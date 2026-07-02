import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import {
  collectStringsFromJson,
  extractHexTextColorsFromHtml,
} from '@/lib/extractHexTextColors';


const HEX_RE = /^#[0-9A-F]{6}$/;
const PALETTE = new Set(DEFAULT_WP_COLORS.map((c) => c.toUpperCase()));

export function normaliseHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  return HEX_RE.test(s) ? s : null;
}

export function isDefaultPaletteColor(hex: string): boolean {
  const n = normaliseHex(hex);
  return !!n && PALETTE.has(n);
}

/**
 * Per-proposal saved custom colours (proposals.custom_colors). Additive to
 * wp_color_palette; centralises auto-add + delete so every WPColorPicker
 * usage contributes.
 *
 * `usedColors` = union of colours currently in use by WPs and themes. The
 * in-use guard used by the picker's delete button consults this set. A future
 * font-colour check would union its own set into `usedColors` here so no
 * other call site needs to change.
 */
export function useProposalCustomColors(proposalId: string | null | undefined) {
  const qc = useQueryClient();

  const customQ = useQuery({
    queryKey: ['proposal-custom-colors', proposalId],
    queryFn: async (): Promise<string[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('proposals')
        .select('custom_colors')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      const raw = (data?.custom_colors as unknown) ?? [];
      if (!Array.isArray(raw)) return [];
      const out: string[] = [];
      const seen = new Set<string>();
      for (const v of raw) {
        const n = typeof v === 'string' ? normaliseHex(v) : null;
        if (!n || PALETTE.has(n) || seen.has(n)) continue;
        seen.add(n);
        out.push(n);
      }
      return out;
    },
    enabled: !!proposalId,
    staleTime: 30_000,
  });

  const usedQ = useQuery({
    queryKey: ['proposal-in-use-colors', proposalId],
    queryFn: async (): Promise<string[]> => {
      if (!proposalId) return [];
      const set = new Set<string>();
      const addFromHtml = (html: string | null | undefined) => {
        for (const c of extractHexTextColorsFromHtml(html)) set.add(c);
      };

      // 1. WP + theme + case-type outline colours (structured hex columns).
      const [wpRes, thRes, ctRes] = await Promise.all([
        supabase
          .from('wp_drafts')
          .select('id, color, objectives, description_before_tasks, b31_objectives, b31_description_before_tasks')
          .eq('proposal_id', proposalId),

        supabase.from('wp_themes').select('color').eq('proposal_id', proposalId),
        supabase.from('proposal_case_types').select('outline_color').eq('proposal_id', proposalId),
      ]);
      for (const r of wpRes.data || []) {
        const row = r as Record<string, string | null>;
        const n = normaliseHex(row.color);
        if (n) set.add(n);
        addFromHtml(row.objectives);
        addFromHtml(row.description_before_tasks);
        addFromHtml(row.b31_objectives);
        addFromHtml(row.b31_description_before_tasks);
      }
      for (const r of thRes.data || []) {
        const n = normaliseHex((r as { color: string }).color);
        if (n) set.add(n);
      }
      for (const r of ctRes.data || []) {
        const n = normaliseHex((r as { outline_color: string | null }).outline_color);
        if (n) set.add(n);
      }

      // 2. Rich-text sources scoped to the proposal (font-colour union).
      const wpIdList = (wpRes.data || []).map((r) => (r as { id: string }).id);



      const [
        secRes,
        taskRes,
        delivRes,
        caseRes,
        pdescRes,
        pinfraRes,
        fstpRes,
      ] = await Promise.all([
        supabase.from('section_content').select('content').eq('proposal_id', proposalId),
        wpIdList.length
          ? supabase.from('wp_draft_tasks').select('description, b31_description').in('wp_draft_id', wpIdList)
          : Promise.resolve({ data: [] as Array<Record<string, string | null>> }),
        wpIdList.length
          ? supabase.from('wp_draft_deliverables').select('description').in('wp_draft_id', wpIdList)
          : Promise.resolve({ data: [] as Array<Record<string, string | null>> }),
        supabase
          .from('case_drafts')
          .select('description, background_context, proposed_solutions, expected_outcomes, replicability, key_stakeholders, subsection_content')
          .eq('proposal_id', proposalId),
        supabase
          .from('participant_descriptions')
          .select('contribution_resources, value_chain, industrial_involvement, participation_justification, participant_id, participants!inner(proposal_id)')
          .eq('participants.proposal_id', proposalId),
        supabase
          .from('participant_infrastructure')
          .select('description, participants!inner(proposal_id)')
          .eq('participants.proposal_id', proposalId),
        supabase.from('fstp_content').select('response_content').eq('proposal_id', proposalId),
      ]);

      for (const r of (secRes.data as Array<{ content: string | null }> | null) || []) addFromHtml(r.content);
      for (const r of (taskRes.data as Array<Record<string, string | null>> | null) || []) {
        addFromHtml(r.description);
        addFromHtml(r.b31_description);
      }
      for (const r of (delivRes.data as Array<{ description: string | null }> | null) || []) addFromHtml(r.description);
      for (const r of (caseRes.data as Array<Record<string, unknown>> | null) || []) {
        for (const k of ['description', 'background_context', 'proposed_solutions', 'expected_outcomes', 'replicability', 'key_stakeholders'] as const) {
          const v = r[k];
          if (typeof v === 'string') addFromHtml(v);
        }
        const strings: string[] = [];
        collectStringsFromJson(r.subsection_content, strings);
        for (const s of strings) addFromHtml(s);
      }
      for (const r of (pdescRes.data as Array<Record<string, unknown>> | null) || []) {
        for (const k of ['contribution_resources', 'value_chain', 'industrial_involvement', 'participation_justification'] as const) {
          const v = r[k];
          if (typeof v === 'string') addFromHtml(v);
        }
      }
      for (const r of (pinfraRes.data as Array<{ description: string | null }> | null) || []) addFromHtml(r.description);
      for (const r of (fstpRes.data as Array<{ response_content: string | null }> | null) || []) addFromHtml(r.response_content);

      return Array.from(set);

    },
    enabled: !!proposalId,
    staleTime: 0,
    refetchOnMount: 'always',
  });



  const customColors = customQ.data ?? [];
  const usedColors = new Set(usedQ.data ?? []);

  const persist = useCallback(
    async (next: string[]) => {
      if (!proposalId) return;
      const { error } = await supabase
        .from('proposals')
        .update({ custom_colors: next as unknown as never })
        .eq('id', proposalId);
      if (error) throw error;
      qc.setQueryData(['proposal-custom-colors', proposalId], next);
    },
    [proposalId, qc],
  );

  const addCustomColor = useCallback(
    async (hex: string) => {
      const n = normaliseHex(hex);
      if (!n || PALETTE.has(n)) return;
      const current = qc.getQueryData<string[]>(['proposal-custom-colors', proposalId]) ?? customColors;
      if (current.includes(n)) return;
      await persist([...current, n]);
    },
    [customColors, persist, proposalId, qc],
  );

  const removeCustomColor = useCallback(
    async (hex: string) => {
      const n = normaliseHex(hex);
      if (!n) return;
      if (usedColors.has(n)) return; // guarded
      const current = qc.getQueryData<string[]>(['proposal-custom-colors', proposalId]) ?? customColors;
      await persist(current.filter((c) => c !== n));
    },
    [customColors, persist, proposalId, qc, usedColors],
  );

  const isColorInUse = useCallback(
    (hex: string) => {
      const n = normaliseHex(hex);
      return !!n && usedColors.has(n);
    },
    [usedColors],
  );

  return { customColors, usedColors, addCustomColor, removeCustomColor, isColorInUse };
}
