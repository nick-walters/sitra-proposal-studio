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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { WPColorPicker } from '@/components/WPColorPicker';
import { WPColorPaletteEditor } from '@/components/WPColorPaletteEditor';
import { Layers, GripVertical, Plus, AlertTriangle, Palette } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWPColorPalette } from '@/hooks/useWPColorPalette';
import { populateB31 } from '@/lib/b31Population';
import { toast } from 'sonner';

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface WPDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  color: string;
  order_index: number;
}

interface SortableWPRowProps {
  wp: WPDraft;
  participants: Participant[];
  onUpdate: (id: string, updates: Partial<WPDraft>) => void;
  canEdit: boolean;
}

function SortableWPRow({ wp, participants, onUpdate, canEdit }: SortableWPRowProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[32px_48px_100px_1fr_140px_48px] gap-2 items-center py-2 border-b ${
        isDragging ? 'bg-muted shadow-lg' : ''
      }`}
    >
      {/* Drag Handle */}
      <div className="flex justify-center">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* WP Number */}
      <div className="font-semibold text-sm text-center">{wp.number}</div>

      {/* Short Name */}
      <Input
        value={wp.short_name || ''}
        onChange={(e) => onUpdate(wp.id, { short_name: e.target.value })}
        placeholder="INIT"
        className="h-8 text-sm"
        disabled={!canEdit}
      />

      {/* Title */}
      <Input
        value={wp.title || ''}
        onChange={(e) => onUpdate(wp.id, { title: e.target.value })}
        placeholder="Work package title"
        className="h-8 text-sm"
        disabled={!canEdit}
      />

      {/* WP Lead */}
      <Select
        value={wp.lead_participant_id || ''}
        onValueChange={(v) => onUpdate(wp.id, { lead_participant_id: v || null })}
        disabled={!canEdit}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Lead..." />
        </SelectTrigger>
        <SelectContent>
          {participants.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.organisation_short_name || p.organisation_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Color Picker */}
      <div className="flex justify-center">
        <WPColorPicker
          color={wp.color}
          onChange={(color) => onUpdate(wp.id, { color })}
        />
      </div>
    </div>
  );
}

interface WPManagementCardProps {
  proposalId: string;
  isAdmin: boolean;
  isFullProposal?: boolean;
}

export function WPManagementCard({ proposalId, isAdmin, isFullProposal = true }: WPManagementCardProps) {
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

  // Fetch WP drafts
  const { data: wpDrafts = [], isLoading: wpsLoading } = useQuery({
    queryKey: ['wp-drafts-management', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, lead_participant_id, color, order_index')
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
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as Participant[];
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

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (reorderedWPs: WPDraft[]) => {
      const updates = reorderedWPs.map((wp, index) => ({
        id: wp.id,
        order_index: index,
        number: index + 1,
      }));
      
      for (const update of updates) {
        const { error } = await supabase
          .from('wp_drafts')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Work Package Drafts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Work Package Drafts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Table Header */}
        <div className="grid grid-cols-[32px_48px_100px_1fr_140px_48px] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
          <div />
          <div className="text-center">WP#</div>
          <div>Short Name</div>
          <div>Title</div>
          <div>WP Lead</div>
          <div className="text-center">Color</div>
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
                onUpdate={handleUpdateWP}
                canEdit={isAdmin}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Actions */}
        {isAdmin && (
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
        
        {/* Color Palette Editor */}
        <WPColorPaletteEditor
          open={paletteEditorOpen}
          onOpenChange={setPaletteEditorOpen}
          colors={wpColors}
          onSave={updatePalette}
        />

        {/* Populate B3.1 Section (Full Proposals Only) */}
        {isFullProposal && isAdmin && (
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
                  This will copy WP content, deliverables, and risks to Part B3.1. Existing content may be updated.
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
