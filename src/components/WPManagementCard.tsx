import { useState, useCallback } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { WPBubble, ParticipantBubble } from '@/components/B31Pill';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WPColorPicker } from '@/components/WPColorPicker';

import { Layers, GripVertical, Plus, Trash2, Lock, LockOpen, Palette } from 'lucide-react';
import { WPColourSequenceDialog } from '@/components/WPColourSequenceDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWPColorPalette } from '@/hooks/useWPColorPalette';
import { useWPThemes, WPTheme } from '@/hooks/useWPThemes';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

interface WPDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  color: string;
  color_locked: boolean;
  order_index: number;
  theme_id: string | null;
  is_locked: boolean;
  locked_by: string | null;
  is_hidden?: boolean;
}

interface SortableWPRowProps {
  wp: WPDraft;
  participants: ParticipantSummary[];
  themes: WPTheme[];
  useThemes: boolean;
  onUpdate: (id: string, updates: Partial<WPDraft>) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  canEdit: boolean;
  isCoordinator: boolean;
}

function SortableWPRow({ wp, participants, themes, useThemes, onUpdate, onDelete, onToggleLock, canEdit, isCoordinator }: SortableWPRowProps) {
  const [leadOpen, setLeadOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: wp.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const selectedLead = participants.find((p) => p.id === wp.lead_participant_id);
  const selectedTheme = themes.find((t) => t.id === wp.theme_id);
  void selectedTheme; // theme selection still shown via wp.theme_id; colour now lives on wp.color

  // Grid columns change based on whether themes are enabled
  const gridCols = useThemes 
    ? 'grid-cols-[24px_50px_100px_90px_1fr_80px_20px_20px]' 
    : 'grid-cols-[24px_50px_90px_1fr_80px_20px_20px]';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid ${gridCols} gap-1.5 items-center pt-0.5 pb-[7px] border-b ${
        isDragging ? 'bg-muted shadow-lg' : ''
      }`}
    >
      {/* Drag Handle */}
      <div className="flex justify-center">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none"
          >
            <GripVertical className="w-4 h-4 text-[#2563EB]" />
          </button>
        )}
      </div>

      {/* WP Number Badge - with Color Picker or Theme Color */}
      {useThemes ? (
        <div className="flex justify-center">
          <WPBubble
            wpColor={wp.color}
            style={{ fontSize: '12px', height: 'auto', padding: '2px 8px' }}
          >
            WP{wp.number}
          </WPBubble>
        </div>
      ) : (
        <WPColorPicker
          color={wp.color}
          onChange={(color) => onUpdate(wp.id, { color } as any)}
          wpNumber={wp.number}
          disabled={!canEdit}
        />

      )}

      {/* Theme selector (only when themes enabled) */}
      {useThemes && (
        <Select
          value={wp.theme_id || 'none'}
          onValueChange={(value) => onUpdate(wp.id, { theme_id: value === 'none' ? null : value })}
          disabled={!canEdit}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">No theme</span>
            </SelectItem>
            {themes.map((theme) => (
              <SelectItem key={theme.id} value={theme.id}>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded shrink-0"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span className="truncate">
                    {theme.short_name || `Theme ${theme.number}`}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Short name */}
      <DebouncedInput
        value={wp.short_name || ''}
        onDebouncedChange={(v) => onUpdate(wp.id, { short_name: v })}
        placeholder="Short"
        className="h-7 text-sm"
        disabled={!canEdit}
      />

      {/* Title */}
      <DebouncedInput
        value={wp.title || ''}
        onDebouncedChange={(v) => onUpdate(wp.id, { title: v })}
        placeholder="Work package title"
        className="h-7 text-sm disabled:opacity-100"
        disabled={!canEdit}
      />

      {/* WP Lead - Dialog styled like partner reference dialog */}
      {selectedLead ? (
        <ParticipantBubble
          onClick={() => { if (canEdit) setLeadOpen(true); }}
          style={{ fontSize: '12px', height: 'auto', padding: '2px 8px', cursor: canEdit ? 'pointer' : 'not-allowed', opacity: canEdit ? 1 : 0.5 }}
          className="justify-self-start whitespace-nowrap hover:ring-2 hover:ring-primary/30 hover:scale-105 transition-all"
        >
          {selectedLead.organisation_short_name || `P${selectedLead.participant_number}`}
        </ParticipantBubble>
      ) : (
        <button
          className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap hover:ring-2 hover:ring-primary/30 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed justify-self-start"
          style={{
            backgroundColor: 'transparent',
            border: '1px dashed hsl(var(--muted-foreground))',
          }}
          disabled={!canEdit}
          onClick={() => setLeadOpen(true)}
        >
          + Lead
        </button>
      )}
      <Dialog open={leadOpen} onOpenChange={setLeadOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Select WP Lead</DialogTitle>
            <DialogDescription>
              Choose a partner organisation to lead this work package.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 p-1">
              {/* Clear selection option when a lead is selected */}
              {selectedLead && (
                <button
                  onClick={() => {
                    onUpdate(wp.id, { lead_participant_id: null });
                    setLeadOpen(false);
                  }}
                  className="w-full flex items-center p-3 rounded-md text-left hover:bg-destructive/10 transition-colors text-destructive border-b mb-1"
                >
                  <span className="text-sm font-medium">Clear selection</span>
                </button>
              )}
              {participants.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onUpdate(wp.id, { lead_participant_id: p.id });
                    setLeadOpen(false);
                  }}
                  className={`w-full flex items-center p-3 rounded-md text-left hover:bg-muted/80 transition-colors ${
                    p.id === wp.lead_participant_id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="w-24 shrink-0">
                    <span
                      className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
                      style={{
                        backgroundColor: '#000000',
                        color: '#ffffff',
                      }}
                    >
                      {p.organisation_short_name || `P${p.participant_number}`}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {p.organisation_name}
                    </div>
                    {p.english_name && p.english_name !== p.organisation_name && (
                      <div className="text-xs text-muted-foreground truncate">
                        {p.english_name}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Lock Button */}
      {canEdit && (
        <button
          onClick={() => onToggleLock(wp.id, !wp.is_locked)}
          className={`p-1 rounded transition-colors ${wp.is_locked ? 'text-destructive hover:bg-destructive/10' : 'text-green-600 hover:bg-green-100'}`}
          title={wp.is_locked ? 'Unlock work package' : 'Lock work package'}
        >
          {wp.is_locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
        </button>
      )}
      {!canEdit && <div />}

      {/* Delete Button */}
      {canEdit && (
        <button
          onClick={() => onDelete(wp.id)}
          className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
          title="Delete work package"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      {!canEdit && <div />}
    </div>
  );
}

interface WPManagementCardProps {
  proposalId: string;
  isCoordinator: boolean;
  isFullProposal?: boolean;
  onDraftVisibilityChange?: () => void;
  onSaveEvent?: () => void;
}

export function WPManagementCard({ proposalId, isCoordinator, isFullProposal = true, onDraftVisibilityChange, onSaveEvent }: WPManagementCardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [colourSequenceOpen, setColourSequenceOpen] = useState(false);

  // Color palette hook — retained for legacy read; per-position overrides now
  // live in wp_color_palette.colors indexed by orderIndex (see Stage C).
  const { colors: wpColors, updatePalette } = useWPColorPalette(proposalId);


  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // WP Themes
  const { themes } = useWPThemes(proposalId);

  // Fetch proposal to check budget_type and use_wp_themes
  const { data: proposal } = useQuery({
    queryKey: ['proposal-for-themes', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('budget_type, use_wp_themes, wp_drafts_visible, case_drafts_visible')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const isLumpSum = proposal?.budget_type === 'lump_sum';
  const useWpThemes = proposal?.use_wp_themes ?? false;
  const wpDraftsVisible = (proposal as any)?.wp_drafts_visible !== false;
  const caseDraftsVisible = (proposal as any)?.case_drafts_visible !== false;

  const handleDraftVisibility = async (field: 'wp_drafts_visible' | 'case_drafts_visible', visible: boolean) => {
    await supabase.from('proposals').update({ [field]: visible } as any).eq('id', proposalId);
    queryClient.invalidateQueries({ queryKey: ['proposal-for-themes', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['proposal'] });
    onDraftVisibilityChange?.();
  };

  // Theme toggle + editor now live inside WPColourSequenceDialog.


  // Fetch WP drafts
  const { data: wpDrafts = [], isLoading: wpsLoading } = useQuery({
    queryKey: ['wp-drafts-management', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, lead_participant_id, color, color_locked, order_index, theme_id, is_locked, locked_by, is_hidden')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as WPDraft[];
    },
  });

  // Fetch participants
  const { data: participants = [] } = useQuery({
    queryKey: ['participants-for-wp', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, english_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantSummary[];
    },
  });

  // Update WP mutation — triggers colour reconciliation when theme_id changes
  const updateWPMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WPDraft> }) => {
      const { error } = await supabase
        .from('wp_drafts')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      // If theme assignment changed, write down the correct colour immediately.
      if (Object.prototype.hasOwnProperty.call(updates, 'theme_id')) {
        const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
        await reconcileWPColorsForProposal(proposalId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      onSaveEvent?.();
    },
  });

  // Reorder mutation with optimistic updates — reassigns colours positionally
  const reorderMutation = useMutation({
    mutationFn: async (reorderedWPs: WPDraft[]) => {
      const { computeWPColorForPosition } = await import('@/lib/computeWPColors');
      const total = reorderedWPs.length;
      const updates = reorderedWPs.map((wp, index) => ({
        id: wp.id,
        order_index: index,
        number: index + 1,
        color: computeWPColorForPosition(index, total),
      }));

      // First pass: set order_index + temp negative number to avoid unique-constraint clashes
      for (const update of updates) {
        const { error } = await supabase
          .from('wp_drafts')
          .update({ order_index: update.order_index, number: -(update.number + 1000) })
          .eq('id', update.id);
        if (error) throw error;
      }

      // Second pass: set final number AND positional colour
      for (const update of updates) {
        const { error } = await supabase
          .from('wp_drafts')
          .update({ number: update.number, color: update.color })
          .eq('id', update.id);
        if (error) throw error;
      }

      // Theme-mode: overwrite positional colour with theme colour where assigned
      const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
      await reconcileWPColorsForProposal(proposalId);
    },
    onMutate: async (reorderedWPs) => {
      await queryClient.cancelQueries({ queryKey: ['wp-drafts-management', proposalId] });
      const previousWPs = queryClient.getQueryData<WPDraft[]>(['wp-drafts-management', proposalId]);
      const { computeWPColorForPosition } = await import('@/lib/computeWPColors');
      const total = reorderedWPs.length;
      const optimisticWPs = reorderedWPs.map((wp, index) => ({
        ...wp,
        order_index: index,
        number: index + 1,
        color: computeWPColorForPosition(index, total),
      }));
      queryClient.setQueryData(['wp-drafts-management', proposalId], optimisticWPs);
      return { previousWPs };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousWPs) {
        queryClient.setQueryData(['wp-drafts-management', proposalId], context.previousWPs);
      }
      toast.error('Failed to reorder work packages');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-gantt', proposalId] });
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed', { detail: { source: 'WPManagementCard.reorder' } }));

      onSaveEvent?.();
    },
  });

  // Add WP mutation — inserts before the last two WPs (Exploitation & Coordination)
  const addWPMutation = useMutation({
    mutationFn: async () => {
      const total = wpDrafts.length;
      const { WP_CONTENT_COLORS } = await import('@/lib/wpColors');

      if (total < 2) {
        // Less than 2 WPs: just append
        const newNumber = total + 1;
        const color = WP_CONTENT_COLORS[(newNumber - 1) % WP_CONTENT_COLORS.length];
        const { error } = await supabase.from('wp_drafts').insert({
          proposal_id: proposalId,
          number: newNumber,
          color,
          order_index: newNumber - 1,
        });
        if (error) throw error;
      } else {
        // Insert before the last two WPs
        const insertPosition = total - 2; // 0-indexed position for the new WP
        const newWPNumber = insertPosition + 1;
        const color = WP_CONTENT_COLORS[insertPosition % WP_CONTENT_COLORS.length];

        // First pass: shift last two WPs to temporary negative numbers
        const lastTwo = wpDrafts.slice(-2);
        for (let i = 0; i < lastTwo.length; i++) {
          await supabase
            .from('wp_drafts')
            .update({ number: -(1000 + i), order_index: insertPosition + 1 + i })
            .eq('id', lastTwo[i].id);
        }

        // Insert new WP at the position before last two
        const { error } = await supabase.from('wp_drafts').insert({
          proposal_id: proposalId,
          number: newWPNumber,
          color,
          order_index: insertPosition,
        });
        if (error) throw error;

        // Second pass: set final numbers for last two WPs (they keep their colors)
        for (let i = 0; i < lastTwo.length; i++) {
          await supabase
            .from('wp_drafts')
            .update({ number: newWPNumber + 1 + i, order_index: insertPosition + 1 + i })
            .eq('id', lastTwo[i].id);
        }
      }

      // Reassign colours positionally (theme-mode overrides applied on top)
      const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
      await reconcileWPColorsForProposal(proposalId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed', { detail: { source: 'WPManagementCard.add' } }));
      onSaveEvent?.();
      toast.success('Work package added');
    },
  });

  // Delete WP mutation — renumbers remaining WPs but preserves their existing colors
  const deleteWPMutation = useMutation({
    mutationFn: async (wpId: string) => {
      const { error } = await supabase
        .from('wp_drafts')
        .delete()
        .eq('id', wpId);
      if (error) throw error;

      // Fetch remaining WPs and renumber them (keep existing colors)
      const { data: remaining, error: fetchErr } = await supabase
        .from('wp_drafts')
        .select('id, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (fetchErr) throw fetchErr;

      if (remaining && remaining.length > 0) {
        // First pass: set temporary negative numbers to avoid unique constraint
        for (let i = 0; i < remaining.length; i++) {
          await supabase
            .from('wp_drafts')
            .update({ order_index: i, number: -(i + 1000) })
            .eq('id', remaining[i].id);
        }
        // Second pass: set final numbers (colors are preserved)
        for (let i = 0; i < remaining.length; i++) {
          await supabase
            .from('wp_drafts')
            .update({ number: i + 1 })
            .eq('id', remaining[i].id);
        }
      }

      // Reassign colours positionally after renumber
      const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
      await reconcileWPColorsForProposal(proposalId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-gantt', proposalId] });
      console.log('[SYNC-EVENT] dispatching cross-ref-data-changed', { source: 'WPManagementCard.delete' }); /* TEMP-LOG */
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed', { detail: { source: 'WPManagementCard.delete' } }));

      onSaveEvent?.();
      toast.success('Work package deleted');
    },
    onError: () => {
      toast.error('Failed to delete work package');
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = wpDrafts.findIndex((wp) => wp.id === active.id);
    const newIndex = wpDrafts.findIndex((wp) => wp.id === over.id);
    const reordered = arrayMove(wpDrafts, oldIndex, newIndex);
    
    reorderMutation.mutate(reordered);
  };

  const handleUpdateWP = useCallback((id: string, updates: Partial<WPDraft>) => {
    updateWPMutation.mutate({ id, updates });
  }, [updateWPMutation]);

  const handleDeleteWP = useCallback((id: string) => {
    if (confirm('Are you sure you want to delete this work package?')) {
      deleteWPMutation.mutate(id);
    }
  }, [deleteWPMutation]);

  const handleToggleLock = useCallback(async (id: string, locked: boolean) => {
    const { error } = await supabase
      .from('wp_drafts')
      .update({ 
        is_locked: locked, 
        locked_by: locked ? user?.id ?? null : null,
        locked_at: locked ? new Date().toISOString() : null,
      } as any)
      .eq('id', id);
    if (error) {
      toast.error('Failed to update lock status');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
    toast.success(locked ? 'Work package locked' : 'Work package unlocked');
  }, [user, proposalId, queryClient]);

  const handleToggleLockAll = useCallback(async () => {
    const allLocked = wpDrafts.every(wp => wp.is_locked);
    const newLocked = !allLocked;
    const { error } = await supabase
      .from('wp_drafts')
      .update({
        is_locked: newLocked,
        locked_by: newLocked ? user?.id ?? null : null,
        locked_at: newLocked ? new Date().toISOString() : null,
      } as any)
      .eq('proposal_id', proposalId);
    if (error) {
      toast.error('Failed to update lock status');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
    toast.success(newLocked ? 'All work packages locked' : 'All work packages unlocked');
  }, [user, proposalId, queryClient, wpDrafts]);


  if (wpsLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="w-4 h-4" />
            Work package manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="w-5 h-5" />
            Work package manager
          </CardTitle>
          {isCoordinator && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setColourSequenceOpen(true)}
              title="Set the colour for each WP position"
            >
              <Palette className="w-3.5 h-3.5" />
              Colour sequence
            </Button>
          )}
        </div>
      </CardHeader>
      <WPColourSequenceDialog
        open={colourSequenceOpen}
        onOpenChange={setColourSequenceOpen}
        proposalId={proposalId}
        isCoordinator={isCoordinator}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
          queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
          queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
          onSaveEvent?.();
        }}
      />

      <CardContent className="space-y-2">


        {/* Table Header */}
        <div className={`grid ${useWpThemes ? 'grid-cols-[24px_50px_100px_90px_1fr_80px_20px_20px]' : 'grid-cols-[24px_50px_90px_1fr_80px_20px_20px]'} gap-x-1.5 items-center text-xs font-bold text-muted-foreground border-b pb-1 min-h-[28px]`}>
          <div />
          <div className="text-center">Colour</div>
          {useWpThemes && <div>Theme</div>}
          <div>Short name</div>
          <div>Title</div>
          <div>WP Leader</div>
          {isCoordinator ? (
            <button
              onClick={handleToggleLockAll}
              className={`p-1 rounded transition-colors ${wpDrafts.length > 0 && wpDrafts.every(wp => wp.is_locked) ? 'text-destructive hover:bg-destructive/10' : 'text-green-600 hover:bg-green-100'}`}
              title={wpDrafts.length > 0 && wpDrafts.every(wp => wp.is_locked) ? 'Unlock all' : 'Lock all'}
            >
              {wpDrafts.length > 0 && wpDrafts.every(wp => wp.is_locked) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
            </button>
          ) : <div />}
          <div />
        </div>

        {/* Sortable WP List */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={wpDrafts.map((wp) => wp.id)} strategy={verticalListSortingStrategy}>
            {wpDrafts.map((wp) => (
              <SortableWPRow
                key={wp.id}
                wp={wp}
                participants={participants}
                themes={themes}
                useThemes={useWpThemes}
                onUpdate={handleUpdateWP}
                onDelete={handleDeleteWP}
                onToggleLock={handleToggleLock}
                canEdit={isCoordinator}
                isCoordinator={isCoordinator}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Actions */}
        {isCoordinator && (
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addWPMutation.mutate()}
              disabled={addWPMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add WP
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
