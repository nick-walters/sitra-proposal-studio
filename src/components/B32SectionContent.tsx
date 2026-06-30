import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble } from './B31Pill';
import { Check } from 'lucide-react';

interface Props {
  proposalId: string;
}

const tableFont = "font-['Times_New_Roman',Times,serif] text-[11pt]";

type Row = { id: string; label: string; order_index: number };
type Col = {
  id: string;
  kind: 'participant' | 'custom';
  participant_id: string | null;
  header_text: string | null;
  order_index: number;
};
type Cell = { row_id: string; column_id: string; checked: boolean };
type Participant = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
};

export function B32SectionContent({ proposalId }: Props) {
  const qc = useQueryClient();

  const enabledQ = useQuery({
    queryKey: ['expertise-matrix-mirror-enabled', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('expertise_matrix_enabled')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data?.expertise_matrix_enabled ?? true) as boolean;
    },
  });

  const dataQ = useQuery({
    queryKey: ['expertise-matrix-mirror', proposalId],
    enabled: !!proposalId && enabledQ.data === true,
    queryFn: async () => {
      const [rowsR, colsR, cellsR, partsR] = await Promise.all([
        supabase
          .from('expertise_matrix_rows')
          .select('id,label,order_index')
          .eq('proposal_id', proposalId)
          .order('order_index'),
        supabase
          .from('expertise_matrix_columns')
          .select('id,kind,participant_id,header_text,order_index')
          .eq('proposal_id', proposalId)
          .order('order_index'),
        supabase
          .from('expertise_matrix_cells')
          .select('row_id,column_id,checked,expertise_matrix_rows!inner(proposal_id)')
          .eq('expertise_matrix_rows.proposal_id', proposalId),
        supabase
          .from('participants')
          .select('id,participant_number,organisation_short_name')
          .eq('proposal_id', proposalId),
      ]);
      if (rowsR.error) throw rowsR.error;
      if (colsR.error) throw colsR.error;
      if (cellsR.error) throw cellsR.error;
      if (partsR.error) throw partsR.error;
      return {
        rows: (rowsR.data || []) as Row[],
        cols: (colsR.data || []) as Col[],
        cells: ((cellsR.data || []) as any[]).map((c) => ({
          row_id: c.row_id,
          column_id: c.column_id,
          checked: c.checked,
        })) as Cell[],
        participants: (partsR.data || []) as Participant[],
      };
    },
  });

  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['expertise-matrix-mirror', proposalId] });
      qc.invalidateQueries({ queryKey: ['expertise-matrix-mirror-enabled', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId]);

  if (enabledQ.data === false) return null;
  if (!dataQ.data) return null;

  const { rows, cols, cells, participants } = dataQ.data;
  const partById = new Map(participants.map((p) => [p.id, p]));

  const partCols = cols
    .filter((c) => c.kind === 'participant')
    .sort((a, b) => {
      const pa = a.participant_id ? partById.get(a.participant_id)?.participant_number ?? 9999 : 9999;
      const pb = b.participant_id ? partById.get(b.participant_id)?.participant_number ?? 9999 : 9999;
      return pa - pb;
    });
  const customCols = cols.filter((c) => c.kind === 'custom').sort((a, b) => a.order_index - b.order_index);
  const orderedCols = [...partCols, ...customCols];

  const cellMap = new Map<string, boolean>();
  for (const c of cells) cellMap.set(`${c.row_id}::${c.column_id}`, c.checked);

  // Heuristic content lengths for the rotated headers (px when rendered horizontally,
  // which becomes the column's vertical clearance after a -90° rotation).
  const headerContentPx = orderedCols.map((c) => {
    if (c.kind === 'participant') {
      const p = c.participant_id ? partById.get(c.participant_id) : undefined;
      const label = `${p?.participant_number ?? ''}. ${p?.organisation_short_name ?? ''}`;
      // 11pt Times bold ≈ 7.5px/char + 16px pill chrome.
      return Math.ceil(label.length * 7.5) + 16;
    }
    // Custom header: 10pt regular ≈ 6px/char, allow some min.
    const t = (c.header_text || '').trim();
    return Math.max(28, Math.ceil(t.length * 6) + 8);
  });

  // Header row height = tallest rotated header (its horizontal length) + breathing room.
  const headerRowHeightPx = (headerContentPx.length ? Math.max(...headerContentPx) : 24) + 8;

  // Rotated badge thickness defines the natural column width.
  // Participant pill: ~17px tall + chrome → 22px. Custom text: ~16px tall.
  const ROTATED_COL_MIN_PX = 22;

  // Expertise column: size to its widest label (≈ 6.5px/char, 11pt Times regular).
  const maxExpertiseChars = rows.reduce((m, r) => Math.max(m, (r.label || '').length), 'Expertise'.length);
  const expertiseColPx = Math.min(420, Math.max(80, Math.ceil(maxExpertiseChars * 6.5) + 16));

  // Width division logic:
  // Container assumed 18cm ≈ 680px. After expertise, share remainder equally among check cols.
  // Each check col gets max(ROTATED_COL_MIN_PX, equalShare). If any single col needs more than its
  // share (it doesn't here — min is fixed), it would take its min and the rest re-divide leftover.
  const ASSUMED_CONTAINER_PX = 680;
  const numChecks = orderedCols.length;
  const remainingPx = Math.max(numChecks * ROTATED_COL_MIN_PX, ASSUMED_CONTAINER_PX - expertiseColPx);
  const equalShare = numChecks > 0 ? Math.floor(remainingPx / numChecks) : 0;
  const checkColWidthPx = Math.max(ROTATED_COL_MIN_PX, equalShare);

  return (
    <div className="b31-tables-container space-y-1 [&_p]:!my-0 mt-[2px]">
      <EditableCaption
        proposalId={proposalId}
        tableKey="b32-expertise-matrix"
        label="Table 3.2.a."
        defaultCaption="Expertise of participants"
      />
      <table
        className={`platform-table platform-table--tight ${tableFont}`}
        style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}
      >
        <colgroup>
          <col style={{ width: `${expertiseColPx}px` }} />
          {orderedCols.map((c) => (
            <col key={c.id} style={{ width: `${checkColWidthPx}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: `${headerRowHeightPx}px` }}>
            <th className="cell-pl-0 py-0 text-[10pt] text-left align-bottom">Expertise</th>
            {orderedCols.map((c, idx) => {
              const contentPx = headerContentPx[idx];
              return (
                <th
                  key={c.id}
                  className="cell-p0 align-bottom"
                  style={{ height: `${headerRowHeightPx}px`, padding: 0, verticalAlign: 'bottom' }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: `${headerRowHeightPx}px`,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        left: '50%',
                        transform: 'translateX(-50%) rotate(-90deg)',
                        transformOrigin: 'center center',
                        whiteSpace: 'nowrap',
                        // After rotation, this element's visual height = its width.
                        // Reserve content width so the rotated element stays inside the row.
                        width: `${contentPx}px`,
                        textAlign: 'center',
                      }}
                    >
                      {c.kind === 'participant'
                        ? (() => {
                            const p = c.participant_id ? partById.get(c.participant_id) : undefined;
                            return (
                              <ParticipantBubble
                                number={p?.participant_number ?? undefined}
                                shortName={p?.organisation_short_name || ''}
                              />
                            );
                          })()
                        : (
                          <span className="text-[10pt] leading-tight">
                            {c.header_text || ''}
                          </span>
                        )}
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr]:border-black/10 [&_tr:last-child]:border-0">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={1 + orderedCols.length} className="align-middle px-2 py-0 leading-tight text-muted-foreground italic">
                No expertise rows defined.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td className="align-middle cell-pl-0 py-0 leading-tight text-[11pt]">{r.label}</td>
                {orderedCols.map((c) => {
                  const checked = cellMap.get(`${r.id}::${c.id}`) === true;
                  return (
                    <td key={c.id} className="align-middle cell-p0 leading-tight text-center">
                      {checked ? (
                        <Check className="inline-block h-4 w-4" style={{ color: '#16a34a' }} strokeWidth={3} />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
