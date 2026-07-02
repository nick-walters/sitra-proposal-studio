/**
 * Position → colour rule for WP drafts (with per-position overrides).
 *
 * Default palette (see src/lib/wpColors.ts):
 *   - Last position (order_index === totalWPs - 1)  → coordination  (#367ABA)
 *   - Penultimate  (order_index === totalWPs - 2)   → exploitation  (#75CFEB)
 *   - Everything else                               → WP_CONTENT_COLORS[orderIndex % 7]
 *
 * Per-position overrides (Stage C):
 *   Stored per-proposal in wp_color_palette.colors as (string|null)[]:
 *     colors[orderIndex] = hex override, or null/absent = use default.
 *   The overrides array is indexed by position, NOT by WP identity — so a WP
 *   moving positions picks up the new position's overridden (or default) colour.
 *
 * Theme mode (Stage D untouched here): a WP with a theme_id + themes-enabled
 *   proposal has its theme colour written down, overriding the position colour.
 */

import {
  WP_CONTENT_COLORS,
  WP_EXPLOITATION_COLOR,
  WP_COORDINATION_COLOR,
} from './wpColors';
import { supabase } from '@/integrations/supabase/client';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function computeWPColorForPosition(
  orderIndex: number,
  totalWPs: number,
  overrides?: readonly (string | null | undefined)[],
): string {
  const override = overrides?.[orderIndex];
  if (typeof override === 'string' && HEX_RE.test(override)) {
    return override.toUpperCase();
  }
  if (totalWPs >= 2 && orderIndex === totalWPs - 1) return WP_COORDINATION_COLOR;
  if (totalWPs >= 2 && orderIndex === totalWPs - 2) return WP_EXPLOITATION_COLOR;
  const idx =
    ((orderIndex % WP_CONTENT_COLORS.length) + WP_CONTENT_COLORS.length) %
    WP_CONTENT_COLORS.length;
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
 * Read per-position colour overrides for a proposal from wp_color_palette.
 * Returns a sparse array of hex strings / nulls indexed by orderIndex.
 * Missing row → empty array (all defaults).
 */
export async function fetchPositionOverrides(
  proposalId: string,
): Promise<(string | null)[]> {
  const { data, error } = await supabase
    .from('wp_color_palette')
    .select('colors')
    .eq('proposal_id', proposalId)
    .maybeSingle();
  if (error) throw error;
  const raw = (data?.colors as unknown) ?? null;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) =>
    typeof v === 'string' && HEX_RE.test(v) ? v.toUpperCase() : null,
  );
}

/**
 * Upsert a single per-position override into wp_color_palette.
 * Pass `null` to clear the override at that index (fall back to default).
 */
export async function setPositionOverride(
  proposalId: string,
  orderIndex: number,
  hexOrNull: string | null,
): Promise<void> {
  const existing = await fetchPositionOverrides(proposalId);
  const next = [...existing];
  while (next.length <= orderIndex) next.push(null);
  next[orderIndex] =
    hexOrNull && HEX_RE.test(hexOrNull) ? hexOrNull.toUpperCase() : null;
  const { error } = await supabase
    .from('wp_color_palette')
    .upsert(
      { proposal_id: proposalId, colors: next as unknown as any },
      { onConflict: 'proposal_id' },
    );
  if (error) throw error;
}

/**
 * Write authoritative colours down to wp_drafts.color for every WP in a
 * proposal:
 *   - If a WP has a theme_id AND themes are enabled: colour = theme.color
 *   - Otherwise: colour = computeWPColorForPosition(order_index, total, overrides)
 *
 * Skips updates when the colour is already correct.
 * Dispatches 'cross-ref-data-changed' if any row was updated.
 */
export async function reconcileWPColorsForProposal(proposalId: string): Promise<void> {
  const [wpRes, propRes, themesRes, overrides] = await Promise.all([
    supabase
      .from('wp_drafts')
      .select('id, order_index, theme_id, color')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase.from('proposals').select('use_wp_themes').eq('id', proposalId).single(),
    supabase.from('wp_themes').select('id, color').eq('proposal_id', proposalId),
    fetchPositionOverrides(proposalId),
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
    if (!target) target = computeWPColorForPosition(wp.order_index, total, overrides);
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
