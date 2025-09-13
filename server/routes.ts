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
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
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
  app.get('/api/contacts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contacts = await storage.getContacts(userId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post('/api/contacts', isAuthenticated, async (req: any, res) => {
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

  app.delete('/api/contacts/:contactUserId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { contactUserId } = req.params;
      
      await storage.removeContact(userId, contactUserId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing contact:", error);
      res.status(500).json({ message: "Failed to remove contact" });
    }
  });

  // Message routes
  app.get('/api/messages/:contactId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { contactId } = req.params;
      
      const messages = await storage.getMessages(userId, contactId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/messages/:contactId/read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { contactId } = req.params;
      
      await storage.markMessagesAsRead(userId, contactId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // Search routes
  app.get('/api/search/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
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
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Map<string, WebSocket>();

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'authenticate') {
          // Store the authenticated user's WebSocket connection
          clients.set(message.userId, ws);
          ws.send(JSON.stringify({ type: 'authenticated' }));
        } else if (message.type === 'sendMessage') {
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
            recipientWs.send(JSON.stringify({
              type: 'newMessage',
              message: {
                ...savedMessage,
                sender: { id: message.senderId }
              }
            }));
          }
          
          // Confirm to sender
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'messageSent',
              messageId: savedMessage.id
            }));
          }
        } else if (message.type === 'typing') {
          // Forward typing indicator to recipient
          const recipientWs = clients.get(message.recipientId);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify({
              type: 'typing',
              senderId: message.senderId,
              isTyping: message.isTyping
            }));
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      }
    });

    ws.on('close', () => {
      // Remove client from the map
      for (const [userId, client] of clients) {
        if (client === ws) {
          clients.delete(userId);
          break;
        }
      }
    });
  });

  return httpServer;
}
