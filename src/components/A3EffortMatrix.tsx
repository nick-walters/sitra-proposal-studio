import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, Lock, Unlock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getContrastingTextColor } from '@/lib/wpColors';

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

  const lockedParticipants = new Set(
    (effortLocks || []).map(l => l.participant_id)
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

  const matrix = new Map<string, Map<string, number>>();
  (participants || []).forEach(p => matrix.set(p.id, new Map()));
  (effortData || []).forEach(e => {
    const pMap = matrix.get(e.participant_id);
    if (pMap) pMap.set(e.wp_draft_id, e.person_months || 0);
  });

  const saveEffortValue = useCallback(async (participantId: string, wpId: string, personMonths: number) => {
    // Optimistically update the local cache so the table doesn't refetch & re-render
    queryClient.setQueryData(
      ['a3-effort-data', proposalId],
      (old: { wp_draft_id: string; participant_id: string; person_months: number }[] | undefined) => {
        if (!old) return old;
        const idx = old.findIndex(e => e.wp_draft_id === wpId && e.participant_id === participantId);
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = { ...updated[idx], person_months: personMonths };
          return updated;
        }
        return [...old, { wp_draft_id: wpId, participant_id: participantId, person_months: personMonths }];
      }
    );

    await supabase
      .from('wp_draft_effort')
      .upsert({
        wp_draft_id: wpId,
        participant_id: participantId,
        person_months: personMonths,
      }, {
        onConflict: 'wp_draft_id,participant_id',
      });

    // Refresh dependent tables (not this one — already updated optimistically)
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });

    // Notify budget tables that effort data changed
    window.dispatchEvent(new CustomEvent('effort-data-changed', { detail: { proposalId } }));
  }, [proposalId, queryClient]);

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
                          >
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
                        <span
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap cursor-default"
                          style={{
                            backgroundColor: wp.color || '#3b82f6',
                            color: '#ffffff',
                          }}
                        >
                          WP{wp.number}
                        </span>
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
                const pMap = matrix.get(p.id)!;
                const rowTotal = wps.reduce((sum, wp) => sum + (pMap?.get(wp.id) || 0), 0);
                const isLocked = lockedParticipants.has(p.id);
                // Coordinators+ can always edit; regular users cannot edit locked rows
                const rowEditable = canEdit && (isCoordinator || !isLocked);
                return (
                  <tr key={p.id} className={cn('border-t hover:bg-muted/50', isLocked && !isCoordinator && 'opacity-60')}>
                    <td className="px-2 py-1 border-r whitespace-nowrap">
                      <div className="flex items-center justify-between gap-1">
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                            style={{ backgroundColor: '#000000', color: '#ffffff' }}
                          >
                            {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                          </span>
                          {isLocked && !isCoordinator && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        </span>
                        {isCoordinator && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => isLocked ? unlockRow(p.id) : lockRow(p.id)}
                          >
                            {isLocked ? <Lock className="w-3 h-3 text-destructive" /> : <Unlock className="w-3 h-3 text-green-600" />}
                          </Button>
                        )}
                      </div>
                    </td>
                    {wps.map(wp => {
                      const val = pMap?.get(wp.id) || 0;
                      return (
                        <td key={wp.id} className="p-1 border-r align-middle">
                          <EffortInputCell
                            value={val}
                            canEdit={rowEditable}
                            onSave={(nextValue) => saveEffortValue(p.id, wp.id, nextValue)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center border-r font-bold tabular-nums">
                      {rowTotal ? formatPM(rowTotal) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
                <td className="px-2 py-1 border-r font-bold">Total</td>
                {wps.map(wp => {
                  const colTotal = participants.reduce((sum, p) => sum + (matrix.get(p.id)?.get(wp.id) || 0), 0);
                  return (
                    <td key={wp.id} className="px-2 py-1 text-center border-r font-bold tabular-nums align-middle">
                      {colTotal ? formatPM(colTotal) : '—'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center border-r font-bold tabular-nums align-middle">
                  {(() => {
                    const grandTotal = participants.reduce((sum, p) => {
                      const pMap = matrix.get(p.id)!;
                      return sum + wps.reduce((s, wp) => s + (pMap?.get(wp.id) || 0), 0);
                    }, 0);
                    return grandTotal ? formatPM(grandTotal) : '—';
                  })()}
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

interface EffortInputCellProps {
  value: number;
  canEdit: boolean;
  onSave: (value: number) => Promise<void>;
}

function EffortInputCell({ value, canEdit, onSave }: EffortInputCellProps) {
  const [localValue, setLocalValue] = useState(() => formatPM(value));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(formatPM(value));
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const commitValue = useCallback(async (rawValue: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const parsed = parseFloat(rawValue) || 0;
    const rounded = Math.round(parsed * 10) / 10;
    setLocalValue(formatPM(rounded));

    if (rounded === value) return;

    await onSave(rounded);
  }, [onSave, value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setLocalValue(nextValue);

    if (!canEdit) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      void commitValue(nextValue);
    }, 500);
  };

  return (
    <Input
      type="number"
      step="0.1"
      min="0"
      value={localValue}
      onChange={handleChange}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        if (!canEdit) return;
        void commitValue(localValue);
      }}
      className="h-8 min-w-[5.5rem] text-center text-sm tabular-nums"
      disabled={!canEdit}
    />
  );
}
