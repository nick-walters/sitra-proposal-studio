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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, GripVertical, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

interface CaseDraft {
  id: string;
  number: number;
  case_type: string;
  custom_type_name: string | null;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  color: string;
  order_index: number;
}

const CASE_TYPES = [
  { value: 'case_study', label: 'Case Study', prefix: 'CS' },
  { value: 'use_case', label: 'Use Case', prefix: 'UC' },
  { value: 'living_lab', label: 'Living Lab', prefix: 'LL' },
  { value: 'pilot', label: 'Pilot', prefix: 'P' },
  { value: 'demonstration', label: 'Demonstration', prefix: 'D' },
  { value: 'other', label: 'Other', prefix: 'C' },
];

const CASE_COLORS = [
  '#DC2626', '#B91C1C', '#EF4444', '#F87171', '#991B1B', 
  '#C53030', '#E53E3E', '#FC8181', '#9B2C2C', '#F56565',
];

function getCasePrefix(caseType: string, customTypeName: string | null): string {
  if (caseType === 'other' && customTypeName) {
    return customTypeName.toUpperCase();
  }
  const type = CASE_TYPES.find(t => t.value === caseType);
  return type?.prefix || 'C';
}

interface SortableCaseRowProps {
  caseItem: CaseDraft;
  participants: ParticipantSummary[];
  onUpdate: (id: string, updates: Partial<CaseDraft>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

function SortableCaseRow({ caseItem, participants, onUpdate, onDelete, canEdit }: SortableCaseRowProps) {
  const [leadOpen, setLeadOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: caseItem.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const selectedLead = participants.find((p) => p.id === caseItem.lead_participant_id);
  const prefix = getCasePrefix(caseItem.case_type, caseItem.custom_type_name);
  const isOtherType = caseItem.case_type === 'other';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[24px_50px_70px_50px_90px_1fr_80px_20px] gap-1.5 items-center py-1 border-b ${
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

      {/* Case Number Badge */}
      <Badge
        className="rounded-full font-bold text-white justify-center text-xs h-6"
        style={{ backgroundColor: caseItem.color }}
      >
        {prefix}{caseItem.number}
      </Badge>

      {/* Type Selector */}
      <Select 
        value={caseItem.case_type} 
        onValueChange={(value) => onUpdate(caseItem.id, { case_type: value })}
        disabled={!canEdit}
      >
        <SelectTrigger className="h-7 text-xs px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CASE_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value} className="text-xs">
              {type.prefix} - {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom Abbreviation (only for "other" type) */}
      {isOtherType ? (
        <Input
          value={caseItem.custom_type_name || ''}
          onChange={(e) => onUpdate(caseItem.id, { custom_type_name: e.target.value.slice(0, 4) })}
          placeholder="Abbr"
          className="h-7 text-xs uppercase"
          maxLength={4}
          disabled={!canEdit}
        />
      ) : (
        <div />
      )}

      {/* Short Name */}
      <Input
        value={caseItem.short_name || ''}
        onChange={(e) => onUpdate(caseItem.id, { short_name: e.target.value })}
        placeholder="Short"
        className="h-7 text-sm"
        disabled={!canEdit}
      />

      {/* Title */}
      <Input
        value={caseItem.title || ''}
        onChange={(e) => onUpdate(caseItem.id, { title: e.target.value })}
        placeholder="Case title"
        className="h-7 text-sm"
        disabled={!canEdit}
      />

      {/* Case Lead */}
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
            <DialogTitle>Select Case Lead</DialogTitle>
            <DialogDescription>
              Choose a partner organisation to lead this case.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 p-1">
              {participants.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onUpdate(caseItem.id, { lead_participant_id: p.id });
                    setLeadOpen(false);
                  }}
                  className="w-full flex items-center p-3 rounded-md text-left hover:bg-muted/80 transition-colors"
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
          onClick={() => onDelete(caseItem.id)}
          className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
          title="Delete case"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      {!canEdit && <div />}
    </div>
  );
}

interface CaseManagementCardProps {
  proposalId: string;
  isAdmin: boolean;
  casesEnabled: boolean;
  onToggleCases: (enabled: boolean) => void;
}

export function CaseManagementCard({ 
  proposalId, 
  isAdmin, 
  casesEnabled, 
  onToggleCases 
}: CaseManagementCardProps) {
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch case drafts
  const { data: caseDrafts = [], isLoading: casesLoading } = useQuery({
    queryKey: ['case-drafts', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select('id, number, case_type, custom_type_name, short_name, title, lead_participant_id, color, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as CaseDraft[];
    },
    enabled: casesEnabled,
  });

  // Fetch participants
  const { data: participants = [] } = useQuery({
    queryKey: ['participants-for-case', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, english_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantSummary[];
    },
    enabled: casesEnabled,
  });

  // Update case mutation
  const updateCaseMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CaseDraft> }) => {
      const { error } = await supabase
        .from('case_drafts')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (reorderedCases: CaseDraft[]) => {
      const updates = reorderedCases.map((c, index) => ({
        id: c.id,
        order_index: index,
        number: index + 1,
      }));
      
      for (const update of updates) {
        const { error } = await supabase
          .from('case_drafts')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onMutate: async (reorderedCases) => {
      await queryClient.cancelQueries({ queryKey: ['case-drafts', proposalId] });
      const previousCases = queryClient.getQueryData<CaseDraft[]>(['case-drafts', proposalId]);
      const optimisticCases = reorderedCases.map((c, index) => ({
        ...c,
        order_index: index,
        number: index + 1,
      }));
      queryClient.setQueryData(['case-drafts', proposalId], optimisticCases);
      return { previousCases };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousCases) {
        queryClient.setQueryData(['case-drafts', proposalId], context.previousCases);
      }
      toast.error('Failed to reorder cases');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
    },
  });

  // Add case mutation
  const addCaseMutation = useMutation({
    mutationFn: async (caseType: string = 'case_study') => {
      const newNumber = caseDrafts.length + 1;
      const color = CASE_COLORS[(newNumber - 1) % CASE_COLORS.length];
      
      const { error } = await supabase.from('case_drafts').insert({
        proposal_id: proposalId,
        number: newNumber,
        case_type: caseType,
        color,
        order_index: newNumber - 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
      toast.success('Case added');
    },
  });

  // Delete case mutation
  const deleteCaseMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const { error } = await supabase
        .from('case_drafts')
        .delete()
        .eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
      toast.success('Case deleted');
    },
    onError: () => {
      toast.error('Failed to delete case');
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = caseDrafts.findIndex((c) => c.id === active.id);
    const newIndex = caseDrafts.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(caseDrafts, oldIndex, newIndex);
    
    reorderMutation.mutate(reordered);
  };

  const handleUpdateCase = useCallback((id: string, updates: Partial<CaseDraft>) => {
    updateCaseMutation.mutate({ id, updates });
  }, [updateCaseMutation]);

  const handleDeleteCase = useCallback((id: string) => {
    if (confirm('Are you sure you want to delete this case?')) {
      deleteCaseMutation.mutate(id);
    }
  }, [deleteCaseMutation]);

  const handleCheckboxChange = (checked: boolean) => {
    onToggleCases(checked);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="w-5 h-5" />
          Case management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Enable cases checkbox */}
        {isAdmin && (
          <div className="flex items-start gap-3">
            <Checkbox
              id="cases-enabled"
              checked={casesEnabled}
              onCheckedChange={handleCheckboxChange}
            />
            <div className="flex-1">
              <Label htmlFor="cases-enabled" className="text-sm cursor-pointer">
                Does this proposal include case studies, use cases, living labs, pilots, demonstrations, or similar?
              </Label>
            </div>
          </div>
        )}

        {/* Cases table (when enabled) */}
        {casesEnabled && (
          <>
            {casesLoading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div className="grid grid-cols-[24px_50px_70px_50px_90px_1fr_80px_20px] gap-1.5 text-xs font-medium text-muted-foreground border-b pb-1">
                  <div />
                  <div className="text-center">№</div>
                  <div>Type</div>
                  <div>Abbr</div>
                  <div>Short Name</div>
                  <div>Title</div>
                  <div>Lead</div>
                  <div />
                </div>

                {/* Sortable Case List */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={caseDrafts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {caseDrafts.map((caseItem) => (
                      <SortableCaseRow
                        key={caseItem.id}
                        caseItem={caseItem}
                        participants={participants}
                        onUpdate={handleUpdateCase}
                        onDelete={handleDeleteCase}
                        canEdit={isAdmin}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {/* Add button */}
                {isAdmin && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addCaseMutation.mutate('case_study')}
                      disabled={addCaseMutation.isPending}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Case
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
