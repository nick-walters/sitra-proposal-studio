import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
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
  const [editingCell, setEditingCell] = useState<{ participantId: string; wpId: string } | null>(null);
  const [editValue, setEditValue] = useState('');

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

  const startEdit = (participantId: string, wpId: string, currentValue: number) => {
    if (!canEdit) return;
    setEditingCell({ participantId, wpId });
    setEditValue(currentValue > 0 ? String(currentValue) : '');
  };

  const saveEdit = useCallback(async () => {
    if (!editingCell) return;
    const { participantId, wpId } = editingCell;
    const parsed = parseFloat(editValue) || 0;
    const newTotal = Math.round(parsed * 10) / 10;

    await supabase
      .from('wp_draft_effort')
      .upsert({
        wp_draft_id: wpId,
        participant_id: participantId,
        person_months: newTotal,
      }, {
        onConflict: 'wp_draft_id,participant_id',
      });

    queryClient.invalidateQueries({ queryKey: ['a3-effort-data', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
    setEditingCell(null);
  }, [editingCell, editValue, proposalId, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') setEditingCell(null);
  };

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold whitespace-nowrap">Participant</TableHead>
                {wps.map(wp => (
                  <TableHead key={wp.id} className="text-center font-bold whitespace-nowrap">
                    WP{wp.number}
                  </TableHead>
                ))}
                <TableHead className="text-center font-bold whitespace-nowrap">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map(p => {
                const pMap = matrix.get(p.id)!;
                const rowTotal = wps.reduce((sum, wp) => sum + (pMap?.get(wp.id) || 0), 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                    </TableCell>
                    {wps.map(wp => {
                      const val = pMap?.get(wp.id) || 0;
                      const isEditing = editingCell?.participantId === p.id && editingCell?.wpId === wp.id;
                      return (
                        <TableCell
                          key={wp.id}
                          className={`text-center ${canEdit ? 'cursor-text hover:bg-muted/50' : ''}`}
                          onClick={() => !isEditing && startEdit(p.id, wp.id, val)}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              className="w-16 bg-transparent outline-none border border-primary rounded px-1 py-0 text-center text-sm"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={handleKeyDown}
                              autoFocus
                            />
                          ) : (
                            <span className="tabular-nums">{val ? formatPM(val) : '—'}</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-bold tabular-nums">
                      {rowTotal ? formatPM(rowTotal) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total</TableCell>
                {wps.map(wp => {
                  const colTotal = participants.reduce((sum, p) => sum + (matrix.get(p.id)?.get(wp.id) || 0), 0);
                  return (
                    <TableCell key={wp.id} className="text-center font-bold tabular-nums">
                      {colTotal ? formatPM(colTotal) : '—'}
                    </TableCell>
                  );
                })}
                <TableCell className="text-center font-bold tabular-nums">
                  {(() => {
                    const grandTotal = participants.reduce((sum, p) => {
                      const pMap = matrix.get(p.id)!;
                      return sum + wps.reduce((s, wp) => s + (pMap?.get(wp.id) || 0), 0);
                    }, 0);
                    return grandTotal ? formatPM(grandTotal) : '—';
                  })()}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
