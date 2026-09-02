import { useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info, XCircle } from 'lucide-react';
import { LsFinding, LsSeverity, useLumpSumValidation } from '@/hooks/useLumpSumValidation';
import { useLsCollapse } from '@/components/LumpSumDepreciationSection';

/**
 * TEMPORARY — the whole validation feature is to be deleted once SUSIE-Q's
 * budget migration from the actual-costs model to the lump-sum model is
 * confirmed complete. Most of its findings are artefacts of that
 * half-finished state, so it is useful only while the migration is being
 * done by hand.
 *
 * Until then it must render for no proposal other than SUSIE-Q
 * (af325ea2-ae8c-4f59-8625-283d5437efba). Deleting the feature means
 * removing this file and src/hooks/useLumpSumValidation.ts, plus the import
 * and single mount line in src/components/LumpSumBudgetPanel.tsx.
 */
export const SUSIE_Q_PROPOSAL_ID = 'af325ea2-ae8c-4f59-8625-283d5437efba';

/** Collapse id used by this panel inside the shared lump-sum collapse state. */
const VALIDATION_COLLAPSE_ID = 'validation';

const SEVERITY_ORDER: LsSeverity[] = ['error', 'warning', 'info'];

const SEVERITY_STYLE: Record<LsSeverity, { icon: typeof XCircle; className: string; label: string }> = {
  error: { icon: XCircle, className: 'text-destructive', label: 'error' },
  warning: { icon: AlertTriangle, className: 'text-amber-600', label: 'warning' },
  info: { icon: Info, className: 'text-muted-foreground', label: 'note' },
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Read-only consortium-wide checks for the lump sum budget. Every figure comes
 * from the existing lump sum hooks; nothing here writes.
 */
export function LumpSumValidationPanel({
  proposalId,
  userId,
  onSelectParticipant,
}: {
  proposalId: string;
  userId?: string | null;
  onSelectParticipant?: (participantId: string) => void;
}) {
  const { findings, counts, isLoading } = useLumpSumValidation(proposalId);
  const { isCollapsed, toggle: toggleCollapsed } = useLsCollapse(userId, proposalId);
  // The panel always starts collapsed; the user's own choice persists through
  // the shared lump-sum collapse state, exactly like the other sections.
  const open = !isCollapsed(VALIDATION_COLLAPSE_ID);
  const toggle = () => toggleCollapsed(VALIDATION_COLLAPSE_ID);

  // Renders nothing for any proposal other than SUSIE-Q — not even an empty
  // collapsed section.
  if (proposalId !== SUSIE_Q_PROPOSAL_ID) return null;

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; participantId: string | null; items: LsFinding[] }>();
    for (const finding of findings) {
      const key = finding.participantId ?? 'consortium';
      const existing = map.get(key) ?? { label: finding.participantLabel, participantId: finding.participantId, items: [] };
      existing.items.push(finding);
      map.set(key, existing);
    }
    for (const group of map.values()) {
      group.items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    }
    return [...map.values()];
  }, [findings]);

  if (isLoading) return null;

  const summary = [
    counts.error ? plural(counts.error, 'error') : null,
    counts.warning ? plural(counts.warning, 'warning') : null,
    counts.info ? plural(counts.info, 'note') : null,
  ].filter(Boolean).join(', ') || 'No issues found';

  const toggle = () => { setTouched(true); setOpen(value => !value); };

  return <section className="mb-2 rounded-md border border-border">
    <div
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      }}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
    >
      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="text-sm font-semibold">Budget validation</span>
      <span className={`text-xs ${counts.error ? 'text-destructive' : 'text-muted-foreground'}`}>{summary}</span>
    </div>
    {open && <div className="space-y-2 border-t border-border px-3 py-2">
      {groups.length === 0 && <p className="text-xs text-muted-foreground">Every check passed for this consortium.</p>}
      {groups.map(group => <div key={group.participantId ?? 'consortium'} className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{group.label}</p>
        <ul className="space-y-1">
          {group.items.map(finding => {
            const style = SEVERITY_STYLE[finding.severity];
            const Icon = style.icon;
            return <li key={finding.id}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-muted/60"
                onClick={() => { if (finding.participantId) onSelectParticipant?.(finding.participantId); }}
              >
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.className}`} aria-label={style.label} />
                <span className="min-w-0">
                  {(finding.wpLabel || finding.costLine) && <span className="mr-1 font-semibold">
                    {[finding.wpLabel, finding.costLine].filter(Boolean).join(' · ')}
                  </span>}
                  <span>{finding.message}</span>
                </span>
              </button>
            </li>;
          })}
        </ul>
      </div>)}
    </div>}
  </section>;
}
