import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertContactSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Contact routes
  app.get("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contacts = await storage.getContacts(userId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contactData = insertContactSchema.parse({
        ...req.body,
        userId,
      });

      const contact = await storage.addContact(contactData);
      res.json(contact);
    } catch (error) {
      console.error("Error adding contact:", error);
      res.status(500).json({ message: "Failed to add contact" });
    }
  });

  app.delete(
    "/api/contacts/:contactUserId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { contactUserId } = req.params;

        await storage.removeContact(userId, contactUserId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error removing contact:", error);
        res.status(500).json({ message: "Failed to remove contact" });
      }
    }
  );

  // Message routes
  app.get(
    "/api/messages/:contactId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { contactId } = req.params;

        const messages = await storage.getMessages(userId, contactId);
        res.json(messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    }
  );

  app.post(
    "/api/messages/:contactId/read",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { contactId } = req.params;

        await storage.markMessagesAsRead(userId, contactId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking messages as read:", error);
        res.status(500).json({ message: "Failed to mark messages as read" });
      }
    }
  );

  // Mark individual message as delivered
  app.put(
    "/api/messages/:messageId/delivered",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { messageId } = req.params;
        await storage.markMessageAsDelivered(messageId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking message as delivered:", error);
        res
          .status(500)
          .json({ message: "Failed to mark message as delivered" });
      }
    }
  );

  // Mark individual message as read
  app.put(
    "/api/messages/:messageId/read",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { messageId } = req.params;
        await storage.markMessageAsRead(messageId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking message as read:", error);
        res.status(500).json({ message: "Failed to mark message as read" });
      }
    }
  );

  // User public key update route
  app.put("/api/user/public-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { publicKey } = req.body;

      if (!publicKey || typeof publicKey !== "string") {
        return res.status(400).json({ message: "Public key is required" });
      }

      await storage.updateUserPublicKey(userId, publicKey);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating public key:", error);
      res.status(500).json({ message: "Failed to update public key" });
    }
  });

  // Search routes
  app.get("/api/search/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { q } = req.query;

      if (!q || typeof q !== "string") {
        return res
          .status(400)
          .json({ message: "Query parameter 'q' is required" });
      }

      const users = await storage.searchUsers(q, userId);
      res.json(users);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket setup for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Map<string, WebSocket>();

  wss.on("connection", (ws: WebSocket, req) => {
    console.log("New WebSocket connection");

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "authenticate") {
          // Store the authenticated user's WebSocket connection
          clients.set(message.userId, ws);
          ws.send(JSON.stringify({ type: "authenticated" }));
        } else if (message.type === "sendMessage") {
          // Validate and save the encrypted message
          const messageData = insertMessageSchema.parse({
            senderId: message.senderId,
            recipientId: message.recipientId,
            encryptedContent: message.encryptedContent,
            iv: message.iv,
          });

          const savedMessage = await storage.sendMessage(messageData);

          // Send to recipient if online
          const recipientWs = clients.get(message.recipientId);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            // Mark as delivered immediately since recipient is online
            await storage.markMessageAsDelivered(savedMessage.id);

            recipientWs.send(
              JSON.stringify({
                type: "newMessage",
                message: {
                  ...savedMessage,
                  isDelivered: true,
                  deliveredAt: new Date().toISOString(),
                  sender: { id: message.senderId },
                },
              })
            );

            // Notify sender about delivery
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "messageDelivered",
                  messageId: savedMessage.id,
                })
              );
            }
          }

          // Confirm to sender
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "messageSent",
                messageId: savedMessage.id,
                isDelivered: recipientWs ? true : false,
              })
            );
          }
        } else if (message.type === "messageRead") {
          // Mark message as read and notify sender
          await storage.markMessageAsRead(message.messageId);

          // Get message details to notify sender
          const messages = await storage.getMessages(
            message.readerId,
            message.senderId
          );
          const readMessage = messages.find((m) => m.id === message.messageId);

          if (readMessage) {
            // Notify sender about read receipt
            const senderWs = clients.get(message.senderId);
            if (senderWs && senderWs.readyState === WebSocket.OPEN) {
              senderWs.send(
                JSON.stringify({
                  type: "messageRead",
                  messageId: message.messageId,
                  readAt: new Date().toISOString(),
                })
              );
            }
          }
        } else if (message.type === "typing") {
          // Forward typing indicator to recipient
          const recipientWs = clients.get(message.recipientId);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(
              JSON.stringify({
                type: "typing",
                senderId: message.senderId,
                isTyping: message.isTyping,
              })
            );
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "error", message: "Invalid message format" })
          );
        }
      }
    });

    ws.on("close", () => {
      // Remove client from the map
      for (const [userId, client] of clients) {
        if (client === ws) {
          clients.delete(userId);
          break;
        }
      }
    });
  });

  // Minimal WebRTC signaling server for P2P (PIN-based)
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

        // Notify existing peer
        for (const peer of room) {
          if (peer !== ws) {
            sendJson(peer, { type: "peerJoined" });
          }
        }

        if (room.size === 2) {
          for (const peer of room) {
            sendJson(peer, { type: "ready" });
          }
        }
      } else if (msg.type === "signal") {
        const pin = socketToPin.get(ws);
        if (!pin) return;
        const room = pinRooms.get(pin);
        if (!room) return;
        for (const peer of room) {
          if (peer !== ws) {
            sendJson(peer, { type: "signal", data: msg.data });
          }
        }
      } else if (msg.type === "leave") {
        const pin = socketToPin.get(ws);
        if (!pin) return;
        const room = pinRooms.get(pin);
        if (!room) return;
        room.delete(ws);
        socketToPin.delete(ws);
        for (const peer of room) {
          sendJson(peer, { type: "peerLeft" });
        }
        if (room.size === 0) {
          pinRooms.delete(pin);
        }
      }
    });

    ws.on("close", () => {
      const pin = socketToPin.get(ws);
      if (!pin) return;
      const room = pinRooms.get(pin);
      if (!room) return;
      room.delete(ws);
      socketToPin.delete(ws);
      for (const peer of room) {
        sendJson(peer, { type: "peerLeft" });
      }
      if (room.size === 0) {
        pinRooms.delete(pin);
      }
    });
  });

  return httpServer;
}
