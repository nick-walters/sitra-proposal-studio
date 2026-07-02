import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WPColorPicker } from '@/components/WPColorPicker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  computeWPColorForPosition,
  fetchPositionOverrides,
  reconcileWPColorsForProposal,
  setPositionOverride,
} from '@/lib/computeWPColors';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { RotateCcw } from 'lucide-react';

interface WPColourSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSaved?: () => void;
}

interface PositionRow {
  order_index: number;
  wp_id: string | null;
  number: number | null;
  short_name: string | null;
}

export function WPColourSequenceDialog({
  open,
  onOpenChange,
  proposalId,
  onSaved,
}: WPColourSequenceDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [overrides, setOverrides] = useState<(string | null)[]>([]);
  const [extraColors, setExtraColors] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !proposalId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [wpsRes, themesRes, ovr] = await Promise.all([
          supabase
            .from('wp_drafts')
            .select('id, number, short_name, order_index, color')
            .eq('proposal_id', proposalId)
            .order('order_index'),
          supabase.from('wp_themes').select('color').eq('proposal_id', proposalId),
          fetchPositionOverrides(proposalId),
        ]);
        if (cancelled) return;
        if (wpsRes.error) throw wpsRes.error;
        const wps = wpsRes.data || [];
        setPositions(
          wps.map((w) => ({
            order_index: w.order_index,
            wp_id: w.id,
            number: w.number,
            short_name: w.short_name,
          })),
        );
        setOverrides(ovr);

        // Distinct in-proposal colours minus default palette
        const palette = new Set(DEFAULT_WP_COLORS.map((c) => c.toUpperCase()));
        const seen = new Set<string>();
        const extras: string[] = [];
        const push = (c: string | null | undefined) => {
          if (!c) return;
          const norm = c.toUpperCase();
          if (!/^#[0-9A-F]{6}$/.test(norm)) return;
          if (palette.has(norm) || seen.has(norm)) return;
          seen.add(norm);
          extras.push(norm);
        };
        (wps || []).forEach((w) => push(w.color));
        (themesRes.data || []).forEach((t: { color: string }) => push(t.color));
        setExtraColors(extras);
      } catch (err) {
        console.error('Load position colours failed:', err);
        toast.error('Failed to load position colours');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, proposalId]);

  const total = positions.length;

  const handleSetOverride = async (orderIndex: number, hex: string) => {
    setSaving(orderIndex);
    try {
      await setPositionOverride(proposalId, orderIndex, hex);
      await reconcileWPColorsForProposal(proposalId);
      const next = [...overrides];
      while (next.length <= orderIndex) next.push(null);
      next[orderIndex] = hex.toUpperCase();
      setOverrides(next);
      onSaved?.();
    } catch (err) {
      console.error('Save override failed:', err);
      toast.error('Failed to save colour');
    } finally {
      setSaving(null);
    }
  };

  const handleResetOverride = async (orderIndex: number) => {
    setSaving(orderIndex);
    try {
      await setPositionOverride(proposalId, orderIndex, null);
      await reconcileWPColorsForProposal(proposalId);
      const next = [...overrides];
      if (orderIndex < next.length) next[orderIndex] = null;
      setOverrides(next);
      onSaved?.();
    } catch (err) {
      console.error('Reset override failed:', err);
      toast.error('Failed to reset colour');
    } finally {
      setSaving(null);
    }
  };

  const rows = useMemo(() => {
    return positions.map((p) => {
      const effective = computeWPColorForPosition(p.order_index, total, overrides);
      const isLast = total >= 2 && p.order_index === total - 1;
      const isPenultimate = total >= 2 && p.order_index === total - 2;
      const label = isLast
        ? 'Coordination'
        : isPenultimate
          ? 'Exploitation'
          : `Position ${p.order_index + 1}`;
      const hasOverride = !!overrides[p.order_index];
      return { ...p, effective, label, hasOverride };
    });
  }, [positions, overrides, total]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Colour sequence</DialogTitle>
          <DialogDescription>
            Set a colour per position. The WP currently at each position adopts that
            colour, and reordering keeps colours positional. Themes (when enabled) still
            override position colours.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No work packages found.
          </div>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-[70px_1fr_auto_auto] gap-2 items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b">
              <div>Position</div>
              <div>Work package</div>
              <div className="text-center">Colour</div>
              <div />
            </div>
            {rows.map((r) => (
              <div
                key={r.order_index}
                className="grid grid-cols-[70px_1fr_auto_auto] gap-2 items-center py-1.5 border-b border-border/60"
              >
                <div className="text-xs font-medium">{r.label}</div>
                <div className="text-sm truncate">
                  {r.wp_id ? (
                    <span>
                      <span className="font-semibold">WP{r.number}</span>
                      {r.short_name ? <span className="text-muted-foreground"> · {r.short_name}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">(vacant)</span>
                  )}
                </div>
                <div className="flex items-center justify-center">
                  <WPColorPicker
                    color={r.effective}
                    onChange={(hex) => handleSetOverride(r.order_index, hex)}
                    extraColors={extraColors}
                    disabled={saving === r.order_index}
                    label={`${r.label} colour`}
                  />
                </div>
                <div className="w-7 flex justify-end">
                  {r.hasOverride ? (
                    <button
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                      title="Reset to default palette colour"
                      onClick={() => handleResetOverride(r.order_index)}
                      disabled={saving === r.order_index}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
