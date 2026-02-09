import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
}

interface ChatUser {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  avatar_url: string | null;
}

interface DirectChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentUserId?: string;
}

export function DirectChatDialog({ open, onOpenChange, userId, currentUserId = 'current-user' }: DirectChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatUser, setChatUser] = useState<ChatUser | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user profile
  useEffect(() => {
    if (!open || !userId) return;

    async function fetchUser() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, organisation, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      setChatUser(data);
    }

    fetchUser();
    setMessages([]);
  }, [open, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getDisplayName = (u: ChatUser) => {
    if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
    if (u.full_name) return u.full_name;
    return 'Unknown';
  };

  const getInitials = (u: ChatUser) => {
    if (u.first_name && u.last_name) return `${u.first_name[0]}${u.last_name[0]}`.toUpperCase();
    if (u.full_name) {
      const parts = u.full_name.split(' ');
      return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : u.full_name[0].toUpperCase();
    }
    return '?';
  };

  const handleSend = () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: String(Date.now()),
      senderId: currentUserId,
      content: newMessage.trim(),
      timestamp: new Date(),
    };

    setMessages([...messages, message]);
    setNewMessage('');
  };

  if (!chatUser) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[600px] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={chatUser.avatar_url || undefined} />
                <AvatarFallback>{getInitials(chatUser)}</AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-base">{getDisplayName(chatUser)}</DialogTitle>
                {chatUser.organisation && (
                  <p className="text-xs text-muted-foreground">{chatUser.organisation}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Start a conversation with {getDisplayName(chatUser)}
              </div>
            )}
            {messages.map((message) => {
              const isOwn = message.senderId === currentUserId;

              return (
                <div
                  key={message.id}
                  className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  {!isOwn && (
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={chatUser.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{getInitials(chatUser)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[70%] ${isOwn ? 'order-1' : ''}`}>
                    <div
                      className={`rounded-lg px-3 py-2 ${
                        isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 px-1">
                      {format(message.timestamp, 'HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
