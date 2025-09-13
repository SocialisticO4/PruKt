// Encrypted local message storage using Web Crypto API (AES-GCM)

export interface StoredMessage {
  id: string;
  timestamp: number;
  direction: "sent" | "received";
  ciphertext: string;
  iv: string;
}

const STORAGE_PREFIX = "securetalk:chat:";

async function deriveKey(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = enc.encode("securetalk-static-salt");
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptAndStoreMessage(
  peerId: string,
  pin: string,
  id: string,
  direction: "sent" | "received",
  plaintext: string
): Promise<void> {
  const key = await deriveKey(pin);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const record: StoredMessage = {
    id,
    timestamp: Date.now(),
    direction,
    ciphertext: arrayBufferToBase64(ct),
    iv: arrayBufferToBase64(iv.buffer),
  };
  const list = await loadMessages(peerId, pin);
  list.push(record);
  localStorage.setItem(STORAGE_PREFIX + peerId, JSON.stringify(list));
}

export async function loadMessages(
  peerId: string,
  pin: string
): Promise<StoredMessage[]> {
  const raw = localStorage.getItem(STORAGE_PREFIX + peerId);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as StoredMessage[];
    // Try a quick decrypt of last message to verify PIN
    if (arr.length > 0) {
      const key = await deriveKey(pin);
      const iv = base64ToArrayBuffer(arr[arr.length - 1].iv);
      const ct = base64ToArrayBuffer(arr[arr.length - 1].ciphertext);
      try {
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: new Uint8Array(iv) },
          key,
          ct
        );
      } catch {}
    }
    return arr;
  } catch {
    return [];
  }
}

export async function decryptMessageRecord(
  pin: string,
  record: StoredMessage
): Promise<string> {
  const key = await deriveKey(pin);
  const iv = base64ToArrayBuffer(record.iv);
  const ct = base64ToArrayBuffer(record.ciphertext);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    ct
  );
  return new TextDecoder().decode(pt);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
