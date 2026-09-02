import { useMemo, useState } from 'react';
import { Lock, LockKeyhole, Unlock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatNumber';
import { ParticipantBubble } from '@/components/B31Pill';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import { DifferenceNote, LumpSumPersonnelTable, NumericInput, costLineTotals } from '@/components/LumpSumPersonnelTable';
import { LumpSumPermissionsDialog } from '@/components/LumpSumPermissionsDialog';
import { useCanEditParticipantBudget } from '@/hooks/useCanEditParticipantBudget';
import { useLumpSumBudgetAccess } from '@/hooks/useLumpSumBudgetAccess';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useAuth } from '@/hooks/useAuth';
import { useLumpSumCollapse } from '@/lib/lumpSumCollapse';
import { LumpSumCostsSection } from '@/components/LumpSumCostsSection';
import { LumpSumDepreciationSection } from '@/components/LumpSumDepreciationSection';

const BLOCKS = [
  { line: 'A.1', label: 'A.1 Personnel costs — employees' },
  { line: 'A.2', label: 'A.2 Personnel costs — natural persons under direct contract' },
  { line: 'A.3', label: 'A.3 Personnel costs — seconded persons' },
  { line: 'A.4', label: 'A.4 Personnel costs — SME owners and natural person beneficiaries' },
];

function formatPM(value: number) {
  return value.toFixed(1);
}

export function LumpSumBudgetPanel({ proposalId }: { proposalId: string }) {
  const { user } = useAuth();
  const { data, isLoading, error, saving, addRole, updateRole, deleteRole, reorderRoles, setEffort, setA4UnitCost } = useLumpSumPersonnel(proposalId);
  const { editableParticipantIds, isCoordinator, loading: permissionsLoading } = useCanEditParticipantBudget(proposalId);
  const budgetAccess = useLumpSumBudgetAccess(proposalId);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [permissionsParticipantId, setPermissionsParticipantId] = useState<string | null>(null);
  const { isCollapsed, toggle } = useLumpSumCollapse(user?.id, proposalId);

  const participants = data?.participants ?? [];
  const selected = participants.find(participant => participant.id === (selectedParticipantId ?? participants[0]?.id));
  const permissionsParticipant = participants.find(participant => participant.id === permissionsParticipantId);
  const roles = data?.roles ?? [];
  const efforts = data?.efforts ?? [];
  const participantRoles = useMemo(() => selected ? roles.filter(role => role.participant_id === selected.id) : [], [roles, selected]);
  const participantBudget = data?.participantBudgets.find(budget => budget.participant_id === selected?.id);
  const participantLock = selected ? budgetAccess.lockFor(selected.id) : null;
  const isLocked = Boolean(participantLock?.is_locked);
  const mayEdit = Boolean(selected && editableParticipantIds.has(selected.id));
  const editable = mayEdit && !isLocked;
  const a4UnitCost = Number(participantBudget?.a4_unit_cost ?? 0);
  const workPackages = data?.workPackages ?? [];

  const totalsForLine = (line: string) => costLineTotals(
    line,
    participantRoles.filter(role => role.cost_line === line),
    efforts,
    workPackages,
    a4UnitCost,
  );
  const totalForLine = (line: string) => totalsForLine(line).portalCost;
  const overallTotals = BLOCKS.reduce((totals, block) => {
    const line = totalsForLine(block.line);
    return {
      portalCost: totals.portalCost + line.portalCost,
      trueCost: totals.trueCost + line.trueCost,
      difference: totals.difference + line.difference,
    };
  }, { portalCost: 0, trueCost: 0, difference: 0 });

  if (isLoading || permissionsLoading) return <div className="p-6 text-sm text-muted-foreground">Loading lump sum personnel costs…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Unable to load lump sum personnel costs.</div>;
  if (!selected) return <div className="p-6 text-sm text-muted-foreground">No participants found for this proposal.</div>;

  const lockAllLabel = budgetAccess.lockState === 'all' ? 'Unlock all participant budgets' : 'Lock all participant budgets';
  return <div className="space-y-4 p-4 md:p-6">
     {isCoordinator && <div className="flex justify-end">
       <Button
         type="button"
         size="sm"
         variant="outline"
         className={budgetAccess.lockState === 'some' ? 'border-warning text-warning hover:bg-warning/10' : ''}
         aria-label={lockAllLabel}
         title={lockAllLabel}
         onClick={() => budgetAccess.setLockAll(budgetAccess.lockState !== 'all')}
       >
         <LockKeyhole className="mr-1.5 h-4 w-4" />
         {budgetAccess.lockState === 'all' ? 'Unlock all budgets' : 'Lock all budgets'}
         {budgetAccess.lockState === 'some' && <span className="ml-1 text-xs">(some locked)</span>}
       </Button>
     </div>}
     <div className="flex flex-wrap gap-[3px] overflow-visible border-b border-border pb-1.5">
       {participants.map(participant => {
         const active = participant.id === selected.id;
         const locked = Boolean(budgetAccess.lockFor(participant.id)?.is_locked);
         return <div key={participant.id} className={`flex min-w-max items-center border-b-2 ${active ? 'border-primary' : 'border-transparent'}`}>
           <button type="button" onClick={() => setSelectedParticipantId(participant.id)} className={`flex items-center px-2 py-1.5 text-left transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
             <ParticipantBubble number={participant.participant_number} shortName={participant.organisation_short_name || participant.organisation_name} />
           </button>
           {isCoordinator && <>
             <Button
               type="button"
               size="icon"
               variant="ghost"
               className={`mr-0.5 h-6 w-6 ${locked ? 'text-warning' : 'text-muted-foreground'}`}
               aria-label={locked ? `Unlock budget for participant ${participant.participant_number ?? ''}` : `Lock budget for participant ${participant.participant_number ?? ''}`}
               title={locked ? 'Unlock budget' : 'Lock budget'}
               onClick={() => budgetAccess.setLock(participant.id, !locked)}
             >
               {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
             </Button>
             <Button
               type="button"
               size="icon"
               variant="ghost"
               className="h-6 w-6 text-muted-foreground hover:text-foreground"
               aria-label={`Manage budget permissions for participant ${participant.participant_number ?? ''}`}
               title="Manage budget permissions"
               onClick={() => setPermissionsParticipantId(participant.id)}
             >
               <Users className="h-3.5 w-3.5" />
             </Button>
           </>}
         </div>;
       })}
     </div>
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <span>Saving…</span>}
          {isLocked && <span>This participant budget is locked. A coordinator must unlock it before editing.</span>}
        </div>
        <h2 className="text-lg font-semibold">A. Personnel costs</h2>
        {BLOCKS.map(block => {
         const collapsed = isCollapsed(block.line);
         const lineRoles = participantRoles.filter(role => role.cost_line === block.line);
         return <section key={block.line} className="border-b border-border">
           <div className="flex min-h-8 items-center gap-1 border-b border-border/60">
             <CollapseChevron collapsed={collapsed} onToggle={() => toggle(block.line)} label={`${block.line} personnel costs`} className="h-6 w-6" />
             <span className="min-w-0 flex-1 text-xs font-semibold">{block.label}</span>
             {collapsed && <span className="shrink-0 text-xs font-semibold text-muted-foreground">{formatCurrency(totalForLine(block.line))}</span>}
             {!collapsed && editable && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onAddRole}>Add role</Button>}
           </div>
           {!collapsed && <div className="space-y-2 pt-2">
             {block.line === 'A.4' && <label className="block max-w-48 text-xs text-muted-foreground">A.4 unit cost (€)<NumericInput value={a4UnitCost} disabled={!editable} step="0.01" decimals={2} className="mt-1 h-7 w-32 px-1.5 text-right text-xs tabular-nums" onCommit={value => setA4UnitCost(selected.id, value)} /></label>}
             <LumpSumPersonnelTable costLine={block.line} roles={lineRoles} efforts={efforts} workPackages={workPackages} editable={editable} a4UnitCost={a4UnitCost} onAdd={() => addRole(selected.id, block.line)} onUpdateRole={updateRole} onDelete={deleteRole} onReorder={reorderRoles} onSetEffort={setEffort} />
           </div>}
         </section>;

         function onAddRole() { addRole(selected.id, block.line); }
       })}
     </div>
     <div className="border-t-2 border-foreground/40 pt-3"><div className="flex items-center justify-between font-semibold"><span>A total</span><span className="tabular-nums whitespace-nowrap">{formatCurrency(overallTotals.portalCost)}<DifferenceNote difference={overallTotals.difference} /></span></div><div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><tbody><tr className="border-t border-border"><td className="py-1.5 font-medium">Total person-months per work package</td>{workPackages.map(wp => <td key={wp.id} className="px-2 py-1.5 text-right tabular-nums">WP{wp.number}<br /><span className="font-semibold tabular-nums">{formatPM(participantRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0))}</span></td>)}</tr></tbody></table></div></div>
     <LumpSumDepreciationSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} />
     <LumpSumCostsSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} />
     {permissionsParticipant && <LumpSumPermissionsDialog proposalId={proposalId} participant={permissionsParticipant} open={Boolean(permissionsParticipantId)} onOpenChange={open => { if (!open) setPermissionsParticipantId(null); }} />}
   </div>;
 }
