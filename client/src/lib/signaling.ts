export type SignalingEvent =
  | { type: "joined"; pin: string; occupants: number }
  | { type: "ready" }
  | { type: "peerJoined" }
  | { type: "peerLeft" }
  | { type: "roomFull"; pin: string }
  | { type: "signal"; data: any }
  | { type: "error"; message: string };

type EventHandler = (event: SignalingEvent) => void;

export class SignalingService {
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
    const wsUrl = configuredUrl && configuredUrl.length > 0 ? configuredUrl : defaultUrl;
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

export const signalingService = new SignalingService();
