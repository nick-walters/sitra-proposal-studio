import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

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
}

interface DBMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export function DirectChatDialog({ open, onOpenChange, userId }: DirectChatDialogProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatUser, setChatUser] = useState<ChatUser | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentUserId = user?.id || '';

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
  }, [open, userId]);

  // Load message history
  const loadMessages = useCallback(async () => {
    if (!currentUserId || !userId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUserId})`
      )
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data as DBMessage[]);
    }
    setLoading(false);
  }, [currentUserId, userId]);

  useEffect(() => {
    if (open && currentUserId && userId) {
      loadMessages();
    }
  }, [open, currentUserId, userId, loadMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!open || !currentUserId || !userId) return;

    const channel = supabase
      .channel(`dm:${[currentUserId, userId].sort().join('-')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => {
          const msg = payload.new as DBMessage;
          // Only add if it's part of this conversation
          if (
            (msg.sender_id === currentUserId && msg.receiver_id === userId) ||
            (msg.sender_id === userId && msg.receiver_id === currentUserId)
          ) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, currentUserId, userId]);

  // Auto-scroll to bottom
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

  const handleSend = async () => {
    if (!newMessage.trim() || !currentUserId || !userId) return;

    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('direct_messages').insert({
      sender_id: currentUserId,
      receiver_id: userId,
      content,
    });

    if (error) {
      console.error('Failed to send message:', error);
      setNewMessage(content); // restore on failure
    }
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
            {loading && messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            )}
            {!loading && messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Start a conversation with {getDisplayName(chatUser)}
              </div>
            )}
            {messages.map((message) => {
              const isOwn = message.sender_id === currentUserId;

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
                      {format(new Date(message.created_at), 'HH:mm')}
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
            <Button type="submit" size="icon" disabled={!newMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
