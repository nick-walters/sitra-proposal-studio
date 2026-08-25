import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Settings2 } from 'lucide-react';
import { useTemplateModifiers, type TemplateModifier } from '@/hooks/useTemplateModifiers';
import { WORK_PROGRAMMES } from '@/types/proposal';

const ANY = '__any__';

type ConditionKey = 'action_type' | 'budget_type' | 'work_programme' | 'submission_stage' | 'uses_fstp';

const ACTION_TYPES = ['RIA', 'IA', 'CSA'];
const BUDGET_TYPES = [
  { value: 'traditional', label: 'Actual costs' },
  { value: 'lump_sum', label: 'Lump sum' },
];
const STAGES = [
  { value: 'stage_1', label: 'Pre-proposal (stage 1)' },
  { value: 'full', label: 'Full proposal' },
];

interface FormState {
  code: string;
  name: string;
  description: string;
  action_type: string;
  budget_type: string;
  work_programme: string;
  submission_stage: string;
  page_limit_delta: number;
  funding_overrides: string;
  flags: string;
  text_substitutions: string;
  non_template_effects: string;
  priority: number;
  is_active: boolean;
  is_admin_editable: boolean;
}

const EMPTY: FormState = {
  code: '', name: '', description: '',
  action_type: ANY, budget_type: ANY, work_programme: ANY, submission_stage: ANY,
  page_limit_delta: 0, funding_overrides: '{}', flags: '{}',
  text_substitutions: '{}', non_template_effects: '{}',
  priority: 0, is_active: true, is_admin_editable: true,
};

function conditionSummary(m: TemplateModifier): string {
  const c = m.conditions ?? {};
  const parts: string[] = [];
  if (c.action_type) parts.push(c.action_type);
  if (c.budget_type) parts.push(c.budget_type === 'lump_sum' ? 'Lump sum' : 'Actual costs');
  if (c.work_programme) parts.push(c.work_programme);
  if (c.submission_stage) parts.push(c.submission_stage === 'stage_1' ? 'Stage 1' : 'Full proposal');
  if (c.uses_fstp !== undefined) parts.push(c.uses_fstp ? 'Uses FSTP' : 'No FSTP');
  return parts.length ? parts.join(' + ') : 'Always';
}

export function TemplateModifiersAdmin() {
  const { modifiers, loading, createModifier, updateModifier, deleteModifier } = useTemplateModifiers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateModifier | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };

  const openEdit = (m: TemplateModifier) => {
    setEditing(m);
    const c = m.conditions ?? {};
    const e = m.effects ?? {};
    setForm({
      code: m.code,
      name: m.name,
      description: m.description || '',
      action_type: c.action_type || ANY,
      budget_type: c.budget_type || ANY,
      work_programme: c.work_programme || ANY,
      submission_stage: c.submission_stage || ANY,
      page_limit_delta: e.page_limit_delta ?? 0,
      funding_overrides: JSON.stringify(e.funding_overrides ?? {}, null, 2),
      flags: JSON.stringify(e.flags ?? {}, null, 2),
      text_substitutions: JSON.stringify(m.text_substitutions ?? {}, null, 2),
      non_template_effects: JSON.stringify(m.non_template_effects ?? {}, null, 2),
      priority: m.priority,
      is_active: m.is_active,
      is_admin_editable: m.is_admin_editable,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    let funding_overrides: Record<string, number>;
    let flags: Record<string, boolean>;
    let text_substitutions: Record<string, string>;
    let non_template_effects: Record<string, unknown>;
    try {
      funding_overrides = JSON.parse(form.funding_overrides || '{}');
      flags = JSON.parse(form.flags || '{}');
      text_substitutions = JSON.parse(form.text_substitutions || '{}');
      non_template_effects = JSON.parse(form.non_template_effects || '{}');
    } catch {
      return;
    }

    const conditions: Record<string, string> = {};
    const set = (k: ConditionKey, v: string) => { if (v !== ANY && v) conditions[k] = v; };
    set('action_type', form.action_type);
    set('budget_type', form.budget_type);
    set('work_programme', form.work_programme);
    set('submission_stage', form.submission_stage);

    const payload = {
      code: form.code,
      name: form.name,
      description: form.description || null,
      conditions,
      effects: { page_limit_delta: form.page_limit_delta, funding_overrides, flags },
      text_substitutions,
      non_template_effects,
      priority: form.priority,
      is_active: form.is_active,
      is_admin_editable: form.is_admin_editable,
    } as any;

    if (editing) await updateModifier(editing.id, payload);
    else await createModifier(payload);
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteModifier(deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  if (loading) return <div className="p-4">Loading modifiers…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Modifiers</h2>
          <p className="text-sm text-muted-foreground">
            One mechanism for every variation — action type, funding mode and work programme.
            A modifier declares when it applies and what it changes. Modifiers are not versioned;
            they act on the template version the proposal is pinned to. Modifier-owned blocks and
            their guidance are authored in the template workspace and tagged with the modifier code.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Add modifier
        </Button>
      </div>

      <ScrollArea className="h-[520px]">
        <div className="space-y-3 pr-3">
          {modifiers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Settings2 className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No modifiers configured</p>
              </CardContent>
            </Card>
          ) : (
            modifiers.map((m) => {
              const e = m.effects ?? {};
              const subs = Object.keys(m.text_substitutions ?? {});
              return (
                <Card key={m.id}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{m.name}</CardTitle>
                          <Badge variant="outline" className="font-mono text-xs">{m.code}</Badge>
                          {!m.is_active && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        {m.description && (
                          <CardDescription className="text-xs">{m.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)} aria-label="Edit" title="Edit">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setDeletingId(m.id); setDeleteDialogOpen(true); }}
                          aria-label="Delete" title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 px-4 border-t grid gap-1 text-xs sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Applies when:</span>{' '}<span className="font-medium">{conditionSummary(m)}</span></div>
                    <div><span className="text-muted-foreground">Priority:</span>{' '}<span className="font-medium">{m.priority}</span></div>
                    <div><span className="text-muted-foreground">Page allowance:</span>{' '}<span className="font-medium">{(e.page_limit_delta ?? 0) >= 0 ? '+' : ''}{e.page_limit_delta ?? 0}</span></div>
                    <div><span className="text-muted-foreground">Substitutions:</span>{' '}<span className="font-medium">{subs.length ? subs.map((s) => `{{${s}}}`).join(', ') : 'None'}</span></div>
                    {Object.keys(m.non_template_effects ?? {}).length > 0 && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Outside the template (declared, not implemented):</span>{' '}
                        <code className="font-mono">{JSON.stringify(m.non_template_effects)}</code>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit modifier' : 'Create modifier'}</DialogTitle>
            <DialogDescription>
              Conditions are combined with AND; an unset condition matches anything.
              Modifiers stack in ascending priority — the last one wins a clash on the same key,
              while page allowances add up.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CBE_JU_EXTENSION" />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Applies when</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Action type</Label>
                  <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      <SelectItem value={ANY}>Any</SelectItem>
                      {ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Funding mode</Label>
                  <Select value={form.budget_type} onValueChange={(v) => setForm({ ...form, budget_type: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      <SelectItem value={ANY}>Any</SelectItem>
                      {BUDGET_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Work programme</Label>
                  <Select value={form.work_programme} onValueChange={(v) => setForm({ ...form, work_programme: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 bg-popover max-h-64">
                      <SelectItem value={ANY}>Any</SelectItem>
                      {WORK_PROGRAMMES.map((wp: any) => (
                        <SelectItem key={wp.id ?? wp.code} value={wp.id ?? wp.code}>
                          {wp.abbreviation ? `${wp.abbreviation} — ${wp.fullName ?? wp.name}` : (wp.name ?? wp.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Proposal stage</Label>
                  <Select value={form.submission_stage} onValueChange={(v) => setForm({ ...form, submission_stage: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      <SelectItem value={ANY}>Any</SelectItem>
                      {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Structural effects — applied when the proposal is created</p>
              <div className="space-y-1">
                <Label className="text-xs">Extra pages</Label>
                <Input
                  type="number"
                  className="h-8 w-32"
                  value={form.page_limit_delta}
                  onChange={(e) => setForm({ ...form, page_limit_delta: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Funding rate overrides (JSON)</Label>
                <Textarea rows={2} className="font-mono text-xs" value={form.funding_overrides}
                  onChange={(e) => setForm({ ...form, funding_overrides: e.target.value })}
                  placeholder='{"IA_company": 0.60}' />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Template flags (JSON)</Label>
                <Textarea rows={2} className="font-mono text-xs" value={form.flags}
                  onChange={(e) => setForm({ ...form, flags: e.target.value })}
                  placeholder='{"includes_participant_table": false}' />
              </div>
              <p className="text-xs text-muted-foreground">
                Extra blocks and their guidance are not listed here. They are authored in the
                template workspace for this modifier's code, and seeded only when the modifier applies.
              </p>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Textual effects — resolved when guidance is displayed</p>
              <Textarea rows={4} className="font-mono text-xs" value={form.text_substitutions}
                onChange={(e) => setForm({ ...form, text_substitutions: e.target.value })}
                placeholder='{"RANKING": "For equally-ranked IA proposals, …"}' />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Outside the template</p>
              <p className="text-xs text-muted-foreground">
                Declared for completeness — e.g. the lump sum budget sheet. Recorded, but no
                consumer acts on it yet.
              </p>
              <Textarea rows={2} className="font-mono text-xs" value={form.non_template_effects}
                onChange={(e) => setForm({ ...form, non_template_effects: e.target.value })}
                placeholder='{"budget_sheet": "lump_sum"}' />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_admin_editable} onCheckedChange={(v) => setForm({ ...form, is_admin_editable: v })} />
                <Label>Admin editable</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this modifier?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing proposals keep the structure they were seeded with, but any wording it
              substitutes reverts to the raw placeholder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
