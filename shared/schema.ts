import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  publicKey: text("public_key"), // For end-to-end encryption
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contacts table for user relationships
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  contactUserId: varchar("contact_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  nickname: varchar("nickname"), // Optional custom name for contact
  isBlocked: boolean("is_blocked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Messages table for encrypted messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  recipientId: varchar("recipient_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  encryptedContent: text("encrypted_content").notNull(), // Encrypted message content
  iv: varchar("iv").notNull(), // Initialization vector for encryption
  isDelivered: boolean("is_delivered").default(false),
  isRead: boolean("is_read").default(false),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "recipient" }),
  contacts: many(contacts, { relationName: "user" }),
  contactOf: many(contacts, { relationName: "contactUser" }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, {
    fields: [contacts.userId],
    references: [users.id],
    relationName: "user",
  }),
  contactUser: one(users, {
    fields: [contacts.contactUserId],
    references: [users.id],
    relationName: "contactUser",
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  recipient: one(users, {
    fields: [messages.recipientId],
    references: [users.id],
    relationName: "recipient",
  }),
}));

// Schemas
export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  isDelivered: true,
  isRead: true,
  deliveredAt: true,
  readAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Extended types for API responses
export type ContactWithUser = Contact & {
  contactUser: User;
};

export type MessageWithUsers = Message & {
  sender: User;
  recipient: User;
};
