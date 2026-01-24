import { useState, useRef, useEffect, useCallback } from 'react';
import { useSectionComments, Comment } from '@/hooks/useSectionComments';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  MessageSquare,
  Lightbulb,
  Check,
  X,
  Reply,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  AtSign,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CommentsSidebarProps {
  proposalId: string;
  sectionId: string;
  selectedText?: string;
  selectionRange?: { start: number; end: number };
  onApplySuggestion?: (originalText: string, suggestedText: string) => void;
  onClearSelection?: () => void;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

function CommentCard({
  comment,
  currentUserId,
  onReply,
  onResolve,
  onReject,
  onDelete,
  onApplySuggestion,
}: {
  comment: Comment;
  currentUserId?: string;
  onReply: (commentId: string) => void;
  onResolve: (commentId: string) => void;
  onReject: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onApplySuggestion?: (originalText: string, suggestedText: string) => void;
}) {
  const [showReplies, setShowReplies] = useState(true);
  const isOwn = comment.user_id === currentUserId;
  const isResolved = comment.status === 'resolved';
  const isRejected = comment.status === 'rejected';

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Render content with @mentions highlighted
  const renderContent = (text: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <span
          key={match.index}
          className="text-primary font-medium bg-primary/10 px-1 rounded"
        >
          @{match[1]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div
      className={cn(
        'border rounded-lg p-3 space-y-2 transition-opacity',
        isResolved && 'opacity-60 bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800',
        isRejected && 'opacity-60 bg-muted/50 line-through'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs bg-primary/10">
              {getInitials(comment.user_name || 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{comment.user_name}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {comment.is_suggestion && (
            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              <Lightbulb className="w-3 h-3 mr-1" />
              Suggestion
            </Badge>
          )}
          {isResolved && (
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
              Resolved
            </Badge>
          )}
        </div>
      </div>

      {/* Selected text quote */}
      {comment.selected_text && (
        <div className="text-xs bg-muted/50 p-2 rounded border-l-2 border-primary/30 italic text-muted-foreground">
          "{comment.selected_text}"
        </div>
      )}

      {/* Comment content with @mentions */}
      <p className="text-sm">{renderContent(comment.content)}</p>

      {/* Suggested text */}
      {comment.is_suggestion && comment.suggested_text && (
        <div className="text-sm bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-200 dark:border-green-800">
          <span className="text-xs text-muted-foreground block mb-1">Suggested change:</span>
          <span className="text-green-800 dark:text-green-200">{comment.suggested_text}</span>
        </div>
      )}

      {/* Actions */}
      {comment.status === 'open' && (
        <div className="flex items-center gap-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onReply(comment.id)}
          >
            <Reply className="w-3 h-3 mr-1" />
            Reply
          </Button>
          {comment.is_suggestion && comment.suggested_text && onApplySuggestion && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => {
                onApplySuggestion(comment.selected_text || '', comment.suggested_text!);
                onResolve(comment.id);
              }}
            >
              <Check className="w-3 h-3 mr-1" />
              Accept
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={() => onResolve(comment.id)}
          >
            <Check className="w-3 h-3 mr-1" />
            Resolve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onReject(comment.id)}
          >
            <X className="w-3 h-3 mr-1" />
            Reject
          </Button>
          {isOwn && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => setShowReplies(!showReplies)}
          >
            {showReplies ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
          </Button>
          {showReplies && (
            <div className="ml-4 mt-2 space-y-2 border-l-2 border-muted pl-3">
              {comment.replies.map((reply) => (
                <div key={reply.id} className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-xs bg-primary/10">
                        {getInitials(reply.user_name || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-xs">{reply.user_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{renderContent(reply.content)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Mention input component
function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  teamMembers,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  teamMembers: TeamMember[];
}) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = teamMembers.filter(
    (m) =>
      m.full_name?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      m.email?.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    // Check if we're typing a mention
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ')) {
      const query = textBeforeCursor.slice(atIndex + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setShowMentions(true);
        return onChange(text);
      }
    }
    
    setShowMentions(false);
    onChange(text);
  };

  const insertMention = (member: TeamMember) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    const beforeMention = value.slice(0, atIndex);
    const afterCursor = value.slice(cursorPos);
    
    const mentionText = `@[${member.full_name}](${member.id})`;
    const newValue = beforeMention + mentionText + ' ' + afterCursor;
    
    onChange(newValue);
    setShowMentions(false);
    
    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
      />
      
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-full bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left transition-colors"
              onClick={() => insertMention(member)}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={member.avatar_url} />
                <AvatarFallback className="text-xs">
                  {member.full_name?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{member.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{member.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentsSidebar({
  proposalId,
  sectionId,
  selectedText,
  selectionRange,
  onApplySuggestion,
  onClearSelection,
}: CommentsSidebarProps) {
  const { user } = useAuth();
  const {
    comments,
    loading,
    addComment,
    updateCommentStatus,
    deleteComment,
    openCount,
    suggestionsCount,
  } = useSectionComments({ proposalId, sectionId });

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSuggestion, setIsSuggestion] = useState(false);
  const [suggestedText, setSuggestedText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Fetch team members for @mentions
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!proposalId) return;
      
      try {
        // Get all users with roles on this proposal
        const { data: roles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('proposal_id', proposalId);

        if (rolesError) throw rolesError;

        if (roles && roles.length > 0) {
          const userIds = roles.map(r => r.user_id);
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('id', userIds);

          if (profilesError) throw profilesError;
          setTeamMembers(profiles || []);
        }
      } catch (err) {
        console.error('Error fetching team members:', err);
      }
    };

    fetchTeamMembers();
  }, [proposalId]);

  // Extract mentioned user IDs from comment text
  const extractMentionedUserIds = (text: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const ids: string[] = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      ids.push(match[2]);
    }
    return ids;
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    // Check for mentions and notify
    const mentionedIds = extractMentionedUserIds(newComment);
    
    await addComment(newComment, {
      selectionStart: selectionRange?.start,
      selectionEnd: selectionRange?.end,
      selectedText: selectedText,
      isSuggestion,
      suggestedText: isSuggestion ? suggestedText : undefined,
    });

    // Create notifications for mentioned users
    if (mentionedIds.length > 0) {
      const { error } = await supabase.from('notifications').insert(
        mentionedIds.map((userId) => ({
          user_id: userId,
          proposal_id: proposalId,
          section_id: sectionId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${user?.user_metadata?.full_name || 'Someone'} mentioned you in a comment`,
        }))
      );
      
      if (error) {
        console.error('Error creating mention notifications:', error);
      }
    }

    setNewComment('');
    setSuggestedText('');
    setIsSuggestion(false);
    onClearSelection?.();
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    const mentionedIds = extractMentionedUserIds(replyContent);
    
    await addComment(replyContent, { parentCommentId: parentId });

    // Create notifications for mentioned users in reply
    if (mentionedIds.length > 0) {
      await supabase.from('notifications').insert(
        mentionedIds.map((userId) => ({
          user_id: userId,
          proposal_id: proposalId,
          section_id: sectionId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${user?.user_metadata?.full_name || 'Someone'} mentioned you in a reply`,
        }))
      );
    }

    setReplyContent('');
    setReplyingTo(null);
  };

  const filteredComments = comments.filter((c) => {
    if (activeTab === 'suggestions') return c.is_suggestion && c.status === 'open';
    if (activeTab === 'resolved') return c.status === 'resolved' || c.status === 'rejected';
    return c.status === 'open';
  });

  return (
    <div className="h-full flex flex-col bg-background border-l">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Comments
        </h3>
        <div className="flex gap-2 mt-2">
          <Badge variant="secondary">{openCount} open</Badge>
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {suggestionsCount} suggestions
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="all" className="text-xs">Open</TabsTrigger>
          <TabsTrigger value="suggestions" className="text-xs">Suggestions</TabsTrigger>
          <TabsTrigger value="resolved" className="text-xs">Resolved</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Loading comments...
                </div>
              ) : filteredComments.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No {activeTab === 'suggestions' ? 'suggestions' : activeTab === 'resolved' ? 'resolved comments' : 'open comments'} yet
                </div>
              ) : (
                filteredComments.map((comment) => (
                  <div key={comment.id}>
                    <CommentCard
                      comment={comment}
                      currentUserId={user?.id}
                      onReply={(id) => setReplyingTo(id)}
                      onResolve={(id) => updateCommentStatus(id, 'resolved')}
                      onReject={(id) => updateCommentStatus(id, 'rejected')}
                      onDelete={deleteComment}
                      onApplySuggestion={onApplySuggestion}
                    />
                    {/* Reply input */}
                    {replyingTo === comment.id && (
                      <div className="ml-4 mt-2 flex gap-2">
                        <MentionTextarea
                          value={replyContent}
                          onChange={setReplyContent}
                          placeholder="Write a reply... (type @ to mention)"
                          className="text-sm min-h-[60px] flex-1"
                          teamMembers={teamMembers}
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={!replyContent.trim()}
                          >
                            <Send className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyContent('');
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* New comment form */}
      <div className="p-4 border-t space-y-3">
        {selectedText && (
          <div className="text-xs bg-muted/50 p-2 rounded border-l-2 border-primary flex items-start justify-between gap-2">
            <span className="italic text-muted-foreground line-clamp-2">"{selectedText}"</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 shrink-0"
              onClick={onClearSelection}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant={isSuggestion ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'text-xs',
              isSuggestion && 'bg-amber-500 hover:bg-amber-600'
            )}
            onClick={() => setIsSuggestion(!isSuggestion)}
          >
            <Lightbulb className="w-3 h-3 mr-1" />
            {isSuggestion ? 'Suggestion Mode' : 'Comment Mode'}
          </Button>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <AtSign className="w-3 h-3" />
            Type @ to mention
          </span>
        </div>

        <MentionTextarea
          value={newComment}
          onChange={setNewComment}
          placeholder={isSuggestion ? 'Explain your suggestion...' : 'Add a comment...'}
          className="text-sm min-h-[60px]"
          teamMembers={teamMembers}
        />

        {isSuggestion && (
          <Textarea
            value={suggestedText}
            onChange={(e) => setSuggestedText(e.target.value)}
            placeholder="Enter suggested replacement text..."
            className="text-sm min-h-[60px] border-amber-300 focus-visible:ring-amber-400"
          />
        )}

        <Button
          className="w-full"
          onClick={handleSubmitComment}
          disabled={!newComment.trim() || (isSuggestion && !suggestedText.trim())}
        >
          <Send className="w-4 h-4 mr-2" />
          {isSuggestion ? 'Submit Suggestion' : 'Add Comment'}
        </Button>
      </div>
    </div>
  );
}
