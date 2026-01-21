import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Phone, Video, MoreVertical } from "lucide-react";
import { DEMO_USERS } from "./CollaboratorsDialog";
import { format } from "date-fns";

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
}

interface DirectChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentUserId?: string;
}

// Demo messages
const generateDemoMessages = (userId: string): Message[] => {
  const now = new Date();
  return [
    {
      id: '1',
      senderId: userId,
      content: 'Hi! Have you had a chance to review the methodology section?',
      timestamp: new Date(now.getTime() - 3600000 * 2),
    },
    {
      id: '2',
      senderId: 'current-user',
      content: 'Yes, I just finished reading it. I think we need to add more detail about the data collection process.',
      timestamp: new Date(now.getTime() - 3600000 * 1.5),
    },
    {
      id: '3',
      senderId: userId,
      content: 'Good point. I\'ll work on expanding that section. Can you send me the draft protocol we discussed last week?',
      timestamp: new Date(now.getTime() - 3600000),
    },
    {
      id: '4',
      senderId: 'current-user',
      content: 'Sure, I\'ll send it over shortly. Also, the deadline for Part B is coming up soon.',
      timestamp: new Date(now.getTime() - 1800000),
    },
  ];
};

export function DirectChatDialog({ open, onOpenChange, userId, currentUserId = 'current-user' }: DirectChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const user = DEMO_USERS.find(u => u.id === userId);

  useEffect(() => {
    if (open && userId) {
      setMessages(generateDemoMessages(userId));
    }
  }, [open, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

    // Simulate a response after a short delay
    setTimeout(() => {
      const response: Message = {
        id: String(Date.now() + 1),
        senderId: userId,
        content: 'Thanks for the update! I\'ll check it out.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, response]);
    }, 2000);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[600px] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={user.avatarUrl} />
                <AvatarFallback>
                  {user.firstName[0]}{user.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-base">{user.fullName}</DialogTitle>
                <p className="text-xs text-muted-foreground">{user.organisation}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {messages.map((message) => {
              const isOwn = message.senderId === currentUserId;
              const sender = isOwn ? null : user;

              return (
                <div
                  key={message.id}
                  className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  {!isOwn && (
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={sender?.avatarUrl} />
                      <AvatarFallback className="text-xs">
                        {sender?.firstName[0]}{sender?.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[70%] ${isOwn ? 'order-1' : ''}`}>
                    <div
                      className={`rounded-lg px-3 py-2 ${
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
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

        {/* Input */}
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
