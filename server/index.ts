import express, { type Request, Response, NextFunction } from "express";
import { setupVite, serveStatic, log } from "./vite";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  let server: Server;

  if (process.env.P2P_ONLY === "true") {
    // Minimal server with only P2P signaling endpoint, no DB or auth
    const httpServer = createServer(app);

    const p2pWss = new WebSocketServer({ server: httpServer, path: "/p2p" });
    const pinRooms = new Map<string, Set<WebSocket>>();
    const socketToPin = new Map<WebSocket, string>();

    const sendJson = (socket: WebSocket, payload: any) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    };

    p2pWss.on("connection", (ws: WebSocket) => {
      ws.on("message", (data) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          sendJson(ws, { type: "error", message: "Invalid JSON" });
          return;
        }

        if (msg.type === "join") {
          const pin: string = String(msg.pin || "").trim();
          if (!/^\d{6}$/.test(pin)) {
            sendJson(ws, { type: "error", message: "PIN must be 6 digits" });
            return;
          }

          const room = pinRooms.get(pin) || new Set<WebSocket>();
          if (room.size >= 2) {
            sendJson(ws, { type: "roomFull", pin });
            return;
          }

          room.add(ws);
          pinRooms.set(pin, room);
          socketToPin.set(ws, pin);
          sendJson(ws, { type: "joined", pin, occupants: room.size });

          for (const peer of room) {
            if (peer !== ws) sendJson(peer, { type: "peerJoined" });
          }

          if (room.size === 2) {
            for (const peer of room) sendJson(peer, { type: "ready" });
          }
        } else if (msg.type === "signal") {
          const pin = socketToPin.get(ws);
          if (!pin) return;
          const room = pinRooms.get(pin);
          if (!room) return;
          for (const peer of room) {
            if (peer !== ws) sendJson(peer, { type: "signal", data: msg.data });
          }
        } else if (msg.type === "leave") {
          const pin = socketToPin.get(ws);
          if (!pin) return;
          const room = pinRooms.get(pin);
          if (!room) return;
          room.delete(ws);
          socketToPin.delete(ws);
          for (const peer of room) sendJson(peer, { type: "peerLeft" });
          if (room.size === 0) pinRooms.delete(pin);
        }
      });

      ws.on("close", () => {
        const pin = socketToPin.get(ws);
        if (!pin) return;
        const room = pinRooms.get(pin);
        if (!room) return;
        room.delete(ws);
        socketToPin.delete(ws);
        for (const peer of room) sendJson(peer, { type: "peerLeft" });
        if (room.size === 0) pinRooms.delete(pin);
      });
    });

    server = httpServer;
  } else {
    const { registerRoutes } = await import("./routes");
    server = await registerRoutes(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve on PORT or 5000. Avoid reusePort for Windows compatibility.
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
