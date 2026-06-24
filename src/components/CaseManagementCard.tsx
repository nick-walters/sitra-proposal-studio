import { useState, useCallback, useRef, useEffect } from 'react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ParticipantBubble } from '@/components/B31Pill';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, GripVertical, Plus, Trash2, Lock, LockOpen, Settings, FileOutput } from 'lucide-react';
import { CaseSubsectionTemplateDialog } from '@/components/CaseSubsectionTemplateDialog';

import { populateCasesNodeToB12, hasSnapshotEdits } from '@/lib/b12CasesNodePopulation';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
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
  is_locked: boolean;
  locked_by: string | null;
  is_hidden: boolean;
}

const CASE_TYPES = [
  { value: 'case_study', label: 'Case Study', prefix: 'CS' },
  { value: 'use_case', label: 'Use Case', prefix: 'UC' },
  { value: 'living_lab', label: 'Living Lab', prefix: 'LL' },
  { value: 'pilot', label: 'Pilot', prefix: 'P' },
  { value: 'demonstration', label: 'Demonstration', prefix: 'D' },
  { value: 'challenge', label: 'Challenge', prefix: 'CH' },
  { value: 'other', label: 'Other', prefix: '' },
];

function getCaseTypeLabel(caseType: string, customTypeName: string | null): string {
  if (caseType === 'other') return customTypeName || 'Case';
  const type = CASE_TYPES.find(t => t.value === caseType);
  return type?.label || 'Case';
}

const CASE_COLORS = [
  '#DC2626', '#B91C1C', '#EF4444', '#F87171', '#991B1B', 
  '#C53030', '#E53E3E', '#FC8181', '#9B2C2C', '#F56565',
];

function getCasePrefix(caseType: string, customTypeName: string | null): string {
  if (caseType === 'other') {
    return customTypeName || '';
  }
  const type = CASE_TYPES.find(t => t.value === caseType);
  return type?.prefix || '';
}

function getCaseBubbleLabel(casePrefix: string, caseNumber: number, shortName: string | null): string {
  if (casePrefix) {
    const label = `${casePrefix}${caseNumber}`;
    return shortName ? `${label}: ${shortName}` : label;
  }
  return shortName || `${caseNumber}`;
}

// Local-state abbreviation input to avoid typing lag
function AbbreviationInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <Input
      value={local}
      onChange={(e) => {
        const v = e.target.value.slice(0, 4);
        setLocal(v);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onChange(v), 500);
      }}
      placeholder="Abbr"
      className="h-7 text-xs w-20"
      maxLength={4}
      disabled={disabled}
    />
  );
}

interface SortableCaseRowProps {
  caseItem: CaseDraft;
  participants: ParticipantSummary[];
  casePrefix: string;
  includeNumber: boolean;
  includeAbbreviation: boolean;
  onUpdate: (id: string, updates: Partial<CaseDraft>) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  canEdit: boolean;
}

function SortableCaseRow({ caseItem, participants, casePrefix, includeNumber, includeAbbreviation, onUpdate, onDelete, onToggleLock, canEdit }: SortableCaseRowProps) {

  const [leadOpen, setLeadOpen] = useState(false);
  const [localShortName, setLocalShortName] = useState(caseItem.short_name || '');
  const [localTitle, setLocalTitle] = useState(caseItem.title || '');
  const isFocused = useRef(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isFocused.current) {
      setLocalShortName(caseItem.short_name || '');
      setLocalTitle(caseItem.title || '');
    }
  }, [caseItem.short_name, caseItem.title]);

  const debouncedUpdate = (id: string, updates: Partial<CaseDraft>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(id, updates), 500);
  };

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`col-span-6 grid grid-cols-subgrid gap-x-1.5 items-center py-1 border-b mb-[4px] ${
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

      {/* Case Bubble with inline-editable short name */}
      <Badge
        className="rounded-full font-bold justify-start text-xs h-6 w-auto min-w-[1.5rem] border-[1.5px] border-black text-black bg-white whitespace-nowrap gap-0 px-2"
      >
        {includeAbbreviation && casePrefix && <span>{casePrefix}</span>}
        {includeNumber && <span>{caseItem.number}</span>}
        {(includeAbbreviation && casePrefix || includeNumber) && <span>:&nbsp;</span>}
        <input
          value={localShortName}
          onChange={(e) => {
            setLocalShortName(e.target.value);
            debouncedUpdate(caseItem.id, { short_name: e.target.value });
          }}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; }}
          placeholder={casePrefix ? 'name' : 'Short name'}
          className="bg-transparent outline-none font-bold text-xs text-black min-w-[2rem]"
          style={{ width: `${Math.max(2, (localShortName || '').length * 0.6)}em` }}
          disabled={!canEdit}
        />
      </Badge>

      {/* Title */}
      <Input
        value={localTitle}
        onChange={(e) => {
          setLocalTitle(e.target.value);
          debouncedUpdate(caseItem.id, { title: e.target.value });
        }}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; }}
        placeholder="Case title"
        className="h-7 text-sm"
        disabled={!canEdit}
      />

      {/* Case Leader */}
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
          + Leader
        </button>
      )}
      <Dialog open={leadOpen} onOpenChange={setLeadOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Select {getCaseTypeLabel(caseItem.case_type, caseItem.custom_type_name)} Leader</DialogTitle>
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
                    <ParticipantBubble
                      style={{ fontSize: '12px', height: 'auto', padding: '2px 8px' }}
                    >
                      {p.organisation_short_name || `P${p.participant_number}`}
                    </ParticipantBubble>
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
          onClick={() => onToggleLock(caseItem.id, !caseItem.is_locked)}
          className={`p-1 rounded transition-colors ${caseItem.is_locked ? 'text-destructive hover:bg-destructive/10' : 'text-green-600 hover:bg-green-100'}`}
          title={caseItem.is_locked ? 'Unlock case' : 'Lock case'}
        >
          {caseItem.is_locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
        </button>
      )}
      {!canEdit && <div />}

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
  isCoordinator: boolean;
  casesEnabled: boolean;
  onToggleCases: (enabled: boolean) => void;
  onSaveEvent?: () => void;
}

export function CaseManagementCard({ 
  proposalId, 
  isCoordinator, 
  casesEnabled, 
  onToggleCases,
  onSaveEvent,
}: CaseManagementCardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [subsectionsDialogOpen, setSubsectionsDialogOpen] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [populateDialogOpen, setPopulateDialogOpen] = useState(false);
  const [selectedPopulateIds, setSelectedPopulateIds] = useState<Set<string>>(new Set());
  const [replaceWarningOpen, setReplaceWarningOpen] = useState(false);

  const runPopulate = async (ids: string[]) => {
    try {
      setPopulating(true);
      const res = await populateCasesNodeToB12(proposalId, { caseIds: ids });
      toast.success(`Populated ${res.insertedOrUpdated} case${res.insertedOrUpdated === 1 ? '' : 's'} into B1.2.`);
      invalidateCaseQueries();
      queryClient.invalidateQueries({ queryKey: ['section-content', proposalId, 'b1-2'] });
      queryClient.invalidateQueries({ queryKey: ['b12-cases', proposalId] });
      setPopulateDialogOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(`Populate failed: ${e?.message || 'unknown error'}`);
    } finally {
      setPopulating(false);
    }
  };

  const handlePopulateClick = async () => {
    const ids = Array.from(selectedPopulateIds);
    if (ids.length === 0) return;
    try {
      const dirty = await hasSnapshotEdits(proposalId, ids);
      if (dirty) {
        setReplaceWarningOpen(true);
        return;
      }
    } catch (e) {
      console.warn('Snapshot diff check failed; proceeding without warning', e);
    }
    runPopulate(ids);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch case drafts
  const { data: caseDrafts = [], isLoading: casesLoading } = useQuery({
    queryKey: ['case-drafts-management', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select('id, number, case_type, custom_type_name, short_name, title, lead_participant_id, color, order_index, is_locked, locked_by, is_hidden')
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

  // Case draft visibility
  const { data: caseSettingsData } = useQuery({
    queryKey: ['case-settings', proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('case_drafts_visible, case_include_number, case_include_abbreviation')
        .eq('id', proposalId)
        .single();
      return data as any;
    },
  });
  const caseDraftsVisible = caseSettingsData?.case_drafts_visible !== false;
  const caseIncludeNumber: boolean = caseSettingsData?.case_include_number !== false;
  const caseIncludeAbbreviation: boolean = caseSettingsData?.case_include_abbreviation !== false;

  const invalidateCaseQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['case-drafts-management', proposalId] });
    void queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
    void queryClient.invalidateQueries({ queryKey: ['case-leadership', proposalId] });
  }, [proposalId, queryClient]);

  const handleCaseDraftVisibility = async (visible: boolean) => {
    await supabase.from('proposals').update({ case_drafts_visible: visible } as any).eq('id', proposalId);
    queryClient.invalidateQueries({ queryKey: ['case-settings', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['proposal-for-themes', proposalId] });
  };

  const handleIncludeNumberChange = async (checked: boolean) => {
    await supabase.from('proposals').update({ case_include_number: checked } as any).eq('id', proposalId);
    queryClient.invalidateQueries({ queryKey: ['case-settings', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['proposal-themes-flag', proposalId] });
  };

  const handleIncludeAbbreviationChange = async (checked: boolean) => {
    await supabase.from('proposals').update({ case_include_abbreviation: checked } as any).eq('id', proposalId);
    queryClient.invalidateQueries({ queryKey: ['case-settings', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['proposal-themes-flag', proposalId] });
  };


  const updateCaseMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CaseDraft> }) => {
      const { error } = await supabase
        .from('case_drafts')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['case-drafts-management', proposalId] });
      const previous = queryClient.getQueryData<CaseDraft[]>(['case-drafts-management', proposalId]);
      queryClient.setQueryData<CaseDraft[]>(['case-drafts-management', proposalId], old =>
        (old || []).map(c => c.id === id ? { ...c, ...updates } : c)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['case-drafts-management', proposalId], context.previous);
      }
      toast.error('Failed to update case');
    },
    onSettled: () => {
      invalidateCaseQueries();
      onSaveEvent?.();
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
      
      // First pass: set numbers to negative temporaries to avoid unique constraint violations
      for (const update of updates) {
        const { error } = await supabase
          .from('case_drafts')
          .update({ order_index: update.order_index, number: -(update.number + 1000) })
          .eq('id', update.id);
        if (error) throw error;
      }
      
      // Second pass: set final numbers
      for (const update of updates) {
        const { error } = await supabase
          .from('case_drafts')
          .update({ number: update.number })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onMutate: async (reorderedCases) => {
      await queryClient.cancelQueries({ queryKey: ['case-drafts-management', proposalId] });
      const previousCases = queryClient.getQueryData<CaseDraft[]>(['case-drafts-management', proposalId]);
      const optimisticCases = reorderedCases.map((c, index) => ({
        ...c,
        order_index: index,
        number: index + 1,
      }));
      queryClient.setQueryData(['case-drafts-management', proposalId], optimisticCases);
      return { previousCases };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousCases) {
        queryClient.setQueryData(['case-drafts-management', proposalId], context.previousCases);
      }
      toast.error('Failed to reorder cases');
    },
    onSettled: async (_data, _error, reorderedCases) => {
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
    },
  });

  // Add case mutation — copies shared headings/guidelines from existing cases
  const addCaseMutation = useMutation({
    mutationFn: async (caseType: string = 'case_study') => {
      const newNumber = caseDrafts.length + 1;
      const color = CASE_COLORS[(newNumber - 1) % CASE_COLORS.length];

      // Copy heading/guideline customisations from first existing case
      let sharedFields: Record<string, string | null> = {};
      if (caseDrafts.length > 0) {
        const { data: ref } = await supabase
          .from('case_drafts')
          .select('heading_background, heading_stakeholders, heading_solutions, heading_outcomes, heading_replicability, guideline_background, guideline_stakeholders, guideline_solutions, guideline_outcomes, guideline_replicability')
          .eq('proposal_id', proposalId)
          .order('number')
          .limit(1)
          .single();
        if (ref) {
          for (const [k, v] of Object.entries(ref)) {
            if (v) sharedFields[k] = v as string;
          }
        }
      }
      
      const { error } = await supabase.from('case_drafts').insert({
        proposal_id: proposalId,
        number: newNumber,
        case_type: caseType,
        color,
        order_index: newNumber - 1,
        ...sharedFields,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCaseQueries();
      onSaveEvent?.();
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
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
      toast.success('Case deleted');
    },
    onError: () => {
      toast.error('Failed to delete case');
    },
  });

  // Derive proposal-level case type from first case (all cases share the same type)
  const proposalCaseType = caseDrafts.length > 0 ? caseDrafts[0].case_type : 'case_study';
  const proposalCustomName = caseDrafts.length > 0 ? caseDrafts[0].custom_type_name : null;
  const casePrefix = getCasePrefix(proposalCaseType, proposalCustomName);

  const handleCaseTypeChange = useCallback((newType: string) => {
    // Update all cases to the new type
    caseDrafts.forEach(c => {
      updateCaseMutation.mutate({ id: c.id, updates: { case_type: newType } });
    });
  }, [caseDrafts, updateCaseMutation]);

  const handleCustomNameChange = useCallback((name: string) => {
    caseDrafts.forEach(c => {
      updateCaseMutation.mutate({ id: c.id, updates: { custom_type_name: name } });
    });
  }, [caseDrafts, updateCaseMutation]);

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

  const handleToggleLock = useCallback(async (id: string, locked: boolean) => {
    // Cancel any in-flight refetches so they don't overwrite our optimistic update
    await queryClient.cancelQueries({ queryKey: ['case-drafts-management', proposalId] });
    // Optimistic update
    queryClient.setQueryData<CaseDraft[]>(['case-drafts-management', proposalId], old =>
      (old || []).map(c => c.id === id ? { ...c, is_locked: locked, locked_by: locked ? user?.id ?? null : null } : c)
    );
    const { error } = await supabase
      .from('case_drafts')
      .update({ 
        is_locked: locked, 
        locked_by: locked ? user?.id ?? null : null,
        locked_at: locked ? new Date().toISOString() : null,
      } as any)
      .eq('id', id);
    if (error) {
      toast.error('Failed to update lock status');
    }
    invalidateCaseQueries();
    if (!error) toast.success(locked ? 'Case locked' : 'Case unlocked');
  }, [user, proposalId, queryClient, invalidateCaseQueries]);

  const handleToggleLockAll = useCallback(async () => {
    const allLocked = caseDrafts.every(c => c.is_locked);
    const newLocked = !allLocked;
    await queryClient.cancelQueries({ queryKey: ['case-drafts-management', proposalId] });
    // Optimistic update
    queryClient.setQueryData<CaseDraft[]>(['case-drafts-management', proposalId], old =>
      (old || []).map(c => ({ ...c, is_locked: newLocked, locked_by: newLocked ? user?.id ?? null : null }))
    );
    const { error } = await supabase
      .from('case_drafts')
      .update({
        is_locked: newLocked,
        locked_by: newLocked ? user?.id ?? null : null,
        locked_at: newLocked ? new Date().toISOString() : null,
      } as any)
      .eq('proposal_id', proposalId);
    if (error) {
      toast.error('Failed to update lock status');
      invalidateCaseQueries();
      return;
    }
    invalidateCaseQueries();
    toast.success(newLocked ? 'All cases locked' : 'All cases unlocked');
  }, [user, proposalId, queryClient, caseDrafts, invalidateCaseQueries]);




  const handleCheckboxChange = (checked: boolean) => {
    onToggleCases(checked);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="w-5 h-5" />
          Case manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Enable cases checkbox */}
        {isCoordinator && (
          <div className="flex items-start gap-3">
            <Checkbox
              id="cases-enabled"
              checked={casesEnabled}
              onCheckedChange={handleCheckboxChange}
            />
            <div className="flex-1">
              <Label htmlFor="cases-enabled" className="text-sm cursor-pointer">
                Does this proposal include case studies, use cases, living labs, pilots, demonstrations, challenges, or similar?
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
                {/* Proposal-level type selector + numbering options */}
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground shrink-0">Type:</Label>
                    <Select 
                      value={proposalCaseType} 
                      onValueChange={handleCaseTypeChange}
                      disabled={!isCoordinator}
                    >
                      <SelectTrigger className="h-7 text-xs w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CASE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-xs">
                            {type.prefix ? `${type.prefix} – ` : ''}{type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {proposalCaseType === 'other' && (
                      <AbbreviationInput
                        value={proposalCustomName || ''}
                        onChange={handleCustomNameChange}
                        disabled={!isCoordinator}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id="include-number"
                        checked={caseIncludeNumber}
                        onCheckedChange={(checked) => handleIncludeNumberChange(!!checked)}
                        disabled={!isCoordinator}
                      />
                      <Label htmlFor="include-number" className="text-xs cursor-pointer">Include number</Label>
                    </div>
                    {!caseIncludeNumber && (
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id="include-abbreviation"
                          checked={caseIncludeAbbreviation}
                          onCheckedChange={(checked) => handleIncludeAbbreviationChange(!!checked)}
                          disabled={!isCoordinator}
                        />
                        <Label htmlFor="include-abbreviation" className="text-xs cursor-pointer">Include abbreviation</Label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[24px_140px_1fr_80px_20px_20px] gap-x-1.5">
                  {/* Header row */}
                  <div className="col-span-6 grid grid-cols-subgrid gap-x-1.5 text-xs font-bold text-muted-foreground border-b pb-1">
                    <div />
                    <div />
                    <div>Title</div>
                    <div>{getCaseTypeLabel(proposalCaseType, proposalCustomName)} Leader</div>
                    {isCoordinator ? (
                      <button
                        onClick={handleToggleLockAll}
                        className={`p-1 rounded transition-colors ${caseDrafts.length > 0 && caseDrafts.every(c => c.is_locked) ? 'text-destructive hover:bg-destructive/10' : 'text-green-600 hover:bg-green-100'}`}
                        title={caseDrafts.length > 0 && caseDrafts.every(c => c.is_locked) ? 'Unlock all' : 'Lock all'}
                      >
                        {caseDrafts.length > 0 && caseDrafts.every(c => c.is_locked) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                      </button>
                    ) : <div />}
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
                          casePrefix={casePrefix}
                          includeNumber={caseIncludeNumber}
                          includeAbbreviation={caseIncludeNumber || caseIncludeAbbreviation}
                          onUpdate={handleUpdateCase}
                          onDelete={handleDeleteCase}
                          onToggleLock={handleToggleLock}
                          
                          canEdit={isCoordinator}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>

                {/* Action buttons row: left = Add + Populate; right = Edit subsections */}
                {isCoordinator && (
                  <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addCaseMutation.mutate(proposalCaseType)}
                        disabled={addCaseMutation.isPending}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add case
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={caseDrafts.length === 0 || populating}
                        onClick={() => {
                          if (caseDrafts.length === 0) return;
                          setSelectedPopulateIds(new Set(caseDrafts.map((c) => c.id)));
                          setPopulateDialogOpen(true);
                        }}
                      >
                        
                        {populating ? 'Populating\u2026' : 'Populate Part B1.2'}
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubsectionsDialogOpen(true)}
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Edit case subsections &amp; guidelines
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <CaseSubsectionTemplateDialog
          open={subsectionsDialogOpen}
          onOpenChange={setSubsectionsDialogOpen}
          proposalId={proposalId}
          canEdit={isCoordinator}
        />

        {/* Populate to B1.2 dialog — choose which cases to include */}
        <Dialog open={populateDialogOpen} onOpenChange={setPopulateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Populate B1.2 with cases</DialogTitle>
              <DialogDescription>
                Select the cases to insert into the B1.2 cases table. Selected cases will be locked from further editing in the case manager (coordinators can override).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto py-2">
              <div className="flex items-center gap-2 pb-1 border-b mb-1">
                <Checkbox
                  id="populate-all"
                  checked={caseDrafts.length > 0 && selectedPopulateIds.size === caseDrafts.length}
                  onCheckedChange={(checked) => {
                    setSelectedPopulateIds(
                      checked ? new Set(caseDrafts.map((c) => c.id)) : new Set(),
                    );
                  }}
                />
                <Label htmlFor="populate-all" className="text-xs font-bold cursor-pointer">Select all</Label>
              </div>
              {caseDrafts.map((c, idx) => {
                const label = getCaseBubbleLabel(casePrefix, c.number, c.short_name);
                const checked = selectedPopulateIds.has(c.id);
                return (
                  <div key={c.id}>
                    {idx > 0 && <div className="border-t my-1" />}
                    <div className="flex items-center gap-2 py-0.5">
                      <Checkbox
                        id={`populate-${c.id}`}
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedPopulateIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(c.id); else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      <Label htmlFor={`populate-${c.id}`} className="text-sm cursor-pointer flex-1">
                        <span className="font-bold">{label}</span>
                        {c.title && <span className="text-muted-foreground"> &mdash; {c.title}</span>}
                      </Label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPopulateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={selectedPopulateIds.size === 0 || populating}
                onClick={handlePopulateClick}
              >
                {populating ? 'Populating\u2026' : `Populate ${selectedPopulateIds.size} case${selectedPopulateIds.size === 1 ? '' : 's'}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={replaceWarningOpen} onOpenChange={setReplaceWarningOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace cases in B1.2?</AlertDialogTitle>
              <AlertDialogDescription>
                Re-populating will replace the cases in B1.2 with the current case drafts. Any edits made to the cases in B1.2 will be lost. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setReplaceWarningOpen(false);
                  runPopulate(Array.from(selectedPopulateIds));
                }}
              >
                Replace
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
