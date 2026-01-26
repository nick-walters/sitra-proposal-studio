import { useEffect, useState } from 'react';
import { useWPDraftEditor } from '@/hooks/useWPDrafts';
import { WPMethodologySection } from '@/components/WPMethodologySection';
import { WPTableSection } from '@/components/WPTableSection';
import { WPPlanningQuestions } from '@/components/WPPlanningQuestions';
import { WPEffortMatrix } from '@/components/WPEffortMatrix';
import { WPDeliverablesTable } from '@/components/WPDeliverablesTable';
import { WPRisksTable } from '@/components/WPRisksTable';
import { WPColorPicker } from '@/components/WPColorPicker';
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

const GENERAL_TIPS = [
  {
    id: 'general-1',
    title: 'Structure your WP clearly',
    content: 'Each WP should have clear objectives, well-defined tasks, and measurable deliverables. Evaluators appreciate logical flow and clear dependencies.',
  },
  {
    id: 'general-2',
    title: 'Balance the workload',
    content: 'Ensure effort is distributed appropriately among partners. Check that WP leaders have sufficient resources and expertise for their roles.',
  },
  {
    id: 'general-3',
    title: 'Consider timing carefully',
    content: 'Plan task timing to avoid bottlenecks. Allow buffer for unexpected delays, especially for external dependencies and approval processes.',
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
    addRisk,
    updateRisk,
    deleteRisk,
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

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Header with color */}
        <div 
          className="rounded-lg p-4 -mx-2"
          style={{ 
            backgroundColor: wpDraft.color,
            color: getContrastingTextColor(wpDraft.color),
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">WP{wpDraft.number}</span>
              {!readOnly && (
                <WPColorPicker
                  color={wpDraft.color}
                  onChange={(color) => updateField('color', color)}
                />
              )}
            </div>
            <div className="flex-1">
              <Input
                value={wpDraft.short_name || ''}
                onChange={(e) => updateField('short_name', e.target.value)}
                placeholder="Short name"
                className="bg-white/90 text-foreground h-8 max-w-[200px]"
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex-1">
              <Input
                value={wpDraft.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Full work package title"
                className="bg-white/90 text-foreground"
                disabled={readOnly}
              />
            </div>
            <div className="w-[200px]">
              <Select
                value={wpDraft.lead_participant_id || ''}
                onValueChange={(value) => updateField('lead_participant_id', value || null)}
                disabled={readOnly}
              >
                <SelectTrigger className="bg-white/90 text-foreground">
                  <SelectValue placeholder="WP Lead..." />
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

        {/* Guidelines Button - matching Part B style */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setGuidelinesDialogOpen(true)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
        >
          <BookOpen className="h-4 w-4" />
          Guidelines
        </Button>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesDialogOpen} onOpenChange={setGuidelinesDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for WP{wpDraft.number}: {wpDraft.title || wpDraft.short_name || 'Work Package'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
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
                    {GENERAL_TIPS.map((tip, index) => (
                      <div key={tip.id}>
                        {tip.title && (
                          <h4 className="font-semibold mb-2 text-gray-900">
                            {tip.title}
                          </h4>
                        )}
                        {parseGuidelineContent(tip.content)}
                        {index < GENERAL_TIPS.length - 1 && (
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
          readOnly={readOnly}
          projectDuration={projectDuration}
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

        {/* Risks */}
        <WPRisksTable
          wpNumber={wpDraft.number}
          risks={wpDraft.risks || []}
          onRiskUpdate={updateRisk}
          onRiskAdd={addRisk}
          onRiskDelete={deleteRisk}
          readOnly={readOnly}
        />
      </div>
    </ScrollArea>
  );
}
