import {
  users,
  contacts,
  messages,
  type User,
  type UpsertUser,
  type Contact,
  type InsertContact,
  type ContactWithUser,
  type Message,
  type InsertMessage,
  type MessageWithUsers,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserPublicKey(userId: string, publicKey: string): Promise<void>;
  
  // Contact operations
  getContacts(userId: string): Promise<ContactWithUser[]>;
  addContact(contact: InsertContact): Promise<Contact>;
  removeContact(userId: string, contactUserId: string): Promise<void>;
  
  // Message operations
  getMessages(userId: string, contactId: string): Promise<MessageWithUsers[]>;
  sendMessage(message: InsertMessage): Promise<Message>;
  markMessageAsDelivered(messageId: string): Promise<void>;
  markMessagesAsRead(userId: string, senderId: string): Promise<void>;
  markMessageAsRead(messageId: string): Promise<void>;
  
  // Search operations
  searchUsers(query: string, currentUserId: string): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserPublicKey(userId: string, publicKey: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        publicKey,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }
  
  // Contact operations
  async getContacts(userId: string): Promise<ContactWithUser[]> {
    const result = await db
      .select()
      .from(contacts)
      .leftJoin(users, eq(contacts.contactUserId, users.id))
      .where(eq(contacts.userId, userId))
      .orderBy(desc(contacts.createdAt));
    
    return result.map(row => ({
      ...row.contacts,
      contactUser: row.users!,
    }));
  }

  async addContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db
      .insert(contacts)
      .values(contact)
      .returning();
    return newContact;
  }

  async removeContact(userId: string, contactUserId: string): Promise<void> {
    await db
      .delete(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          eq(contacts.contactUserId, contactUserId)
        )
      );
  }
  
  // Message operations
  async getMessages(userId: string, contactId: string): Promise<MessageWithUsers[]> {
    const result = await db
      .select()
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(
        or(
          and(eq(messages.senderId, userId), eq(messages.recipientId, contactId)),
          and(eq(messages.senderId, contactId), eq(messages.recipientId, userId))
        )
      )
      .orderBy(messages.createdAt);
    
    return result.map(row => ({
      ...row.messages,
      sender: row.users!,
      recipient: { id: row.messages.recipientId } as User,
    }));
  }

  async sendMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async markMessageAsDelivered(messageId: string): Promise<void> {
    await db
      .update(messages)
      .set({ 
        isDelivered: true, 
        deliveredAt: new Date() 
      })
      .where(eq(messages.id, messageId));
  }

  async markMessagesAsRead(userId: string, senderId: string): Promise<void> {
    await db
      .update(messages)
      .set({ 
        isRead: true,
        readAt: new Date() 
      })
      .where(
        and(
          eq(messages.recipientId, userId),
          eq(messages.senderId, senderId)
        )
      );
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await db
      .update(messages)
      .set({ 
        isRead: true,
        readAt: new Date() 
      })
      .where(eq(messages.id, messageId));
  }
  
  // Search operations
  async searchUsers(query: string, currentUserId: string): Promise<User[]> {
    const result = await db
      .select()
      .from(users)
      .where(
        and(
          or(
            eq(users.email, query),
            eq(users.firstName, query),
            eq(users.lastName, query)
          )
        )
      )
      .limit(10);
    
    return result.filter(user => user.id !== currentUserId);
  }
}

export const storage = new DatabaseStorage();
