import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const DEFAULT_INSTRUCTIONS = `Financial support in the form of a grant awarded after a call for proposals

Where this possibility is indicated under the relevant topic in the Work Programme and in the relevant calls for proposals, provide a description of the use of financial support to third parties. This description must address at least the following:

1.   clearly detail the objectives and the results to be obtained and

2.   contain the following specifications (as a minimum):

a)     the maximum amount of financial support for each third party; this amount may not exceed 60 000 EUR, unless explicitly mentioned in the Work Programme topic. If your project requires a higher amount per third party than the threshold amount set in the call conditions, justify and explain why this is necessary in order to fulfil your project's objectives.

b)     the criteria for calculating the exact amount of the financial support

c)     the different types of activity that qualify for financial support, on the basis of a closed list

d)     the persons or categories of persons that may receive financial support, and

e)     the criteria for giving financial support

Please check in the Work Programme and call for proposals if there are other conditions that apply and, if so, include them in the specifications or in any other element of the proposal as appropriate.`;

export interface FstpContentData {
  id?: string;
  instructionsText: string;
  responseContent: string;
}

export function useFstpContent(proposalId: string) {
  const { user } = useAuth();
  const [data, setData] = useState<FstpContentData>({
    instructionsText: DEFAULT_INSTRUCTIONS,
    responseContent: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchContent = useCallback(async () => {
    if (!proposalId) return;
    setLoading(true);
    const { data: row, error } = await supabase
      .from('fstp_content' as any)
      .select('*')
      .eq('proposal_id', proposalId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching FSTP content:', error);
      setLoading(false);
      return;
    }

    if (row) {
      setData({
        id: row.id,
        instructionsText: row.instructions_text || DEFAULT_INSTRUCTIONS,
        responseContent: row.response_content || '',
      });
    }
    setLoading(false);
  }, [proposalId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const saveContent = useCallback(async (updates: Partial<FstpContentData>) => {
    if (!proposalId || !user) return;
    setSaving(true);

    const payload: Record<string, any> = {
      proposal_id: proposalId,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    if (updates.instructionsText !== undefined) payload.instructions_text = updates.instructionsText;
    if (updates.responseContent !== undefined) payload.response_content = updates.responseContent;

    const { error } = await supabase
      .from('fstp_content' as any)
      .upsert(payload, { onConflict: 'proposal_id' } as any);

    if (error) {
      toast.error('Failed to save FSTP content');
      console.error(error);
    } else {
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    }
    setSaving(false);
  }, [proposalId, user]);

  const updateInstructions = useCallback((text: string) => {
    setData(prev => ({ ...prev, instructionsText: text }));
    setHasUnsavedChanges(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveContent({ instructionsText: text });
    }, 5000);
  }, [saveContent]);

  const updateResponse = useCallback((content: string) => {
    setData(prev => ({ ...prev, responseContent: content }));
    setHasUnsavedChanges(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveContent({ responseContent: content });
    }, 5000);
  }, [saveContent]);

  const saveNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveContent({
      instructionsText: data.instructionsText,
      responseContent: data.responseContent,
    });
  }, [saveContent, data]);

  return {
    data,
    loading,
    saving,
    lastSaved,
    hasUnsavedChanges,
    updateInstructions,
    updateResponse,
    saveNow,
  };
}
