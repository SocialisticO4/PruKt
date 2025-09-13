import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Lock, MessageSquare, Users, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export default function Landing() {
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">PruKt</h1>
          <p className="text-muted-foreground">
            End-to-end encrypted messaging
          </p>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Lock className="w-5 h-5 text-primary" />
            <span className="font-medium text-sm">
              Your privacy is protected
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Messages are encrypted end-to-end. Only you and your contacts can
            read them.
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <MessageSquare className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium">Secure Messaging</p>
            </div>
            <div className="text-center">
              <Users className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium">Contact Management</p>
            </div>
          </div>

          <Button
            onClick={handleLogin}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3"
            data-testid="button-login"
          >
            Sign In Securely
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              By signing in, you agree to our secure communication protocols
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
