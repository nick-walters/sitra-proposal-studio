import { useMemo, useState } from 'react';
import { LockKeyhole, UnlockKeyhole } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatNumber';
import { LumpSumPersonnelTable } from '@/components/LumpSumPersonnelTable';
import { useCanEditParticipantBudget } from '@/hooks/useCanEditParticipantBudget';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';

const BLOCKS = [
  { line: 'A.1', label: 'A.1 Personnel costs — employees' },
  { line: 'A.2', label: 'A.2 Personnel costs — natural persons under direct contract' },
  { line: 'A.3', label: 'A.3 Personnel costs — seconded persons' },
  { line: 'A.4', label: 'A.4 Personnel costs — SME owners and natural person beneficiaries' },
];

function formatPM(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function LumpSumBudgetPanel({ proposalId }: { proposalId: string }) {
  const { data, isLoading, error, saving, addRole, updateRole, deleteRole, reorderRoles, setEffort, setA4UnitCost } = useLumpSumPersonnel(proposalId);
  const { editableParticipantIds, isCoordinator, loading: permissionsLoading } = useCanEditParticipantBudget(proposalId);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'A.1': true });

  const participants = data?.participants ?? [];
  const selected = participants.find(participant => participant.id === (selectedParticipantId ?? participants[0]?.id));
  const roles = data?.roles ?? [];
  const efforts = data?.efforts ?? [];
  const participantRoles = useMemo(() => selected ? roles.filter(role => role.participant_id === selected.id) : [], [roles, selected]);
  const participantBudget = data?.participantBudgets.find(budget => budget.participant_id === selected?.id);
  const mayEdit = Boolean(selected && editableParticipantIds.has(selected.id));
  const editable = mayEdit && (!participantBudget?.is_locked || isCoordinator);
  const a4UnitCost = Number(participantBudget?.a4_unit_cost ?? 0);
  const workPackages = data?.workPackages ?? [];

  const totalForLine = (line: string) => {
    const lineRoles = participantRoles.filter(role => role.cost_line === line);
    return lineRoles.reduce((total, role) => {
      const pm = workPackages.reduce((sum, wp) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0);
      return total + pm * (line === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0));
    }, 0);
  };

  if (isLoading || permissionsLoading) return <div className="p-6 text-sm text-muted-foreground">Loading lump sum personnel costs…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Unable to load lump sum personnel costs.</div>;
  if (!selected) return <div className="p-6 text-sm text-muted-foreground">No participants found for this proposal.</div>;

  return <div className="space-y-5 p-4 md:p-6">
    <div>
      <h2 className="text-lg font-semibold">A. Personnel costs</h2>
      <p className="text-sm text-muted-foreground">Enter personnel effort and rates for one participant at a time.</p>
    </div>
    <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
      {participants.map(participant => {
        const active = participant.id === selected.id;
        const canEdit = editableParticipantIds.has(participant.id);
        return <button type="button" key={participant.id} onClick={() => setSelectedParticipantId(participant.id)} className={`flex min-w-max items-center gap-2 border-b-2 px-3 py-2 text-left text-sm transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <span className="font-semibold">P{participant.participant_number ?? '—'}</span><span>{participant.organisation_short_name || participant.organisation_name}</span><Badge variant={canEdit ? 'secondary' : 'outline'} className="text-[11px] font-normal">{canEdit ? 'Editable' : 'Read-only'}</Badge>
        </button>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
      <div className="text-base font-semibold">P{selected.participant_number ?? '—'} · {selected.organisation_name}</div>
      <Badge variant={editable ? 'secondary' : 'outline'} className="gap-1">{editable ? <UnlockKeyhole className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}{editable ? 'Editable' : 'Read-only'}</Badge>
      {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      {participantBudget?.is_locked && !isCoordinator && <span className="text-xs text-muted-foreground">This participant budget is locked.</span>}
    </div>
    {BLOCKS.map(block => {
      const open = expanded[block.line] ?? false;
      const lineRoles = participantRoles.filter(role => role.cost_line === block.line);
      return <section key={block.line} className="border-b border-border pb-4">
        <button type="button" className="flex w-full items-center justify-between py-2 text-left" onClick={() => setExpanded(current => ({ ...current, [block.line]: !open }))} aria-expanded={open}>
          <span className="font-semibold">{block.label}</span><span className="text-sm text-muted-foreground">{open ? 'Collapse' : `${formatCurrency(totalForLine(block.line))}`}</span>
        </button>
        {open && <div className="space-y-3">
          {block.line === 'A.4' && <label className="block max-w-xs text-xs text-muted-foreground">A.4 unit cost (€)<Input className="mt-1 h-8" type="number" min="0" step="0.01" value={a4UnitCost} disabled={!editable} onChange={event => setA4UnitCost(selected.id, Number(event.target.value) || 0)} /></label>}
          <LumpSumPersonnelTable costLine={block.line} roles={lineRoles} efforts={efforts} workPackages={workPackages} editable={editable} a4UnitCost={a4UnitCost} onAdd={() => addRole(selected.id, block.line)} onUpdateRole={updateRole} onDelete={deleteRole} onReorder={reorderRoles} onSetEffort={setEffort} />
        </div>}
      </section>;
    })}
    <div className="border-t-2 border-foreground/40 pt-3">
      <div className="flex items-center justify-between font-semibold"><span>A total</span><span>{formatCurrency(BLOCKS.reduce((sum, block) => sum + totalForLine(block.line), 0))}</span></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><tbody><tr className="border-t border-border"><td className="py-2 font-medium">Total person-months per work package</td>{workPackages.map(wp => <td key={wp.id} className="px-2 py-2 text-right">WP{wp.number}<br /><span className="font-semibold">{formatPM(participantRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0))}</span></td>)}</tr></tbody></table></div>
    </div>
  </div>;
}
