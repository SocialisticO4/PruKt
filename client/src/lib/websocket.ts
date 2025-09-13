import { encryptionService } from './encryption';

export interface WebSocketMessage {
  type: 'authenticate' | 'sendMessage' | 'newMessage' | 'messageSent' | 'typing' | 'error' | 'authenticated';
  userId?: string;
  senderId?: string;
  recipientId?: string;
  encryptedContent?: string;
  iv?: string;
  message?: any;
  messageId?: string;
  isTyping?: boolean;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers = new Map<string, (data: any) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        
        // Authenticate with the server
        this.send({
          type: 'authenticate',
          userId: userId,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'authenticated') {
            resolve();
          } else if (message.type === 'newMessage') {
            this.handleNewMessage(message);
          } else {
            const handler = this.messageHandlers.get(message.type);
            if (handler) {
              handler(message);
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect(userId);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      // Timeout for initial connection
      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private async handleNewMessage(message: WebSocketMessage) {
    try {
      if (message.message && message.message.encryptedContent) {
        const decryptedContent = await encryptionService.decryptMessage(
          message.message.encryptedContent,
          message.message.iv
        );
        
        // Dispatch custom event for new message
        window.dispatchEvent(new CustomEvent('newMessage', {
          detail: {
            ...message.message,
            decryptedContent,
          }
        }));
      }
    } catch (error) {
      console.error('Error decrypting message:', error);
    }
  }

  async sendMessage(recipientId: string, message: string, recipientPublicKey: string, senderId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    try {
      const { encryptedContent, iv } = await encryptionService.encryptMessage(message, recipientPublicKey);
      
      this.send({
        type: 'sendMessage',
        senderId,
        recipientId,
        encryptedContent,
        iv,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  sendTypingIndicator(recipientId: string, senderId: string, isTyping: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.send({
      type: 'typing',
      senderId,
      recipientId,
      isTyping,
    });
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  offMessage(type: string): void {
    this.messageHandlers.delete(type);
  }

  private send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private attemptReconnect(userId: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect(userId).catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
  }
}

export const webSocketService = new WebSocketService();
