import { useState, useEffect } from 'react';
import { getDefaultWPColor } from '@/lib/wpColors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchWPDraftsForPopulate,
  populateB31,
  type WPDraftForPopulate,
  type PopulateSelections,
} from '@/lib/b31Population';
import { WPBubble } from '@/components/B31Pill';

interface PopulateB31DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
}

type Step = 'wp-select' | 'item-select';

// Per-WP selections
interface WPSelections {
  objectives: boolean;
  descriptionBeforeTasks: boolean;
  tasksEnabled: boolean;
  taskChecks: Record<string, boolean>;
  deliverablesEnabled: boolean;
  deliverableChecks: Record<string, boolean>;
  milestonesEnabled: boolean;
  milestoneChecks: Record<string, boolean>;
  risksEnabled: boolean;
  riskChecks: Record<string, boolean>;
}

export function PopulateB31Dialog({ open, onOpenChange, proposalId }: PopulateB31DialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [wpDrafts, setWpDrafts] = useState<WPDraftForPopulate[]>([]);
  const [step, setStep] = useState<Step>('wp-select');

  // WP selection (step 1)
  const [wpChecks, setWpChecks] = useState<Record<string, boolean>>({});

  // Per-WP item selections (step 2)
  const [wpSelections, setWpSelections] = useState<Record<string, WPSelections>>({});
  const [currentWpIndex, setCurrentWpIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep('wp-select');
    setCurrentWpIndex(0);
    setLoading(true);
    fetchWPDraftsForPopulate(proposalId)
      .then((data) => {
        setWpDrafts(data);
        const wps: Record<string, boolean> = {};
        for (const wp of data) wps[wp.id] = true;
        setWpChecks(wps);
      })
      .catch(() => toast.error('Failed to load WP data'))
      .finally(() => setLoading(false));
  }, [open, proposalId]);

  const selectedWpDrafts = wpDrafts.filter((wp) => wpChecks[wp.id]);

  const initWpSelections = () => {
    const sels: Record<string, WPSelections> = {};
    for (const wp of selectedWpDrafts) {
      const taskChecks: Record<string, boolean> = {};
      const deliverableChecks: Record<string, boolean> = {};
      const milestoneChecks: Record<string, boolean> = {};
      const riskChecks: Record<string, boolean> = {};
      for (const t of wp.tasks) taskChecks[t.id] = true;
      for (const d of wp.deliverables) deliverableChecks[d.id] = true;
      for (const m of wp.milestones) milestoneChecks[m.id] = true;
      for (const r of wp.risks) riskChecks[r.id] = true;
      sels[wp.id] = {
        objectives: true,
        descriptionBeforeTasks: !!wp.description_before_tasks,
        tasksEnabled: true,
        taskChecks,
        deliverablesEnabled: true,
        deliverableChecks,
        milestonesEnabled: true,
        milestoneChecks,
        risksEnabled: true,
        riskChecks,
      };
    }
    return sels;
  };

  const proceedToItemSelect = () => {
    if (selectedWpDrafts.length === 0) {
      toast.error('Select at least one work package');
      return;
    }
    setWpSelections(initWpSelections());
    setCurrentWpIndex(0);
    setStep('item-select');
  };

  const currentWp = selectedWpDrafts[currentWpIndex];
  const currentSel = currentWp ? wpSelections[currentWp.id] : null;

  const updateCurrentSel = (updates: Partial<WPSelections>) => {
    if (!currentWp) return;
    setWpSelections((prev) => ({
      ...prev,
      [currentWp.id]: { ...prev[currentWp.id], ...updates },
    }));
  };

  const toggleAllInRecord = (checks: Record<string, boolean>, val: boolean) => {
    const next = { ...checks };
    for (const key of Object.keys(next)) next[key] = val;
    return next;
  };

  const handlePopulate = async () => {
    setPopulating(true);
    try {
      // Merge per-WP selections into a single PopulateSelections
      const allTaskChecks: Record<string, boolean> = {};
      const allDeliverableChecks: Record<string, boolean> = {};
      const allMilestoneChecks: Record<string, boolean> = {};
      const allRiskChecks: Record<string, boolean> = {};
      let anyObjectives = false;
      let anyDescBefore = false;

      for (const wp of selectedWpDrafts) {
        const sel = wpSelections[wp.id];
        if (!sel) continue;
        if (sel.objectives) anyObjectives = true;
        if (sel.descriptionBeforeTasks) anyDescBefore = true;
        if (sel.tasksEnabled) Object.assign(allTaskChecks, sel.taskChecks);
        if (sel.deliverablesEnabled) Object.assign(allDeliverableChecks, sel.deliverableChecks);
        if (sel.milestonesEnabled) Object.assign(allMilestoneChecks, sel.milestoneChecks);
        if (sel.risksEnabled) Object.assign(allRiskChecks, sel.riskChecks);
      }

      const selections: PopulateSelections = {
        objectives: anyObjectives,
        descriptionBeforeTasks: anyDescBefore,
        tasks: allTaskChecks,
        deliverables: allDeliverableChecks,
        milestones: allMilestoneChecks,
        risks: allRiskChecks,
      };

      const result = await populateB31(proposalId, selectedWpDrafts, selections);

      if (result.success) {
        const parts: string[] = [];
        if (result.counts.objectives > 0) parts.push(`${result.counts.objectives} objectives`);
        if (result.counts.tasks > 0) parts.push(`${result.counts.tasks} task descriptions`);
        if (result.counts.deliverables > 0) parts.push(`${result.counts.deliverables} deliverables`);
        if (result.counts.milestones > 0) parts.push(`${result.counts.milestones} milestones`);
        if (result.counts.risks > 0) parts.push(`${result.counts.risks} risks`);
        toast.success(`Populated: ${parts.join(', ') || 'nothing selected'}`);
        queryClient.invalidateQueries({ queryKey: ['b31-wp-data'] });
        queryClient.invalidateQueries({ queryKey: ['b31-deliverables'] });
        queryClient.invalidateQueries({ queryKey: ['b31-milestones'] });
        queryClient.invalidateQueries({ queryKey: ['b31-risks'] });
        queryClient.invalidateQueries({ queryKey: ['section-content'] });
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to populate');
      }
    } catch {
      toast.error('Failed to populate');
    } finally {
      setPopulating(false);
    }
  };

  const allWpsSelected = wpDrafts.length > 0 && wpDrafts.every((wp) => wpChecks[wp.id]);
  const isLastWp = currentWpIndex === selectedWpDrafts.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Populate Part B3.1</DialogTitle>
          <DialogDescription>
            {step === 'wp-select'
              ? 'Select which work packages to copy from drafts to Part B3.1.'
              : `Select content to copy (${currentWpIndex + 1} of ${selectedWpDrafts.length}).`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : step === 'wp-select' ? (
          /* ── Step 1: WP selection ── */
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-2 pb-2">
              {wpDrafts.length > 1 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer underline"
                  onClick={() => {
                    const newVal = !allWpsSelected;
                    const next: Record<string, boolean> = {};
                    for (const wp of wpDrafts) next[wp.id] = newVal;
                    setWpChecks(next);
                  }}
                >
                  {allWpsSelected ? 'Deselect all' : 'Select all'}
                </button>
              )}
              {wpDrafts.map((wp) => {
                const wpColor = wp.color || getDefaultWPColor(wp.number);
                return (
                  <label key={wp.id} className="flex items-start gap-2 cursor-pointer border rounded-md p-3">
                    <Checkbox
                      checked={wpChecks[wp.id] ?? false}
                      onCheckedChange={(v) => setWpChecks({ ...wpChecks, [wp.id]: v === true })}
                      className="mt-0.5"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <WPBubble
                        wpColor={wpColor}
                        style={{ padding: '0px 6px', height: '20px' }}
                      >
                        WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}{wp.title ? ` – ${wp.title}` : ''}
                      </WPBubble>
                      <span className="text-xs text-muted-foreground">
                        {wp.tasks.length} {wp.tasks.length === 1 ? 'task' : 'tasks'} · {wp.deliverables.length} {wp.deliverables.length === 1 ? 'deliverable' : 'deliverables'} · {wp.milestones.length} {wp.milestones.length === 1 ? 'milestone' : 'milestones'} · {wp.risks.length} {wp.risks.length === 1 ? 'risk' : 'risks'}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ) : currentWp && currentSel ? (
          /* ── Step 2: Per-WP item selection ── */
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {/* WP header bubble */}
            <div className="mb-3">
              <span
                className="inline-flex items-center rounded-full font-bold text-white whitespace-nowrap"
                style={{
                  backgroundColor: currentWp.color || getDefaultWPColor(currentWp.number),
                  fontFamily: "'Times New Roman', Times, serif",
                  fontSize: '11pt',
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: '0px 6px',
                  height: '20px',
                }}
              >
                WP{currentWp.number}{currentWp.short_name ? `: ${currentWp.short_name}` : ''}{currentWp.title ? ` – ${currentWp.title}` : ''}
              </span>
            </div>

            <div className="space-y-4 pb-2">
              <SectionBlock
                label="Objectives"
                description="Copies objectives to Table 3.1.b"
                checked={currentSel.objectives}
                onCheckedChange={(v) => updateCurrentSel({ objectives: v })}
              />

              {currentWp.description_before_tasks && (
                <SectionBlock
                  label="Optional field before tasks"
                  description="Copies the optional content that appears before tasks in Table 3.1.b"
                  checked={currentSel.descriptionBeforeTasks}
                  onCheckedChange={(v) => updateCurrentSel({ descriptionBeforeTasks: v })}
                />
              )}

              {currentWp.tasks.length > 0 && (
                <SectionBlock
                  label={`${currentWp.tasks.length === 1 ? 'Task' : 'Tasks'} (${currentWp.tasks.length})`}
                  description="Copies task content to Table 3.1.b"
                  checked={currentSel.tasksEnabled}
                  onCheckedChange={(v) => {
                    updateCurrentSel({
                      tasksEnabled: v,
                      taskChecks: toggleAllInRecord(currentSel.taskChecks, v),
                    });
                  }}
                >
                  {currentSel.tasksEnabled && (
                    <ItemList
                      items={currentWp.tasks.map((t) => ({
                        id: t.id,
                        label: `T${currentWp.number}.${t.number}${t.title ? `: ${t.title}` : ''}`,
                      }))}
                      checks={currentSel.taskChecks}
                      setChecks={(c) => updateCurrentSel({ taskChecks: c })}
                    />
                  )}
                </SectionBlock>
              )}

              {currentWp.deliverables.length > 0 && (
                <SectionBlock
                  label={`${currentWp.deliverables.length === 1 ? 'Deliverable' : 'Deliverables'} (${currentWp.deliverables.length})`}
                  description="Copies to Table 3.1.c"
                  checked={currentSel.deliverablesEnabled}
                  onCheckedChange={(v) => {
                    updateCurrentSel({
                      deliverablesEnabled: v,
                      deliverableChecks: toggleAllInRecord(currentSel.deliverableChecks, v),
                    });
                  }}
                >
                  {currentSel.deliverablesEnabled && (
                    <ItemList
                      items={currentWp.deliverables.map((d) => ({
                        id: d.id,
                        label: `D${currentWp.number}.${d.number}${d.title ? `: ${d.title}` : ''}`,
                      }))}
                      checks={currentSel.deliverableChecks}
                      setChecks={(c) => updateCurrentSel({ deliverableChecks: c })}
                    />
                  )}
                </SectionBlock>
              )}

              {currentWp.milestones.length > 0 && (
                <SectionBlock
                  label={`${currentWp.milestones.length === 1 ? 'Milestone' : 'Milestones'} (${currentWp.milestones.length})`}
                  description="Copies to Table 3.1.d"
                  checked={currentSel.milestonesEnabled}
                  onCheckedChange={(v) => {
                    updateCurrentSel({
                      milestonesEnabled: v,
                      milestoneChecks: toggleAllInRecord(currentSel.milestoneChecks, v),
                    });
                  }}
                >
                  {currentSel.milestonesEnabled && (
                    <ItemList
                      items={currentWp.milestones.map((m) => ({
                        id: m.id,
                        label: `MS${m.number}${m.title ? `: ${m.title}` : ''}`,
                      }))}
                      checks={currentSel.milestoneChecks}
                      setChecks={(c) => updateCurrentSel({ milestoneChecks: c })}
                    />
                  )}
                </SectionBlock>
              )}

              {currentWp.risks.length > 0 && (
                <SectionBlock
                  label={`${currentWp.risks.length === 1 ? 'Risk' : 'Risks'} (${currentWp.risks.length})`}
                  description="Copies to Table 3.1.e"
                  checked={currentSel.risksEnabled}
                  onCheckedChange={(v) => {
                    updateCurrentSel({
                      risksEnabled: v,
                      riskChecks: toggleAllInRecord(currentSel.riskChecks, v),
                    });
                  }}
                >
                  {currentSel.risksEnabled && (
                    <ItemList
                      items={currentWp.risks.map((r) => ({
                        id: r.id,
                        label: `R${r.number}${r.title ? `: ${r.title}` : ''}`,
                      }))}
                      checks={currentSel.riskChecks}
                      setChecks={(c) => updateCurrentSel({ riskChecks: c })}
                    />
                  )}
                </SectionBlock>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={populating} className="mr-auto">
            Cancel
          </Button>
          {step === 'item-select' && (
            <Button
              variant="outline"
              onClick={() => {
                if (currentWpIndex > 0) setCurrentWpIndex(currentWpIndex - 1);
                else setStep('wp-select');
              }}
              disabled={populating}
            >
              Back
            </Button>
          )}
          {step === 'wp-select' ? (
            <Button onClick={proceedToItemSelect} disabled={loading || selectedWpDrafts.length === 0}>
              Next
            </Button>
          ) : isLastWp ? (
            <Button onClick={handlePopulate} disabled={populating || loading}>
              {populating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Populating…
                </>
              ) : (
                'Populate'
              )}
            </Button>
          ) : (
            <Button onClick={() => setCurrentWpIndex(currentWpIndex + 1)}>
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Section block with header checkbox ── */
function SectionBlock({
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border rounded-md p-3">
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">{label}</span>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </label>
      {children}
    </div>
  );
}

/* ── Expandable item checklist ── */
function ItemList({
  items,
  checks,
  setChecks,
}: {
  items: { id: string; label: string }[];
  checks: Record<string, boolean>;
  setChecks: (v: Record<string, boolean>) => void;
}) {
  const allChecked = items.every((i) => checks[i.id]);

  return (
    <div className="mt-2 ml-6 space-y-1">
      <button
        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer underline"
        onClick={() => {
          const next = { ...checks };
          const newVal = !allChecked;
          for (const item of items) next[item.id] = newVal;
          setChecks(next);
        }}
      >
        {allChecked ? 'Deselect all' : 'Select all'}
      </button>
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={checks[item.id] ?? false}
            onCheckedChange={(v) => setChecks({ ...checks, [item.id]: v === true })}
          />
          <span className="truncate">{item.label}</span>
        </label>
      ))}
    </div>
  );
}
