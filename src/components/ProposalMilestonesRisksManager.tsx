import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { WPBubble, B31Pill, RiskBadge } from '@/components/B31Pill';
import { SingleMonthPicker } from '@/components/SingleMonthPicker';
import { Plus, Trash2, ChevronsUpDown, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { toast } from 'sonner';

interface Props {
  proposalId: string;
  canEdit: boolean;
  projectDuration?: number;
}

interface WPRow {
  id: string;
  number: number;
  short_name: string | null;
  color: string;
}
interface TaskRow {
  id: string;
  number: number;
  title: string | null;
  wp_draft_id: string;
}
interface Milestone {
  id: string;
  number: number;
  title: string | null;
  due_month: number | null;
  means_of_verification: string | null;
  order_index: number;
  wp_ids: string[];
  task_ids: string[];
}
interface Risk {
  id: string;
  number: number;
  title: string | null;
  likelihood: string | null;
  severity: string | null;
  mitigation: string | null;
  order_index: number;
  wp_ids: string[];
}

const MS_KEY = (pid: string) => ['proposal-milestones-mgr', pid];
const RISK_KEY = (pid: string) => ['proposal-risks-mgr', pid];

// ── Strip HTML to plain text (decodes &nbsp;, &amp; etc via DOMParser) ──
function stripHtml(s: string | null | undefined): string {
  if (!s) return '';
  if (!/<[a-z!\/][^>]*>|&[a-z#0-9]+;/i.test(s)) return s;
  try {
    const doc = new DOMParser().parseFromString(s, 'text/html');
    return (doc.body.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  } catch {
    return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}

// ── Hexagon MS badge (matches B31TablesEditor.MilestoneBadge) ──
function MilestoneBadge({ number }: { number: number | null | undefined }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', color: '#fff', fontFamily: "'Times New Roman', Times, serif",
      fontSize: '11pt', fontWeight: 700, lineHeight: '18px', height: '18px', padding: '0 6px',
      clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
      minWidth: 38,
    }}>
      MS{number ?? ''}
    </span>
  );
}

// ── Auto-textarea that grows with content ──
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => { resize(); }, [props.value]);
  return (
    <textarea
      ref={ref}
      {...props}
      onInput={(e) => { resize(); props.onInput?.(e as any); }}
      className={(props.className || '') + ' w-full resize-none overflow-hidden bg-transparent border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring'}
      style={{ minHeight: 28, ...(props.style || {}) }}
    />
  );
}

export function ProposalMilestonesRisksManager({ proposalId, canEdit, projectDuration = 36 }: Props) {
  const qc = useQueryClient();

  // ── WP + task lookups ────────────────────────────────────────
  const { data: wps = [] } = useQuery<WPRow[]>({
    queryKey: ['wp-drafts-mr-mgr', proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');
      return (data || []).map((wp: any) => ({
        ...wp,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
      }));
    },
  });

  const wpIdsKey = wps.map(w => w.id).join(',');
  const { data: tasks = [] } = useQuery<TaskRow[]>({
    queryKey: ['wp-tasks-mr-mgr', proposalId, wpIdsKey],
    queryFn: async () => {
      if (wps.length === 0) return [];
      const { data } = await supabase
        .from('wp_draft_tasks')
        .select('id, number, title, wp_draft_id')
        .in('wp_draft_id', wps.map(wp => wp.id))
        .order('number');
      return data || [];
    },
    enabled: wps.length > 0,
  });

  // ── Milestones ───────────────────────────────────────────────
  const { data: milestones = [] } = useQuery<Milestone[]>({
    queryKey: MS_KEY(proposalId),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_milestones')
        .select('id, number, title, due_month, means_of_verification, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index')
        .order('number');
      const ids = (rows || []).map((r: any) => r.id);
      const [wpLinksRes, taskLinksRes] = await Promise.all([
        ids.length
          ? supabase.from('proposal_milestone_wps').select('milestone_id, wp_draft_id').in('milestone_id', ids)
          : Promise.resolve({ data: [] as any[] }),
        ids.length
          ? supabase.from('proposal_milestone_tasks').select('milestone_id, wp_draft_task_id').in('milestone_id', ids)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const wpMap = new Map<string, string[]>();
      for (const l of wpLinksRes.data || []) {
        const a = wpMap.get(l.milestone_id) || [];
        a.push(l.wp_draft_id);
        wpMap.set(l.milestone_id, a);
      }
      const taskMap = new Map<string, string[]>();
      for (const l of taskLinksRes.data || []) {
        const a = taskMap.get(l.milestone_id) || [];
        a.push(l.wp_draft_task_id);
        taskMap.set(l.milestone_id, a);
      }
      return (rows || []).map((r: any) => ({
        ...r,
        wp_ids: wpMap.get(r.id) || [],
        task_ids: taskMap.get(r.id) || [],
      }));
    },
  });

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: RISK_KEY(proposalId),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_risks')
        .select('id, number, title, likelihood, severity, mitigation, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index')
        .order('number');
      const ids = (rows || []).map((r: any) => r.id);
      const linksRes = ids.length
        ? await supabase.from('proposal_risk_wps').select('risk_id, wp_draft_id').in('risk_id', ids)
        : { data: [] as any[] };
      const wpMap = new Map<string, string[]>();
      for (const l of linksRes.data || []) {
        const a = wpMap.get(l.risk_id) || [];
        a.push(l.wp_draft_id);
        wpMap.set(l.risk_id, a);
      }
      return (rows || []).map((r: any) => ({ ...r, wp_ids: wpMap.get(r.id) || [] }));
    },
  });

  // Helper: bump cross-ref consumers when MS data changes
  const notifyRefs = () => {
    window.dispatchEvent(new CustomEvent('cross-ref-data-changed', { detail: { source: 'ProposalMilestonesRisksManager' } }));
  };

  const wpsById = useMemo(() => new Map(wps.map(wp => [wp.id, wp])), [wps]);

  // ── Auto-order milestones: due_month asc (nulls last), then min(WP number), then id ──
  const orderedMs = useMemo(() => {
    const minWpNum = (m: Milestone) => {
      const nums = m.wp_ids.map(id => wpsById.get(id)?.number).filter((n): n is number => typeof n === 'number');
      return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY;
    };
    return [...milestones].sort((a, b) => {
      const da = a.due_month ?? Number.POSITIVE_INFINITY;
      const db = b.due_month ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      const wa = minWpNum(a);
      const wb = minWpNum(b);
      if (wa !== wb) return wa - wb;
      return a.id.localeCompare(b.id);
    });
  }, [milestones, wpsById]);

  // ── Persist sequential numbers 1..N matching auto-order ──
  const renumberInFlight = useRef(false);
  useEffect(() => {
    if (!orderedMs.length || renumberInFlight.current) return;
    const mismatches = orderedMs
      .map((m, i) => ({ id: m.id, want: i + 1, have: m.number }))
      .filter(x => x.want !== x.have);
    if (mismatches.length === 0) return;
    renumberInFlight.current = true;
    (async () => {
      try {
        // Two-phase to avoid any future unique-collision; not strictly required today.
        for (const { id } of mismatches) {
          await supabase.from('proposal_milestones').update({ number: -1 - Math.floor(Math.random() * 1e6) }).eq('id', id);
        }
        for (const { id, want } of mismatches) {
          await supabase.from('proposal_milestones').update({ number: want, order_index: want - 1 }).eq('id', id);
        }
        qc.invalidateQueries({ queryKey: MS_KEY(proposalId) });
        notifyRefs();
      } finally {
        renumberInFlight.current = false;
      }
    })();
  }, [orderedMs, proposalId, qc]);

  // ── One-shot: strip HTML from existing means_of_verification rows ──
  const cleanedRef = useRef(new Set<string>());
  useEffect(() => {
    const dirty = milestones.filter(m =>
      m.means_of_verification &&
      /<[a-z!\/][^>]*>|&[a-z#0-9]+;/i.test(m.means_of_verification) &&
      !cleanedRef.current.has(m.id)
    );
    if (dirty.length === 0) return;
    (async () => {
      for (const m of dirty) {
        cleanedRef.current.add(m.id);
        const cleaned = stripHtml(m.means_of_verification);
        await supabase.from('proposal_milestones').update({ means_of_verification: cleaned }).eq('id', m.id);
      }
      qc.invalidateQueries({ queryKey: MS_KEY(proposalId) });
    })();
  }, [milestones, proposalId, qc]);

  // ── Mutations: milestones ────────────────────────────────────
  const addMilestone = useMutation({
    mutationFn: async () => {
      const nextOrder = (milestones.reduce((m, x) => Math.max(m, x.order_index), -1)) + 1;
      const nextNum = milestones.length + 1;
      const { error } = await supabase
        .from('proposal_milestones')
        .insert({ proposal_id: proposalId, number: nextNum, order_index: nextOrder, title: '' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Milestone> }) => {
      const { wp_ids, task_ids, ...rest } = patch as any;
      const { error } = await supabase.from('proposal_milestones').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proposal_milestones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
  });

  const setMsWpsAndTasks = useMutation({
    mutationFn: async ({ id, wpIds, taskIds }: { id: string; wpIds: string[]; taskIds: string[] }) => {
      await supabase.from('proposal_milestone_wps').delete().eq('milestone_id', id);
      if (wpIds.length > 0) {
        const { error } = await supabase
          .from('proposal_milestone_wps')
          .insert(wpIds.map(w => ({ milestone_id: id, wp_draft_id: w })));
        if (error) throw error;
      }
      await supabase.from('proposal_milestone_tasks').delete().eq('milestone_id', id);
      // Only keep tasks whose WP is checked
      const allowed = new Set(tasks.filter(t => wpIds.includes(t.wp_draft_id)).map(t => t.id));
      const kept = taskIds.filter(t => allowed.has(t));
      if (kept.length > 0) {
        const { error } = await supabase
          .from('proposal_milestone_tasks')
          .insert(kept.map(t => ({ milestone_id: id, wp_draft_task_id: t })));
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
  });

  // ── Mutations: risks (UNCHANGED — part 2 will revisit) ───────
  const addRisk = useMutation({
    mutationFn: async () => {
      const nextNum = (risks.reduce((m, x) => Math.max(m, x.number), 0)) + 1;
      const nextOrder = (risks.reduce((m, x) => Math.max(m, x.order_index), -1)) + 1;
      const { error } = await supabase
        .from('proposal_risks')
        .insert({ proposal_id: proposalId, number: nextNum, order_index: nextOrder, title: '' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateRisk = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Risk> }) => {
      const { wp_ids, ...rest } = patch as any;
      const { error } = await supabase.from('proposal_risks').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
  });

  const deleteRisk = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proposal_risks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
  });

  const setRiskWps = useMutation({
    mutationFn: async ({ id, wpIds }: { id: string; wpIds: string[] }) => {
      await supabase.from('proposal_risk_wps').delete().eq('risk_id', id);
      if (wpIds.length > 0) {
        const { error } = await supabase
          .from('proposal_risk_wps')
          .insert(wpIds.map(wp => ({ risk_id: id, wp_draft_id: wp })));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
  });

  // Auto-order risks by min related WP number (matches B31RisksTable mirror)
  const orderedRisks = useMemo(() => {
    const minWpNum = (r: Risk) => {
      const nums = r.wp_ids.map(id => wpsById.get(id)?.number).filter((n): n is number => typeof n === 'number');
      return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY;
    };
    return [...risks].sort((a, b) => {
      const wa = minWpNum(a);
      const wb = minWpNum(b);
      if (wa !== wb) return wa - wb;
      return a.id.localeCompare(b.id);
    });
  }, [risks, wpsById]);

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-foreground">Milestones &amp; risks</h1>
      </div>

      {/* Milestones */}
      <Card>
        <CardHeader className="space-y-1 pb-3">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Milestones</CardTitle>
            {canEdit && (
              <Button size="sm" onClick={() => addMilestone.mutate()}>
                <Plus className="h-4 w-4 mr-1" /> Add milestone
              </Button>
            )}
          </div>
          <MilestonesGuidelinesInline />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="platform-table text-sm">
              <thead>
                <tr>
                  <th className="w-14">No.</th>
                  <th style={{ width: '280px' }}>Milestone name</th>
                  <th style={{ width: '113px' }}>WP(s)</th>
                  <th style={{ width: '83px' }}>Due month</th>
                  <th>Means of verification</th>
                  <th style={{ width: '28px' }}></th>
                </tr>
              </thead>
              <tbody>
                {orderedMs.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-muted-foreground italic">No milestones yet.</td></tr>
                )}
                {orderedMs.map((m) => {
                  const selectedWps = m.wp_ids
                    .map(id => wpsById.get(id))
                    .filter((w): w is WPRow => !!w)
                    .sort((a, b) => a.number - b.number);
                  return (
                    <tr key={m.id} className="border-b align-top">
                      <td className="py-1.5 px-1 whitespace-nowrap">
                        <MilestoneBadge number={m.number} />
                      </td>
                      <td className="py-1.5 px-1">
                        <AutoTextarea
                          value={m.title || ''}
                          disabled={!canEdit}
                          placeholder="Milestone name"
                          onChange={(e) => updateMilestone.mutate({ id: m.id, patch: { title: e.target.value } })}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <MilestoneWpTaskDialog
                          wps={wps}
                          tasks={tasks}
                          selectedWpIds={m.wp_ids}
                          selectedTaskIds={m.task_ids}
                          disabled={!canEdit}
                          onSave={(wpIds, taskIds) => setMsWpsAndTasks.mutate({ id: m.id, wpIds, taskIds })}
                          renderTrigger={(open) => (
                            <button
                              type="button"
                              onClick={open}
                              disabled={!canEdit}
                              className="w-full min-h-7 px-1.5 py-1 border border-input rounded-md bg-background text-left hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {selectedWps.length === 0 ? (
                                <span className="text-muted-foreground italic">Select WP(s)…</span>
                              ) : (
                                <span className="flex flex-wrap gap-0.5">
                                  {selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
                                </span>
                              )}
                            </button>
                          )}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <SingleMonthPicker
                          value={m.due_month}
                          projectDuration={projectDuration}
                          readOnly={!canEdit}
                          label=""
                          onChange={(month) => updateMilestone.mutate({ id: m.id, patch: { due_month: month } })}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <AutoTextarea
                          value={stripHtml(m.means_of_verification)}
                          disabled={!canEdit}
                          placeholder="Means of verification"
                          onChange={(e) => updateMilestone.mutate({ id: m.id, patch: { means_of_verification: e.target.value } })}
                        />
                      </td>
                      <td className="py-1.5 px-0 text-center">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700"
                          disabled={!canEdit}
                          onClick={() => deleteMilestone.mutate(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Risks */}
      <Card>
        <CardHeader className="space-y-1 pb-3">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Critical risks</CardTitle>
            {canEdit && (
              <Button size="sm" onClick={() => addRisk.mutate()}>
                <Plus className="h-4 w-4 mr-1" /> Add risk
              </Button>
            )}
          </div>
          <RisksGuidelinesInline />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="platform-table text-sm">
              <thead>
                <tr>
                  <th>Risk description</th>
                  <th style={{ width: '44px' }}>Likelihood</th>
                  <th style={{ width: '44px' }}>Severity</th>
                  <th style={{ width: '113px' }}>WP(s)</th>
                  <th>Mitigation &amp; adaptation measures</th>
                  <th style={{ width: '28px' }}></th>
                </tr>
              </thead>
              <tbody>
                {orderedRisks.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-muted-foreground italic">No risks yet.</td></tr>
                )}
                {orderedRisks.map((r) => {
                  const selectedWps = r.wp_ids
                    .map(id => wpsById.get(id))
                    .filter((w): w is WPRow => !!w)
                    .sort((a, b) => a.number - b.number);
                  return (
                    <tr key={r.id} className="border-b align-top">
                      <td className="py-1.5 px-1">
                        <AutoTextarea
                          value={r.title || ''}
                          disabled={!canEdit}
                          placeholder="Risk description"
                          onChange={(e) => updateRisk.mutate({ id: r.id, patch: { title: e.target.value } })}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <RiskLevelSelect
                          value={(r.likelihood as 'L' | 'M' | 'H' | null) || null}
                          disabled={!canEdit}
                          onChange={(v) => updateRisk.mutate({ id: r.id, patch: { likelihood: v } })}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <RiskLevelSelect
                          value={(r.severity as 'L' | 'M' | 'H' | null) || null}
                          disabled={!canEdit}
                          onChange={(v) => updateRisk.mutate({ id: r.id, patch: { severity: v } })}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <WPMultiSelect
                          allWps={wps}
                          selectedIds={r.wp_ids}
                          disabled={!canEdit}
                          onChange={(ids) => setRiskWps.mutate({ id: r.id, wpIds: ids })}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <AutoTextarea
                          value={r.mitigation || ''}
                          disabled={!canEdit}
                          placeholder="Mitigation & adaptation measures"
                          onChange={(e) => updateRisk.mutate({ id: r.id, patch: { mitigation: e.target.value } })}
                        />
                      </td>
                      <td className="py-1.5 px-0 text-center">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700"
                          disabled={!canEdit}
                          onClick={() => deleteRisk.mutate(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── L/M/H badge dropdown (uses the same RiskBadge as Table 3.1.e) ──
function RiskLevelSelect({
  value, onChange, disabled,
}: {
  value: 'L' | 'M' | 'H' | null;
  onChange: (v: 'L' | 'M' | 'H' | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : (v as 'L' | 'M' | 'H'))}
      disabled={disabled}
    >
      <SelectTrigger hideArrow className="h-8 w-auto inline-flex px-1 border-0 bg-transparent focus:ring-0">
        <span className="inline-flex items-center">
          {value ? <RiskBadge level={value} /> : <span className="text-muted-foreground">—</span>}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__"><span className="text-muted-foreground">—</span></SelectItem>
        <SelectItem value="L"><RiskBadge level="L" /></SelectItem>
        <SelectItem value="M"><RiskBadge level="M" /></SelectItem>
        <SelectItem value="H"><RiskBadge level="H" /></SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Guidelines dialog (red button at top of page opens this) ──
function MilestonesRisksGuidelinesDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const LMHBadges = (
    <span className="inline-flex items-center gap-1 align-middle mx-1">
      <RiskBadge level="L" />
      <RiskBadge level="M" />
      <RiskBadge level="H" />
    </span>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guidelines — Milestones &amp; risks</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold text-base">Risks</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Critical risk:</span> A plausible event or issue that could have a high adverse impact on the ability of the project to achieve its objectives.
              </li>
              <li>
                <span className="font-medium">Level of likelihood to occur</span>{LMHBadges}: The estimated probability that the risk will materialise, even after taking account of the mitigating measures put in place.
              </li>
              <li>
                <span className="font-medium">Level of severity</span>{LMHBadges}: The relative seriousness of the risk and the significance of its effect.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Milestones</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Milestone:</span> Control points in the project that help to chart progress. Milestones may correspond to the achievement of a key result, allowing the next phase of the work to begin. They may also be needed at intermediary points so that, if problems have arisen, corrective measures can be taken. A milestone may be a critical decision point in the project where, for example, the consortium must decide which of several technologies to adopt for further development. The achievement of a milestone should be verifiable.
              </li>
              <li>
                <span className="font-medium">Due date:</span> Measured in months from the project start date.
              </li>
              <li>
                <span className="font-medium">Means of verification:</span> Show how you will confirm that the milestone has been attained. Refer to indicators if appropriate. For example: a laboratory prototype that is &lsquo;up and running&rsquo;; software released and validated by a user group; field survey complete and data quality validated.
              </li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── WP multi-select (used by risks — UNCHANGED) ─────────────────
function WPMultiSelect({
  allWps, selectedIds, onChange, disabled,
}: {
  allWps: WPRow[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? selectedIds;
  const ordered = [...allWps].sort((a, b) => a.number - b.number);
  const selectedWps = ordered.filter(wp => current.includes(wp.id));

  const toggle = (id: string) => {
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    setDraft(next);
  };

  const commit = (next: boolean) => {
    setOpen(next);
    if (!next && draft) {
      onChange(draft);
      setDraft(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={commit}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-auto min-h-8 w-full justify-start font-normal py-1 px-1.5 whitespace-normal" disabled={disabled}>
          <span className="flex flex-wrap gap-0.5 w-full">
            {selectedWps.length === 0
              ? <span className="text-muted-foreground">Select…</span>
              : selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {ordered.map(wp => (
            <label key={wp.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer">
              <Checkbox checked={current.includes(wp.id)} onCheckedChange={() => toggle(wp.id)} />
              <WPBubble wpNumber={wp.number} wpColor={wp.color} />
              <span className="text-sm truncate">{wp.short_name || `WP${wp.number}`}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Combined WP + Tasks dialog for milestones ───────────────────
function MilestoneWpTaskDialog({
  wps, tasks, selectedWpIds, selectedTaskIds, disabled, onSave, renderTrigger,
}: {
  wps: WPRow[];
  tasks: TaskRow[];
  selectedWpIds: string[];
  selectedTaskIds: string[];
  disabled?: boolean;
  onSave: (wpIds: string[], taskIds: string[]) => void;
  renderTrigger: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draftWps, setDraftWps] = useState<string[]>(selectedWpIds);
  const [draftTasks, setDraftTasks] = useState<string[]>(selectedTaskIds);

  // Reset draft when reopening
  useEffect(() => {
    if (open) {
      setDraftWps(selectedWpIds);
      setDraftTasks(selectedTaskIds);
    }
  }, [open, selectedWpIds, selectedTaskIds]);

  const orderedWps = useMemo(() => [...wps].sort((a, b) => a.number - b.number), [wps]);
  const tasksByWp = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      const arr = m.get(t.wp_draft_id) || [];
      arr.push(t);
      m.set(t.wp_draft_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.number - b.number);
    return m;
  }, [tasks]);

  const toggleWp = (wp: WPRow) => {
    if (draftWps.includes(wp.id)) {
      setDraftWps(draftWps.filter(x => x !== wp.id));
      // Clear that WP's tasks
      const taskIds = new Set((tasksByWp.get(wp.id) || []).map(t => t.id));
      setDraftTasks(draftTasks.filter(t => !taskIds.has(t)));
    } else {
      setDraftWps([...draftWps, wp.id]);
    }
  };

  const toggleTask = (taskId: string) => {
    setDraftTasks(draftTasks.includes(taskId)
      ? draftTasks.filter(t => t !== taskId)
      : [...draftTasks, taskId]);
  };

  const save = () => {
    onSave(draftWps, draftTasks);
    setOpen(false);
  };

  return (
    <>
      {renderTrigger(() => !disabled && setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Related WPs &amp; tasks</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground -mt-1 space-y-2">
            <p>The related WPs are shown in Table 3.1.d (List of milestones).</p>
            <p>The related tasks illustrate task interactions/bottlenecks in Figure 3.1.b (Gantt chart).</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
            {orderedWps.length === 0 && (
              <div className="text-sm text-muted-foreground italic py-2">No work packages defined yet.</div>
            )}
            {orderedWps.map(wp => {
              const wpChecked = draftWps.includes(wp.id);
              const wpTasks = tasksByWp.get(wp.id) || [];
              return (
                <div key={wp.id} className="rounded border border-border/40">
                  <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent">
                    <span className="w-4 flex justify-center text-muted-foreground">
                      {wpChecked ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    <Checkbox checked={wpChecked} onCheckedChange={() => toggleWp(wp)} />
                    <WPBubble wpNumber={wp.number} wpColor={wp.color} />
                    <span className="text-sm truncate">{wp.short_name || `WP${wp.number}`}</span>
                  </label>
                  {wpChecked && (
                    <div className="pr-2 pb-1.5 space-y-0.5" style={{ paddingLeft: '57px' }}>
                      {wpTasks.length === 0 && (
                        <div className="text-xs text-muted-foreground italic py-1">No tasks in this WP.</div>
                      )}
                      {wpTasks.map(t => (
                        <label key={t.id} className="flex items-center gap-2 py-1 rounded hover:bg-accent cursor-pointer">
                          <Checkbox
                            checked={draftTasks.includes(t.id)}
                            onCheckedChange={() => toggleTask(t.id)}
                          />
                          <B31Pill variant="outline" color={wp.color}>
                            T{wp.number}.{t.number}
                          </B31Pill>
                          <span className="text-sm truncate">{t.title || ''}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
