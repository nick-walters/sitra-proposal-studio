import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { FlaskConical, GripVertical, Plus, Trash2, Lock, LockOpen, Settings, X } from 'lucide-react';
import { CaseSubsectionTemplateDialog } from '@/components/CaseSubsectionTemplateDialog';

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
  case_type_id: string | null;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  color: string;
  order_index: number;
  is_locked: boolean;
  locked_by: string | null;
}

interface CaseTypeRow {
  id: string;
  proposal_id: string;
  type_code: string;
  custom_type_name: string | null;
  outline_color: string;
  include_number: boolean;
  include_abbreviation: boolean;
  order_index: number;
}

import {
  CASE_TYPE_DEFS,
  getCaseTypeLabel,
  getCaseTypePrefix as getCasePrefix,
  buildCaseLabel,
} from '@/lib/caseTypeLabels';

const CASE_TYPES = CASE_TYPE_DEFS.map((d) => ({
  value: d.code,
  label: d.singular,
  prefix: d.prefix,
}));


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
  caseTypeLabel: string;
  includeNumber: boolean;
  includeAbbreviation: boolean;
  outlineColor: string;
  onUpdate: (id: string, updates: Partial<CaseDraft>) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  canEdit: boolean;
}

function SortableCaseRow({ caseItem, participants, casePrefix, caseTypeLabel, includeNumber, includeAbbreviation, outlineColor, onUpdate, onDelete, onToggleLock, canEdit }: SortableCaseRowProps) {


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

      <Badge
        className="rounded-full font-bold justify-start text-xs h-6 w-auto min-w-[1.5rem] border-[1.5px] text-black bg-white whitespace-nowrap gap-0 px-2"
        style={{ borderColor: outlineColor || '#000000' }}
      >
        {includeAbbreviation && casePrefix && <span>{casePrefix}</span>}
        {includeNumber && <span>{caseItem.number}</span>}
        {((includeAbbreviation && casePrefix) || includeNumber) && <span>:&nbsp;</span>}
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
            <DialogTitle>Select {caseTypeLabel} Leader</DialogTitle>
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Proposal-level case type rows
  const { data: caseTypeRows = [], isLoading: typesLoading } = useQuery({
    queryKey: ['proposal-case-types', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_case_types')
        .select('id, proposal_id, type_code, custom_type_name, outline_color, include_number, include_abbreviation, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as CaseTypeRow[];
    },
    enabled: casesEnabled,
  });


  const { data: caseDrafts = [], isLoading: casesLoading } = useQuery({
    queryKey: ['case-drafts-management', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select('id, number, case_type, custom_type_name, case_type_id, short_name, title, lead_participant_id, color, order_index, is_locked, locked_by')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as CaseDraft[];
    },
    enabled: casesEnabled,
  });

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

  const { data: caseSettingsData } = useQuery({
    queryKey: ['case-settings', proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('case_drafts_visible')
        .eq('id', proposalId)
        .single();
      return data as any;
    },
  });

  const invalidateCaseQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['case-drafts-management', proposalId] });
    void queryClient.invalidateQueries({ queryKey: ['proposal-case-types', proposalId] });
    void queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
    void queryClient.invalidateQueries({ queryKey: ['case-leadership', proposalId] });
  }, [proposalId, queryClient]);


  // Update a case row (debounced from inputs).
  const updateCaseMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CaseDraft> }) => {
      const { error } = await supabase.from('case_drafts').update(updates).eq('id', id);
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
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(['case-drafts-management', proposalId], context.previous);
      toast.error('Failed to update case');
    },
    onSettled: () => { invalidateCaseQueries(); onSaveEvent?.(); },
  });

  // Per-type reorder: renumber 1..n within a case_type_id (two-phase to dodge unique constraint).
  const reorderTypeMutation = useMutation({
    mutationFn: async ({ typeId, ordered }: { typeId: string; ordered: CaseDraft[] }) => {
      // Phase 1: temp negative numbers
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from('case_drafts')
          .update({ order_index: i, number: -(i + 1000) })
          .eq('id', ordered[i].id);
        if (error) throw error;
      }
      // Phase 2: final numbers
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from('case_drafts')
          .update({ number: i + 1 })
          .eq('id', ordered[i].id);
        if (error) throw error;
      }
      return typeId;
    },
    onSettled: () => {
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
    },
    onError: () => toast.error('Failed to reorder cases'),
  });

  // Add a case to a specific type card.
  const addCaseMutation = useMutation({
    mutationFn: async (typeRow: CaseTypeRow) => {
      const existing = caseDrafts.filter(c => c.case_type_id === typeRow.id);
      const newNumber = existing.length + 1;
      const color = typeRow.outline_color || '#000000';

      // Copy shared headings/guidelines from an existing case (any) so subsection
      // customisations propagate to new cases.
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
        case_type: typeRow.type_code,
        custom_type_name: typeRow.custom_type_name,
        case_type_id: typeRow.id,
        color,
        order_index: caseDrafts.length,
        ...sharedFields,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidateCaseQueries(); onSaveEvent?.(); toast.success('Case added'); },
    onError: () => toast.error('Failed to add case'),
  });

  // Delete a case (renumber its type group afterwards).
  const deleteCaseMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const target = caseDrafts.find(c => c.id === caseId);
      const { error } = await supabase.from('case_drafts').delete().eq('id', caseId);
      if (error) throw error;
      if (target?.case_type_id) {
        const remaining = caseDrafts
          .filter(c => c.case_type_id === target.case_type_id && c.id !== caseId)
          .sort((a, b) => a.order_index - b.order_index);
        // Two-phase renumber to keep (case_type_id, number) unique
        for (let i = 0; i < remaining.length; i++) {
          await supabase.from('case_drafts').update({ number: -(i + 1000) }).eq('id', remaining[i].id);
        }
        for (let i = 0; i < remaining.length; i++) {
          await supabase.from('case_drafts').update({ number: i + 1 }).eq('id', remaining[i].id);
        }
      }
    },
    onSuccess: () => {
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
      toast.success('Case deleted');
    },
    onError: () => toast.error('Failed to delete case'),
  });

  // Change a card's type: update proposal_case_types row + sync legacy
  // case_type/custom_type_name on every case in that group.
  const changeTypeMutation = useMutation({
    mutationFn: async ({ typeRowId, type_code, custom_type_name }: { typeRowId: string; type_code: string; custom_type_name: string | null }) => {
      const { error: e1 } = await supabase
        .from('proposal_case_types')
        .update({ type_code, custom_type_name })
        .eq('id', typeRowId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('case_drafts')
        .update({ case_type: type_code, custom_type_name })
        .eq('case_type_id', typeRowId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
    },
    onError: () => toast.error('Failed to change case type'),
  });

  // Per-type settings: outline colour, include_number, include_abbreviation.
  const updateTypeMutation = useMutation({
    mutationFn: async ({ typeRowId, patch }: { typeRowId: string; patch: Partial<Pick<CaseTypeRow, 'outline_color' | 'include_number' | 'include_abbreviation'>> }) => {
      const { error } = await supabase.from('proposal_case_types').update(patch).eq('id', typeRowId);
      if (error) throw error;
      // If colour changed, mirror onto child cases so legacy `color`-based UI stays in sync.
      if (patch.outline_color !== undefined) {
        await supabase.from('case_drafts').update({ color: patch.outline_color }).eq('case_type_id', typeRowId);
      }
    },
    onSuccess: () => {
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
    },
    onError: () => toast.error('Failed to update case type'),
  });

  // Add another case type row (next order_index, picks first unused non-other type, or 'other').
  const addTypeMutation = useMutation({
    mutationFn: async () => {
      const used = new Set(caseTypeRows.filter(t => t.type_code !== 'other').map(t => t.type_code));
      const firstFree = CASE_TYPE_DEFS.find(d => d.code !== 'other' && !used.has(d.code))?.code ?? 'other';
      const nextOrder = caseTypeRows.length > 0 ? Math.max(...caseTypeRows.map(t => t.order_index)) + 1 : 0;
      const { error } = await supabase.from('proposal_case_types').insert({
        proposal_id: proposalId,
        type_code: firstFree,
        order_index: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidateCaseQueries(); onSaveEvent?.(); },
    onError: () => toast.error('Failed to add type'),
  });

  // Delete a type card. Cases must be removed first (ON DELETE RESTRICT).
  // Behaviour: confirm-cascade — if cases exist, ask the user; on confirm, delete cases then the type row.
  const deleteTypeMutation = useMutation({
    mutationFn: async (typeRowId: string) => {
      const { error: ce } = await supabase.from('case_drafts').delete().eq('case_type_id', typeRowId);
      if (ce) throw ce;
      const { error: te } = await supabase.from('proposal_case_types').delete().eq('id', typeRowId);
      if (te) throw te;
    },
    onSuccess: () => {
      invalidateCaseQueries();
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      onSaveEvent?.();
      toast.success('Case type removed');
    },
    onError: () => toast.error('Failed to remove case type'),
  });

  const handleUpdateCase = useCallback((id: string, updates: Partial<CaseDraft>) => {
    updateCaseMutation.mutate({ id, updates });
  }, [updateCaseMutation]);

  const handleDeleteCase = useCallback((id: string) => {
    if (confirm('Are you sure you want to delete this case?')) {
      deleteCaseMutation.mutate(id);
    }
  }, [deleteCaseMutation]);

  const handleToggleLock = useCallback(async (id: string, locked: boolean) => {
    await queryClient.cancelQueries({ queryKey: ['case-drafts-management', proposalId] });
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
    if (error) toast.error('Failed to update lock status');
    invalidateCaseQueries();
    if (!error) toast.success(locked ? 'Case locked' : 'Case unlocked');
  }, [user, proposalId, queryClient, invalidateCaseQueries]);

  const handleToggleLockAll = useCallback(async () => {
    const allLocked = caseDrafts.length > 0 && caseDrafts.every(c => c.is_locked);
    const newLocked = !allLocked;
    await queryClient.cancelQueries({ queryKey: ['case-drafts-management', proposalId] });
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
    if (error) { toast.error('Failed to update lock status'); invalidateCaseQueries(); return; }
    invalidateCaseQueries();
    toast.success(newLocked ? 'All cases locked' : 'All cases unlocked');
  }, [user, proposalId, queryClient, caseDrafts, invalidateCaseQueries]);

  const handleCheckboxChange = (checked: boolean) => onToggleCases(checked);

  // Group cases by case_type_id.
  const casesByType = useMemo(() => {
    const map = new Map<string, CaseDraft[]>();
    for (const c of caseDrafts) {
      if (!c.case_type_id) continue;
      const arr = map.get(c.case_type_id) ?? [];
      arr.push(c);
      map.set(c.case_type_id, arr);
    }
    // Sort each group by number (1..n) for stable display.
    for (const [k, v] of map) {
      map.set(k, [...v].sort((a, b) => a.number - b.number));
    }
    return map;
  }, [caseDrafts]);

  const usedNonOtherTypes = useMemo(
    () => new Set(caseTypeRows.filter(t => t.type_code !== 'other').map(t => t.type_code)),
    [caseTypeRows]
  );

  const hasAnyCase = caseDrafts.length > 0;
  const canShowAddAnother = isCoordinator && hasAnyCase;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="w-5 h-5" />
          Case manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

        {casesEnabled && (
          <>
            {(casesLoading || typesLoading) ? (
              <div className="animate-pulse space-y-2">
                {[1, 2].map((i) => (<div key={i} className="h-8 bg-muted rounded" />))}
              </div>
            ) : (
              <>
                {/* (Per-type number/abbreviation toggles live on each case-type card below.) */}


                {/* First-run prompt: cases enabled but no type yet */}
                {caseTypeRows.length === 0 && (
                  <div className="border rounded-md p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
                    <span>Pick the first case type to start adding cases.</span>
                    {isCoordinator && (
                      <Button size="sm" variant="outline" onClick={() => addTypeMutation.mutate()} disabled={addTypeMutation.isPending}>
                        <Plus className="w-4 h-4 mr-1" /> Add case type
                      </Button>
                    )}
                  </div>
                )}

                {/* One card per case type */}
                {caseTypeRows.map((typeRow) => {
                  const typeLabel = getCaseTypeLabel(typeRow.type_code, typeRow.custom_type_name);
                  const prefix = getCasePrefix(typeRow.type_code, typeRow.custom_type_name);
                  const cases = casesByType.get(typeRow.id) ?? [];

                  const onDragEnd = (event: DragEndEvent) => {
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;
                    const oldIndex = cases.findIndex((c) => c.id === active.id);
                    const newIndex = cases.findIndex((c) => c.id === over.id);
                    const reordered = arrayMove(cases, oldIndex, newIndex);
                    reorderTypeMutation.mutate({ typeId: typeRow.id, ordered: reordered });
                  };

                  return (
                    <div key={typeRow.id} className="border rounded-md p-3 space-y-2">
                      {/* Card header: type selector + delete-type */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm text-muted-foreground shrink-0">Type:</Label>
                          <Select
                            value={typeRow.type_code}
                            onValueChange={(newType) => changeTypeMutation.mutate({
                              typeRowId: typeRow.id,
                              type_code: newType,
                              custom_type_name: newType === 'other' ? typeRow.custom_type_name : null,
                            })}
                            disabled={!isCoordinator}
                          >
                            <SelectTrigger className="h-7 text-xs w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CASE_TYPES.map((t) => {
                                const disabledOpt =
                                  t.value !== 'other' &&
                                  t.value !== typeRow.type_code &&
                                  usedNonOtherTypes.has(t.value);
                                return (
                                  <SelectItem
                                    key={t.value}
                                    value={t.value}
                                    disabled={disabledOpt}
                                    className="text-xs"
                                  >
                                    {t.prefix ? `${t.prefix} – ` : ''}{t.label}
                                    {disabledOpt ? ' (already used)' : ''}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {typeRow.type_code === 'other' && (
                            <AbbreviationInput
                              value={typeRow.custom_type_name || ''}
                              onChange={(name) => changeTypeMutation.mutate({
                                typeRowId: typeRow.id,
                                type_code: 'other',
                                custom_type_name: name,
                              })}
                              disabled={!isCoordinator}
                            />
                          )}
                        </div>
                        {isCoordinator && (
                          <button
                            onClick={() => {
                              const n = cases.length;
                              const msg = n === 0
                                ? 'Remove this case type?'
                                : `This will permanently delete ${n} case${n === 1 ? '' : 's'} of this type. Continue?`;
                              if (confirm(msg)) deleteTypeMutation.mutate(typeRow.id);
                            }}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Remove case type"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Per-type display settings */}
                      {isCoordinator && (
                        <div className="flex items-center gap-4 flex-wrap text-xs pt-1">
                          <label className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Outline:</span>
                            <input
                              type="color"
                              value={typeRow.outline_color || '#000000'}
                              onChange={(e) => updateTypeMutation.mutate({ typeRowId: typeRow.id, patch: { outline_color: e.target.value } })}
                              className="w-7 h-6 rounded border cursor-pointer p-0"
                              aria-label="Outline colour"
                            />
                          </label>
                          <label className="flex items-center gap-1.5">
                            <Switch
                              checked={typeRow.include_number}
                              onCheckedChange={(v) => updateTypeMutation.mutate({ typeRowId: typeRow.id, patch: { include_number: v } })}
                            />
                            <span>Include number</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <Switch
                              checked={typeRow.include_abbreviation}
                              onCheckedChange={(v) => updateTypeMutation.mutate({ typeRowId: typeRow.id, patch: { include_abbreviation: v } })}
                            />
                            <span>Include abbreviation</span>
                          </label>
                        </div>
                      )}

                      {/* Cases grid */}
                      <div className="grid grid-cols-[24px_140px_1fr_80px_20px_20px] gap-x-1.5">
                        <div className="col-span-6 grid grid-cols-subgrid gap-x-1.5 text-xs font-bold text-muted-foreground border-b pb-1">
                          <div />
                          <div />
                          <div>Title</div>
                          <div>{typeLabel} Leader</div>
                          <div />
                          <div />
                        </div>

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                          <SortableContext items={cases.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                            {cases.map((caseItem) => (
                              <SortableCaseRow
                                key={caseItem.id}
                                caseItem={caseItem}
                                participants={participants}
                                casePrefix={prefix}
                                caseTypeLabel={typeLabel}
                                includeNumber={typeRow.include_number}
                                includeAbbreviation={typeRow.include_abbreviation}
                                outlineColor={typeRow.outline_color || '#000000'}
                                onUpdate={handleUpdateCase}
                                onDelete={handleDeleteCase}
                                onToggleLock={handleToggleLock}
                                canEdit={isCoordinator}

                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      </div>

                      {isCoordinator && (
                        <div className="pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addCaseMutation.mutate(typeRow)}
                            disabled={addCaseMutation.isPending}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add {typeLabel.toLowerCase()}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add another case type */}
                {canShowAddAnother && (
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addTypeMutation.mutate()}
                      disabled={addTypeMutation.isPending}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add another case type
                    </Button>
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

                {/* Subsection button always available even when no "add another" yet */}
                {!canShowAddAnother && isCoordinator && caseTypeRows.length > 0 && (
                  <div className="pt-1 flex justify-end">
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
      </CardContent>
    </Card>
  );
}
