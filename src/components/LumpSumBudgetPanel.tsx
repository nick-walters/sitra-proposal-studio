import { useMemo, useState } from 'react';
import { Lock, Unlock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatNumber';
import { ParticipantBubble } from '@/components/B31Pill';
import { LumpSumPersonnelTable, NumericInput, PersonMonthTotalsRows, costLineTotals } from '@/components/LumpSumPersonnelTable';
import { LumpSumPermissionsDialog } from '@/components/LumpSumPermissionsDialog';
import { LumpSumValidationPanel } from '@/components/LumpSumValidationPanel';
import { useCanEditParticipantBudget } from '@/hooks/useCanEditParticipantBudget';
import { useLumpSumBudgetAccess } from '@/hooks/useLumpSumBudgetAccess';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useAuth } from '@/hooks/useAuth';
import { LumpSumCostsSection, TotalRow } from '@/components/LumpSumCostsSection';
import { LumpSumTotalsSection } from '@/components/LumpSumTotalsSection';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { CollapsibleHeader, HeaderControl, LINE_INDENT, useLsCollapse } from '@/components/LumpSumDepreciationSection';
import { LumpSumPortalView } from '@/components/LumpSumPortalView';
import { LumpSumOverview } from '@/components/LumpSumOverview';
import { buildWpInputs, personMonthsForRoles } from '@/lib/lumpSumFigures';

type BudgetView = 'enter' | 'portal' | 'overview';


const BLOCKS = [
  { line: 'A.1', label: 'A.1 Personnel costs — employees' },
  { line: 'A.2', label: 'A.2 Personnel costs — natural persons under direct contract' },
  { line: 'A.3', label: 'A.3 Personnel costs — seconded persons' },
  { line: 'A.4', label: 'A.4 Personnel costs — SME owners and natural person beneficiaries' },
];


export function LumpSumBudgetPanel({
  proposalId,
  readOnly = false,
  budgetView = 'enter',
}: {
  proposalId: string;
  readOnly?: boolean;
  budgetView?: BudgetView;
}) {
  const { user } = useAuth();
  const { data, isLoading, error, saving, addRole, updateRole, deleteRole, reorderRoles, setEffort, setA4UnitCost } = useLumpSumPersonnel(proposalId);
  const lumpSumCosts = useLumpSumCosts(proposalId);
  const lumpSumDepreciation = useLumpSumDepreciation(proposalId);
  const { editableParticipantIds, isCoordinator, loading: permissionsLoading } = useCanEditParticipantBudget(proposalId);
  const budgetAccess = useLumpSumBudgetAccess(proposalId);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [permissionsParticipantId, setPermissionsParticipantId] = useState<string | null>(null);
  const { isCollapsed, toggle } = useLsCollapse(user?.id, proposalId);
  const canUsePortalCopy = !readOnly && editableParticipantIds.size > 0;

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
  const editable = !readOnly && mayEdit && (!isLocked || isCoordinator);
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

  /**
   * Per-WP source figures passed to E–H. Personnel uses the existing rounded
   * portal calculation for each A.1 category and A.2–A.4 line; B–D use the
   * figures already represented by the cost/depreciation sections.
   */
  const budgetInputsByWp = useMemo(() => buildWpInputs(
    participantRoles,
    efforts,
    workPackages,
    a4UnitCost,
    (lumpSumCosts.data?.items ?? []).filter(item => item.participant_id === selected?.id),
    (lumpSumDepreciation.data?.items ?? []).filter(item => item.participant_id === selected?.id),
  ), [a4UnitCost, efforts, lumpSumCosts.data?.items, lumpSumDepreciation.data?.items, participantRoles, selected?.id, workPackages]);



  if (isLoading || permissionsLoading) return <div className="p-6 text-sm text-muted-foreground">Loading lump sum personnel costs…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Unable to load lump sum personnel costs.</div>;
  if (budgetView === 'overview') return <div className="space-y-2 p-4 md:p-6"><LumpSumOverview proposalId={proposalId} userId={user?.id} /></div>;
  if (!selected) return <div className="p-6 text-sm text-muted-foreground">No participants found for this proposal.</div>;
  
  return <div className="space-y-2 p-4 md:p-6">
{/* TEMPORARY — lump-sum budget validation, only for SUSIE-Q's budget migration.
          Delete this line and the import above, plus the files
          LumpSumValidationPanel.tsx and useLumpSumValidation.ts, once the
          migration is confirmed complete. */}
      <LumpSumValidationPanel proposalId={proposalId} userId={user?.id} onSelectParticipant={setSelectedParticipantId} />
      <div className="flex flex-wrap items-center gap-y-1 overflow-visible border-b border-border pb-1.5">
       {participants.map((participant, index) => {
         const active = participant.id === selected.id;
         const locked = Boolean(budgetAccess.lockFor(participant.id)?.is_locked);
         return <div key={participant.id} className={`flex min-w-max items-center gap-0 border-b-2 ${active ? 'border-primary' : 'border-transparent'} ${index < participants.length - 1 ? 'mr-1 border-r border-r-border/60 pr-1' : ''}`}>
           <button type="button" onClick={() => setSelectedParticipantId(participant.id)} className={`flex items-center px-1 py-1.5 text-left transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
             {/*
               ParticipantBubble paints its own colour through an inline style,
               which no Tailwind colour or opacity class on the badge itself can
               override. Fading a wrapper instead composites the whole badge,
               inline background included.
             */}
             <span className={`inline-flex transition-opacity ${active ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}>
               <ParticipantBubble number={participant.participant_number} shortName={participant.organisation_short_name || participant.organisation_name} />
             </span>
           </button>
            {isCoordinator && <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                disabled={readOnly}
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
                disabled={readOnly}
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
      {budgetView === 'portal' && canUsePortalCopy ? <LumpSumPortalView proposalId={proposalId} participantId={selected.id} userId={user?.id} /> : <div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
           {saving && !readOnly && <span>Saving…</span>}
           {readOnly && <span>This lump sum budget is superseded and read-only.</span>}
           {!readOnly && isLocked && <span>This participant budget is locked. A coordinator must unlock it before editing.</span>}
        </div>
         <section className="border-b border-border">
           <CollapsibleHeader collapsed={isCollapsed('A')} onToggle={() => toggle('A')} label="A. Personnel costs" level="major">
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">A. Personnel costs</span>
              {isCollapsed('A') && <span className="shrink-0 text-sm font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(overallTotals.portalCost)}</span>}
           </CollapsibleHeader>
           {!isCollapsed('A') && <>
             {BLOCKS.map(block => {
              const collapsed = isCollapsed(block.line);
              const lineRoles = participantRoles.filter(role => role.cost_line === block.line);
              return <section key={block.line} className={`border-b border-border ${LINE_INDENT}`}>
                <CollapsibleHeader collapsed={collapsed} onToggle={() => toggle(block.line)} label={`${block.line} personnel costs`} level="line" className="border-b border-border/60">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">{block.label}</span>
                  {collapsed && <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(totalForLine(block.line))}</span>}
                  {!collapsed && editable && <HeaderControl><Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={onAddRole}>Add role</Button></HeaderControl>}
                </CollapsibleHeader>
                {!collapsed && <div className="space-y-2 pt-2">
                  {block.line === 'A.4' && <label className="block max-w-48 text-xs text-muted-foreground">A.4 unit cost (€)<NumericInput value={a4UnitCost} disabled={!editable} step="0.01" decimals={2} className="mt-1 h-7 w-32 px-1.5 text-right text-xs tabular-nums" onCommit={value => setA4UnitCost(selected.id, value)} /></label>}
                  <LumpSumPersonnelTable costLine={block.line} roles={lineRoles} efforts={efforts} workPackages={workPackages} editable={editable} a4UnitCost={a4UnitCost} onAdd={() => addRole(selected.id, block.line)} onUpdateRole={updateRole} onDelete={deleteRole} onReorder={reorderRoles} onSetEffort={setEffort} />
                </div>}
              </section>;

              function onAddRole() { addRole(selected.id, block.line); }
             })}
              <div className="border-t-2 border-foreground/40 pt-2">
                <PersonMonthTotalsRows
                  label="Total person-months per work package"
                  workPackages={workPackages}
                  personMonths={workPackages.map(wp => personMonthsForRoles(participantRoles, efforts, workPackages, wp.id))}
                />
               {/*
                 The A total reuses the B–D total row geometry: the label sits on
                 one line immediately left of the Cost column, the value's right
                 edge lines up with the subtotal figures, and the rounding note
                 sits directly beneath the figure in that same column.
               */}
                 <TotalRow label="A total" value={overallTotals.portalCost} difference={overallTotals.difference} measure="A-total" />

             </div>
           </>}
         </section>
        <LumpSumCostsSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} />
        <LumpSumTotalsSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} budgetInputsByWp={budgetInputsByWp} />
       </div>}

     {permissionsParticipant && <LumpSumPermissionsDialog proposalId={proposalId} participant={permissionsParticipant} open={Boolean(permissionsParticipantId)} onOpenChange={open => { if (!open) setPermissionsParticipantId(null); }} />}
   </div>;
 }
