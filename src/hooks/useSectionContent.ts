import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { renumberAllCaptionsWithMapping } from '@/lib/captionRenumbering';

interface UseSectionContentProps {
  proposalId: string;
  sectionId: string;
  sectionNumber?: string; // For caption renumbering
}

// Version save interval: 5 minutes
const VERSION_SAVE_INTERVAL = 5 * 60 * 1000;
// Debounce delay for autosave
const AUTOSAVE_DEBOUNCE = 1000;

export function useSectionContent({ proposalId, sectionId, sectionNumber }: UseSectionContentProps) {
  const [content, setContentState] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [lastCitationMapping, setLastCitationMapping] = useState<Map<number, number>>(new Map());
  const { user } = useAuth();
  
  // Refs for managing state across effects
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const versionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentIdRef = useRef<string | null>(null);
  const lastVersionContentRef = useRef<string>('');
  const lastVersionTimeRef = useRef<number>(0);
  const pendingContentRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);

  // Immediate save function (no debounce) - used for urgent saves
  const saveContentImmediately = useCallback(async (contentToSave: string, shouldRenumber = true): Promise<boolean> => {
    if (!proposalId || !sectionId || !user?.id) return false;
    if (isSavingRef.current) return false;

    isSavingRef.current = true;
    setSaving(true);

    // Auto-renumber captions before saving if section number is provided
    let finalContent = contentToSave;
    let citationMapping = new Map<number, number>();
    if (shouldRenumber && sectionNumber) {
      const result = renumberAllCaptionsWithMapping(contentToSave, sectionNumber);
      finalContent = result.content;
      citationMapping = result.citationMapping;
    }

    try {
      if (contentIdRef.current) {
        // Update existing
        const { error } = await supabase
          .from('section_content')
          .update({
            content: finalContent,
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
            content: finalContent,
            last_edited_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;
        contentIdRef.current = data.id;
      }

      setLastSaved(new Date());
      pendingContentRef.current = null;
      
      // Update citation mapping for footnote sync
      if (citationMapping.size > 0) {
        setLastCitationMapping(citationMapping);
      }
      
      // Update state if content was renumbered
      if (finalContent !== contentToSave) {
        setContentState(finalContent);
      }
      
      return true;
    } catch (error) {
      console.error('Error saving content:', error);
      toast.error('Failed to save content');
      return false;
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  }, [proposalId, sectionId, sectionNumber, user?.id]);

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
        setContentState(data.content || '');
        contentIdRef.current = data.id;
        lastVersionContentRef.current = data.content || '';
      } else {
        setContentState('');
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
              setContentState(newData.content || '');
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

  // Debounced save with queuing
  const saveContent = useCallback(async (newContent: string) => {
    if (!proposalId || !sectionId || !user?.id) return;

    const success = await saveContentImmediately(newContent);
    
    if (success) {
      // Schedule version save check
      if (versionTimeoutRef.current) {
        clearTimeout(versionTimeoutRef.current);
      }
      versionTimeoutRef.current = setTimeout(() => {
        saveVersion(newContent);
      }, VERSION_SAVE_INTERVAL);
    }
  }, [proposalId, sectionId, user?.id, saveVersion, saveContentImmediately]);

  // Handle content change with debounce
  const handleContentChange = useCallback((newContent: string) => {
    setContentState(newContent);
    pendingContentRef.current = newContent;

    // Debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, AUTOSAVE_DEBOUNCE);
  }, [saveContent]);

  // Flush pending changes immediately
  const flushPendingChanges = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    if (pendingContentRef.current !== null) {
      await saveContentImmediately(pendingContentRef.current);
    }
  }, [saveContentImmediately]);

  // Handle beforeunload - save immediately when user leaves page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingContentRef.current !== null) {
        // Use sendBeacon for reliable save on page unload
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/section_content?id=eq.${contentIdRef.current}`;
        const data = JSON.stringify({
          content: pendingContentRef.current,
          last_edited_by: user?.id,
          updated_at: new Date().toISOString(),
        });
        
        navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
        
        // Also try to save synchronously
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user?.id]);

  // Handle visibility change - save when tab becomes hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingContentRef.current !== null) {
        flushPendingChanges();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flushPendingChanges]);

  // Cleanup on unmount - flush any pending changes
  useEffect(() => {
    return () => {
      // Clear timeouts
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (versionTimeoutRef.current) {
        clearTimeout(versionTimeoutRef.current);
      }
      
      // Synchronously save any pending content using sendBeacon
      if (pendingContentRef.current !== null && contentIdRef.current && user?.id) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/section_content?id=eq.${contentIdRef.current}`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Prefer': 'return=minimal',
        };
        
        // sendBeacon doesn't support custom headers, so we'll use a sync XHR as fallback
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('PATCH', url, false); // Synchronous
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
          xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('sb-nfeoyxjstfehwrkgapho-auth-token') ? JSON.parse(localStorage.getItem('sb-nfeoyxjstfehwrkgapho-auth-token') || '{}')?.access_token : ''}`);
          xhr.setRequestHeader('Prefer', 'return=minimal');
          xhr.send(JSON.stringify({
            content: pendingContentRef.current,
            last_edited_by: user.id,
            updated_at: new Date().toISOString(),
          }));
        } catch (e) {
          console.error('Failed to save on unmount:', e);
        }
      }
      
      // Save version if content changed when leaving the section
      const currentContent = pendingContentRef.current || '';
      if (currentContent !== lastVersionContentRef.current && currentContent.trim()) {
        saveVersion(currentContent);
      }
    };
  }, [user?.id, saveVersion]);

  return {
    content,
    setContent: handleContentChange,
    loading,
    saving,
    lastSaved,
    lastCitationMapping,
    saveNow: flushPendingChanges,
    saveVersionNow: () => saveVersion(content),
  };
}
