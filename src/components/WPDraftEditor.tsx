import { useEffect, useState } from 'react';
import { useWPDraftEditor } from '@/hooks/useWPDrafts';
import { WPMethodologySection } from '@/components/WPMethodologySection';
import { WPTableSection } from '@/components/WPTableSection';
import { WPPlanningQuestions } from '@/components/WPPlanningQuestions';
import { WPEffortMatrix } from '@/components/WPEffortMatrix';
import { WPDeliverablesTable } from '@/components/WPDeliverablesTable';
import { WPRisksTable } from '@/components/WPRisksTable';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, Lightbulb } from 'lucide-react';
import { getContrastingTextColor } from '@/lib/wpColors';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface WPDraftEditorProps {
  wpId: string;
  proposalId: string;
  canEdit: boolean;
  projectDuration?: number;
}

const SITRA_TIPS = [
  {
    id: 'sitra-1',
    title: 'Structure your WP clearly',
    content: 'Each WP should have clear objectives, well-defined tasks, and measurable deliverables. Evaluators appreciate logical flow and clear dependencies.',
  },
  {
    id: 'sitra-2',
    title: 'Balance the workload',
    content: 'Ensure effort is distributed appropriately among partners. Check that WP leaders have sufficient resources and expertise for their roles.',
  },
  {
    id: 'sitra-3',
    title: 'Consider timing carefully',
    content: 'Plan task timing to avoid bottlenecks. Allow buffer for unexpected delays, especially for external dependencies and approval processes.',
  },
  {
    id: 'sitra-methodology-1',
    title: 'Be specific about your choices',
    content: 'Explain WHY you chose these particular methods over alternatives. Evaluators want to see that you\'ve considered options and made informed decisions.',
  },
  {
    id: 'sitra-methodology-2',
    title: 'Reference state-of-the-art',
    content: 'Show awareness of current best practices and explain how your approach builds on or improves existing methodologies.',
  },
  {
    id: 'sitra-methodology-3',
    title: 'Acknowledge limitations',
    content: 'Being honest about methodological limitations and explaining your mitigation strategies demonstrates maturity and credibility.',
  },
  {
    id: 'sitra-methodology-4',
    title: 'Link to objectives',
    content: 'Explicitly connect your methods to the objectives they support. Show evaluators that every methodological choice serves a purpose.',
  },
];

const EC_GUIDELINES = [
  {
    id: 'ec-methodology',
    title: 'Methodology',
    content: 'Describe and explain the methodologies used in this WP, including the concepts, models and assumptions that underpin your work. Explain how they will enable you to deliver your project\'s objectives. Refer to any important challenges you may have identified in the chosen methodologies and how you intend to overcome them.',
  },
  {
    id: 'ec-objectives',
    title: 'Objectives',
    content: 'State the objectives for this work package in a manner that is verifiable and measurable. They should be consistent with the overall project objectives.',
  },
  {
    id: 'ec-tasks',
    title: 'Tasks',
    content: 'For each task, provide:\n• A description of the work\n• The partner(s) involved and the task leader\n• Start month and end month\n• Links to other tasks and work packages',
  },
  {
    id: 'ec-deliverables',
    title: 'Deliverables',
    content: 'For each deliverable, provide:\n• A short name and description\n• The nature of the deliverable (Report, Demonstrator, Data management, etc.)\n• The dissemination level (Public, Sensitive, or Classified: EU-RES, EU-CON, EU-SEC)\n• The delivery date (project month)\n• The partner responsible',
  },
  {
    id: 'ec-risks',
    title: 'Critical risks',
    content: 'Describe any critical risks relating to project implementation that the stated project objectives may not be achieved. Detail:\n• A description of the risk\n• The work package(s) involved\n• Proposed risk-mitigation measures',
  },
];

// Parse content to handle bullet points
function parseGuidelineContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const cleanLine = line.trim();
        
        if (cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('–')) {
          const bulletContent = cleanLine.replace(/^[•\-–]\s*/, '');
          return (
            <div key={index} className="flex items-start gap-1.5">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span className="text-sm text-muted-foreground">{bulletContent}</span>
            </div>
          );
        }
        
        if (cleanLine) {
          return (
            <p key={index} className="text-sm text-muted-foreground">{cleanLine}</p>
          );
        }
        
        return null;
      })}
    </div>
  );
}

export function WPDraftEditor({ wpId, proposalId, canEdit, projectDuration = 36 }: WPDraftEditorProps) {
  const {
    wpDraft,
    loading,
    saving,
    updateField,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    updateTaskEffort,
    setTaskParticipants,
    addDeliverable,
    updateDeliverable,
    deleteDeliverable,
    reorderDeliverables,
    addRisk,
    updateRisk,
    deleteRisk,
    reorderRisks,
  } = useWPDraftEditor(wpId);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [guidelinesDialogOpen, setGuidelinesDialogOpen] = useState(false);

  // Fetch participants for the proposal
  useEffect(() => {
    const fetchParticipants = async () => {
      const { data } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      
      if (data) {
        setParticipants(data);
      }
    };

    fetchParticipants();
  }, [proposalId]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!wpDraft) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Work package not found
      </div>
    );
  }

  const readOnly = !canEdit;

  const leadParticipant = participants.find(p => p.id === wpDraft.lead_participant_id);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {/* Guidelines Button - above header */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setGuidelinesDialogOpen(true)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 -mb-4"
        >
          <BookOpen className="h-4 w-4" />
          Guidelines
        </Button>

        {/* Header with color */}
        <div 
          className="rounded-lg p-4 -mx-2"
          style={{ 
            backgroundColor: wpDraft.color,
            color: getContrastingTextColor(wpDraft.color),
          }}
        >
          {/* WPX: Title */}
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">WP{wpDraft.number}:</span>
            <Input
              value={wpDraft.title || ''}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Work package title"
              className="bg-white/90 text-foreground flex-1"
              disabled={readOnly}
            />
          </div>
          
          {/* Short name, Lead partner, and Duration */}
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Short name:</span>
              <Input
                value={wpDraft.short_name || ''}
                onChange={(e) => updateField('short_name', e.target.value)}
                placeholder="e.g. COORD"
                className="bg-white/90 text-foreground h-7 w-[140px] text-sm"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Lead:</span>
              <Select
                value={wpDraft.lead_participant_id || ''}
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
            {/* Auto-calculated duration from tasks */}
            {(() => {
              const tasks = wpDraft.tasks || [];
              const taskStartMonths = tasks.filter(t => t.start_month !== null && t.start_month !== undefined).map(t => t.start_month!);
              const taskEndMonths = tasks.filter(t => t.end_month !== null && t.end_month !== undefined).map(t => t.end_month!);
              const hasAllTiming = tasks.length > 0 && taskStartMonths.length === tasks.length && taskEndMonths.length === tasks.length;
              
              if (hasAllTiming) {
                const startMonth = Math.min(...taskStartMonths);
                const endMonth = Math.max(...taskEndMonths);
                const formatMonth = (m: number) => `M${m.toString().padStart(2, '0')}`;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm opacity-80">Duration:</span>
                    <span className="text-sm font-medium">
                      {formatMonth(startMonth)}–{formatMonth(endMonth)}
                    </span>
                  </div>
                );
              } else if (taskStartMonths.length > 0 || taskEndMonths.length > 0) {
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm opacity-80">Duration:</span>
                    <span className="text-xs opacity-60 italic">Add dates to all tasks</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesDialogOpen} onOpenChange={setGuidelinesDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for WP{wpDraft.number}: {wpDraft.title || wpDraft.short_name || 'Work Package'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
                {/* Official EC Guidelines */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-foreground">Official guidelines</h4>
                  {EC_GUIDELINES.map((guideline) => (
                    <div key={guideline.id} className="space-y-1">
                      <h5 className="font-medium text-sm text-muted-foreground">{guideline.title}</h5>
                      {parseGuidelineContent(guideline.content)}
                    </div>
                  ))}
                </div>

                {/* Sitra's Tips Box - matching Part B style */}
                <div
                  className={cn(
                    "rounded-lg border-2 p-4",
                    "border-gray-800",
                    "bg-gray-50/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-shrink-0 text-gray-800">
                      <Lightbulb className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      Sitra's tips
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {SITRA_TIPS.map((tip, index) => (
                      <div key={tip.id}>
                        {tip.title && (
                          <h4 className="font-semibold mb-2 text-gray-900">
                            {tip.title}
                          </h4>
                        )}
                        {parseGuidelineContent(tip.content)}
                        {index < SITRA_TIPS.length - 1 && (
                          <div className="mt-4 border-t border-current/10" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Methodology Section */}
        <WPMethodologySection
          methodology={wpDraft.methodology}
          onChange={(value) => updateField('methodology', value)}
          readOnly={readOnly}
        />

        {/* WP Table (Objectives & Tasks) */}
        <WPTableSection
          wpNumber={wpDraft.number}
          objectives={wpDraft.objectives}
          tasks={wpDraft.tasks || []}
          participants={participants}
          onObjectivesChange={(value) => updateField('objectives', value)}
          onTaskUpdate={updateTask}
          onTaskAdd={addTask}
          onTaskDelete={deleteTask}
          onTaskParticipantsChange={setTaskParticipants}
          onTaskReorder={reorderTasks}
          readOnly={readOnly}
          projectDuration={projectDuration}
        />

        {/* Deliverables */}
        <WPDeliverablesTable
          wpNumber={wpDraft.number}
          deliverables={wpDraft.deliverables || []}
          participants={participants}
          onDeliverableUpdate={updateDeliverable}
          onDeliverableAdd={addDeliverable}
          onDeliverableDelete={deleteDeliverable}
          onDeliverableReorder={reorderDeliverables}
          readOnly={readOnly}
          projectDuration={projectDuration}
        />

        {/* Risks - moved above Staff Effort */}
        <WPRisksTable
          wpNumber={wpDraft.number}
          risks={wpDraft.risks || []}
          onRiskUpdate={updateRisk}
          onRiskAdd={addRisk}
          onRiskDelete={deleteRisk}
          onRiskReorder={reorderRisks}
          readOnly={readOnly}
        />

        {/* Task Interactions & Bottlenecks */}
        <WPPlanningQuestions
          inputs={wpDraft.inputs_question}
          outputs={wpDraft.outputs_question}
          bottlenecks={wpDraft.bottlenecks_question}
          onInputsChange={(value) => updateField('inputs_question', value)}
          onOutputsChange={(value) => updateField('outputs_question', value)}
          onBottlenecksChange={(value) => updateField('bottlenecks_question', value)}
          readOnly={readOnly}
        />

        {/* Staff Effort Matrix */}
        <WPEffortMatrix
          wpNumber={wpDraft.number}
          tasks={wpDraft.tasks || []}
          participants={participants}
          onEffortChange={updateTaskEffort}
          readOnly={readOnly}
        />
      </div>
    </ScrollArea>
  );
}
