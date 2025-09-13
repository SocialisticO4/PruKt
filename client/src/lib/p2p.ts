import { signalingService, type SignalingEvent } from "./signaling";
import {
  generateEphemeralKeyPair,
  importRemotePublicKey,
  deriveSessionKey,
  encryptWithSession,
  decryptWithSession,
  computeFingerprint,
} from "./sessionCrypto";

export type P2PEvent =
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "message"; data: string }
  | { type: "fingerprint"; value: string }
  | { type: "error"; message: string };

type P2PHandler = (event: P2PEvent) => void;

export interface P2PConfig {
  iceServers?: RTCIceServer[];
}

export class P2PService {
  private peer: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private handlers: Set<P2PHandler> = new Set();
  private isOfferer = false;
  private config: P2PConfig;
  private ephPriv: CryptoKey | null = null;
  private ephPubJwk: JsonWebKey | null = null;
  private remotePub: CryptoKey | null = null;
  private sessionKey: CryptoKey | null = null;
  private currentPin: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: number | null = null;

  constructor(config?: P2PConfig) {
    this.config = config || {
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:stun1.l.google.com:19302"] },
        {
          urls: ["turn:openrelay.metered.ca:80"],
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: ["turn:openrelay.metered.ca:443"],
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    };
  }

  async join(pin: string): Promise<void> {
    this.currentPin = pin;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.emit({ type: "connecting" });
    // Avoid duplicate listeners
    signalingService.off(this.handleSignal);
    signalingService.on(this.handleSignal);
    signalingService.join(pin);
  }

  leave(): void {
    signalingService.off(this.handleSignal);
    signalingService.leave();
    this.cleanup();
  }

  send(text: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;
    if (!this.sessionKey) {
      // Fallback plaintext until key ready (should be brief). Better: queue.
      this.dataChannel.send(JSON.stringify({ t: "text", v: text }));
      return;
    }
    encryptWithSession(this.sessionKey, text).then(({ iv, ciphertext }) => {
      this.dataChannel!.send(JSON.stringify({ t: "enc", iv, ct: ciphertext }));
    });
  }

  on(handler: P2PHandler): void {
    this.handlers.add(handler);
  }

  off(handler: P2PHandler): void {
    this.handlers.delete(handler);
  }

  private handleSignal = async (evt: SignalingEvent) => {
    try {
      if (evt.type === "ready") {
        // Both peers present. Create or respond to offer.
        if (!this.peer) this.createPeer();
        this.emit({ type: "connecting" });
        if (!this.isOfferer) {
          // Decide offerer by random to reduce glare; if dataChannel doesn't exist, become offerer
          this.isOfferer = !this.dataChannel;
        }
        // Prepare ephemeral keys for ECDH
        if (!this.ephPriv) {
          const { privateKey, publicJwk } = await generateEphemeralKeyPair();
          this.ephPriv = privateKey;
          this.ephPubJwk = publicJwk;
        }
        // Share our public JWK over signaling
        signalingService.sendSignal({ key: this.ephPubJwk });
        if (this.isOfferer) {
          this.createDataChannel();
          const offer = await this.peer!.createOffer();
          await this.peer!.setLocalDescription(offer);
          signalingService.sendSignal({ sdp: this.peer!.localDescription });
        }
      } else if (evt.type === "signal" && evt.data?.sdp) {
        if (!this.peer) this.createPeer();
        const desc = new RTCSessionDescription(evt.data.sdp);
        await this.peer!.setRemoteDescription(desc);
        if (desc.type === "offer") {
          const answer = await this.peer!.createAnswer();
          await this.peer!.setLocalDescription(answer);
          signalingService.sendSignal({ sdp: this.peer!.localDescription });
        }
      } else if (evt.type === "signal" && evt.data?.candidate) {
        if (!this.peer) this.createPeer();
        try {
          await this.peer!.addIceCandidate(evt.data.candidate);
        } catch {}
      } else if (evt.type === "signal" && evt.data?.key) {
        // Receive remote ECDH public key
        this.remotePub = await importRemotePublicKey(evt.data.key);
        // If we have our private key, derive session
        if (this.ephPriv && this.remotePub) {
          this.sessionKey = await deriveSessionKey(
            this.ephPriv,
            this.remotePub
          );
          const fp = await computeFingerprint(this.ephPriv, this.remotePub);
          this.emit({ type: "fingerprint", value: fp });
        }
      } else if (evt.type === "peerLeft") {
        this.emit({ type: "disconnected" });
        this.cleanup();
      }
    } catch (e) {
      this.emit({ type: "error", message: "P2P negotiation error" });
    }
  };

  private createPeer(): void {
    this.peer = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.peer.onicecandidate = (ev) => {
      if (ev.candidate) {
        signalingService.sendSignal({ candidate: ev.candidate });
      }
    };
    this.peer.ondatachannel = (ev) => {
      this.dataChannel = ev.channel;
      this.setupDataChannel();
    };
    this.peer.onconnectionstatechange = () => {
      if (!this.peer) return;
      if (this.peer.connectionState === "connecting") {
        this.emit({ type: "connecting" });
      }
      if (this.peer.connectionState === "connected") {
        this.emit({ type: "connected" });
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
      }
      if (
        this.peer.connectionState === "disconnected" ||
        this.peer.connectionState === "failed" ||
        this.peer.connectionState === "closed"
      ) {
        this.emit({ type: "disconnected" });
        // Attempt reconnection on transient failures
        if (
          this.peer.connectionState === "disconnected" ||
          this.peer.connectionState === "failed"
        ) {
          this.attemptReconnect();
        }
      }
    };
    // Fallback for older states
    (this.peer as any).oniceconnectionstatechange = () => {
      const state = (this.peer as any).iceConnectionState as string;
      if (state === "checking") this.emit({ type: "connecting" });
      if (state === "connected" || state === "completed") {
        this.emit({ type: "connected" });
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
      }
      if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        this.emit({ type: "disconnected" });
        if (state === "disconnected" || state === "failed")
          this.attemptReconnect();
      }
    };
  }

  private createDataChannel(): void {
    if (!this.peer) this.createPeer();
    this.dataChannel = this.peer!.createDataChannel("chat", { ordered: true });
    this.setupDataChannel();
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;
    this.dataChannel.onopen = () => {
      this.emit({ type: "connected" });
    };
    this.dataChannel.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.t === "enc" && this.sessionKey) {
          decryptWithSession(this.sessionKey, msg.iv, msg.ct)
            .then((text) => this.emit({ type: "message", data: text }))
            .catch(() =>
              this.emit({ type: "error", message: "Decrypt failed" })
            );
        } else if (msg.t === "text") {
          this.emit({ type: "message", data: String(msg.v) });
        }
      } catch {
        this.emit({ type: "message", data: String(ev.data) });
      }
    };
    this.dataChannel.onclose = () => {
      this.emit({ type: "disconnected" });
    };
    this.dataChannel.onerror = () => {
      this.emit({ type: "error", message: "Data channel error" });
    };
  }

  private cleanup(): void {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }
    if (this.peer) {
      try {
        this.peer.close();
      } catch {}
      this.peer = null;
    }
    this.ephPriv = null;
    this.ephPubJwk = null;
    this.remotePub = null;
    this.sessionKey = null;
  }

  private emit(evt: P2PEvent): void {
    for (const h of this.handlers) h(evt);
  }

  private attemptReconnect(): void {
    if (!this.currentPin) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit({ type: "error", message: "Reconnect attempts exceeded" });
      return;
    }
    const delay = Math.min(30000, 500 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      this.emit({ type: "connecting" });
      this.cleanup();
      // Re-join signaling; listener already attached
      signalingService.join(this.currentPin!);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const p2pService = new P2PService();
