import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type AnchorType = 'editor_text' | 'b31_dom';

export interface EditorTextAnchorPayload {
  from: number;
  to: number;
  quote: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface B31DomAnchorPayload {
  commentableKey: string;
  quote: string;
  startOffset?: number;
  endOffset?: number;
}

export type AnchorPayload = EditorTextAnchorPayload | B31DomAnchorPayload;

export interface Comment {
  id: string;
  proposal_id: string;
  section_id: string;
  user_id: string;
  content: string;
  selection_start: number | null;
  selection_end: number | null;
  selected_text: string | null;
  anchor_type: AnchorType | null;
  anchor_payload: AnchorPayload | null;
  is_suggestion: boolean;
  suggested_text: string | null;
  status: 'open' | 'resolved' | 'rejected';
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  user_name?: string;
  user_email?: string;
  replies?: Comment[];
}

interface UseSectionCommentsProps {
  proposalId: string;
  sectionId: string;
}

export function useSectionComments({ proposalId, sectionId }: UseSectionCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch comments for this section
  const fetchComments = useCallback(async () => {
    if (!proposalId || !sectionId) return;

    try {
      const { data, error } = await supabase
        .from('section_comments')
        .select(`
          id, proposal_id, section_id, user_id, content,
          selection_start, selection_end, selected_text,
          anchor_type, anchor_payload,
          is_suggestion, suggested_text, status,
          parent_comment_id, created_at, updated_at,
          profiles:user_id (full_name, email)
        `)
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Transform data to include user info and organize replies
      const allComments = (data || []).map((c: any) => ({
        ...c,
        user_name: c.profiles?.full_name || c.profiles?.email?.split('@')[0] || 'Unknown',
        user_email: c.profiles?.email,
        is_suggestion: c.is_suggestion || false,
        status: c.status || 'open',
      }));

      // Organize into threads (parent comments with replies) - single-pass
      const parentComments: Comment[] = [];
      const replyMap = new Map<string, Comment[]>();

      for (const c of allComments) {
        if (c.parent_comment_id) {
          const arr = replyMap.get(c.parent_comment_id);
          if (arr) arr.push(c);
          else replyMap.set(c.parent_comment_id, [c]);
        } else {
          parentComments.push(c);
        }
      }

      const threaded = parentComments.map((parent: Comment) => ({
        ...parent,
        replies: replyMap.get(parent.id) || [],
      }));

      setComments(threaded);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [proposalId, sectionId]);

  // Initial fetch
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Real-time subscription with debounce to prevent refetch storms
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!proposalId || !sectionId) return;

    const channel = supabase
      .channel(`comments:${proposalId}:${sectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'section_comments',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => {
          // Debounce: wait 300ms before refetching to batch rapid changes
          clearTimeout(realtimeTimerRef.current);
          realtimeTimerRef.current = setTimeout(() => fetchComments(), 300);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [proposalId, sectionId, fetchComments]);

  // Add a new comment
  const addComment = useCallback(async (
    content: string,
    options?: {
      selectionStart?: number;
      selectionEnd?: number;
      selectedText?: string;
      isSuggestion?: boolean;
      suggestedText?: string;
      parentCommentId?: string;
      anchorType?: AnchorType;
      anchorPayload?: AnchorPayload;
    }
  ) => {
    if (!user || !proposalId || !sectionId) return null;

    try {
      const { data, error } = await supabase
        .from('section_comments')
        .insert({
          proposal_id: proposalId,
          section_id: sectionId,
          user_id: user.id,
          content,
          selection_start: options?.selectionStart ?? null,
          selection_end: options?.selectionEnd ?? null,
          selected_text: options?.selectedText ?? null,
          is_suggestion: options?.isSuggestion ?? false,
          suggested_text: options?.suggestedText ?? null,
          parent_comment_id: options?.parentCommentId ?? null,
          anchor_type: options?.anchorType ?? null,
          anchor_payload: options?.anchorPayload ?? null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      return null;
    }
  }, [user, proposalId, sectionId]);

  // Update comment status (resolve/reject suggestion) - optimistic
  const updateCommentStatus = useCallback(async (
    commentId: string,
    status: 'open' | 'resolved' | 'rejected'
  ) => {
    // Optimistic update
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, status } : c));

    try {
      const { error } = await supabase
        .from('section_comments')
        .update({ status })
        .eq('id', commentId);

      if (error) {
        fetchComments(); // revert
        throw error;
      }
    } catch (error) {
      console.error('Error updating comment:', error);
      toast.error('Failed to update comment');
    }
  }, [fetchComments]);

  // Delete a comment (with optimistic removal)
  const deleteComment = useCallback(async (commentId: string) => {
    // Optimistically remove from UI immediately
    setComments(prev => {
      // Remove if it's a top-level comment
      const filtered = prev.filter(c => c.id !== commentId);
      // Also remove from replies
      return filtered.map(c => ({
        ...c,
        replies: c.replies?.filter(r => r.id !== commentId) || [],
      }));
    });

    try {
      // Delete associated notifications
      await supabase
        .from('notifications')
        .delete()
        .contains('metadata', { comment_id: commentId });

      const { error } = await supabase
        .from('section_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        // Revert on failure
        fetchComments();
        throw error;
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  }, [fetchComments]);

  // Get comment counts
  const openCount = comments.filter(c => c.status === 'open').length;
  const suggestionsCount = comments.filter(c => c.is_suggestion && c.status === 'open').length;

  return {
    comments,
    loading,
    addComment,
    updateCommentStatus,
    deleteComment,
    refetch: fetchComments,
    openCount,
    suggestionsCount,
  };
}
