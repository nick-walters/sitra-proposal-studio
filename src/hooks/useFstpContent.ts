import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const DEFAULT_GRANT_INSTRUCTIONS = `Where this possibility is indicated under the relevant topic in the Work Programme and in the relevant calls for proposals, provide a description of the use of financial support to third parties. This description must address at least the following:
1.   Clearly detail the objectives and the results to be obtained and
2.   Contain the following specifications (as a minimum):
     a.     The maximum amount of financial support for each third party; this amount may not exceed €60,000, unless explicitly mentioned in the Work Programme topic. If your project requires a higher amount per third party than the threshold amount set in the call conditions, justify and explain why this is necessary in order to fulfil your project's objectives.
     b.     The criteria for calculating the exact amount of the financial support
     c.     The different types of activity that qualify for financial support, on the basis of a closed list
     d.     The persons or categories of persons that may receive financial support, and
      e.     The criteria for giving financial support`;

const DEFAULT_PRIZE_INSTRUCTIONS = `Provide a description of the use of financial support to third parties. This description must address at least the following: 

1. clearly detail the objectives and the results to be obtained and

2. Contain the following specifications (as a minimum):  

a) The eligibility and award criteria;

b) The amount of the prize; and

c) The payment arrangements.

Please check in the Work Programme and the call for proposals if there are other conditions that apply and, if so, include them in the specifications or in any other element of the proposal as appropriate.`;

const DEFAULT_RESPONSE = '<p><strong><u>1. Objectives</u></strong></p><p>The objectives of the open call for FSTP are </p><p><strong><u>2. Open call &amp; evaluation criteria specifications</u></strong></p><ol data-list-style="lower-alpha" style="list-style-type: lower-alpha;"><li><p>The maximum amount of financial support available for each third party is €XX,000. The total amount of funding available is €XX,000.</p></li><li><p>The criteria for calculating the exact amount of financial support are </p></li><li><p>The different types of activity that qualify for financial support, on the basis of a closed list, are </p></li><li><p>The persons or categories of persons that may receive financial support are </p></li><li><p>The criteria for giving financial support are </p></li></ol><p></p>';

export interface FstpContentData {
  id?: string;
  instructionsText: string;
  responseContent: string;
}

export function useFstpContent(proposalId: string, fstpType: 'grant' | 'prize' = 'grant') {
  const DEFAULT_INSTRUCTIONS = fstpType === 'prize' ? DEFAULT_PRIZE_INSTRUCTIONS : DEFAULT_GRANT_INSTRUCTIONS;
  const { user } = useAuth();
  const [data, setData] = useState<FstpContentData>({
    instructionsText: DEFAULT_INSTRUCTIONS,
    responseContent: DEFAULT_RESPONSE,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to the latest data so saveNow always has fresh values
  const dataRef = useRef(data);
  dataRef.current = data;

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
      const r = row as any;
      setData({
        id: r.id,
        instructionsText: r.instructions_text || DEFAULT_INSTRUCTIONS,
        responseContent: r.response_content || DEFAULT_RESPONSE,
      });
    }
    setLoading(false);
  }, [proposalId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const saveContent = useCallback(async (instructionsText: string, responseContent: string) => {
    if (!proposalId || !user) {
      console.warn('FSTP save skipped: no proposalId or user');
      return;
    }
    setSaving(true);
    setSaveError(null);

    const payload: Record<string, any> = {
      proposal_id: proposalId,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
      instructions_text: instructionsText,
      response_content: responseContent,
    };

    const { error } = await supabase
      .from('fstp_content' as any)
      .upsert(payload, { onConflict: 'proposal_id' } as any);

    if (error) {
      const msg = 'Failed to save FSTP content';
      toast.error(msg);
      setSaveError(msg);
      console.error('FSTP save error:', error);
    } else {
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setSaveError(null);
    }
    setSaving(false);
  }, [proposalId, user]);

  const scheduleSave = useCallback((nextData?: FstpContentData) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const d = nextData ?? dataRef.current;
      saveContent(d.instructionsText, d.responseContent);
    }, 5000);
  }, [saveContent]);

  const updateInstructions = useCallback((text: string) => {
    const nextData = { ...dataRef.current, instructionsText: text };
    dataRef.current = nextData;
    setData(nextData);
    setHasUnsavedChanges(true);
    scheduleSave(nextData);
  }, [scheduleSave]);

  const updateResponse = useCallback((content: string) => {
    const nextData = { ...dataRef.current, responseContent: content };
    dataRef.current = nextData;
    setData(nextData);
    setHasUnsavedChanges(true);
    scheduleSave(nextData);
  }, [scheduleSave]);

  const saveNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const d = dataRef.current;
    saveContent(d.instructionsText, d.responseContent);
  }, [saveContent]);

  return {
    data,
    loading,
    saving,
    lastSaved,
    hasUnsavedChanges,
    saveError,
    updateInstructions,
    updateResponse,
    saveNow,
  };
}
