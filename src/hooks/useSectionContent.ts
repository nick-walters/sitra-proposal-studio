import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface UseSectionContentProps {
  proposalId: string;
  sectionId: string;
}

// Version save interval: 5 minutes
const VERSION_SAVE_INTERVAL = 5 * 60 * 1000;

export function useSectionContent({ proposalId, sectionId }: UseSectionContentProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { user } = useAuth();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const versionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentIdRef = useRef<string | null>(null);
  const lastVersionContentRef = useRef<string>('');
  const lastVersionTimeRef = useRef<number>(0);

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
        lastVersionContentRef.current = data.content || '';
      } else {
        setContent('');
        contentIdRef.current = null;
        lastVersionContentRef.current = '';
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

  // Save a version snapshot
  const saveVersion = useCallback(async (contentToSave: string) => {
    if (!proposalId || !sectionId || !user?.id) return;
    
    // Don't save if content hasn't changed since last version
    if (contentToSave === lastVersionContentRef.current) return;
    
    // Don't save too frequently
    const now = Date.now();
    if (now - lastVersionTimeRef.current < VERSION_SAVE_INTERVAL) return;

    try {
      // Get the next version number
      const { data: existingVersions } = await supabase
        .from('section_versions')
        .select('version_number')
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId)
        .order('version_number', { ascending: false })
        .limit(1);

      const nextVersion = (existingVersions?.[0]?.version_number || 0) + 1;

      await supabase
        .from('section_versions')
        .insert({
          proposal_id: proposalId,
          section_id: sectionId,
          content: contentToSave,
          created_by: user.id,
          version_number: nextVersion,
          is_auto_save: true,
        });

      lastVersionContentRef.current = contentToSave;
      lastVersionTimeRef.current = now;
    } catch (error) {
      console.error('Error saving version:', error);
    }
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

      // Schedule version save check
      if (versionTimeoutRef.current) {
        clearTimeout(versionTimeoutRef.current);
      }
      versionTimeoutRef.current = setTimeout(() => {
        saveVersion(newContent);
      }, VERSION_SAVE_INTERVAL);

    } catch (error) {
      console.error('Error saving content:', error);
      toast.error('Failed to save content');
    } finally {
      setSaving(false);
    }
  }, [proposalId, sectionId, user?.id, saveVersion]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    // Debounced save (1 second for autosave)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent]);

  // Save version on unmount if content changed
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (versionTimeoutRef.current) {
        clearTimeout(versionTimeoutRef.current);
      }
      // Save version if content changed when leaving the section
      if (content !== lastVersionContentRef.current && content.trim()) {
        saveVersion(content);
      }
    };
  }, [content, saveVersion]);

  return {
    content,
    setContent: handleContentChange,
    loading,
    saving,
    lastSaved,
    saveNow: () => saveContent(content),
    saveVersionNow: () => saveVersion(content),
  };
}
