import { useState, useCallback, useEffect, useMemo } from 'react';
import { DraftFormattingToolbar } from '@/components/DraftFormattingToolbar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { SitraTipsBox } from '@/components/SitraTipsBox';
import { BookOpen, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

const CASE_TYPES: Record<string, string> = {
  case_study: 'CS',
  use_case: 'UC',
  living_lab: 'LL',
  pilot: 'P',
  demonstration: 'D',
  challenge: 'CH',
  other: '',
};

const CASE_TYPE_LABELS: Record<string, string> = {
  case_study: 'Case Study',
  use_case: 'Use Case',
  living_lab: 'Living Lab',
  pilot: 'Pilot',
  demonstration: 'Demonstration',
  challenge: 'Challenge',
  other: 'Case',
};

function getCaseTypeLabel(caseType: string, customTypeName?: string | null): string {
  if (caseType === 'other') return customTypeName || 'Case';
  return CASE_TYPE_LABELS[caseType] || 'Case';
}

function getCasePrefix(caseType: string, customTypeName?: string | null): string {
  if (caseType === 'other') return customTypeName ? customTypeName.toUpperCase() : '';
  return CASE_TYPES[caseType] || '';
}

const SITRA_CASE_TIPS = [
  {
    id: 'sitra-case-1',
    title: 'Make each case distinct',
    content: 'Each case should address a clearly different context, sector, or geography. Avoid overlap — evaluators want to see breadth and complementarity across cases.',
  },
  {
    id: 'sitra-case-2',
    title: 'Ground cases in real needs',
    content: 'Cases are most convincing when rooted in genuine, documented needs of end-users or stakeholders. Reference existing evidence or engagement activities.',
  },
  {
    id: 'sitra-case-3',
    title: 'Show the path to impact',
    content: 'For each case, make the connection from activities to outcomes to wider impact explicit. This helps evaluators see how results will materialise beyond the project.',
  },
  {
    id: 'sitra-case-4',
    title: 'Plan for replicability early',
    content: 'Describe how lessons learned and solutions developed in each case can be transferred to other contexts. This strengthens the overall impact narrative of the proposal.',
  },
];

interface SubsectionConfig {
  key: 'background_context' | 'key_stakeholders' | 'proposed_solutions' | 'expected_outcomes' | 'replicability';
  headingKey: 'heading_background' | 'heading_stakeholders' | 'heading_solutions' | 'heading_outcomes' | 'heading_replicability';
  guidelineKey: 'guideline_background' | 'guideline_stakeholders' | 'guideline_solutions' | 'guideline_outcomes' | 'guideline_replicability';
  defaultHeading: string;
  defaultGuideline: string;
}

const SUBSECTIONS: SubsectionConfig[] = [
  {
    key: 'background_context',
    headingKey: 'heading_background',
    guidelineKey: 'guideline_background',
    defaultHeading: 'Background context',
    defaultGuideline: 'Describe the specific setting, stakeholders, and challenges that motivate this case. Explain what makes this context relevant to the project objectives.',
  },
  {
    key: 'key_stakeholders',
    headingKey: 'heading_stakeholders',
    guidelineKey: 'guideline_stakeholders',
    defaultHeading: 'Key stakeholders',
    defaultGuideline: 'Summarise the key target groups involved in the case.',
  },
  {
    key: 'proposed_solutions',
    headingKey: 'heading_solutions',
    guidelineKey: 'guideline_solutions',
    defaultHeading: 'Proposed solutions',
    defaultGuideline: 'Outline the solutions or interventions to be developed and tested in this case. Describe interactions with relevant WPs and how each contributes to this case.',
  },
  {
    key: 'expected_outcomes',
    headingKey: 'heading_outcomes',
    guidelineKey: 'guideline_outcomes',
    defaultHeading: 'Expected outcomes',
    defaultGuideline: 'Specify the measurable results expected from this case, including KPIs and success criteria.',
  },
  {
    key: 'replicability',
    headingKey: 'heading_replicability',
    guidelineKey: 'guideline_replicability',
    defaultHeading: 'Replicability',
    defaultGuideline: 'Explain how lessons and solutions from this case can be transferred to other contexts, sectors, or geographies.',
  },
];

interface CaseDraftEditorProps {
  caseId: string;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
}

export function CaseDraftEditor({ caseId, proposalId, canEdit: canEditProp, isCoordinator }: CaseDraftEditorProps) {
  const queryClient = useQueryClient();
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lockWarningDismissed, setLockWarningDismissed] = useState(false);
  const [showLockWarning, setShowLockWarning] = useState(false);

  // Fetch case draft
  const { data: caseDraft, isLoading } = useQuery({
    queryKey: ['case-draft-detail', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select('*')
        .eq('id', caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch participants
  const { data: participants = [] } = useQuery({
    queryKey: ['participants-for-case-editor', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantSummary[];
    },
  });

  // Lock enforcement
  const isLocked = (caseDraft as any)?.is_locked === true;
  const lockedById = (caseDraft as any)?.locked_by as string | null;

  // Reset lock warning dismissal when case changes
  useEffect(() => { setLockWarningDismissed(false); }, [caseId]);

  // Fetch locker's name
  const { data: lockerProfile } = useQuery({
    queryKey: ['profile-name', lockedById],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', lockedById!)
        .single();
      return data;
    },
    enabled: !!lockedById && isLocked,
  });
  const lockerName = lockerProfile?.full_name || lockerProfile?.email || 'another user';

  const canEdit = useMemo(() => {
    if (!canEditProp) return false;
    if (!isLocked) return true;
    if (isCoordinator) return lockWarningDismissed;
    return false;
  }, [canEditProp, isLocked, isCoordinator, lockWarningDismissed]);

  // Heading and guideline keys that should propagate across all cases
  const PROPAGATED_KEYS = new Set([
    'heading_background', 'heading_stakeholders', 'heading_solutions', 'heading_outcomes', 'heading_replicability',
    'guideline_background', 'guideline_stakeholders', 'guideline_solutions', 'guideline_outcomes', 'guideline_replicability',
  ]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase
        .from('case_drafts')
        .update(updates)
        .eq('id', caseId);
      if (error) throw error;

      // Propagate heading/guideline changes to ALL other cases in the proposal
      const propagatedUpdates: Record<string, any> = {};
      for (const [key, val] of Object.entries(updates)) {
        if (PROPAGATED_KEYS.has(key)) {
          propagatedUpdates[key] = val;
        }
      }
      if (Object.keys(propagatedUpdates).length > 0) {
        await supabase
          .from('case_drafts')
          .update(propagatedUpdates)
          .eq('proposal_id', proposalId)
          .neq('id', caseId);
      }
    },
    onSuccess: () => {
      setLastSaved(new Date());
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts-management', proposalId] });
    },
    onError: () => {
      setSaveError('Failed to save changes');
    },
  });

  const updateField = useCallback((field: string, value: any) => {
    updateMutation.mutate({ [field]: value });
  }, [updateMutation]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const insertTable = (rows: number, cols: number) => {
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:8px 0;">';
    for (let r = 0; r < rows; r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < cols; c++) {
        if (r === 0) {
          tableHtml += '<th style="border:1px solid #000; padding:4px; background:#000; color:#fff; font-weight:bold;">&nbsp;</th>';
        } else {
          tableHtml += '<td style="border:1px solid #000; padding:4px;">&nbsp;</td>';
        }
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</table><p><br></p>';
    execCommand('insertHTML', tableHtml);
    setTablePopoverOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!caseDraft) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Case not found
      </div>
    );
  }

  const readOnly = !canEdit;
  const prefix = getCasePrefix(caseDraft.case_type, caseDraft.custom_type_name);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {/* Lock warning banner */}
        {isLocked && !canEdit && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
            <Lock className="w-4 h-4 text-destructive shrink-0" />
            <span>This case has been locked by <strong>{lockerName}</strong>. Editing is disabled.</span>
            {isCoordinator && (
              <Button variant="outline" size="sm" className="ml-auto shrink-0 h-7 text-xs" onClick={() => setShowLockWarning(true)}>
                Edit anyway
              </Button>
            )}
          </div>
        )}

        {/* Lock warning dialog for coordinators */}
        <Dialog open={showLockWarning} onOpenChange={setShowLockWarning}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-destructive" />
                Locked draft
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This case has been locked by <strong>{lockerName}</strong>. As you are a coordinator, you can still edit it, but doing so may result in differences between the draft and Part B. It is recommended to therefore work on Part B instead.
            </p>
            <p className="text-sm font-medium">Do you wish to continue editing the draft?</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLockWarning(false)}>Cancel</Button>
              <Button size="sm" onClick={() => { setLockWarningDismissed(true); setShowLockWarning(false); }}>OK</Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Top Toolbar Row - Guidelines + Formatting (shared component) */}
        <DraftFormattingToolbar
          onOpenGuidelines={() => setGuidelinesOpen(true)}
          save={{
            saving: updateMutation.isPending,
            lastSaved,
            saveError,
            onSaveNow: () => {},
          }}
          isReadOnly={readOnly}
          onCommand={execCommand}
          table={{
            open: tablePopoverOpen,
            onOpenChange: setTablePopoverOpen,
            hoveredCell,
            onHoverCell: setHoveredCell,
            onInsert: insertTable,
          }}
        />


        {/* Header with white bg + black outline (case bubble style) */}
        <div
          className="rounded-lg p-4 -mx-2 bg-white border-[1.5px] border-black"
        >
          {/* Row 1: Short name + Leader */}
          <div className="flex items-center gap-4 flex-wrap mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-black">Short name:</span>
              <DebouncedInput
                value={caseDraft.short_name || ''}
                onDebouncedChange={(v) => updateField('short_name', v)}
                placeholder="e.g. Barcelona"
                className="h-8 w-[160px] text-base font-bold"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-black">{getCaseTypeLabel(caseDraft.case_type, caseDraft.custom_type_name)} Leader:</span>
              <Select
                value={caseDraft.lead_participant_id || ''}
                onValueChange={(value) => updateField('lead_participant_id', value || null)}
                disabled={readOnly}
              >
                <SelectTrigger className="h-8 w-[160px] text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span
                        className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
                        style={{ backgroundColor: '#000000', color: '#ffffff', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 5px', height: '17px' }}
                      >
                        {p.organisation_short_name || p.organisation_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Row 2: Badge + Title */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-black">{prefix ? `${prefix}${caseDraft.number}` : (caseDraft.short_name || caseDraft.number)}:</span>
            <DebouncedInput
              value={caseDraft.title || ''}
              onDebouncedChange={(v) => updateField('title', v)}
              placeholder="Full case title"
              className="flex-1 text-base font-bold"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for {prefix ? `${prefix}${caseDraft.number}` : (caseDraft.short_name || caseDraft.number)}: {caseDraft.title || caseDraft.short_name || 'Case'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  There are no official EC guidelines for case descriptions. Use the Sitra tips below for guidance.
                </p>
                <SitraTipsBox tips={SITRA_CASE_TIPS} />
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Subsections */}
        {SUBSECTIONS.map((sub) => {
          const heading = (caseDraft as any)[sub.headingKey] || sub.defaultHeading;
          const guideline = (caseDraft as any)[sub.guidelineKey] || sub.defaultGuideline;
          const content = (caseDraft as any)[sub.key] || '';

          return (
            <Card key={sub.key}>
              <CardHeader className="py-2 px-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4" />
                  {isCoordinator ? (
                    <DebouncedInput
                      value={heading}
                      onDebouncedChange={(v) => updateField(sub.headingKey, v)}
                      className="h-7 text-base font-semibold border-dashed"
                      disabled={!isCoordinator}
                    />
                  ) : (
                    <span>{heading}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3 pt-0">
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  {isCoordinator ? (
                    <DebouncedInput
                      value={guideline}
                      onDebouncedChange={(v) => updateField(sub.guidelineKey, v)}
                      className="h-auto text-xs text-muted-foreground italic border-dashed bg-transparent min-h-[1.5rem]"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {guideline}
                    </p>
                  )}
                </div>
                <WPSimpleEditor
                  value={content}
                  onChange={(v) => updateField(sub.key, v)}
                  placeholder={`Write about ${sub.defaultHeading.toLowerCase()}...`}
                  disabled={readOnly}
                  minHeight="150px"
                  hideToolbar={true}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}