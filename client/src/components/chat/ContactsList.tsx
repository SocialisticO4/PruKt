import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, Search, Plus, Settings, LogOut, UserPlus } from "lucide-react";
import type { User, ContactWithUser } from "@shared/schema";

interface ContactsListProps {
  currentUser: User;
  selectedContact: ContactWithUser | null;
  onSelectContact: (contact: ContactWithUser) => void;
}

export function ContactsList({
  currentUser,
  selectedContact,
  onSelectContact,
}: ContactsListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  // Fetch contacts
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["/api/contacts"],
    retry: false,
  });

  // Search users for adding contacts
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["/api/search/users", userSearchQuery],
    enabled: userSearchQuery.length > 0 && addContactOpen,
    retry: false,
  });

  // Add contact mutation
  const addContactMutation = useMutation({
    mutationFn: async (contactUserId: string) => {
      await apiRequest("POST", "/api/contacts", { contactUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setAddContactOpen(false);
      setUserSearchQuery("");
      toast({
        title: "Contact Added",
        description: "Contact has been added successfully",
      });
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
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add contact",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const filteredContacts = (contacts as ContactWithUser[]).filter(
    (contact: ContactWithUser) =>
      contact.contactUser.firstName
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      contact.contactUser.lastName
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      contact.contactUser.email
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

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

  return (
    <div
      className="w-80 bg-white border-r border-border flex flex-col"
      data-testid="contacts-list"
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg">PruKt</h2>
              <div className="flex items-center gap-1 text-xs text-primary">
                <Shield className="w-3 h-3" />
                <span>End-to-end encrypted</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              title="Settings"
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Add Contact"
                  data-testid="button-add-contact"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Contact</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Search users by email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    data-testid="input-user-search"
                  />
                  {searchLoading && (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </div>
                  )}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      {(searchResults as User[]).map((user: User) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                          data-testid={`user-result-${user.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={user.profileImageUrl || ""} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                {getInitials(user)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {getDisplayName(user)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => addContactMutation.mutate(user.id)}
                            disabled={addContactMutation.isPending}
                            data-testid={`button-add-${user.id}`}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {userSearchQuery &&
                    !searchLoading &&
                    (searchResults as User[]).length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No users found
                      </p>
                    )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-contact-search"
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto">
        {contactsLoading ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading contacts...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-muted-foreground text-sm">
              {(contacts as ContactWithUser[]).length === 0
                ? "No contacts yet. Add some contacts to start chatting!"
                : "No contacts match your search"}
            </p>
          </div>
        ) : (
          filteredContacts.map((contact: ContactWithUser) => (
            <button
              key={contact.id}
              className={`w-full p-4 hover:bg-muted cursor-pointer border-b border-border/50 transition-colors text-left ${
                selectedContact?.id === contact.id ? "bg-muted" : ""
              }`}
              onClick={() => onSelectContact(contact)}
              data-testid={`contact-${contact.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarImage
                      src={contact.contactUser.profileImageUrl || ""}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(contact.contactUser)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">
                      {getDisplayName(contact.contactUser)}
                    </span>
                    <Shield className="w-3 h-3 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    Tap to start secure conversation
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-10 h-10">
              <AvatarImage src={currentUser.profileImageUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(currentUser)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {getDisplayName(currentUser)}
              </span>
              <Shield className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">Online</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            title="Sign out"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
