import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ContactsList } from "@/components/chat/ContactsList";
import { ChatArea } from "@/components/chat/ChatArea";
import { encryptionService } from "@/lib/encryption";
import { webSocketService } from "@/lib/websocket";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { ContactWithUser } from "@shared/schema";

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [selectedContact, setSelectedContact] = useState<ContactWithUser | null>(null);
  const [isEncryptionReady, setIsEncryptionReady] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
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
  }, [user, isLoading, toast]);

  // Initialize encryption and WebSocket
  useEffect(() => {
    if (user) {
      const initializeEncryption = async () => {
        try {
          await encryptionService.generateKeyPair();
          await webSocketService.connect(user.id);
          setIsEncryptionReady(true);

          // TODO: Update user's public key on server
          // const publicKey = encryptionService.getPublicKey();
          // await updateUserPublicKey(publicKey);
        } catch (error) {
          console.error("Error initializing encryption:", error);
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
            title: "Encryption Error",
            description: "Failed to initialize secure communication",
            variant: "destructive",
          });
        }
      };

      initializeEncryption();
    }

    return () => {
      webSocketService.disconnect();
    };
  }, [user, toast]);

  if (isLoading || !user || !isEncryptionReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {isLoading ? "Loading..." : "Initializing secure connection..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background" data-testid="app-home">
      <ContactsList
        currentUser={user as any}
        selectedContact={selectedContact}
        onSelectContact={setSelectedContact}
      />
      <ChatArea
        currentUser={user as any}
        selectedContact={selectedContact}
      />
    </div>
  );
}
