import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Link2,
  CheckCircle2,
  Lock,
  Users,
  Fingerprint,
} from "lucide-react";
import { p2pService } from "@/lib/p2p";
import {
  decryptMessageRecord,
  encryptAndStoreMessage,
  loadMessages,
  type StoredMessage,
} from "@/lib/localStore";

function DecryptedMessage({
  pin,
  message,
}: {
  pin: string;
  message: StoredMessage;
}) {
  const [text, setText] = useState<string>("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    decryptMessageRecord(pin, message)
      .then((t) => {
        if (active) setText(t);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [message.id, pin]);
  return (
    <span className={failed ? "italic text-red-600" : ""}>
      {failed ? "Unable to decrypt" : text}
    </span>
  );
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function P2PChat() {
  const [pin, setPin] = useState<string>("");
  const [mode, setMode] = useState<
    "idle" | "creating" | "joining" | "ready" | "connected"
  >("idle");
  const [peerConnected, setPeerConnected] = useState(false);
  const [connState, setConnState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [showChat, setShowChat] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [error, setError] = useState<string>("");
  const [trustOK, setTrustOK] = useState(false);
  const [fingerprint, setFingerprint] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = async (evt: any) => {
      if (evt.type === "connecting") {
        setConnState("connecting");
      } else if (evt.type === "connected") {
        setPeerConnected(true);
        setMode("connected");
        setConnState("connected");
        setShowChat(true);
      } else if (evt.type === "disconnected") {
        setPeerConnected(false);
        setTrustOK(false);
        setConnState("disconnected");
      } else if (evt.type === "message") {
        const id = crypto.randomUUID();
        await encryptAndStoreMessage(pin, pin, id, "received", evt.data);
        const list = await loadMessages(pin, pin);
        setMessages(list);
      } else if (evt.type === "fingerprint") {
        setFingerprint(evt.value);
      }
    };
    p2pService.on(handler as any);
    return () => p2pService.off(handler as any);
  }, [pin]);

  const visibleMessages = useMemo(() => messages, [messages]);

  const startCreate = async () => {
    const newPin = generatePin();
    setPin(newPin);
    setMode("creating");
    await p2pService.join(newPin);
  };

  const startJoin = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setError("Enter a valid 6-digit PIN");
      return;
    }
    setError("");
    setMode("joining");
    await p2pService.join(pin);
    const list = await loadMessages(pin, pin);
    setMessages(list);
  };

  const send = async () => {
    if (!input.trim()) return;
    const text = input;
    p2pService.send(text);
    const id = crypto.randomUUID();
    await encryptAndStoreMessage(pin, pin, id, "sent", text);
    const list = await loadMessages(pin, pin);
    setMessages(list);
    setInput("");
  };

  return (
    <div className="h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-5xl h-full grid grid-cols-1 md:grid-cols-3 overflow-hidden">
        <div
          className={`border-r p-4 bg-white md:col-span-1 ${
            showChat ? "hidden md:block" : "block"
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold">PruKt</h2>
              <div className="flex items-center gap-1 text-xs text-primary">
                <Lock className="w-3 h-3" />
                <span>End-to-end encrypted</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  connState === "connected"
                    ? "bg-green-600"
                    : connState === "connecting"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                aria-label={`Connection ${connState}`}
              />
              <span className="capitalize">{connState}</span>
            </div>
            <Button
              className="w-full"
              onClick={startCreate}
              disabled={mode !== "idle" && mode !== "ready"}
            >
              Create PIN
            </Button>
            <div className="flex gap-2">
              <Input
                placeholder="Enter 6-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={6}
              />
              <Button onClick={startJoin} disabled={!/^\d{6}$/.test(pin)}>
                Join
              </Button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}

            {pin && (
              <div className="bg-primary/10 border border-primary/20 rounded p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>
                    PIN:{" "}
                    <span className="font-mono tracking-widest">{pin}</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Share this PIN with your contact.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <Link2
                className={`w-4 h-4 ${
                  peerConnected ? "text-green-600" : "text-muted-foreground"
                }`}
              />
              <span>
                {peerConnected ? "Peer connected" : "Waiting for peer..."}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2
                className={`w-4 h-4 ${
                  trustOK ? "text-green-600" : "text-muted-foreground"
                }`}
              />
              <span>
                {trustOK ? "Trust verified" : "Awaiting trust verification"}
              </span>
            </div>
            {fingerprint && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Fingerprint className="w-3 h-3" />
                <span>
                  Verify code: <span className="font-mono">{fingerprint}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTrustOK(true)}
                >
                  Mark trusted
                </Button>
              </div>
            )}

            <div className="md:hidden">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => setShowChat(true)}
              >
                Open Chat
              </Button>
            </div>
          </div>
        </div>

        <div
          className={`md:col-span-2 ${
            !showChat ? "hidden md:flex" : "flex"
          } flex-col`}
        >
          {/* Mobile header with Back + status */}
          <div className="md:hidden flex items-center justify-between p-2 border-b bg-white">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowChat(false)}
            >
              Back
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  connState === "connected"
                    ? "bg-green-600"
                    : connState === "connecting"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              />
              <span className="capitalize">{connState}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 chat-scroll bg-gradient-to-b from-background to-muted/30">
            <div className="flex justify-center mb-6">
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 max-w-md">
                <div className="flex items-center gap-2 text-sm text-primary font-medium">
                  <Shield className="w-4 h-4" />
                  <span>
                    Messages are end-to-end encrypted. PIN protects local
                    history.
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {visibleMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.direction === "sent" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`${
                      m.direction === "sent"
                        ? "message-bubble-sent text-white"
                        : "message-bubble-received"
                    } rounded-lg px-4 py-2 max-w-md`}
                  >
                    <DecryptedMessage pin={pin} message={m} />
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="p-3 border-t bg-white flex gap-2">
            <Input
              placeholder={
                peerConnected ? "Type a message" : "Waiting for peer..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={!peerConnected}
            />
            <Button onClick={send} disabled={!peerConnected || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
