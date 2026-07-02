import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { WPColorPicker } from '@/components/WPColorPicker';
import { WPBubble } from '@/components/B31Pill';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  computeWPColorForPosition,
  fetchPositionOverrides,
  reconcileWPColorsForProposal,
  setPositionOverride,
} from '@/lib/computeWPColors';
import {
  DEFAULT_WP_COLORS,
  themeLetter,
  WP_CONTENT_COLORS,
  WP_EXPLOITATION_COLOR,
  WP_COORDINATION_COLOR,
} from '@/lib/wpColors';

/** Default colour for a theme at a given position (mirrors seed + fixed-pair rule). */
function defaultThemeColor(orderIndex: number, total: number): string {
  if (total >= 2 && orderIndex === total - 1) return WP_COORDINATION_COLOR;
  if (total >= 2 && orderIndex === total - 2) return WP_EXPLOITATION_COLOR;
  const idx = ((orderIndex % WP_CONTENT_COLORS.length) + WP_CONTENT_COLORS.length) % WP_CONTENT_COLORS.length;
  return WP_CONTENT_COLORS[idx];
}
import { RotateCcw, Plus, Trash2, GripVertical, Lock } from 'lucide-react';
import { useWPThemes, isFixedThemeIndex, type WPTheme } from '@/hooks/useWPThemes';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface WPColourSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  isCoordinator?: boolean;
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
  isCoordinator = true,
  onSaved,
}: WPColourSequenceDialogProps) {
  const queryClient = useQueryClient();

  // ---- Proposal (budget_type + themes toggle) ----
  const { data: proposal } = useQuery({
    queryKey: ['proposal-colour-seq', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('budget_type, use_wp_themes')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data as { budget_type: string; use_wp_themes: boolean };
    },
    enabled: open && !!proposalId,
  });
  const isLumpSum = proposal?.budget_type === 'lump_sum';
  const useThemes = !!proposal?.use_wp_themes;

  // ---- Themes ----
  const { themes, seedThemesIfEmpty, addTheme, updateTheme, deleteTheme, reorderThemes, isAdding: isAddingTheme } = useWPThemes(proposalId);

  const toggleThemes = async (enabled: boolean) => {
    const { error } = await supabase.from('proposals').update({ use_wp_themes: enabled }).eq('id', proposalId);
    if (error) {
      toast.error('Failed to toggle themes');
      return;
    }
    if (enabled) {
      const res = await seedThemesIfEmpty();
      if (res?.seeded) toast.success('Seeded 4 default themes');
    }
    queryClient.invalidateQueries({ queryKey: ['proposal-colour-seq', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['proposal-for-themes', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
    await reconcileWPColorsForProposal(proposalId);
    onSaved?.();
  };

  // ---- Position mode data ----
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
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
        console.error('Load colour data failed:', err);
        toast.error('Failed to load colours');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, proposalId, themes.length, useThemes]);

  const total = positions.length;

  const handleSetOverride = async (orderIndex: number, hex: string) => {
    setSaving(`pos-${orderIndex}`);
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
    setSaving(`pos-${orderIndex}`);
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

  const posRows = useMemo(() => {
    return positions.map((p) => {
      const effective = computeWPColorForPosition(p.order_index, total, overrides);
      const label = `Position ${p.order_index + 1}`;
      const hasOverride = !!overrides[p.order_index];
      return { ...p, effective, label, hasOverride };
    });
  }, [positions, overrides, total]);

  // ---- Theme reorder ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleThemeDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const totalT = themes.length;
    const oldIndex = themes.findIndex((t) => t.id === active.id);
    const newIndex = themes.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Block moves involving fixed pair OR moves into fixed positions.
    if (isFixedThemeIndex(oldIndex, totalT) || isFixedThemeIndex(newIndex, totalT)) {
      toast.error('The fixed exploitation & coordination themes are pinned last');
      return;
    }
    const reordered = arrayMove(themes, oldIndex, newIndex);
    reorderThemes(reordered);
  };

  const showThemeMode = isLumpSum && useThemes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colour sequence</DialogTitle>
          <DialogDescription>
            {showThemeMode
              ? 'Group WPs by theme. Each theme has one colour that all its member WPs adopt. The last two themes are the fixed exploitation & coordination slots.'
              : 'Set a colour per position. The WP currently at each position adopts that colour, and reordering keeps colours positional.'}
          </DialogDescription>
        </DialogHeader>

        {/* Lump-sum: theme toggle */}
        {isLumpSum && isCoordinator && (
          <div className="flex items-center space-x-2 pb-3 border-b">
            <Switch id="use-wp-themes" checked={useThemes} onCheckedChange={toggleThemes} />
            <Label htmlFor="use-wp-themes" className="text-sm cursor-pointer">
              Group WPs by themes (one colour per theme)
            </Label>
          </div>
        )}

        {showThemeMode ? (
          // ---------- Theme editor ----------
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-[24px_80px_90px_110px_1fr_70px_20px] gap-2 items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b">
              <div />
              <div>Position</div>
              <div className="text-center">Theme</div>
              <div>Short name</div>
              <div>Theme name</div>
              <div className="text-center">Colour</div>
              <div />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleThemeDragEnd}>
              <SortableContext items={themes.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {themes.map((t, i) => (
                  <SortableThemeRow
                    key={t.id}
                    theme={t}
                    index={i}
                    total={themes.length}
                    extraColors={extraColors}
                    canEdit={isCoordinator}
                    proposalId={proposalId}
                    onColorChange={(hex) => updateTheme(t.id, { color: hex })}
                    onShortChange={(v) => updateTheme(t.id, { short_name: v })}
                    onNameChange={(v) => updateTheme(t.id, { name: v })}
                    onReset={() => updateTheme(t.id, { color: defaultThemeColor(i, themes.length) })}
                    onDelete={() => {
                      if (isFixedThemeIndex(i, themes.length)) {
                        toast.error('Fixed themes cannot be deleted');
                        return;
                      }
                      if (confirm('Delete this theme? WPs using it will have no theme assigned.')) {
                        deleteTheme(t.id);
                      }
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {isCoordinator && (
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => addTheme()} disabled={isAddingTheme}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add theme
                </Button>
                <span className="text-xs text-muted-foreground">
                  Inserted before the fixed pair. Assign WPs to themes in the WP manager row.
                </span>
              </div>
            )}
          </div>
        ) : (
          // ---------- Position mode ----------
          <>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : posRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No work packages found.</div>
            ) : (
              <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-[90px_1fr_auto_auto] gap-2 items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b">
                  <div>Position</div>
                  <div>Work package</div>
                  <div className="text-center">Colour</div>
                  <div />
                </div>
                {posRows.map((r) => (
                  <div
                    key={r.order_index}
                    className="grid grid-cols-[90px_1fr_auto_auto] gap-2 items-center py-1.5 border-b border-border/60"
                  >
                    <div className="text-xs font-medium">{r.label}</div>
                    <div className="text-sm">
                      {r.wp_id && r.number != null ? (
                        <WPBubble wpNumber={r.number} wpColor={r.effective} />
                      ) : (
                        <span className="text-muted-foreground italic text-xs">(vacant)</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center">
                      <WPColorPicker
                        color={r.effective}
                        onChange={(hex) => handleSetOverride(r.order_index, hex)}
                        extraColors={extraColors}
                        proposalId={proposalId}
                        canManageCustom={isCoordinator}
                        disabled={saving === `pos-${r.order_index}` || !isCoordinator}
                        label={`${r.label} colour`}
                        excludePaletteColors={['#000000']}
                      />

                    </div>
                    <div className="w-7 flex justify-end">
                      {r.hasOverride && isCoordinator ? (
                        <button
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Reset to default palette colour"
                          onClick={() => handleResetOverride(r.order_index)}
                          disabled={saving === `pos-${r.order_index}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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

// ---------- Sortable theme row ----------
interface SortableThemeRowProps {
  theme: WPTheme;
  index: number;
  total: number;
  extraColors: string[];
  canEdit: boolean;
  proposalId: string;
  onColorChange: (hex: string) => void;
  onShortChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onReset: () => void;
  onDelete: () => void;
}

function SortableThemeRow({
  theme, index, total, extraColors, canEdit, proposalId,
  onColorChange, onShortChange, onNameChange, onReset, onDelete,
}: SortableThemeRowProps) {
  const fixed = isFixedThemeIndex(index, total);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: theme.id,
    disabled: !canEdit || fixed,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const letter = themeLetter(index);
  const defaultColor = defaultThemeColor(index, total).toUpperCase();
  const hasOverride = (theme.color || '').toUpperCase() !== defaultColor;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[24px_80px_90px_110px_1fr_70px_20px_20px] gap-2 items-center py-1 border-b ${isDragging ? 'bg-muted shadow-lg' : ''}`}
    >
      <div className="flex justify-center">
        {fixed ? (
          <Lock className="w-3.5 h-3.5 text-muted-foreground" aria-label="Fixed position" />
        ) : canEdit ? (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none">
            <GripVertical className="w-4 h-4 text-[#2563EB]" />
          </button>
        ) : null}
      </div>
      <div className="text-xs font-medium">Position {index + 1}</div>
      <div className="flex items-center justify-center">
        <WPBubble wpColor={theme.color}>{`Theme ${letter}`}</WPBubble>
      </div>
      <DebouncedInput
        value={theme.short_name || ''}
        onDebouncedChange={onShortChange}
        placeholder="Short"
        className="h-7 text-sm"
        disabled={!canEdit}
      />
      <DebouncedInput
        value={theme.name || ''}
        onDebouncedChange={onNameChange}
        placeholder={fixed ? (index === total - 1 ? 'Project coordination & administration' : 'Dissemination, exploitation & communication') : 'Theme name'}
        className="h-7 text-sm"
        disabled={!canEdit}
      />
      <div className="flex items-center justify-center">
        <WPColorPicker
          color={theme.color}
          onChange={onColorChange}
          extraColors={extraColors}
          proposalId={proposalId}
          canManageCustom={canEdit}
          disabled={!canEdit}
          excludePaletteColors={['#000000']}
        />
      </div>
      <div className="w-5 flex justify-end">
        {hasOverride && canEdit ? (
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Reset to default theme colour"
            onClick={onReset}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
      <div className="w-5 flex justify-end">
        {!fixed && canEdit ? (
          <button onClick={onDelete} className="p-1 text-destructive hover:bg-destructive/10 rounded" title="Delete theme">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
