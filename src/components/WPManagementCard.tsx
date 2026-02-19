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
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { WPColorPicker } from '@/components/WPColorPicker';
import { WPColorPaletteEditor } from '@/components/WPColorPaletteEditor';
import { Layers, GripVertical, Plus, AlertTriangle, Palette, Trash2, Paintbrush } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWPColorPalette } from '@/hooks/useWPColorPalette';
import { useWPThemes, WPTheme } from '@/hooks/useWPThemes';
import { populateB31 } from '@/lib/b31Population';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

interface WPDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  color: string;
  order_index: number;
  theme_id: string | null;
}

interface SortableWPRowProps {
  wp: WPDraft;
  participants: ParticipantSummary[];
  themes: WPTheme[];
  useThemes: boolean;
  onUpdate: (id: string, updates: Partial<WPDraft>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

function SortableWPRow({ wp, participants, themes, useThemes, onUpdate, onDelete, canEdit }: SortableWPRowProps) {
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
  const effectiveColor = useThemes && selectedTheme ? selectedTheme.color : wp.color;

  // Grid columns change based on whether themes are enabled
  const gridCols = useThemes 
    ? 'grid-cols-[24px_50px_100px_90px_1fr_80px_20px]' 
    : 'grid-cols-[24px_50px_90px_1fr_80px_20px]';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid ${gridCols} gap-1.5 items-center py-1 border-b ${
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
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* WP Number Badge - with Color Picker or Theme Color */}
      {useThemes ? (
        <div className="flex justify-center">
          <span
            className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: effectiveColor }}
          >
            WP{wp.number}
          </span>
        </div>
      ) : (
        <WPColorPicker
          color={wp.color}
          onChange={(color) => onUpdate(wp.id, { color })}
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

      {/* Short Name */}
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
        className="h-7 text-sm"
        disabled={!canEdit}
      />

      {/* WP Lead - Dialog styled like partner reference dialog */}
      <button
        className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap hover:ring-2 hover:ring-primary/30 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed justify-self-start"
        style={{
          backgroundColor: selectedLead ? '#000000' : 'transparent',
          color: selectedLead ? '#ffffff' : undefined,
          border: selectedLead ? 'none' : '1px dashed hsl(var(--muted-foreground))',
        }}
        disabled={!canEdit}
        onClick={() => setLeadOpen(true)}
      >
        {selectedLead
          ? selectedLead.organisation_short_name || `P${selectedLead.participant_number}`
          : '+ Lead'}
      </button>
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
}

export function WPManagementCard({ proposalId, isCoordinator, isFullProposal = true }: WPManagementCardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedWPs, setSelectedWPs] = useState<Set<string>>(new Set());
  const [isPopulating, setIsPopulating] = useState(false);
  const [paletteEditorOpen, setPaletteEditorOpen] = useState(false);
  
  
  // Color palette for the proposal
  const { colors: wpColors, updatePalette } = useWPColorPalette(proposalId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // WP Themes
  const { themes, addTheme, updateTheme, deleteTheme, reorderThemes, isAdding: isAddingTheme } = useWPThemes(proposalId);

  // Fetch proposal to check budget_type and use_wp_themes
  const { data: proposal } = useQuery({
    queryKey: ['proposal-for-themes', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('budget_type, use_wp_themes')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const isLumpSum = proposal?.budget_type === 'lump_sum';
  const useWpThemes = proposal?.use_wp_themes ?? false;

  // Toggle use_wp_themes
  const toggleWpThemesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('proposals')
        .update({ use_wp_themes: enabled })
        .eq('id', proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-for-themes', proposalId] });
    },
  });

  // Fetch WP drafts
  const { data: wpDrafts = [], isLoading: wpsLoading } = useQuery({
    queryKey: ['wp-drafts-management', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, lead_participant_id, color, order_index, theme_id')
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

  // Update WP mutation
  const updateWPMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WPDraft> }) => {
      const { error } = await supabase
        .from('wp_drafts')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
    },
  });

  // Reorder mutation with optimistic updates
  const reorderMutation = useMutation({
    mutationFn: async (reorderedWPs: WPDraft[]) => {
      const updates = reorderedWPs.map((wp, index) => ({
        id: wp.id,
        order_index: index,
        number: index + 1,
        color: wpColors[index % wpColors.length],
      }));
      
      // First pass: set all numbers to negative temporaries to avoid unique constraint violations
      for (const update of updates) {
        const { error } = await supabase
          .from('wp_drafts')
          .update({ order_index: update.order_index, number: -(update.number + 1000) })
          .eq('id', update.id);
        if (error) throw error;
      }
      
      // Second pass: set final numbers and reassign colors from palette
      for (const update of updates) {
        const { error } = await supabase
          .from('wp_drafts')
          .update({ number: update.number, color: update.color })
          .eq('id', update.id);
        if (error) throw error;
      }

      // Third pass: update b31_deliverables.wp_number for deliverables linked via tasks
      // Fetch all tasks for these WPs to build wp_draft_id → new number map
      const wpIdToNumber = new Map(updates.map(u => [u.id, u.number]));
      const { data: tasks } = await supabase
        .from('wp_draft_tasks')
        .select('id, wp_draft_id')
        .in('wp_draft_id', updates.map(u => u.id));
      
      if (tasks && tasks.length > 0) {
        // Build task_id → new wp_number map
        const taskWpMap = new Map(tasks.map(t => [t.id, wpIdToNumber.get(t.wp_draft_id)!]));
        
        // Fetch deliverables linked to these tasks
        const { data: deliverables } = await supabase
          .from('b31_deliverables')
          .select('id, task_id, wp_number')
          .eq('proposal_id', proposalId)
          .not('task_id', 'is', null);
        
        if (deliverables) {
          for (const del of deliverables) {
            const newWpNum = del.task_id ? taskWpMap.get(del.task_id) : undefined;
            if (newWpNum != null && newWpNum !== del.wp_number) {
              await supabase
                .from('b31_deliverables')
                .update({ wp_number: newWpNum })
                .eq('id', del.id);
            }
          }
        }
      }
    },
    onMutate: async (reorderedWPs) => {
      await queryClient.cancelQueries({ queryKey: ['wp-drafts-management', proposalId] });
      const previousWPs = queryClient.getQueryData<WPDraft[]>(['wp-drafts-management', proposalId]);
      const optimisticWPs = reorderedWPs.map((wp, index) => ({
        ...wp,
        order_index: index,
        number: index + 1,
        color: wpColors[index % wpColors.length],
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
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
    },
  });

  // Add WP mutation
  const addWPMutation = useMutation({
    mutationFn: async () => {
      const newNumber = wpDrafts.length + 1;
      const colors = ['#2563EB', '#059669', '#D97706', '#E11D48', '#7C3AED', '#0891B2', '#EA580C', '#DB2777', '#475569', '#65A30D', '#4F46E5', '#0D9488'];
      const color = colors[(newNumber - 1) % colors.length];
      
      const { error } = await supabase.from('wp_drafts').insert({
        proposal_id: proposalId,
        number: newNumber,
        color,
        order_index: newNumber - 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      toast.success('Work package added');
    },
  });

  // Delete WP mutation
  const deleteWPMutation = useMutation({
    mutationFn: async (wpId: string) => {
      const { error } = await supabase
        .from('wp_drafts')
        .delete()
        .eq('id', wpId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
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

  const handleToggleWP = (wpId: string) => {
    const newSelection = new Set(selectedWPs);
    if (newSelection.has(wpId)) {
      newSelection.delete(wpId);
    } else {
      newSelection.add(wpId);
    }
    setSelectedWPs(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedWPs.size === wpDrafts.length) {
      setSelectedWPs(new Set());
    } else {
      setSelectedWPs(new Set(wpDrafts.map((wp) => wp.id)));
    }
  };

  const handlePopulate = async (all: boolean) => {
    if (!user?.id) {
      toast.error('You must be logged in to populate content');
      return;
    }
    
    setIsPopulating(true);
    try {
      const wpsToPopulate = all ? wpDrafts : wpDrafts.filter((wp) => selectedWPs.has(wp.id));
      const wpIds = wpsToPopulate.map((wp) => wp.id);
      
      const result = await populateB31(proposalId, wpIds, user.id);
      
      if (result.success) {
        toast.success(`Populated ${wpsToPopulate.length} work package(s) to Part B3.1`);
        // Invalidate section content queries to refresh the editor
        queryClient.invalidateQueries({ queryKey: ['section-content'] });
      } else {
        toast.error(result.error || 'Failed to populate work packages');
      }
    } catch (error) {
      console.error('Error populating B3.1:', error);
      toast.error('Failed to populate work packages');
    } finally {
      setIsPopulating(false);
    }
  };

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
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-5 h-5" />
          Work package manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* WP Themes Toggle (only for lump sum proposals) */}
        {isLumpSum && isCoordinator && (
          <div className="flex items-center space-x-2 pb-3 border-b mb-3">
            <Switch
              id="use-wp-themes"
              checked={useWpThemes}
              onCheckedChange={(checked) => toggleWpThemesMutation.mutate(checked)}
            />
            <Label htmlFor="use-wp-themes" className="text-sm cursor-pointer">
              Lump sum: Group WPs by themes (one colour per theme)
            </Label>
          </div>
        )}

        {/* Theme Management Table (when themes enabled) */}
        {useWpThemes && (
          <div className="mb-4 pb-4 border-b">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Paintbrush className="w-4 h-4" />
              Themes
            </h4>
            
            {/* Theme Table Header */}
            <div className="grid grid-cols-[24px_50px_100px_1fr_20px] gap-1.5 text-xs font-medium text-muted-foreground border-b pb-1">
              <div />
              <div className="text-center">Theme</div>
              <div>Short Name</div>
              <div>Theme Name</div>
              <div />
            </div>

            {/* Theme List */}
            {themes.map((theme) => (
              <div
                key={theme.id}
                className="grid grid-cols-[24px_50px_100px_1fr_20px] gap-1.5 items-center py-1 border-b"
              >
                <div />
                {/* Theme Badge with Color */}
                <div className="flex justify-center">
                  <button
                    className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold text-white cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
                    style={{ backgroundColor: theme.color }}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'color';
                      input.value = theme.color;
                      input.onchange = (e) => updateTheme(theme.id, { color: (e.target as HTMLInputElement).value });
                      input.click();
                    }}
                    disabled={!isCoordinator}
                    title="Click to change colour"
                  >
                    T{theme.number}
                  </button>
                </div>
                {/* Short Name */}
                <DebouncedInput
                  value={theme.short_name || ''}
                  onDebouncedChange={(v) => updateTheme(theme.id, { short_name: v })}
                  placeholder="Short"
                  className="h-7 text-sm"
                  disabled={!isCoordinator}
                />
                {/* Theme Name */}
                <DebouncedInput
                  value={theme.name || ''}
                  onDebouncedChange={(v) => updateTheme(theme.id, { name: v })}
                  placeholder="Theme name"
                  className="h-7 text-sm"
                  disabled={!isCoordinator}
                />
                {/* Delete Button */}
                {isCoordinator && (
                  <button
                    onClick={() => {
                      if (confirm('Delete this theme? WPs using it will have no theme assigned.')) {
                        deleteTheme(theme.id);
                      }
                    }}
                    className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                    title="Delete theme"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {!isCoordinator && <div />}
              </div>
            ))}

            {/* Theme Actions */}
            {isCoordinator && (
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addTheme()}
                  disabled={isAddingTheme}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Theme
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaletteEditorOpen(true)}
                >
                  <Palette className="w-4 h-4 mr-1" />
                  Edit Color Palette
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Table Header */}
        <div className={`grid ${useWpThemes ? 'grid-cols-[24px_50px_100px_90px_1fr_80px_20px]' : 'grid-cols-[24px_50px_90px_1fr_80px_20px]'} gap-1.5 text-xs font-medium text-muted-foreground border-b pb-1`}>
          <div />
          <div className="text-center">WP</div>
          {useWpThemes && <div>Theme</div>}
          <div>Short name</div>
          <div>Title</div>
          <div>WP Leader</div>
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
                canEdit={isCoordinator}
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
            {/* Only show color palette button when themes NOT enabled */}
            {!useWpThemes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaletteEditorOpen(true)}
              >
                <Palette className="w-4 h-4 mr-1" />
                Edit Color Palette
              </Button>
            )}
          </div>
        )}
        
        {/* Color Palette Editor */}
        <WPColorPaletteEditor
          open={paletteEditorOpen}
          onOpenChange={setPaletteEditorOpen}
          colors={wpColors}
          onSave={updatePalette}
        />

        {/* Populate B3.1 Section (Full Proposals Only) */}
        {isFullProposal && isCoordinator && (
          <>
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3">Populate Part B3.1</h4>
              
              {/* WP Selection */}
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-xs"
                >
                  {selectedWPs.size === wpDrafts.length ? 'Deselect All' : 'Select All'}
                </Button>
                {wpDrafts.map((wp) => (
                  <label
                    key={wp.id}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedWPs.has(wp.id)}
                      onCheckedChange={() => handleToggleWP(wp.id)}
                    />
                    <span
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: wp.color }}
                    />
                    WP{wp.number}
                  </label>
                ))}
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded mb-3">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span>
                  This will generate Tables 3.1a-f (WP descriptions, deliverables, milestones, risks, staff effort). Existing content will be replaced. Cost justifications (3.1g-h) can be added separately from Part A3: Budget.
                </span>
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePopulate(false)}
                  disabled={selectedWPs.size === 0 || isPopulating}
                >
                  Populate Selected ({selectedWPs.size})
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePopulate(true)}
                  disabled={isPopulating}
                >
                  Populate All WPs
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
