import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { SitraTipsBox } from '@/components/SitraTipsBox';
import { BookOpen, Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

const CASE_TYPES: Record<string, string> = {
  case_study: 'CS',
  use_case: 'UC',
  living_lab: 'LL',
  pilot: 'P',
  demonstration: 'D',
  other: 'C',
};

function getCasePrefix(caseType: string, customTypeName?: string | null): string {
  if (caseType === 'other' && customTypeName) return customTypeName.toUpperCase();
  return CASE_TYPES[caseType] || 'C';
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
  key: 'background_context' | 'proposed_solutions' | 'expected_outcomes' | 'replicability';
  headingKey: 'heading_background' | 'heading_solutions' | 'heading_outcomes' | 'heading_replicability';
  defaultHeading: string;
  guideline: string;
}

const SUBSECTIONS: SubsectionConfig[] = [
  {
    key: 'background_context',
    headingKey: 'heading_background',
    defaultHeading: 'Background context',
    guideline: 'Describe the specific setting, stakeholders, and challenges that motivate this case. Explain what makes this context relevant to the project objectives.',
  },
  {
    key: 'proposed_solutions',
    headingKey: 'heading_solutions',
    defaultHeading: 'Proposed solutions',
    guideline: 'Outline the solutions or interventions to be developed and tested in this case. Describe interactions with relevant WPs and how each contributes to this case.',
  },
  {
    key: 'expected_outcomes',
    headingKey: 'heading_outcomes',
    defaultHeading: 'Expected outcomes',
    guideline: 'Specify the measurable results expected from this case, including KPIs and success criteria.',
  },
  {
    key: 'replicability',
    headingKey: 'heading_replicability',
    defaultHeading: 'Replicability',
    guideline: 'Explain how lessons and solutions from this case can be transferred to other contexts, sectors, or geographies.',
  },
];

interface CaseDraftEditorProps {
  caseId: string;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
}

export function CaseDraftEditor({ caseId, proposalId, canEdit, isCoordinator }: CaseDraftEditorProps) {
  const queryClient = useQueryClient();
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase
        .from('case_drafts')
        .update(updates)
        .eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
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
        {/* Top Toolbar Row - Guidelines + Formatting (matches WP editor, sticky) */}
        <div className="flex items-center gap-2 p-2 border rounded-md bg-card flex-wrap sticky top-0 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGuidelinesOpen(true)}
            className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Guidelines
          </Button>

          <Separator orientation="vertical" className="h-5" />

          {!readOnly && (
            <>
              {/* Subheading */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => { execCommand('bold'); execCommand('underline'); }}>
                    <span className="text-xs font-black underline">Subheading</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Subheading (Bold & Underlined)</TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-5" />

              {/* Bold, Italic, Underline */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('bold')}>
                      <span className="font-black text-sm">B</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('italic')}>
                      <Italic className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('underline')}>
                      <Underline className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-5" />

              {/* Lists */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertUnorderedList')}>
                      <List className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Bullet List</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertOrderedList')}>
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Numbered List</TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-5" />

              {/* Alignment */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyLeft')}>
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Align Left</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyCenter')}>
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Align Center</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyRight')}>
                      <AlignRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Align Right</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyFull')}>
                      <AlignJustify className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Justify</TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-5" />

              {/* Table insert */}
              <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1">
                        <Table2 className="h-3.5 w-3.5" />
                        <span className="text-xs">Table</span>
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert Table</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="text-xs text-muted-foreground mb-2">
                    {hoveredCell ? `${hoveredCell.row} × ${hoveredCell.col}` : 'Select size'}
                  </div>
                  <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                    {Array.from({ length: 8 }, (_, row) =>
                      Array.from({ length: 8 }, (_, col) => {
                        const isHighlighted = hoveredCell && row < hoveredCell.row && col < hoveredCell.col;
                        const isFirstRow = row === 0;
                        return (
                          <button
                            key={`${row}-${col}`}
                            className={cn(
                              "w-4 h-4 border border-border rounded-sm transition-colors",
                              isHighlighted
                                ? isFirstRow ? "bg-foreground" : "bg-primary/40"
                                : "bg-background hover:bg-muted"
                            )}
                            onMouseEnter={() => setHoveredCell({ row: row + 1, col: col + 1 })}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => insertTable(row + 1, col + 1)}
                          />
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>

        {/* Header with color (matches WP editor header) */}
        <div
          className="rounded-lg p-4 -mx-2"
          style={{ backgroundColor: caseDraft.color, color: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{prefix}{caseDraft.number}:</span>
            <DebouncedInput
              value={caseDraft.title || ''}
              onDebouncedChange={(v) => updateField('title', v)}
              placeholder="Case title"
              className="bg-white/90 text-foreground flex-1"
              disabled={readOnly}
            />
          </div>
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Short name:</span>
              <DebouncedInput
                value={caseDraft.short_name || ''}
                onDebouncedChange={(v) => updateField('short_name', v)}
                placeholder="e.g. Barcelona"
                className="bg-white/90 text-foreground h-7 w-[140px] text-sm"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Lead:</span>
              <Select
                value={caseDraft.lead_participant_id || ''}
                onValueChange={(value) => updateField('lead_participant_id', value || null)}
                disabled={readOnly}
              >
                <SelectTrigger className="bg-white/90 text-foreground h-7 w-[160px] text-sm">
                  <SelectValue placeholder="Select lead..." />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.organisation_short_name || p.organisation_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for {prefix}{caseDraft.number}: {caseDraft.title || caseDraft.short_name || 'Case'}</DialogTitle>
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
                  <p className="text-xs text-muted-foreground italic">
                    {sub.guideline}
                  </p>
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