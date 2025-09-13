import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { encryptionService } from "@/lib/encryption";
import { Shield, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageWithUsers, User } from "@shared/schema";

interface MessageBubbleProps {
  message: MessageWithUsers;
  isOwnMessage: boolean;
}

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
  const [decryptedContent, setDecryptedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(true);
  const [decryptionError, setDecryptionError] = useState(false);

  // Decrypt message content
  useEffect(() => {
    const decryptMessage = async () => {
      try {
        setIsDecrypting(true);
        const content = await encryptionService.decryptMessage(
          message.encryptedContent,
          message.iv
        );
        setDecryptedContent(content);
        setDecryptionError(false);
      } catch (error) {
        console.error("Error decrypting message:", error);
        setDecryptedContent("Unable to decrypt message");
        setDecryptionError(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    decryptMessage();
  }, [message]);

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const formatTime = (date: Date | string) => {
    const messageDate = new Date(date);
    return messageDate.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (isOwnMessage) {
    return (
      <div className="flex items-start gap-3 justify-end" data-testid="message-sent">
        <div className="flex-1 max-w-md">
          <div className="bg-gradient-to-r from-primary to-green-500 rounded-lg px-4 py-3 ml-auto">
            {isDecrypting ? (
              <div className="flex items-center gap-2 text-primary-foreground">
                <div className="animate-spin rounded-full h-3 w-3 border border-primary-foreground border-t-transparent"></div>
                <span className="text-sm">Decrypting...</span>
              </div>
            ) : (
              <p className={cn(
                "text-primary-foreground",
                decryptionError && "text-red-200 italic"
              )}>
                {decryptedContent}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground justify-end">
            <Shield className="w-3 h-3 text-primary" />
            <span data-testid="message-time">{formatTime(message.createdAt!)}</span>
            {message.isRead ? (
              <CheckCheck className="w-3 h-3 text-primary" />
            ) : (
              <Check className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3" data-testid="message-received">
      <Avatar className="w-8 h-8">
        <AvatarImage src={message.sender.profileImageUrl || ""} />
        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
          {getInitials(message.sender)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 max-w-md">
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          {isDecrypting ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin rounded-full h-3 w-3 border border-muted-foreground border-t-transparent"></div>
              <span className="text-sm">Decrypting...</span>
            </div>
          ) : (
            <p className={cn(
              "text-foreground",
              decryptionError && "text-red-600 italic"
            )}>
              {decryptedContent}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span data-testid="message-time">{formatTime(message.createdAt!)}</span>
          <Shield className="w-3 h-3 text-primary" />
        </div>
      </div>
    </div>
  );
}
