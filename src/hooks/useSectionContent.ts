import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { renumberAllCaptionsWithMapping } from '@/lib/captionRenumbering';

interface UseSectionContentProps {
  proposalId: string;
  sectionId: string;
  sectionNumber?: string;
  placeholderContent?: string;
}

// Minimum interval between version snapshots: 5 minutes
const VERSION_MIN_INTERVAL = 5 * 60 * 1000;
// Debounce delay for autosave
const AUTOSAVE_DEBOUNCE = 5000;

/**
 * Check if the content change is significant enough to warrant a version snapshot.
 * Strips HTML and compares word/character differences.
 */
function hasSignificantChange(oldContent: string, newContent: string): boolean {
  const stripHtml = (html: string) =>
    html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  const oldText = stripHtml(oldContent);
  const newText = stripHtml(newContent);

  // Empty ↔ non-empty is always significant
  if ((!oldText && newText) || (oldText && !newText)) return true;

  // Character difference threshold
  const charDiff = Math.abs(newText.length - oldText.length);
  if (charDiff >= 50) return true;

  // Word difference threshold
  const oldWords = oldText.split(/\s+/).filter(w => w.length > 0);
  const newWords = newText.split(/\s+/).filter(w => w.length > 0);
  const wordDiff = Math.abs(newWords.length - oldWords.length);
  if (wordDiff >= 5) return true;

  return false;
}
// Retry config for saves
const MAX_SAVE_RETRIES = 2;
const RETRY_DELAY = 1500;

/**
 * Helper: get a valid auth token for sync XHR calls (beforeunload / unmount).
 * Falls back to reading from localStorage if session isn't available synchronously.
 */
function getAuthToken(): string {
  try {
    const raw = localStorage.getItem('sitra-proposal-studio-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token || '';
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * Perform a synchronous PATCH via XHR — used only in beforeunload / unmount
 * where we cannot await an async call.
 */
function syncSaveContent(contentId: string, content: string, userId: string) {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/section_content?id=eq.${contentId}`;
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', url, false); // synchronous
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`);
    xhr.setRequestHeader('Prefer', 'return=minimal');
    xhr.send(JSON.stringify({
      content,
      last_edited_by: userId,
      updated_at: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('[useSectionContent] syncSaveContent failed:', e);
  }
}

/**
 * Perform a synchronous POST to insert a version via RPC — used in unmount.
 * Calls the atomic insert_section_version function to avoid race conditions.
 */
function syncSaveVersion(proposalId: string, sectionId: string, content: string, userId: string) {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/insert_section_version`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, false); // synchronous
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`);
    xhr.setRequestHeader('Prefer', 'return=minimal');
    xhr.send(JSON.stringify({
      p_proposal_id: proposalId,
      p_section_id: sectionId,
      p_content: content,
      p_created_by: userId,
      p_is_auto_save: true,
    }));
  } catch (e) {
    console.error('[useSectionContent] syncSaveVersion failed:', e);
  }
}

export function useSectionContent({ proposalId, sectionId, sectionNumber, placeholderContent }: UseSectionContentProps) {
  const [content, setContentState] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [lastCitationMapping, setLastCitationMapping] = useState<Map<number, number>>(new Map());
  const [isPlaceholder, setIsPlaceholder] = useState(false);
  const { user } = useAuth();

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentIdRef = useRef<string | null>(null);
  const lastVersionContentRef = useRef<string>('');
  const lastVersionTimeRef = useRef<number>(0);
  const lastVersionNumberRef = useRef<number>(0);
  const pendingContentRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const contentRef = useRef<string>(''); // always-current content mirror
  const lastSavedContentRef = useRef<string>(''); // content actually written to DB

  // Keep contentRef in sync
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // ── Save a version snapshot (async, optionally forced) ──────────────
  const saveVersion = useCallback(async (contentToSave: string, force = false) => {
    if (!proposalId || !sectionId || !user?.id) return;
    if (contentToSave === lastVersionContentRef.current) return;
    if (!contentToSave.trim()) return;

    const now = Date.now();
    if (!force && now - lastVersionTimeRef.current < VERSION_MIN_INTERVAL) return;

    // Apply significance threshold for automatic saves (not forced)
    if (!force && lastVersionContentRef.current && !hasSignificantChange(lastVersionContentRef.current, contentToSave)) return;

    try {
      const { data, error } = await supabase.rpc('insert_section_version', {
        p_proposal_id: proposalId,
        p_section_id: sectionId,
        p_content: contentToSave,
        p_created_by: user.id,
      });

      if (error) throw error;

      lastVersionContentRef.current = contentToSave;
      lastVersionTimeRef.current = now;
      lastVersionNumberRef.current = data as number;
    } catch (error) {
      console.error('[useSectionContent] Error saving version:', error);
    }
  }, [proposalId, sectionId, user?.id]);

  // ── Save content (with retry) ──────────────────────────────────────
  const saveContentImmediately = useCallback(async (contentToSave: string, shouldRenumber = true): Promise<boolean> => {
    if (!proposalId || !sectionId || !user?.id) return false;
    if (isSavingRef.current) return false;

    isSavingRef.current = true;
    setSaving(true);

    let finalContent = contentToSave;
    let citationMapping = new Map<number, number>();
    if (shouldRenumber && sectionNumber) {
      const result = renumberAllCaptionsWithMapping(contentToSave, sectionNumber);
      finalContent = result.content;
      citationMapping = result.citationMapping;
    }

    let attempt = 0;
    let success = false;

    while (attempt <= MAX_SAVE_RETRIES && !success) {
      try {
        if (contentIdRef.current) {
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
        success = true;
      } catch (error) {
        attempt++;
        if (attempt > MAX_SAVE_RETRIES) {
          console.error('[useSectionContent] Save failed after retries:', error);
          toast.error('Failed to save content. Your changes may not be saved.');
        } else {
          console.warn(`[useSectionContent] Save attempt ${attempt} failed, retrying...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
      }
    }

    if (success) {
      setLastSaved(new Date());
      pendingContentRef.current = null;

      if (citationMapping.size > 0) {
        setLastCitationMapping(citationMapping);
      }
      if (finalContent !== contentToSave) {
        setContentState(finalContent);
      }

      // Track the actual content written to DB for version comparison
      lastSavedContentRef.current = finalContent;

      // Trigger a throttled version save after every successful content save
      saveVersion(finalContent);
    }

    isSavingRef.current = false;
    setSaving(false);
    return success;
  }, [proposalId, sectionId, sectionNumber, user?.id, saveVersion]);

  // ── Fetch content on mount ─────────────────────────────────────────
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
        console.error('[useSectionContent] Error fetching content:', error);
        toast.error('Failed to load content');
      }

      if (data) {
        setContentState(data.content || '');
        contentIdRef.current = data.id;
        lastVersionContentRef.current = data.content || '';
        setIsPlaceholder(false);

        // Save an initial version (baseline) if none exist yet
        if (data.content?.trim()) {
          const { count } = await supabase
            .from('section_versions')
            .select('id', { count: 'exact', head: true })
            .eq('proposal_id', proposalId)
            .eq('section_id', sectionId);

          if (count === 0) {
            // No versions yet — create baseline via atomic RPC
            const userId = data.last_edited_by || '';
            if (userId) {
              const { data: verNum } = await supabase.rpc('insert_section_version', {
                p_proposal_id: proposalId,
                p_section_id: sectionId,
                p_content: data.content,
                p_created_by: userId,
                p_is_auto_save: true,
              });
              lastVersionContentRef.current = data.content;
              lastVersionTimeRef.current = Date.now();
              lastVersionNumberRef.current = (verNum as number) || 1;
            }
          }
        }
      } else {
        if (placeholderContent) {
          setContentState(placeholderContent);
          setIsPlaceholder(true);
        } else {
          setContentState('');
          setIsPlaceholder(false);
        }
        contentIdRef.current = null;
        lastVersionContentRef.current = '';
      }
      setLoading(false);
    };

    fetchContent();
  }, [proposalId, sectionId]);

  // ── Real-time subscription ─────────────────────────────────────────
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

  // ── Debounced save on content change ───────────────────────────────
  const saveContent = useCallback(async (newContent: string) => {
    if (!proposalId || !sectionId || !user?.id) return;
    await saveContentImmediately(newContent);
  }, [proposalId, sectionId, user?.id, saveContentImmediately]);

  const handleContentChange = useCallback((newContent: string) => {
    setContentState(newContent);
    pendingContentRef.current = newContent;

    if (isPlaceholder) {
      setIsPlaceholder(false);
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, AUTOSAVE_DEBOUNCE);
  }, [saveContent, isPlaceholder]);

  // ── Periodic version saving (safety net) ───────────────────────────
  useEffect(() => {
    if (!proposalId || !sectionId || !user?.id) return;

    const intervalId = setInterval(() => {
      // Use lastSavedContentRef (what was actually written to DB) for comparison,
      // since pendingContentRef is null after save and contentRef may match the pre-renumber version
      const currentContent = lastSavedContentRef.current || contentRef.current;
      if (currentContent && currentContent !== lastVersionContentRef.current && currentContent.trim()) {
        saveVersion(currentContent, true); // force=true to bypass throttle since interval already provides throttling
      }
    }, VERSION_MIN_INTERVAL);

    return () => clearInterval(intervalId);
  }, [proposalId, sectionId, user?.id, saveVersion]);

  const clearPlaceholder = useCallback(() => {
    setContentState('');
    setIsPlaceholder(false);
    pendingContentRef.current = '';
  }, []);

  // ── Flush pending changes immediately ──────────────────────────────
  const flushPendingChanges = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingContentRef.current !== null) {
      await saveContentImmediately(pendingContentRef.current);
    }
  }, [saveContentImmediately]);

  // ── beforeunload: save via sync XHR (sendBeacon can't carry auth) ─
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingContentRef.current !== null && contentIdRef.current && user?.id) {
        syncSaveContent(contentIdRef.current, pendingContentRef.current, user.id);
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user?.id]);

  // ── Visibility change: flush saves when tab becomes hidden ─────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingContentRef.current !== null) {
        flushPendingChanges();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flushPendingChanges]);

  // ── Cleanup on unmount: sync XHR for both content and version ──────
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Save pending content via sync XHR
      if (pendingContentRef.current !== null && contentIdRef.current && user?.id) {
        syncSaveContent(contentIdRef.current, pendingContentRef.current, user.id);
      }

      // Save a version if content changed since last version (atomic RPC)
      const currentContent = pendingContentRef.current ?? contentRef.current;
      if (
        currentContent &&
        currentContent !== lastVersionContentRef.current &&
        currentContent.trim() &&
        user?.id
      ) {
        syncSaveVersion(proposalId, sectionId, currentContent, user.id);
      }
    };
  }, [proposalId, sectionId, user?.id]);

  return {
    content,
    setContent: handleContentChange,
    loading,
    saving,
    lastSaved,
    lastCitationMapping,
    isPlaceholder,
    clearPlaceholder,
    saveNow: flushPendingChanges,
    saveVersionNow: () => saveVersion(content),
  };
}
