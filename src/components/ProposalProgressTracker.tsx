import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BarChart3, Check, Circle, ListChecks, Package, AlertTriangle, Users, ChevronDown, ChevronRight, StickyNote } from 'lucide-react';
import { WPProgressTracker } from '@/components/WPProgressTracker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProposalProgressTrackerProps {
  proposalId: string;
  isCoordinator: boolean;
  sections: { id: string; label: string }[];
  onNavigateToWP?: (wpId: string) => void;
}

interface ProgressEntry {
  id: string;
  proposal_id: string;
  section_id: string;
  section_label: string;
  progress_percent: number;
  notes: string | null;
  updated_by: string;
  updated_at: string;
}

const DEFAULT_SECTIONS = [
  { id: 'a1', label: 'A1 – General Information' },
  { id: 'a2', label: 'A2 – Participants' },
  { id: 'a3', label: 'A3 – Budget' },
  { id: 'a4', label: 'A4 – Ethics & Security' },
  { id: 'a5', label: 'A5 – Other Questions' },
  { id: 'b1-1', label: 'B1.1 – Excellence' },
  { id: 'b1-2', label: 'B1.2 – Methodology' },
  { id: 'b2-1', label: 'B2.1 – Impact pathways' },
  { id: 'b2-2', label: 'B2.2 – Dissemination' },
  { id: 'b2-3', label: 'B2.3 – Communication' },
  { id: 'b3-1', label: 'B3.1 – Work plan' },
  { id: 'b3-2', label: 'B3.2 – Capacity' },
];

export function ProposalProgressTracker({ proposalId, isCoordinator, sections, onNavigateToWP }: ProposalProgressTrackerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const displaySections = sections.length > 0 ? sections : DEFAULT_SECTIONS;

  // Fetch progress entries
  const { data: progressEntries = [], isLoading } = useQuery({
    queryKey: ['proposal-progress', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_progress')
        .select('*')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return (data || []) as ProgressEntry[];
    },
    enabled: !!proposalId,
  });

  const progressMap = useMemo(() =>
    new Map(progressEntries.map(p => [p.section_id, p])),
  [progressEntries]);

  // Overall progress
  const overallProgress = useMemo(() => {
    if (displaySections.length === 0) return 0;
    const total = displaySections.reduce((sum, s) => {
      return sum + (progressMap.get(s.id)?.progress_percent || 0);
    }, 0);
    return Math.round(total / displaySections.length);
  }, [displaySections, progressMap]);

  // Upsert progress
  const upsertProgress = useMutation({
    mutationFn: async ({ sectionId, sectionLabel, percent, notes }: {
      sectionId: string; sectionLabel: string; percent: number; notes?: string;
    }) => {
      const existing = progressMap.get(sectionId);
      if (existing) {
        const updateData: Record<string, unknown> = { progress_percent: percent, updated_by: user!.id };
        if (notes !== undefined) updateData.notes = notes;
        const { error } = await supabase
          .from('proposal_progress')
          .update(updateData)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('proposal_progress')
          .insert({
            proposal_id: proposalId,
            section_id: sectionId,
            section_label: sectionLabel,
            progress_percent: percent,
            notes: notes || null,
            updated_by: user!.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-progress', proposalId] });
    },
  });

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveNotes = (sectionId: string, sectionLabel: string) => {
    const notes = editingNotes[sectionId] ?? '';
    const entry = progressMap.get(sectionId);
    upsertProgress.mutate({
      sectionId,
      sectionLabel,
      percent: entry?.progress_percent || 0,
      notes,
    });
    toast.success('Notes saved');
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Progress Tracker</h2>
        <p className="text-muted-foreground text-sm">Track completion status across all proposal sections</p>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overall Proposal Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress value={overallProgress} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Weighted average across all sections</span>
              <span className="font-medium">{overallProgress}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Section Progress</CardTitle>
          <CardDescription>
            {isCoordinator ? 'Drag sliders to update progress for each section' : 'View progress for each section'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {displaySections.map(section => {
            const entry = progressMap.get(section.id);
            const percent = entry?.progress_percent || 0;
            const notes = entry?.notes || '';
            const isNotesOpen = expandedNotes.has(section.id);
            const currentNotes = editingNotes[section.id] ?? notes;

            return (
              <div key={section.id} className="border rounded-md px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-[200px] shrink-0 truncate">{section.label}</span>
                  <div className="flex-1">
                    {isCoordinator ? (
                      <Slider
                        value={[percent]}
                        max={100}
                        step={5}
                        onValueCommit={([val]) => {
                          upsertProgress.mutate({ sectionId: section.id, sectionLabel: section.label, percent: val });
                        }}
                        className="w-full"
                      />
                    ) : (
                      <Progress value={percent} className="h-2" />
                    )}
                  </div>
                  <span className="text-sm font-medium w-12 text-right">{percent}%</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      toggleNotes(section.id);
                      if (!isNotesOpen) setEditingNotes(prev => ({ ...prev, [section.id]: notes }));
                    }}
                  >
                    <StickyNote className={cn("h-3.5 w-3.5", notes ? "text-primary" : "text-muted-foreground")} />
                  </Button>
                </div>
                {isNotesOpen && (
                  <div className="mt-2 pl-[200px] space-y-1">
                    {isCoordinator ? (
                      <>
                        <Textarea
                          value={currentNotes}
                          onChange={e => setEditingNotes(prev => ({ ...prev, [section.id]: e.target.value }))}
                          placeholder="Add notes about this section's progress..."
                          className="min-h-[60px] text-sm"
                        />
                        <div className="flex justify-end">
                          <Button size="sm" className="h-7 text-xs" onClick={() => saveNotes(section.id, section.label)}>
                            Save Notes
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{notes || 'No notes'}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* WP Progress (existing component) */}
      <WPProgressTracker proposalId={proposalId} onNavigateToWP={onNavigateToWP} />
    </div>
  );
}
