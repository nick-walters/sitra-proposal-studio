/**
 * Single position → colour rule for WP drafts.
 *
 * Canonical palette (see src/lib/wpColors.ts):
 *   - Last position (order_index === totalWPs - 1)     → coordination  (#367ABA)
 *   - Penultimate  (order_index === totalWPs - 2)     → exploitation  (#75CFEB)
 *   - Everything else                                 → WP_CONTENT_COLORS[orderIndex % 7]
 *
 * Per-position OVERRIDES (Stage C) and fixed-last-two theme seeding (Stage D)
 * are not implemented here yet — this returns the default palette colour only.
 */

import {
  WP_CONTENT_COLORS,
  WP_EXPLOITATION_COLOR,
  WP_COORDINATION_COLOR,
} from './wpColors';
import { supabase } from '@/integrations/supabase/client';

export function computeWPColorForPosition(orderIndex: number, totalWPs: number): string {
  if (totalWPs >= 2 && orderIndex === totalWPs - 1) return WP_COORDINATION_COLOR;
  if (totalWPs >= 2 && orderIndex === totalWPs - 2) return WP_EXPLOITATION_COLOR;
  const idx = ((orderIndex % WP_CONTENT_COLORS.length) + WP_CONTENT_COLORS.length) % WP_CONTENT_COLORS.length;
  return WP_CONTENT_COLORS[idx];
}

interface WPRow {
  id: string;
  order_index: number;
  theme_id?: string | null;
}
interface ThemeRow {
  id: string;
  color: string;
}

/**
 * Write authoritative colours down to wp_drafts.color for every WP in a
 * proposal:
 *   - If a WP has a theme_id AND themes are enabled: colour = theme.color
 *   - Otherwise: colour = computeWPColorForPosition(order_index, total)
 *
 * Skips updates when the colour is already correct.
 * Dispatches 'cross-ref-data-changed' if any row was updated.
 */
export async function reconcileWPColorsForProposal(proposalId: string): Promise<void> {
  const [wpRes, propRes, themesRes] = await Promise.all([
    supabase
      .from('wp_drafts')
      .select('id, order_index, theme_id, color')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase.from('proposals').select('use_wp_themes').eq('id', proposalId).single(),
    supabase.from('wp_themes').select('id, color').eq('proposal_id', proposalId),
  ]);
  if (wpRes.error) throw wpRes.error;
  const wps = (wpRes.data || []) as (WPRow & { color: string })[];
  const useThemes = propRes.data?.use_wp_themes ?? false;
  const themesById = new Map<string, ThemeRow>(
    ((themesRes.data || []) as ThemeRow[]).map((t) => [t.id, t]),
  );
  const total = wps.length;
  let changed = 0;
  for (const wp of wps) {
    let target: string | null = null;
    if (useThemes && wp.theme_id) {
      const t = themesById.get(wp.theme_id);
      if (t) target = t.color;
    }
    if (!target) target = computeWPColorForPosition(wp.order_index, total);
    if (target && target !== wp.color) {
      const { error } = await supabase
        .from('wp_drafts')
        .update({ color: target })
        .eq('id', wp.id);
      if (error) throw error;
      changed++;
    }
  }
  if (changed > 0) {
    window.dispatchEvent(
      new CustomEvent('cross-ref-data-changed', {
        detail: { source: 'reconcileWPColorsForProposal' },
      }),
    );
  }
}
