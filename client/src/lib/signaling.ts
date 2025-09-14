export type SignalingEvent =
  | { type: "joined"; pin: string; occupants: number }
  | { type: "ready" }
  | { type: "peerJoined" }
  | { type: "peerLeft" }
  | { type: "roomFull"; pin: string }
  | { type: "signal"; data: any }
  | { type: "error"; message: string };

type EventHandler = (event: SignalingEvent) => void;

class WebSocketSignalingService {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private pin: string | null = null;

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const configuredUrl = (import.meta as any).env?.VITE_SIGNALING_WS_URL as
      | string
      | undefined;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const defaultUrl = `${protocol}//${window.location.host}/p2p`;
    const wsUrl =
      configuredUrl && configuredUrl.length > 0 ? configuredUrl : defaultUrl;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.dispatch(msg as SignalingEvent);
      } catch (e) {
        this.dispatch({ type: "error", message: "Invalid signaling payload" });
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
    };
  }

  join(pin: string): void {
    this.pin = pin;
    this.connect();
    const sendJoin = () => {
      this.send({ type: "join", pin });
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      sendJoin();
    } else if (this.ws) {
      this.ws.onopen = () => sendJoin();
    }
  }

  leave(): void {
    this.send({ type: "leave" });
    this.pin = null;
  }

  sendSignal(data: any): void {
    this.send({ type: "signal", data });
  }

  on(handler: EventHandler): void {
    this.handlers.add(handler);
  }

  off(handler: EventHandler): void {
    this.handlers.delete(handler);
  }

  private send(payload: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private dispatch(event: SignalingEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

class HttpPollingSignalingService {
  private handlers: Set<EventHandler> = new Set();
  private pin: string | null = null;
  private pollTimer: number | null = null;
  private httpUrl: string;
  private myId: string = crypto.randomUUID();
  private joinedEmitted = false;
  private readyEmitted = false;
  private seenPeers = new Set<string>();

  constructor() {
    const envUrl = (import.meta as any).env?.VITE_SIGNALING_HTTP_URL as
      | string
      | undefined;
    this.httpUrl =
      envUrl && envUrl.length > 0 ? envUrl : "/.netlify/functions/signaling";
  }

  private dispatch(event: SignalingEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  private async post(signal: any): Promise<void> {
    if (!this.pin) return;
    await fetch(this.httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: this.pin, signal }),
    });
  }

  private async pollOnce(): Promise<void> {
    if (!this.pin) return;
    try {
      // Heartbeat presence so peers can detect each other reliably
      await this.post({ t: "presence", id: this.myId, ts: Date.now() });

      const res = await fetch(this.httpUrl, {
        method: "GET",
        headers: { "x-room-pin": this.pin },
      });
      const { signals } = await res.json();

      let presenceSeen = false;
      for (const sig of signals as any[]) {
        if (sig?.t === "presence" && sig.id && sig.id !== this.myId) {
          presenceSeen = true;
          if (!this.seenPeers.has(sig.id)) {
            this.seenPeers.add(sig.id);
            this.dispatch({ type: "peerJoined" });
          }
        } else if (sig?.t === "leave" && sig.id && sig.id !== this.myId) {
          if (this.seenPeers.has(sig.id)) {
            this.seenPeers.delete(sig.id);
            this.dispatch({ type: "peerLeft" });
          }
        } else {
          this.dispatch({ type: "signal", data: sig });
        }
      }

      if (!this.joinedEmitted) {
        const occupants = presenceSeen ? 2 : 1;
        this.joinedEmitted = true;
        this.dispatch({ type: "joined", pin: this.pin, occupants });
      }

      if (presenceSeen && !this.readyEmitted) {
        this.readyEmitted = true;
        this.dispatch({ type: "ready" });
      }
    } catch (e) {
      this.dispatch({ type: "error", message: "HTTP signaling failed" });
    }
  }

  connect(): void {
    // no-op for HTTP polling
  }

  join(pin: string): void {
    this.pin = pin;
    this.joinedEmitted = false;
    this.readyEmitted = false;
    this.seenPeers.clear();

    // First tick immediately to decide occupants, then start interval
    this.pollOnce();
    this.pollTimer = window.setInterval(() => this.pollOnce(), 1000);
  }

  leave(): void {
    if (this.pin) {
      this.post({ t: "leave", id: this.myId }).catch(() => {});
    }
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pin = null;
    this.joinedEmitted = false;
    this.readyEmitted = false;
    this.seenPeers.clear();
  }

  sendSignal(data: any): void {
    this.post(data).catch(() => {
      this.dispatch({ type: "error", message: "Failed to send signal" });
    });
  }

  on(handler: EventHandler): void {
    this.handlers.add(handler);
  }

  off(handler: EventHandler): void {
    this.handlers.delete(handler);
  }
}

const mode = ((import.meta as any).env?.VITE_SIGNALING_MODE as string) || "ws";
export const signalingService =
  mode === "http"
    ? new HttpPollingSignalingService()
    : new WebSocketSignalingService();
