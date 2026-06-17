import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Button } from '@/components/ui/button';
import { Users, Lock, Unlock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { WPBubble, ParticipantBubble } from '@/components/B31Pill';


function formatPM(value: number): string {
  if (value === 0) return '0';
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

interface A3EffortMatrixProps {
  proposalId: string;
  canEdit: boolean;
  isCoordinator?: boolean;
}

interface WPInfo {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
}

interface ParticipantInfo {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string;
}

interface EffortLock {
  id: string;
  participant_id: string;
  locked_by: string;
  locked_at: string;
}

export function A3EffortMatrix({ proposalId, canEdit, isCoordinator = false }: A3EffortMatrixProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: wps } = useQuery({
    queryKey: ['a3-effort-wps', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return data as WPInfo[];
    },
  });

  const { data: participants } = useQuery({
    queryKey: ['a3-effort-participants', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantInfo[];
    },
  });

  const { data: effortData } = useQuery({
    queryKey: ['a3-effort-data', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_draft_effort')
        .select('wp_draft_id, participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId);
      if (error) throw error;
      return data as { wp_draft_id: string; participant_id: string; person_months: number }[];
    },
  });

  const { data: effortLocks } = useQuery({
    queryKey: ['effort-row-locks', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('effort_row_locks')
        .select('id, participant_id, locked_by, locked_at')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return (data || []) as EffortLock[];
    },
  });

  const lockedParticipants = useMemo(
    () => new Set((effortLocks || []).map(l => l.participant_id)),
    [effortLocks]
  );

  const lockRow = useCallback(async (participantId: string) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('effort_row_locks')
      .insert({ proposal_id: proposalId, participant_id: participantId, locked_by: user.id });
    if (error) {
      toast.error('Failed to lock row');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['effort-row-locks', proposalId] });
  }, [proposalId, user?.id, queryClient]);

  const unlockRow = useCallback(async (participantId: string) => {
    const { error } = await supabase
      .from('effort_row_locks')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('participant_id', participantId);
    if (error) {
      toast.error('Failed to unlock row');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['effort-row-locks', proposalId] });
  }, [proposalId, queryClient]);

  // Stable list of WP IDs in column order; reference only changes when the
  // WP set or order changes.
  const wpIds = useMemo(() => (wps || []).map(w => w.id), [wps]);
  const wpIdsKey = wpIds.join('|');

  // Build a per-participant lookup of {wpId: pm}. Each participant's values
  // object is a fresh plain object on every recompute, but the memoized row
  // component below uses a JSON comparator to skip re-render when its own
  // numbers are unchanged.
  const participantEfforts = useMemo(() => {
    const byPart = new Map<string, Record<string, number>>();
    (participants || []).forEach(p => byPart.set(p.id, {}));
    (effortData || []).forEach(e => {
      const rec = byPart.get(e.participant_id);
      if (rec) rec[e.wp_draft_id] = e.person_months || 0;
    });
    return byPart;
  }, [participants, effortData]);

  // Column / grand totals derived once per data change (no setState → no
  // extra render passes).
  const { colTotals, grandTotal } = useMemo(() => {
    const cols: Record<string, number> = {};
    for (const wpId of wpIds) cols[wpId] = 0;
    let grand = 0;
    participantEfforts.forEach(values => {
      for (const wpId of wpIds) {
        const v = values[wpId] || 0;
        cols[wpId] += v;
        grand += v;
      }
    });
    return { colTotals: cols, grandTotal: grand };
  }, [participantEfforts, wpIds]);

  // Coalesce optimistic cache updates + downstream invalidations so rapid
  // edits across multiple cells trigger a single matrix re-render after
  // the user pauses (~800 ms), not one re-render per keystroke flush.
  const pendingEditsRef = useRef<Map<string, { participantId: string; wpId: string; personMonths: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingEdits = useCallback(() => {
    flushTimerRef.current = null;
    const pending = pendingEditsRef.current;
    if (pending.size === 0) return;
    const edits = Array.from(pending.values());
    pendingEditsRef.current = new Map();

    queryClient.setQueryData(
      ['a3-effort-data', proposalId],
      (old: { wp_draft_id: string; participant_id: string; person_months: number }[] | undefined) => {
        const base = old ? [...old] : [];
        for (const { participantId, wpId, personMonths } of edits) {
          const idx = base.findIndex(e => e.wp_draft_id === wpId && e.participant_id === participantId);
          if (idx >= 0) {
            base[idx] = { ...base[idx], person_months: personMonths };
          } else {
            base.push({ wp_draft_id: wpId, participant_id: participantId, person_months: personMonths });
          }
        }
        return base;
      }
    );

    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
    window.dispatchEvent(new CustomEvent('effort-data-changed', { detail: { proposalId } }));
  }, [proposalId, queryClient]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        // Final flush so unmount doesn't lose pending UI updates.
        flushPendingEdits();
      }
    };
  }, [flushPendingEdits]);

  const saveEffortValue = useCallback(async (participantId: string, wpId: string, personMonths: number) => {
    await supabase
      .from('wp_draft_effort')
      .upsert({
        wp_draft_id: wpId,
        participant_id: participantId,
        person_months: personMonths,
      }, {
        onConflict: 'wp_draft_id,participant_id',
      });

    pendingEditsRef.current.set(`${participantId}|${wpId}`, { participantId, wpId, personMonths });
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushPendingEdits, 800);
  }, [flushPendingEdits]);


  if (!wps?.length || !participants?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-5 h-5" />
          Staff effort (person months per participant per WP)
        </CardTitle>
        <CardDescription>
          Values are mirrored to Table 3.1.f.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
        <div className="overflow-auto">
          <table className="text-xs border-collapse w-full table-fixed">
            <colgroup>
              <col style={{ width: `${1.2 / ((wps?.length || 9) + 1.2 + 1) * 100}%` }} />
              {(wps || []).map(wp => (
                <col key={wp.id} style={{ width: `${1 / ((wps?.length || 9) + 1.2 + 1) * 100}%` }} />
              ))}
              <col style={{ width: `${1 / ((wps?.length || 9) + 1.2 + 1) * 100}%` }} />
            </colgroup>
            <thead>
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left border-r font-bold whitespace-nowrap">
                  <div className="flex items-center justify-between gap-1">
                    <span>Participant</span>
                    {isCoordinator && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const allLocked = (participants || []).every(p => lockedParticipants.has(p.id));
                              if (allLocked) {
                                (participants || []).forEach(p => unlockRow(p.id));
                              } else {
                                (participants || []).filter(p => !lockedParticipants.has(p.id)).forEach(p => lockRow(p.id));
                              }
                            }}
                           aria-label="Lock" title="Lock">
                            {(participants || []).length > 0 && (participants || []).every(p => lockedParticipants.has(p.id))
                              ? <Lock className="w-3.5 h-3.5 text-destructive" />
                              : <Unlock className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {(participants || []).every(p => lockedParticipants.has(p.id)) ? 'Unlock all rows' : 'Lock all rows'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </th>
                {wps.map(wp => (
                  <th key={wp.id} className="px-1 py-1.5 text-center border-r">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <WPBubble
                          wpColor={wp.color || '#3b82f6'}
                          style={{ fontSize: '10px', height: 'auto', padding: '2px 8px', cursor: 'default' }}
                        >
                          WP{wp.number}
                        </WPBubble>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span className="text-xs">WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}{wp.title ? ` – ${wp.title}` : ''}</span>
                      </TooltipContent>
                    </Tooltip>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center border-r font-bold whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {participants.map(p => {
                const values = participantEfforts.get(p.id) || {};
                const isLocked = lockedParticipants.has(p.id);
                const rowEditable = canEdit && (isCoordinator || !isLocked);
                return (
                  <EffortRow
                    key={p.id}
                    participant={p}
                    values={values}
                    wpIds={wpIds}
                    wpIdsKey={wpIdsKey}
                    isLocked={isLocked}
                    isCoordinator={isCoordinator}
                    rowEditable={rowEditable}
                    onSave={saveEffortValue}
                    onLock={lockRow}
                    onUnlock={unlockRow}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
                <td className="px-2 py-1 border-r font-bold">Total</td>
                {wps.map(wp => {
                  const colTotal = colTotals[wp.id] || 0;
                  return (
                    <td key={wp.id} className="px-2 py-1 text-center border-r font-bold tabular-nums align-middle">
                      {colTotal ? formatPM(colTotal) : '—'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center border-r font-bold tabular-nums align-middle">
                  {grandTotal ? formatPM(grandTotal) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

interface EffortRowProps {
  participant: ParticipantInfo;
  values: Record<string, number | undefined>;
  wpIds: string[];
  wpIdsKey: string;
  isLocked: boolean;
  isCoordinator: boolean;
  rowEditable: boolean;
  onSave: (participantId: string, wpId: string, personMonths: number) => Promise<void>;
  onLock: (participantId: string) => void;
  onUnlock: (participantId: string) => void;
}

const EffortRow = React.memo(function EffortRow({
  participant: p,
  values,
  wpIds,
  isLocked,
  isCoordinator,
  rowEditable,
  onSave,
  onLock,
  onUnlock,
}: EffortRowProps) {
  const rowTotal = wpIds.reduce((sum, wpId) => sum + (values[wpId] || 0), 0);
  return (
    <tr className={cn('border-t hover:bg-muted/50', isLocked && !isCoordinator && 'opacity-60')}>
      <td className="px-2 py-1 border-r whitespace-nowrap">
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1">
            <ParticipantBubble>
              {p.participant_number}. {p.organisation_short_name || p.organisation_name}
            </ParticipantBubble>
            {isLocked && !isCoordinator && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
          </span>
          {isCoordinator && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => isLocked ? onUnlock(p.id) : onLock(p.id)}
             aria-label="Lock" title="Lock">
              {isLocked ? <Lock className="w-3 h-3 text-destructive" /> : <Unlock className="w-3 h-3 text-green-600" />}
            </Button>
          )}
        </div>
      </td>
      {wpIds.map(wpId => {
        const val = values[wpId];
        return (
          <td key={wpId} className="p-1 border-r align-middle">
            <EffortInputCell
              value={val}
              canEdit={rowEditable}
              onSave={(nextValue) => onSave(p.id, wpId, nextValue)}
            />
          </td>
        );
      })}
      <td className="px-2 py-1 text-center border-r font-bold tabular-nums">
        {rowTotal ? formatPM(rowTotal) : '—'}
      </td>
    </tr>
  );
}, (prev, next) => {
  if (prev.participant !== next.participant) return false;
  if (prev.wpIdsKey !== next.wpIdsKey) return false;
  if (prev.isLocked !== next.isLocked) return false;
  if (prev.isCoordinator !== next.isCoordinator) return false;
  if (prev.rowEditable !== next.rowEditable) return false;
  if (prev.onSave !== next.onSave) return false;
  if (prev.onLock !== next.onLock) return false;
  if (prev.onUnlock !== next.onUnlock) return false;
  // Numeric value comparison restricted to current WP columns.
  for (const wpId of next.wpIds) {
    if ((prev.values[wpId] || 0) !== (next.values[wpId] || 0)) return false;
  }
  return true;
});

interface EffortInputCellProps {
  value: number | undefined;
  canEdit: boolean;
  onSave: (value: number) => Promise<void>;
}

function EffortInputCell({ value, canEdit, onSave }: EffortInputCellProps) {
  const displayValue = formatPM(value ?? 0);

  const handleDebouncedChange = useCallback((raw: string) => {
    if (!canEdit) return;
    // Empty / NaN inputs are treated as 0 and persisted, so the cell
    // shows "0" on next load instead of reverting to empty.
    const parsed = parseFloat(raw);
    const safe = Number.isFinite(parsed) ? parsed : 0;
    const rounded = Math.round(safe * 10) / 10;
    if (rounded === (value ?? null)) return;
    void onSave(rounded);
  }, [canEdit, onSave, value]);

  return (
    <DebouncedInput
      type="number"
      step="0.1"
      min="0"
      value={displayValue}
      onDebouncedChange={handleDebouncedChange}
      debounceMs={500}
      className="h-8 min-w-[5.5rem] text-center text-sm tabular-nums"
      disabled={!canEdit}
    />
  );
}
