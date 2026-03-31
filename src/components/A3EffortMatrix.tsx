import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Users } from 'lucide-react';

function formatPM(value: number): string {
  if (value === 0) return '0';
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

interface A3EffortMatrixProps {
  proposalId: string;
  canEdit: boolean;
}

interface WPInfo {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
}

interface ParticipantInfo {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string;
}

export function A3EffortMatrix({ proposalId, canEdit }: A3EffortMatrixProps) {
  const queryClient = useQueryClient();

  const { data: wps } = useQuery({
    queryKey: ['a3-effort-wps', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title')
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

  const matrix = new Map<string, Map<string, number>>();
  (participants || []).forEach(p => matrix.set(p.id, new Map()));
  (effortData || []).forEach(e => {
    const pMap = matrix.get(e.participant_id);
    if (pMap) pMap.set(e.wp_draft_id, e.person_months || 0);
  });

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

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['a3-effort-data', proposalId] }),
      queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] }),
    ]);
  }, [proposalId, queryClient]);

  if (!wps?.length || !participants?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Staff effort (person months per participant per WP)
        </CardTitle>
        <CardDescription>
          Click on a cell to edit person months. These values are mirrored to Section B3.1.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left border-r font-bold whitespace-nowrap">Participant</th>
                {wps.map(wp => (
                  <th key={wp.id} className="px-2 py-1.5 text-center border-r font-bold whitespace-nowrap">
                    WP{wp.number}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center border-r font-bold whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {participants.map(p => {
                const pMap = matrix.get(p.id)!;
                const rowTotal = wps.reduce((sum, wp) => sum + (pMap?.get(wp.id) || 0), 0);
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/50">
                    <td className="px-2 py-1 border-r whitespace-nowrap font-bold">
                      {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                    </td>
                    {wps.map(wp => {
                      const val = pMap?.get(wp.id) || 0;
                      return (
                        <td key={wp.id} className="p-1 border-r align-middle">
                          <EffortInputCell
                            value={val}
                            canEdit={canEdit}
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
                    <td key={wp.id} className="px-2 py-1 text-center border-r font-bold tabular-nums">
                      {colTotal ? formatPM(colTotal) : '—'}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center border-r font-bold tabular-nums">
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

  useEffect(() => {
    setLocalValue(formatPM(value));
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
      onBlur={() => {
        if (!canEdit) return;
        void commitValue(localValue);
      }}
      className="h-8 min-w-[5.5rem] text-center text-sm tabular-nums"
      disabled={!canEdit}
    />
  );
}
