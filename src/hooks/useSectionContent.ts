import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface UseSectionContentProps {
  proposalId: string;
  sectionId: string;
}

export function useSectionContent({ proposalId, sectionId }: UseSectionContentProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { user } = useAuth();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentIdRef = useRef<string | null>(null);

  // Fetch content on mount
  useEffect(() => {
    if (!proposalId || !sectionId) return;

    const fetchContent = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('section_content')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching content:', error);
        toast.error('Failed to load content');
      }

      if (data) {
        setContent(data.content || '');
        contentIdRef.current = data.id;
      } else {
        setContent('');
        contentIdRef.current = null;
      }
      setLoading(false);
    };

    fetchContent();
  }, [proposalId, sectionId]);

  // Real-time subscription
  useEffect(() => {
    if (!proposalId || !sectionId) return;

    const channel = supabase
      .channel(`section_content:${proposalId}:${sectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'section_content',
          filter: `proposal_id=eq.${proposalId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newData = payload.new as { section_id: string; content: string; id: string; last_edited_by: string | null };
            if (newData.section_id === sectionId && newData.last_edited_by !== user?.id) {
              setContent(newData.content || '');
              contentIdRef.current = newData.id;
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, sectionId, user?.id]);

  // Auto-save with debounce
  const saveContent = useCallback(async (newContent: string) => {
    if (!proposalId || !sectionId || !user?.id) return;

    setSaving(true);

    try {
      if (contentIdRef.current) {
        // Update existing
        const { error } = await supabase
          .from('section_content')
          .update({
            content: newContent,
            last_edited_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contentIdRef.current);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('section_content')
          .insert({
            proposal_id: proposalId,
            section_id: sectionId,
            content: newContent,
            last_edited_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;
        contentIdRef.current = data.id;
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving content:', error);
      toast.error('Failed to save content');
    } finally {
      setSaving(false);
    }
  }, [proposalId, sectionId, user?.id]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    // Debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    content,
    setContent: handleContentChange,
    loading,
    saving,
    lastSaved,
    saveNow: () => saveContent(content),
  };
}
