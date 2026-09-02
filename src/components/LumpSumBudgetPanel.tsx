import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lock, Unlock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatNumber';
import { ParticipantBubble, WPBubble } from '@/components/B31Pill';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import { COL_WIDTH, DifferenceNote, LumpSumPersonnelTable, NUM_READ_FIELD, NumericInput, READ_FIELD, costLineTotals } from '@/components/LumpSumPersonnelTable';
import { LumpSumPermissionsDialog } from '@/components/LumpSumPermissionsDialog';
import { useCanEditParticipantBudget } from '@/hooks/useCanEditParticipantBudget';
import { useLumpSumBudgetAccess } from '@/hooks/useLumpSumBudgetAccess';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useAuth } from '@/hooks/useAuth';
import { LumpSumCostsSection, TotalRow } from '@/components/LumpSumCostsSection';
import { LumpSumTotalsSection } from '@/components/LumpSumTotalsSection';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { LINE_HEADING_ROW, LINE_INDENT, MAJOR_HEADING_ROW, useLsCollapse } from '@/components/LumpSumDepreciationSection';

const BLOCKS = [
  { line: 'A.1', label: 'A.1 Personnel costs — employees' },
  { line: 'A.2', label: 'A.2 Personnel costs — natural persons under direct contract' },
  { line: 'A.3', label: 'A.3 Personnel costs — seconded persons' },
  { line: 'A.4', label: 'A.4 Personnel costs — SME owners and natural person beneficiaries' },
];

function formatPM(value: number) {
  return value.toFixed(1);
}

export function LumpSumBudgetPanel({ proposalId, readOnly = false }: { proposalId: string; readOnly?: boolean }) {
  const { user } = useAuth();
  const { data, isLoading, error, saving, addRole, updateRole, deleteRole, reorderRoles, setEffort, setA4UnitCost } = useLumpSumPersonnel(proposalId);
  const lumpSumCosts = useLumpSumCosts(proposalId);
  const lumpSumDepreciation = useLumpSumDepreciation(proposalId);
  const { editableParticipantIds, isCoordinator, loading: permissionsLoading } = useCanEditParticipantBudget(proposalId);
  const budgetAccess = useLumpSumBudgetAccess(proposalId);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [permissionsParticipantId, setPermissionsParticipantId] = useState<string | null>(null);
  const { isCollapsed, toggle } = useLsCollapse(user?.id, proposalId);

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
  const budgetInputsByWp = useMemo(() => {
    const result: Record<string, { personnel: number; subcontracting: number; purchase: number; other: number }> = {};
    const cLines = new Set(['C.1', 'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets', 'C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other']);
    const dLines = new Set(['D.1', 'D.2']);
    const costItems = (lumpSumCosts.data?.items ?? []).filter(item => item.participant_id === selected?.id);
    const depreciationItems = (lumpSumDepreciation.data?.items ?? []).filter(item => item.participant_id === selected?.id && item.include_in_c2);
    for (const wp of workPackages) {
      result[wp.id] = { personnel: 0, subcontracting: 0, purchase: 0, other: 0 };
    }
    const addPersonnelGroup = (line: string, groupRoles: typeof participantRoles) => {
      const groupTotals = costLineTotals(line, groupRoles, efforts, workPackages, a4UnitCost);
      const rate = groupTotals.totalPm ? groupTotals.portalCost / groupTotals.totalPm : 0;
      for (const wp of workPackages) {
        const pm = groupRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0);
        result[wp.id].personnel += rate * pm;
      }
    };
    for (const block of BLOCKS) {
      const lineRoles = participantRoles.filter(role => role.cost_line === block.line);
      if (block.line === 'A.1') {
        const categories = [...new Set(lineRoles.map(role => role.he_category || 'blank'))];
        for (const category of categories) addPersonnelGroup(block.line, lineRoles.filter(role => (role.he_category || 'blank') === category));
      } else {
        addPersonnelGroup(block.line, lineRoles);
      }
    }
    for (const item of costItems) {
      const target = result[item.wp_draft_id];
      if (!target) continue;
      const amount = Number(item.amount ?? 0);
      if (item.cost_line === 'B.1') target.subcontracting += amount;
      else if (cLines.has(item.cost_line)) target.purchase += amount;
      else if (dLines.has(item.cost_line)) target.other += amount;
    }
    for (const item of depreciationItems) {
      const target = result[item.wp_draft_id];
      if (target) target.purchase += Number(item.charged_depreciation ?? 0);
    }
    return result;
  }, [a4UnitCost, efforts, lumpSumCosts.data?.items, lumpSumDepreciation.data?.items, participantRoles, selected?.id, workPackages]);


  if (isLoading || permissionsLoading) return <div className="p-6 text-sm text-muted-foreground">Loading lump sum personnel costs…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Unable to load lump sum personnel costs.</div>;
  if (!selected) return <div className="p-6 text-sm text-muted-foreground">No participants found for this proposal.</div>;
  
  return <div className="space-y-2 p-4 md:p-6">
     <div className="flex flex-wrap items-center gap-y-1 overflow-visible border-b border-border pb-1.5">
       {participants.map((participant, index) => {
         const active = participant.id === selected.id;
         const locked = Boolean(budgetAccess.lockFor(participant.id)?.is_locked);
         return <div key={participant.id} className={`flex min-w-max items-center gap-0 border-b-2 ${active ? 'border-primary' : 'border-transparent'} ${index < participants.length - 1 ? 'mr-1 border-r border-r-border/60 pr-1' : ''}`}>
           <button type="button" onClick={() => setSelectedParticipantId(participant.id)} className={`flex items-center px-1 py-1.5 text-left transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
             <ParticipantBubble number={participant.participant_number} shortName={participant.organisation_short_name || participant.organisation_name} />
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
      <div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
           {saving && !readOnly && <span>Saving…</span>}
           {readOnly && <span>This lump sum budget is superseded and read-only.</span>}
           {!readOnly && isLocked && <span>This participant budget is locked. A coordinator must unlock it before editing.</span>}
        </div>
         <section className="border-b border-border">
           <div className={MAJOR_HEADING_ROW}>
              <CollapseChevron collapsed={isCollapsed('A')} onToggle={() => toggle('A')} label="A. Personnel costs" />
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">A. Personnel costs</span>
              {isCollapsed('A') && <span className="shrink-0 text-sm font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(overallTotals.portalCost)}</span>}
           </div>
           {!isCollapsed('A') && <>
             {BLOCKS.map(block => {
              const collapsed = isCollapsed(block.line);
              const lineRoles = participantRoles.filter(role => role.cost_line === block.line);
              return <section key={block.line} className={`border-b border-border ${LINE_INDENT}`}>
                <div className={`${LINE_HEADING_ROW} border-b border-border/60`}>
                  <CollapseChevron collapsed={collapsed} onToggle={() => toggle(block.line)} label={`${block.line} personnel costs`} className="h-6 w-6" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">{block.label}</span>
                  {collapsed && <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(totalForLine(block.line))}</span>}
                  {!collapsed && editable && <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={onAddRole}>Add role</Button>}
                </div>
                {!collapsed && <div className="space-y-2 pt-2">
                  {block.line === 'A.4' && <label className="block max-w-48 text-xs text-muted-foreground">A.4 unit cost (€)<NumericInput value={a4UnitCost} disabled={!editable} step="0.01" decimals={2} className="mt-1 h-7 w-32 px-1.5 text-right text-xs tabular-nums" onCommit={value => setA4UnitCost(selected.id, value)} /></label>}
                  <LumpSumPersonnelTable costLine={block.line} roles={lineRoles} efforts={efforts} workPackages={workPackages} editable={editable} a4UnitCost={a4UnitCost} onAdd={() => addRole(selected.id, block.line)} onUpdateRole={updateRole} onDelete={deleteRole} onReorder={reorderRoles} onSetEffort={setEffort} />
                </div>}
              </section>;

              function onAddRole() { addRole(selected.id, block.line); }
             })}
             <div className="border-t-2 border-foreground/40 pt-2">
               {/*
                 The per-work-package person-month row sits above the A total and
                 labels each value with the same number-only WPBubble badge the
                 A.1–A.4 tables use for their work-package columns.
               */}
               <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-1.5 pb-1 text-xs">
                 <span className="mr-auto text-muted-foreground">Total person-months per work package</span>
                 {workPackages.map(wp => <span key={wp.id} className="inline-flex items-center gap-1">
                   <span title={wp.short_name ? `WP${wp.number}: ${wp.short_name}` : (wp.title ?? undefined)}><WPBubble wpNumber={wp.number} wpColor={wp.color} /></span>
                   <span className="font-semibold tabular-nums">{formatPM(participantRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0))}</span>
                 </span>)}
               </div>
               {/*
                 The A total reuses the B–D total row geometry: the label sits on
                 one line immediately left of the Cost column, the value's right
                 edge lines up with the subtotal figures, and the rounding note
                 sits directly beneath the figure in that same column.
               */}
                 <TotalRow label="A total" value={overallTotals.portalCost} difference={overallTotals.difference} />

             </div>
           </>}
         </section>
        <LumpSumCostsSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} />
        <LumpSumTotalsSection proposalId={proposalId} participantId={selected.id} userId={user?.id} editable={editable} budgetInputsByWp={budgetInputsByWp} />
      </div>

     {permissionsParticipant && <LumpSumPermissionsDialog proposalId={proposalId} participant={permissionsParticipant} open={Boolean(permissionsParticipantId)} onOpenChange={open => { if (!open) setPermissionsParticipantId(null); }} />}
   </div>;
 }
