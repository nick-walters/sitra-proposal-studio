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
      const [wpRes, thRes] = await Promise.all([
        supabase.from('wp_drafts').select('color').eq('proposal_id', proposalId),
        supabase.from('wp_themes').select('color').eq('proposal_id', proposalId),
      ]);
      const set = new Set<string>();
      for (const r of wpRes.data || []) {
        const n = normaliseHex((r as { color: string }).color);
        if (n) set.add(n);
      }
      for (const r of thRes.data || []) {
        const n = normaliseHex((r as { color: string }).color);
        if (n) set.add(n);
      }
      // FUTURE: union font-colour usage from editor content here.
      return Array.from(set);
    },
    enabled: !!proposalId,
    staleTime: 15_000,
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
