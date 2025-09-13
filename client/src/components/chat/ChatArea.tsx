import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { webSocketService } from "@/lib/websocket";
import { encryptionService } from "@/lib/encryption";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "./MessageBubble";
import {
  Shield,
  Phone,
  Video,
  Info,
  Paperclip,
  Smile,
  Send,
} from "lucide-react";
import type { User, ContactWithUser, MessageWithUsers } from "@shared/schema";

interface ChatAreaProps {
  currentUser: User;
  selectedContact: ContactWithUser | null;
}

export function ChatArea({ currentUser, selectedContact }: ChatAreaProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch messages for selected contact
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/messages", selectedContact?.contactUser.id],
    enabled: !!selectedContact,
    retry: false,
  });

  // Mark messages as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await apiRequest("POST", `/api/messages/${contactId}/read`);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when contact is selected
  useEffect(() => {
    if (selectedContact) {
      markAsReadMutation.mutate(selectedContact.contactUser.id);
    }
  }, [selectedContact]);

  // WebSocket message handlers
  useEffect(() => {
    const handleNewMessage = (event: CustomEvent) => {
      const newMessage = event.detail;
      if (
        selectedContact &&
        (newMessage.senderId === selectedContact.contactUser.id ||
          newMessage.recipientId === selectedContact.contactUser.id)
      ) {
        queryClient.invalidateQueries({
          queryKey: ["/api/messages", selectedContact.contactUser.id],
        });
      }
    };

    const handleTyping = (data: any) => {
      if (data.senderId === selectedContact?.contactUser.id) {
        if (data.isTyping) {
          setTypingUsers((prev) => [
            ...prev.filter((id) => id !== data.senderId),
            data.senderId,
          ]);
        } else {
          setTypingUsers((prev) => prev.filter((id) => id !== data.senderId));
        }
      }
    };

    const handleMessageDelivered = (data: any) => {
      // Update the message in the cache to mark it as delivered
      queryClient.invalidateQueries({
        queryKey: ["/api/messages", selectedContact?.contactUser.id],
      });
    };

    const handleMessageRead = (data: any) => {
      // Update the message in the cache to mark it as read
      queryClient.invalidateQueries({
        queryKey: ["/api/messages", selectedContact?.contactUser.id],
      });
    };

    window.addEventListener("newMessage", handleNewMessage as EventListener);
    webSocketService.onMessage("typing", handleTyping);
    webSocketService.onMessage("messageDelivered", handleMessageDelivered);
    webSocketService.onMessage("messageRead", handleMessageRead);

    return () => {
      window.removeEventListener(
        "newMessage",
        handleNewMessage as EventListener
      );
      webSocketService.offMessage("typing");
      webSocketService.offMessage("messageDelivered");
      webSocketService.offMessage("messageRead");
    };
  }, [selectedContact, queryClient]);

  const handleSendMessage = async () => {
    if (
      !message.trim() ||
      !selectedContact ||
      !selectedContact.contactUser.publicKey
    ) {
      if (!selectedContact?.contactUser.publicKey) {
        toast({
          title: "Error",
          description: "Contact's encryption key not available",
          variant: "destructive",
        });
      }
      return;
    }

    try {
      await webSocketService.sendMessage(
        selectedContact.contactUser.id,
        message,
        selectedContact.contactUser.publicKey,
        currentUser.id
      );

      setMessage("");
      stopTyping();
    } catch (error) {
      console.error("Error sending message:", error);
      if (error instanceof Error && isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);

    if (!selectedContact) return;

    // Send typing indicator
    if (value && !isTyping) {
      setIsTyping(true);
      webSocketService.sendTypingIndicator(
        selectedContact.contactUser.id,
        currentUser.id,
        true
      );
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 1000);
  };

  const stopTyping = () => {
    if (isTyping && selectedContact) {
      setIsTyping(false);
      webSocketService.sendTypingIndicator(
        selectedContact.contactUser.id,
        currentUser.id,
        false
      );
    }
  };

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getDisplayName = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "Unknown User";
  };

  if (!selectedContact) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-gradient-to-b from-background to-muted/30"
        data-testid="chat-area-empty"
      >
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">PruKt</h3>
          <p className="text-muted-foreground mb-4">
            Select a contact to start a secure, end-to-end encrypted
            conversation.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-primary">
            <Shield className="w-4 h-4" />
            <span>
              All messages are protected with military-grade encryption
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" data-testid="chat-area">
      {/* Chat Header */}
      <div className="p-4 bg-white border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="w-10 h-10">
                <AvatarImage
                  src={selectedContact.contactUser.profileImageUrl || ""}
                />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(selectedContact.contactUser)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium" data-testid="chat-contact-name">
                  {getDisplayName(selectedContact.contactUser)}
                </h3>
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-primary font-medium">
                Online • End-to-end encrypted
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              title="Voice call"
              data-testid="button-voice-call"
            >
              <Phone className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Video call"
              data-testid="button-video-call"
            >
              <Video className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Chat info"
              data-testid="button-chat-info"
            >
              <Info className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-background to-muted/30"
        data-testid="messages-area"
      >
        {/* Encryption Notice */}
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 max-w-md">
            <div className="flex items-center gap-2 text-sm text-primary font-medium">
              <Shield className="w-4 h-4" />
              <span>
                Messages are end-to-end encrypted. Only you and{" "}
                {getDisplayName(selectedContact.contactUser)} can see them.
              </span>
            </div>
          </div>
        </div>

        {messagesLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (messages as MessageWithUsers[]).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(messages as MessageWithUsers[]).map((msg: MessageWithUsers) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwnMessage={msg.senderId === currentUser.id}
                data-testid={`message-${msg.id}`}
              />
            ))}
          </div>
        )}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div
            className="flex items-start gap-3 mt-4"
            data-testid="typing-indicator"
          >
            <Avatar className="w-8 h-8">
              <AvatarImage
                src={selectedContact.contactUser.profileImageUrl || ""}
              />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {getInitials(selectedContact.contactUser)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 max-w-md">
              <div className="bg-white border border-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>
                  {getDisplayName(selectedContact.contactUser)} is typing...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 bg-white border-t border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            title="Attach file"
            data-testid="button-attach"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <div className="flex-1 relative">
            <Input
              placeholder="Type a secure message..."
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pr-12"
              data-testid="input-message"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2"
              title="Emoji"
              data-testid="button-emoji"
            >
              <Smile className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!message.trim()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            title="Send message"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        {/* Security Footer */}
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-primary">
          <Shield className="w-3 h-3" />
          <span>Your messages are secured with end-to-end encryption</span>
        </div>
      </div>
    </div>
  );
}
