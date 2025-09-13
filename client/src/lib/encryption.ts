// Client-side end-to-end encryption using Web Crypto API
export class EncryptionService {
  private keyPair: CryptoKeyPair | null = null;
  private publicKey: string | null = null;

  async generateKeyPair(): Promise<void> {
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    // Export public key for sharing
    const publicKeyBuffer = await window.crypto.subtle.exportKey(
      "spki",
      this.keyPair.publicKey
    );
    this.publicKey = this.arrayBufferToBase64(publicKeyBuffer);
  }

  async importPublicKey(publicKeyString: string): Promise<CryptoKey> {
    const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyString);
    return await window.crypto.subtle.importKey(
      "spki",
      publicKeyBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["encrypt"]
    );
  }

  async encryptMessage(message: string, recipientPublicKey: string): Promise<{ encryptedContent: string; iv: string }> {
    if (!this.keyPair) {
      throw new Error("Key pair not generated");
    }

    // Generate a random AES key for this message
    const aesKey = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );

    // Encrypt the message with AES
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = new TextEncoder().encode(message);
    const encryptedMessage = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      encodedMessage
    );

    // Encrypt the AES key with recipient's RSA public key
    const recipientKey = await this.importPublicKey(recipientPublicKey);
    const aesKeyBuffer = await window.crypto.subtle.exportKey("raw", aesKey);
    const encryptedAesKey = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      recipientKey,
      aesKeyBuffer
    );

    // Combine encrypted AES key and encrypted message
    const combined = new Uint8Array(encryptedAesKey.byteLength + encryptedMessage.byteLength);
    combined.set(new Uint8Array(encryptedAesKey), 0);
    combined.set(new Uint8Array(encryptedMessage), encryptedAesKey.byteLength);

    return {
      encryptedContent: this.arrayBufferToBase64(combined.buffer),
      iv: this.arrayBufferToBase64(iv.buffer),
    };
  }

  async decryptMessage(encryptedContent: string, iv: string): Promise<string> {
    if (!this.keyPair?.privateKey) {
      throw new Error("Private key not available");
    }

    const encryptedData = this.base64ToArrayBuffer(encryptedContent);
    const ivBuffer = this.base64ToArrayBuffer(iv);

    // Extract encrypted AES key (first 256 bytes for RSA-2048)
    const encryptedAesKey = encryptedData.slice(0, 256);
    const encryptedMessage = encryptedData.slice(256);

    // Decrypt the AES key with our RSA private key
    const aesKeyBuffer = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      this.keyPair.privateKey,
      encryptedAesKey
    );

    // Import the AES key
    const aesKey = await window.crypto.subtle.importKey(
      "raw",
      aesKeyBuffer,
      {
        name: "AES-GCM",
      },
      false,
      ["decrypt"]
    );

    // Decrypt the message with AES
    const decryptedMessage = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer),
      },
      aesKey,
      encryptedMessage
    );

    return new TextDecoder().decode(decryptedMessage);
  }

  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error("Public key not generated");
    }
    return this.publicKey;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const encryptionService = new EncryptionService();
