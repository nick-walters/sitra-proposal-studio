import { useState, useRef, useEffect, useCallback } from 'react';
import { useSectionComments, Comment } from '@/hooks/useSectionComments';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MentionTextarea, extractMentionedUserIds, renderMentionContent } from '@/components/MentionTextarea';
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
  Check,
  X,
  Reply,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  AtSign,
  RotateCcw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CommentsSidebarProps {
  proposalId: string;
  sectionId: string;
  selectedText?: string;
  selectionRange?: { start: number; end: number };
  onClearSelection?: () => void;
  onCommentClick?: (selectionStart: number | null, selectionEnd: number | null) => void;
  onFocusEditor?: () => void;
  compact?: boolean;
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
  isCoordinator,
  onReply,
  onResolve,
  onReopen,
  onDelete,
  onDeleteReply,
  onClickHighlight,
}: {
  comment: Comment;
  currentUserId?: string;
  isCoordinator: boolean;
  onReply: (commentId: string) => void;
  onResolve: (commentId: string) => void;
  onReopen: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onDeleteReply: (replyId: string) => void;
  onClickHighlight?: (start: number, end: number) => void;
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
  const renderContent = (text: string) => renderMentionContent(text);

  return (
    <div
      className={cn(
        'border rounded-lg p-3 space-y-2 transition-opacity',
        isResolved && 'opacity-60 bg-muted/30 border-muted'
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
          {isResolved && (
            <Badge variant="secondary" className="text-xs">
              Resolved
            </Badge>
          )}
        </div>
      </div>

      {/* Selected text quote */}
      {comment.selected_text && (
        <button
          type="button"
          className="w-full text-left text-xs bg-muted/50 p-2 rounded border-l-2 border-primary/30 italic text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          onClick={() => {
            if (onClickHighlight && comment.selection_start != null && comment.selection_end != null) {
              onClickHighlight(comment.selection_start, comment.selection_end);
            }
          }}
          title="Click to highlight in editor"
        >
          "{comment.selected_text}"
        </button>
      )}

      {/* Comment content with @mentions */}
      <p className="text-sm">{renderContent(comment.content)}</p>




      {comment.status === 'open' && (
        <div className="flex items-center gap-1 pt-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReply(comment.id)}>
            <Reply className="w-3 h-3 mr-1" /> Reply
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => onResolve(comment.id)}>
            <Check className="w-3 h-3 mr-1" /> Resolve
          </Button>
          {(isOwn || isCoordinator) && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => onDelete(comment.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      {isResolved && (
        <div className="flex items-center gap-1 pt-1">
          {isOwn ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReopen(comment.id)}>
                <RotateCcw className="w-3 h-3 mr-1" /> Reopen
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => onDelete(comment.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReply(comment.id)}>
              <Reply className="w-3 h-3 mr-1" /> Reply to reopen
            </Button>
          )}
          {!isOwn && isCoordinator && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => onDelete(comment.id)}>
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
              {comment.replies.map((reply) => {
                const isReplyOwn = reply.user_id === currentUserId;
                return (
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
                      {(isReplyOwn || isCoordinator) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                          onClick={() => onDeleteReply(reply.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <p className="text-muted-foreground">{renderContent(reply.content)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Local MentionTextarea removed — using shared component from @/components/MentionTextarea
export function CommentsSidebar({
  proposalId,
  sectionId,
  selectedText,
  selectionRange,
  onClearSelection,
  onCommentClick,
  onFocusEditor,
  compact = false,
}: CommentsSidebarProps) {
  const { user } = useAuth();
  const { roleTier } = useProposalRole(proposalId);
  const {
    comments,
    loading,
    addComment,
    updateCommentStatus,
    deleteComment,
    openCount,
  } = useSectionComments({ proposalId, sectionId });

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newComment, setNewComment] = useState('');
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
            .from('profiles_basic')
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

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    // Check for mentions and notify
    const mentionedIds = extractMentionedUserIds(newComment);
    
    const newCommentData = await addComment(newComment, {
      selectionStart: selectionRange?.start,
      selectionEnd: selectionRange?.end,
      selectedText: selectedText,
    });

    // Create notifications for mentioned users
    if (mentionedIds.length > 0 && newCommentData) {
      const targetIds = mentionedIds;
      if (targetIds.length > 0) {
        const { error } = await supabase.from('notifications').insert(
          targetIds.map((userId) => ({
            user_id: userId,
            proposal_id: proposalId,
            section_id: sectionId,
            type: 'mention',
            title: 'You were mentioned',
            message: `${user?.user_metadata?.full_name || 'Someone'} mentioned you in a comment`,
            metadata: { source: 'comment', comment_id: newCommentData.id },
          }))
        );
        
        if (error) {
          console.error('Error creating mention notifications:', error);
        }
      }
    }

    setNewComment('');
    onClearSelection?.();
    // Return focus to the editor
    onFocusEditor?.();
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    const mentionedIds = extractMentionedUserIds(replyContent);
    
    // If the parent comment is resolved, reopen it when a reply is added
    const parentComment = comments.find(c => c.id === parentId);
    if (parentComment?.status === 'resolved') {
      await updateCommentStatus(parentId, 'open');
    }

    const replyData = await addComment(replyContent, { parentCommentId: parentId });

    // Create notifications for mentioned users in reply
    if (mentionedIds.length > 0 && replyData) {
      const targetIds = mentionedIds;
      if (targetIds.length > 0) {
        await supabase.from('notifications').insert(
          targetIds.map((userId) => ({
            user_id: userId,
            proposal_id: proposalId,
            section_id: sectionId,
            type: 'mention',
            title: 'You were mentioned',
            message: `${user?.user_metadata?.full_name || 'Someone'} mentioned you in a reply`,
            metadata: { source: 'comment', comment_id: replyData.id },
          }))
        );
      }
    }

    setReplyContent('');
    setReplyingTo(null);
    onFocusEditor?.();
  };

  const filteredComments = comments
    .filter((c) => {
      if (activeTab === 'resolved') return c.status === 'resolved';
      return c.status === 'open';
    })
    .sort((a, b) => {
      const aPos = a.selection_start ?? Infinity;
      const bPos = b.selection_start ?? Infinity;
      if (aPos !== bPos) return aPos - bPos;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  return (
    <div className={cn("h-full flex flex-col bg-background", !compact && "border-l")}>
      {/* Header - hidden in compact mode (parent provides header) */}
      {!compact && (
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Comments
          </h3>
          <div className="flex gap-2 mt-2">
            <Badge variant="secondary">{openCount} open</Badge>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="all" className="text-xs">Open</TabsTrigger>
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
                  No {activeTab === 'resolved' ? 'resolved comments' : 'open comments'} yet
                </div>
              ) : (
                filteredComments.map((comment) => (
                  <div key={comment.id}>
                    <CommentCard
                      comment={comment}
                      currentUserId={user?.id}
                      isCoordinator={roleTier === 'coordinator'}
                      onReply={(id) => setReplyingTo(id)}
                      onResolve={(id) => { updateCommentStatus(id, 'resolved'); onFocusEditor?.(); }}
                      onReopen={(id) => { updateCommentStatus(id, 'open'); onFocusEditor?.(); }}
                      onDelete={(id) => { deleteComment(id); onFocusEditor?.(); }}
                      onDeleteReply={(id) => { deleteComment(id); onFocusEditor?.(); }}
                      onClickHighlight={onCommentClick ? (start, end) => onCommentClick(start, end) : undefined}
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

        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <AtSign className="w-3 h-3" />
          Type @ to mention
        </span>

        <MentionTextarea
          value={newComment}
          onChange={setNewComment}
          placeholder="Add a comment..."
          className="text-sm min-h-[60px]"
          teamMembers={teamMembers}
        />

        <Button
          className="w-full"
          onClick={handleSubmitComment}
          disabled={!newComment.trim()}
        >
          <Send className="w-4 h-4 mr-2" />
          Add Comment
        </Button>
      </div>
    </div>
  );
}
