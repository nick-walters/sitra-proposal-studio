import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPBubble } from '@/components/B31Pill';
import { Plus, Trash2, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { toast } from 'sonner';

interface Props {
  proposalId: string;
  canEdit: boolean;
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

export function ProposalMilestonesRisksManager({ proposalId, canEdit }: Props) {
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

  const { data: tasks = [] } = useQuery<TaskRow[]>({
    queryKey: ['wp-tasks-mr-mgr', proposalId],
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

  // ── Risks ────────────────────────────────────────────────────
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

  // ── Mutations: milestones ────────────────────────────────────
  const addMilestone = useMutation({
    mutationFn: async () => {
      const nextNum = (milestones.reduce((m, x) => Math.max(m, x.number), 0)) + 1;
      const nextOrder = (milestones.reduce((m, x) => Math.max(m, x.order_index), -1)) + 1;
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

  const setMsWps = useMutation({
    mutationFn: async ({ id, wpIds }: { id: string; wpIds: string[] }) => {
      await supabase.from('proposal_milestone_wps').delete().eq('milestone_id', id);
      if (wpIds.length > 0) {
        const rows = wpIds.map(wp => ({ milestone_id: id, wp_draft_id: wp }));
        const { error } = await supabase.from('proposal_milestone_wps').insert(rows);
        if (error) throw error;
      }
      // Drop tasks whose WP is no longer selected
      const allowedTaskIds = new Set(tasks.filter(t => wpIds.includes(t.wp_draft_id)).map(t => t.id));
      const ms = milestones.find(m => m.id === id);
      if (ms) {
        const toKeep = ms.task_ids.filter(t => allowedTaskIds.has(t));
        if (toKeep.length !== ms.task_ids.length) {
          await supabase.from('proposal_milestone_tasks').delete().eq('milestone_id', id);
          if (toKeep.length) {
            await supabase.from('proposal_milestone_tasks').insert(toKeep.map(t => ({ milestone_id: id, wp_draft_task_id: t })));
          }
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
  });

  const setMsTasks = useMutation({
    mutationFn: async ({ id, taskIds }: { id: string; taskIds: string[] }) => {
      await supabase.from('proposal_milestone_tasks').delete().eq('milestone_id', id);
      if (taskIds.length > 0) {
        const rows = taskIds.map(t => ({ milestone_id: id, wp_draft_task_id: t }));
        const { error } = await supabase.from('proposal_milestone_tasks').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }),
  });

  const reorderMs = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const ordered = [...milestones].sort((a, b) => a.order_index - b.order_index);
      const idx = ordered.findIndex(m => m.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= ordered.length) return;
      const a = ordered[idx], b = ordered[j];
      // Two-phase swap to dodge any unique-order conflicts
      await supabase.from('proposal_milestones').update({ order_index: -1 }).eq('id', a.id);
      await supabase.from('proposal_milestones').update({ order_index: a.order_index }).eq('id', b.id);
      await supabase.from('proposal_milestones').update({ order_index: b.order_index }).eq('id', a.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }),
  });

  // ── Mutations: risks ─────────────────────────────────────────
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

  const reorderRisk = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const ordered = [...risks].sort((a, b) => a.order_index - b.order_index);
      const idx = ordered.findIndex(r => r.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= ordered.length) return;
      const a = ordered[idx], b = ordered[j];
      await supabase.from('proposal_risks').update({ order_index: -1 }).eq('id', a.id);
      await supabase.from('proposal_risks').update({ order_index: a.order_index }).eq('id', b.id);
      await supabase.from('proposal_risks').update({ order_index: b.order_index }).eq('id', a.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
  });

  const orderedMs = useMemo(() => [...milestones].sort((a, b) => a.order_index - b.order_index), [milestones]);
  const orderedRisks = useMemo(() => [...risks].sort((a, b) => a.order_index - b.order_index), [risks]);
  const wpsById = useMemo(() => new Map(wps.map(wp => [wp.id, wp])), [wps]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-foreground">Milestones &amp; risks</h1>

      {/* Milestones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Milestones</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => addMilestone.mutate()}>
              <Plus className="h-4 w-4 mr-1" /> Add milestone
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium py-2 px-2 w-12">No.</th>
                  <th className="text-left font-medium py-2 px-2">Name</th>
                  <th className="text-left font-medium py-2 px-2 w-24">Due month</th>
                  <th className="text-left font-medium py-2 px-2">Means of verification</th>
                  <th className="text-left font-medium py-2 px-2 w-40">Related WPs</th>
                  <th className="text-left font-medium py-2 px-2 w-40">Related tasks</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {orderedMs.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground italic">No milestones yet.</td></tr>
                )}
                {orderedMs.map((m, i) => (
                  <tr key={m.id} className="border-b align-top">
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        className="h-8 w-14"
                        value={m.number}
                        disabled={!canEdit}
                        onChange={(e) => updateMilestone.mutate({ id: m.id, patch: { number: parseInt(e.target.value || '0', 10) } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        className="h-8"
                        value={m.title || ''}
                        disabled={!canEdit}
                        placeholder="Milestone name"
                        onChange={(e) => updateMilestone.mutate({ id: m.id, patch: { title: e.target.value } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        className="h-8 w-20"
                        value={m.due_month ?? ''}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateMilestone.mutate({ id: m.id, patch: { due_month: v === '' ? null : parseInt(v, 10) } });
                        }}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Textarea
                        className="min-h-8 text-sm"
                        rows={1}
                        value={m.means_of_verification || ''}
                        disabled={!canEdit}
                        onChange={(e) => updateMilestone.mutate({ id: m.id, patch: { means_of_verification: e.target.value } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <WPMultiSelect
                        allWps={wps}
                        selectedIds={m.wp_ids}
                        disabled={!canEdit}
                        onChange={(ids) => setMsWps.mutate({ id: m.id, wpIds: ids })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <TaskMultiSelect
                        allTasks={tasks.filter(t => m.wp_ids.includes(t.wp_draft_id))}
                        wpsById={wpsById}
                        selectedIds={m.task_ids}
                        disabled={!canEdit || m.wp_ids.length === 0}
                        onChange={(ids) => setMsTasks.mutate({ id: m.id, taskIds: ids })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!canEdit || i === 0} onClick={() => reorderMs.mutate({ id: m.id, dir: -1 })}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!canEdit || i === orderedMs.length - 1} onClick={() => reorderMs.mutate({ id: m.id, dir: 1 })}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" disabled={!canEdit} onClick={() => deleteMilestone.mutate(m.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Risks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Critical risks</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => addRisk.mutate()}>
              <Plus className="h-4 w-4 mr-1" /> Add risk
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium py-2 px-2 w-12">No.</th>
                  <th className="text-left font-medium py-2 px-2">Description</th>
                  <th className="text-left font-medium py-2 px-2 w-28">Likelihood</th>
                  <th className="text-left font-medium py-2 px-2 w-28">Severity</th>
                  <th className="text-left font-medium py-2 px-2 w-40">Related WPs</th>
                  <th className="text-left font-medium py-2 px-2">Mitigation</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {orderedRisks.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground italic">No risks yet.</td></tr>
                )}
                {orderedRisks.map((r, i) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        className="h-8 w-14"
                        value={r.number}
                        disabled={!canEdit}
                        onChange={(e) => updateRisk.mutate({ id: r.id, patch: { number: parseInt(e.target.value || '0', 10) } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Textarea
                        rows={2}
                        className="text-sm"
                        value={r.title || ''}
                        disabled={!canEdit}
                        placeholder="Risk description"
                        onChange={(e) => updateRisk.mutate({ id: r.id, patch: { title: e.target.value } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Select value={r.likelihood || ''} onValueChange={(v) => updateRisk.mutate({ id: r.id, patch: { likelihood: v || null } })} disabled={!canEdit}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="L">Low</SelectItem>
                          <SelectItem value="M">Medium</SelectItem>
                          <SelectItem value="H">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Select value={r.severity || ''} onValueChange={(v) => updateRisk.mutate({ id: r.id, patch: { severity: v || null } })} disabled={!canEdit}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="L">Low</SelectItem>
                          <SelectItem value="M">Medium</SelectItem>
                          <SelectItem value="H">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <WPMultiSelect
                        allWps={wps}
                        selectedIds={r.wp_ids}
                        disabled={!canEdit}
                        onChange={(ids) => setRiskWps.mutate({ id: r.id, wpIds: ids })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Textarea
                        rows={2}
                        className="text-sm"
                        value={r.mitigation || ''}
                        disabled={!canEdit}
                        onChange={(e) => updateRisk.mutate({ id: r.id, patch: { mitigation: e.target.value } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!canEdit || i === 0} onClick={() => reorderRisk.mutate({ id: r.id, dir: -1 })}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!canEdit || i === orderedRisks.length - 1} onClick={() => reorderRisk.mutate({ id: r.id, dir: 1 })}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" disabled={!canEdit} onClick={() => deleteRisk.mutate(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Multi-select with checkboxes ───────────────────────────────
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
        <Button variant="outline" size="sm" className="h-8 w-full justify-between font-normal" disabled={disabled}>
          <span className="flex flex-wrap gap-0.5">
            {selectedWps.length === 0
              ? <span className="text-muted-foreground">Select…</span>
              : selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-1 shrink-0" />
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

function TaskMultiSelect({
  allTasks, wpsById, selectedIds, onChange, disabled,
}: {
  allTasks: TaskRow[]; wpsById: Map<string, WPRow>; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? selectedIds;

  const ordered = [...allTasks].sort((a, b) => {
    const wa = wpsById.get(a.wp_draft_id)?.number ?? 999;
    const wb = wpsById.get(b.wp_draft_id)?.number ?? 999;
    if (wa !== wb) return wa - wb;
    return a.number - b.number;
  });
  const selected = ordered.filter(t => current.includes(t.id));

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

  const label = (t: TaskRow) => {
    const wp = wpsById.get(t.wp_draft_id);
    const wpn = wp?.number ?? '?';
    return `T${wpn}.${t.number}${t.title ? ' — ' + t.title : ''}`;
  };

  return (
    <Popover open={open} onOpenChange={commit}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full justify-between font-normal" disabled={disabled}>
          <span className="truncate text-left">
            {disabled && (selectedIds.length === 0)
              ? <span className="text-muted-foreground">Pick WPs first</span>
              : selected.length === 0
                ? <span className="text-muted-foreground">Select…</span>
                : <span className="text-xs">{selected.length} task{selected.length === 1 ? '' : 's'}</span>}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-1 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {ordered.length === 0 && (
            <div className="text-xs text-muted-foreground px-1 py-2 italic">No tasks under the selected WPs.</div>
          )}
          {ordered.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer">
              <Checkbox checked={current.includes(t.id)} onCheckedChange={() => toggle(t.id)} />
              <span className="text-sm truncate">{label(t)}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
