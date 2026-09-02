import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Unlock, Users } from 'lucide-react';
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

/**
 * The Validate / Export toolbar lives in BudgetPortalSheet, which this feature may not edit.
 * Mount a slot between those two buttons and portal the lock-all control into it.
 */
function useToolbarSlot(enabled: boolean) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) { setSlot(null); return; }
    let host: HTMLElement | null = null;
    const attach = () => {
      if (host?.isConnected) return true;
      const validate = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim().startsWith('Validate'));
      if (!validate?.parentElement) return false;
      host = document.createElement('span');
      host.dataset.lsLockAllSlot = 'true';
      validate.insertAdjacentElement('afterend', host);
      setSlot(host);
      return true;
    };
    if (!attach()) {
      const timer = window.setInterval(() => { if (attach()) window.clearInterval(timer); }, 250);
      return () => { window.clearInterval(timer); host?.remove(); };
    }
    return () => { host?.remove(); };
  }, [enabled]);
  return slot;
}


const BLOCKS = [
  { line: 'A.1', label: 'A.1 Personnel costs — employees' },
  { line: 'A.2', label: 'A.2 Personnel costs — natural persons under direct contract' },
  { line: 'A.3', label: 'A.3 Personnel costs — seconded persons' },
  { line: 'A.4', label: 'A.4 Personnel costs — SME owners and natural person beneficiaries' },
const MAJOR_COLLAPSE_DEFAULTS: Record<string, boolean> = { A: false, B: true, C: false, D: true };

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
  const [majorCollapse, setMajorCollapse] = useState<Record<string, boolean>>({ A: false, B: true, C: false, D: true });
  const majorCollapseKey = `ls-major-collapse:${user?.id ?? 'anon'}:${proposalId}`;
  useEffect(() => {
    try {
      const stored = localStorage.getItem(majorCollapseKey);
      if (stored) setMajorCollapse(current => ({ ...current, ...(JSON.parse(stored) as Record<string, boolean>) }));
    } catch { /* view preference only */ }
  }, [majorCollapseKey]);
  const toggleMajor = (key: string) => setMajorCollapse(current => {
    const next = { ...current, [key]: !(current[key] ?? true) };
    try { localStorage.setItem(majorCollapseKey, JSON.stringify(next)); } catch { /* view preference only */ }
    return next;
  });
  const toolbarSlot = useToolbarSlot(isCoordinator);


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

  
  const allLocked = budgetAccess.lockState === 'all';
  const mixedLocks = budgetAccess.lockState === 'some';
  const lockAllLabel = allLocked ? 'Unlock all participant budgets' : 'Lock all participant budgets';
  const lockAllButton = <Button
    type="button"
    variant="outline"
    className="gap-2"
    aria-label={lockAllLabel}
    title={mixedLocks ? 'Some budgets are locked — lock all budgets' : lockAllLabel}
    onClick={() => budgetAccess.setLockAll(!allLocked)}
  >
    {allLocked
      ? <Lock className="h-4 w-4 text-destructive" />
      : <Unlock className={`h-4 w-4 ${mixedLocks ? 'text-warning' : 'text-green-600'}`} />}
    {allLocked ? 'Unlock all budgets' : 'Lock all budgets'}
  </Button>;

  return <div className="space-y-4 p-4 md:p-6">
     {isCoordinator && (toolbarSlot ? createPortal(lockAllButton, toolbarSlot) : <div className="flex justify-end">{lockAllButton}</div>)}
     <div className="flex flex-wrap items-center gap-y-1 overflow-visible border-b border-border pb-1.5">
       {participants.map((participant, index) => {
         const active = participant.id === selected.id;
         const locked = Boolean(budgetAccess.lockFor(participant.id)?.is_locked);
         return <div key={participant.id} className={`flex min-w-max items-center gap-0 border-b-2 ${active ? 'border-primary' : 'border-transparent'} ${index > 0 ? 'ml-1 border-l border-l-border/40 pl-1' : ''}`}>
           <button type="button" onClick={() => setSelectedParticipantId(participant.id)} className={`flex items-center px-1 py-1.5 text-left transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
             <ParticipantBubble number={participant.participant_number} shortName={participant.organisation_short_name || participant.organisation_name} />
           </button>
           {isCoordinator && <>
             <Button
               type="button"
               size="icon"
               variant="ghost"
               className="h-5 w-5"
               aria-label={locked ? `Unlock budget for participant ${participant.participant_number ?? ''}` : `Lock budget for participant ${participant.participant_number ?? ''}`}
               title={locked ? 'Unlock budget' : 'Lock budget'}
               onClick={() => budgetAccess.setLock(participant.id, !locked)}
             >
               {locked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-green-600" />}
             </Button>
             <Button
               type="button"
               size="icon"
               variant="ghost"
               className="h-5 w-5 text-muted-foreground hover:text-foreground"
               aria-label={`Manage budget permissions for participant ${participant.participant_number ?? ''}`}
               title="Manage budget permissions"
               onClick={() => setPermissionsParticipantId(participant.id)}
             >
               <Users className="h-3 w-3" />
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
         <section className="border-b border-border">
           <div className="flex min-h-9 items-center gap-1">
             <CollapseChevron collapsed={Boolean(majorCollapse.A)} onToggle={() => toggleMajor('A')} label="A. Personnel costs" />
             <h2 className="min-w-0 flex-1 text-lg font-semibold">A. Personnel costs</h2>
             {majorCollapse.A && <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{formatCurrency(overallTotals.portalCost)}</span>}
           </div>
           {!majorCollapse.A && <>
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
             <div className="border-t-2 border-foreground/40 pt-3"><div className="flex items-center justify-between font-semibold"><span>A total</span><span className="tabular-nums whitespace-nowrap">{formatCurrency(overallTotals.portalCost)}<DifferenceNote difference={overallTotals.difference} /></span></div><div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><tbody><tr className="border-t border-border"><td className="py-1.5 font-medium">Total person-months per work package</td>{workPackages.map(wp => <td key={wp.id} className="px-2 py-1.5 text-right tabular-nums">WP{wp.number}<br /><span className="font-semibold tabular-nums">{formatPM(participantRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0))}</span></td>)}</tr></tbody></table></div></div>
           </>}
         </section>
      </div>
     <LumpSumDepreciationSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} />
     <LumpSumCostsSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} />
     {permissionsParticipant && <LumpSumPermissionsDialog proposalId={proposalId} participant={permissionsParticipant} open={Boolean(permissionsParticipantId)} onOpenChange={open => { if (!open) setPermissionsParticipantId(null); }} />}
   </div>;
 }
