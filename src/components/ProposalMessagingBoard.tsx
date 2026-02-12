import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare, Send, Search, Pin, Flag, Trash2, Edit2, ChevronDown, ChevronRight,
  Eye, EyeOff, X, Check, MoreHorizontal, Reply, CheckCircle,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface ProposalMessagingBoardProps {
  proposalId: string;
  isCoordinator: boolean;
}

interface Message {
  id: string;
  proposal_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  visibility: string;
  is_high_priority: boolean;
  is_pinned: boolean;
  priority_level: number;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

const PRIORITY_LABELS = ['No priority', 'Low priority', 'Medium priority', 'High priority'] as const;

export function ProposalMessagingBoard({ proposalId, isCoordinator }: ProposalMessagingBoardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newVisibility, setNewVisibility] = useState<'all' | 'private'>('all');
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState(0);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  // Fetch proposal members
  const { data: members = [] } = useQuery({
    queryKey: ['proposal-members', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      const userIds = [...new Set((data || []).map(r => r.user_id))];
      if (userIds.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);
      if (pErr) throw pErr;
      return (profiles || []) as Profile[];
    },
    enabled: !!proposalId,
  });

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['proposal-messages', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_messages')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!proposalId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!proposalId) return;
    const channel = supabase
      .channel(`messages-${proposalId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'proposal_messages',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proposalId, queryClient]);

  // Build thread structure
  const threads = useMemo(() => {
    const topLevel = messages.filter(m => !m.parent_id);
    const childMap = new Map<string, Message[]>();
    messages.filter(m => m.parent_id).forEach(m => {
      const arr = childMap.get(m.parent_id!) || [];
      arr.push(m);
      childMap.set(m.parent_id!, arr);
    });

    const getLastReplyDate = (threadId: string) => {
      const replies = childMap.get(threadId) || [];
      if (replies.length === 0) return new Date(topLevel.find(t => t.id === threadId)?.created_at || 0);
      return new Date(replies[replies.length - 1].created_at);
    };

    let filtered = topLevel;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set<string>();
      messages.forEach(m => {
        if (m.content.toLowerCase().includes(q)) {
          matchingIds.add(m.parent_id || m.id);
        }
      });
      filtered = filtered.filter(t => matchingIds.has(t.id));
    }

    filtered.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return getLastReplyDate(b.id).getTime() - getLastReplyDate(a.id).getTime();
    });

    return filtered.map(t => ({
      ...t,
      replies: (childMap.get(t.id) || []).sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    }));
  }, [messages, searchQuery]);

  const profileMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const getProfile = (userId: string) => profileMap.get(userId);

  // Mutations
  const sendMessage = useMutation({
    mutationFn: async ({ content, parentId, visibility, priorityLevel, tagged }: {
      content: string; parentId?: string; visibility: string; priorityLevel: number; tagged: string[];
    }) => {
      const { data, error } = await supabase
        .from('proposal_messages')
        .insert({
          proposal_id: proposalId,
          parent_id: parentId || null,
          author_id: user!.id,
          content,
          visibility,
          is_high_priority: priorityLevel >= 3,
          priority_level: priorityLevel,
        } as any)
        .select()
        .single();
      if (error) throw error;
      if (visibility === 'private' && tagged.length > 0) {
        const { error: rErr } = await supabase
          .from('proposal_message_recipients')
          .insert(tagged.map(uid => ({ message_id: data.id, user_id: uid })));
        if (rErr) throw rErr;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
    },
  });

  const updateMessage = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('proposal_messages')
        .update({ content })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
      setEditingId(null);
    },
  });

  const updatePriority = useMutation({
    mutationFn: async ({ id, priorityLevel }: { id: string; priorityLevel: number }) => {
      const { error } = await supabase
        .from('proposal_messages')
        .update({ priority_level: priorityLevel, is_high_priority: priorityLevel >= 3 } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
    },
  });

  const toggleResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase
        .from('proposal_messages')
        .update({ is_resolved: resolved } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('proposal_messages')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
      toast.success('Message deleted');
    },
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('proposal_messages')
        .update({ is_pinned: pinned })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
    },
  });

  const cyclePriority = (current: number) => (current + 1) % 4;

  const handleSendNew = () => {
    if (!newMessage.trim()) return;
    sendMessage.mutate({
      content: newMessage.trim(),
      visibility: newVisibility,
      priorityLevel: newPriority,
      tagged: taggedUserIds,
    });
    setNewMessage('');
    setNewPriority(0);
    setNewVisibility('all');
    setTaggedUserIds([]);
  };

  const handleSendReply = (parentId: string) => {
    if (!replyContent.trim()) return;
    sendMessage.mutate({
      content: replyContent.trim(),
      parentId,
      visibility: 'all',
      priorityLevel: 0,
      tagged: [],
    });
    setReplyContent('');
    setReplyingTo(null);
  };

  const canModify = (msg: Message) => msg.author_id === user?.id || isCoordinator;

  const toggleThread = (id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const PriorityButton = ({ level, onClick, size = 'sm' }: { level: number; onClick: () => void; size?: 'sm' | 'default' }) => {
    if (level === 0) {
      return (
        <Button variant="outline" size={size} className="h-8" onClick={onClick}>
          <Flag className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> Priority
        </Button>
      );
    }
    if (level === 1) {
      return (
        <Button variant="outline" size={size} className="h-8 border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:border-green-700" onClick={onClick}>
          <Flag className="h-3.5 w-3.5 mr-1" /> Low
        </Button>
      );
    }
    if (level === 2) {
      return (
        <Button variant="outline" size={size} className="h-8 border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700" onClick={onClick}>
          <Flag className="h-3.5 w-3.5 mr-0.5" /><Flag className="h-3.5 w-3.5 mr-1" /> Medium
        </Button>
      );
    }
    return (
      <Button variant="destructive" size={size} className="h-8" onClick={onClick}>
        <Flag className="h-3.5 w-3.5 mr-0.5" /><Flag className="h-3.5 w-3.5 mr-0.5" /><Flag className="h-3.5 w-3.5 mr-1" /> High
      </Button>
    );
  };

  const PriorityBadge = ({ level }: { level: number }) => {
    if (level === 1) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-300">
          <Flag className="h-2.5 w-2.5 mr-0.5" /> Low
        </Badge>
      );
    }
    if (level === 2) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-300">
          <Flag className="h-2.5 w-2.5 mr-0.5" /><Flag className="h-2.5 w-2.5 mr-0.5" /> Medium
        </Badge>
      );
    }
    if (level === 3) {
      return (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
          <Flag className="h-2.5 w-2.5 mr-0.5" /><Flag className="h-2.5 w-2.5 mr-0.5" /><Flag className="h-2.5 w-2.5 mr-0.5" /> High
        </Badge>
      );
    }
    return null;
  };

  const renderMessage = (msg: Message, isReply = false, isThreadResolved = false) => {
    const profile = getProfile(msg.author_id);
    const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
    const isEditing = editingId === msg.id;
    const priorityLevel = (msg as any).priority_level ?? (msg.is_high_priority ? 3 : 0);

    return (
      <div key={msg.id} className={cn("flex gap-3 py-3", isReply && "pl-8", isThreadResolved && "opacity-50")}>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{profile?.full_name || profile?.email || 'Unknown'}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
            </span>
            <PriorityBadge level={priorityLevel} />
            {msg.is_pinned && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                <Pin className="h-2.5 w-2.5 mr-0.5" /> Pinned
              </Badge>
            )}
            {msg.visibility === 'private' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                <EyeOff className="h-2.5 w-2.5 mr-0.5" /> Private
              </Badge>
            )}
            {!isReply && (msg as any).is_resolved && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Resolved
              </Badge>
            )}
          </div>
          {isEditing ? (
            <div className="mt-1 flex gap-2">
              <Textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="min-h-[60px] text-sm"
                autoFocus
              />
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="ghost" onClick={() => {
                  updateMessage.mutate({ id: msg.id, content: editContent });
                }}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-0.5 whitespace-pre-wrap">{msg.content}</p>
          )}
          {!isEditing && (
            <div className="flex items-center gap-1 mt-1">
              {!isReply && (
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                  onClick={() => { setReplyingTo(msg.id); toggleThread(msg.id); }}>
                  <Reply className="h-3 w-3 mr-1" /> Reply
                </Button>
              )}
              {canModify(msg) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }}>
                      <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const next = cyclePriority(priorityLevel);
                      updatePriority.mutate({ id: msg.id, priorityLevel: next });
                    }}>
                      <Flag className="h-3.5 w-3.5 mr-2" />
                      {PRIORITY_LABELS[cyclePriority(priorityLevel)]}
                    </DropdownMenuItem>
                    {!isReply && (
                      <DropdownMenuItem onClick={() => toggleResolved.mutate({ id: msg.id, resolved: !(msg as any).is_resolved })}>
                        <CheckCircle className="h-3.5 w-3.5 mr-2" />
                        {(msg as any).is_resolved ? 'Unresolve' : 'Mark resolved'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteMessage.mutate(msg.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                    {!isReply && isCoordinator && (
                      <DropdownMenuItem onClick={() => togglePin.mutate({ id: msg.id, pinned: !msg.is_pinned })}>
                        <Pin className="h-3.5 w-3.5 mr-2" /> {msg.is_pinned ? 'Unpin' : 'Pin'}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold">Message Board</h2>
        <p className="text-muted-foreground text-sm">Discuss and coordinate with your proposal team</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search messages..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Compose */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <Textarea
            placeholder="Start a new thread..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={newVisibility} onValueChange={(v: 'all' | 'private') => setNewVisibility(v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><span className="flex items-center gap-1"><Eye className="h-3 w-3" /> All members</span></SelectItem>
                <SelectItem value="private"><span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Private</span></SelectItem>
              </SelectContent>
            </Select>
            {newVisibility === 'private' && (
              <div className="flex items-center gap-1 flex-wrap">
                {members.filter(m => m.id !== user?.id).map(m => (
                  <Button
                    key={m.id}
                    variant={taggedUserIds.includes(m.id) ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setTaggedUserIds(prev =>
                      prev.includes(m.id) ? prev.filter(i => i !== m.id) : [...prev, m.id]
                    )}
                  >
                    {m.full_name || m.email}
                  </Button>
                ))}
              </div>
            )}
            <PriorityButton level={newPriority} onClick={() => setNewPriority(cyclePriority(newPriority))} />
            <div className="ml-auto">
              <Button size="sm" onClick={handleSendNew} disabled={!newMessage.trim() || sendMessage.isPending}>
                <Send className="h-3.5 w-3.5 mr-1" /> Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Threads */}
      {threads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-medium text-muted-foreground">No messages yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">Start a thread to begin the conversation</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map(thread => {
            const isExpanded = expandedThreads.has(thread.id);
            const replyCount = thread.replies.length;
            const isResolved = (thread as any).is_resolved;
            const priorityLevel = (thread as any).priority_level ?? (thread.is_high_priority ? 3 : 0);
            return (
              <Card key={thread.id} className={cn(
                thread.is_pinned && "border-primary/30 bg-primary/5",
                priorityLevel === 3 && !thread.is_pinned && "border-destructive/30",
                priorityLevel === 2 && !thread.is_pinned && "border-amber-400/30",
                priorityLevel === 1 && !thread.is_pinned && "border-green-500/30",
                isResolved && "opacity-60"
              )}>
                <CardContent className="pt-3 pb-2">
                  {renderMessage(thread, false, isResolved)}
                  {replyCount > 0 && (
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-11 mt-1"
                      onClick={() => toggleThread(thread.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                    </button>
                  )}
                  {isExpanded && (
                    <div className="border-l-2 border-muted ml-4 mt-1">
                      {thread.replies.map(r => renderMessage(r, true, isResolved))}
                    </div>
                  )}
                  {replyingTo === thread.id && (
                    <div className="flex gap-2 ml-11 mt-2">
                      <Textarea
                        placeholder="Write a reply..."
                        value={replyContent}
                        onChange={e => setReplyContent(e.target.value)}
                        className="min-h-[50px] text-sm"
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={() => handleSendReply(thread.id)} disabled={!replyContent.trim()}>
                          <Send className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
