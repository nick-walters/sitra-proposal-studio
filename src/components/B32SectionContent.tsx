import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { ParticipantBubble } from './B31Pill';
import { Check } from 'lucide-react';
import { useProposalRole } from '@/hooks/useProposalRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';

interface Props {
  proposalId: string;
}

const tableFont = "font-['Times_New_Roman',Times,serif] text-[11pt]";

// 1cm cap (~37.8px) — used ONLY as the default initial width for check columns.
const ONE_CM_PX = 38;
const ROTATED_COL_MIN_PX = 22;
// 3pt = ~4px clearance between rotated badge bottom and the header bottom border.
const HEADER_BOTTOM_GAP_PX = 4;
// Rotated badge "thickness" (perpendicular to text direction) — fits a 24px-tall pill.
const ROTATED_BADGE_THICKNESS_PX = 26;

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
  const { roleTier } = useProposalRole(proposalId);
  const canResize = roleTier === 'coordinator';

  const enabledQ = useQuery({
    queryKey: ['expertise-matrix-mirror-enabled', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('expertise_matrix_enabled,expertise_matrix_header_height')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return {
        enabled: (data?.expertise_matrix_enabled ?? true) as boolean,
        headerHeight: (data?.expertise_matrix_header_height ?? null) as number | null,
      };
    },
  });

  const dataQ = useQuery({
    queryKey: ['expertise-matrix-mirror', proposalId],
    enabled: !!proposalId && enabledQ.data?.enabled === true,
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

  // Persisted header-row height (null = auto).
  const persistedHeight = enabledQ.data?.headerHeight ?? null;
  const [overrideHeight, setOverrideHeight] = useState<number | null>(null);
  useEffect(() => { setOverrideHeight(persistedHeight); }, [persistedHeight]);

  const dragStateRef = useRef<{ startY: number; startH: number; min: number; max: number; latest: number } | null>(null);

  // Column-width resize (reuse the B3.1 mirror's persistence path).
  const totalCols = 1 + ((dataQ.data?.cols.length) ?? 0);
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId,
    tableKey: 'b32-expertise-matrix',
    canResize,
    minWidth: ROTATED_COL_MIN_PX,
  });
  const hasManualWidths = colWidths.length === totalCols && colWidths.every((w) => Number.isFinite(w));

  if (enabledQ.data?.enabled === false) return null;
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
  const lastColIdx = orderedCols.length; // index of the final column in the table (0 = expertise)

  const cellMap = new Map<string, boolean>();
  for (const c of cells) cellMap.set(`${c.row_id}::${c.column_id}`, c.checked);

  // Rotated header content lengths in px (becomes vertical clearance after rotation).
  const headerContentPx = orderedCols.map((c) => {
    if (c.kind === 'participant') {
      const p = c.participant_id ? partById.get(c.participant_id) : undefined;
      const label = `${p?.participant_number ?? ''}. ${p?.organisation_short_name ?? ''}`;
      return Math.ceil(label.length * 7.5) + 16;
    }
    const t = (c.header_text || '').trim();
    return Math.max(28, Math.ceil(t.length * 6) + 8);
  });

  // Min header height = tallest badge + 3pt gap above the bottom border.
  const autoHeaderHeightPx =
    (headerContentPx.length ? Math.max(...headerContentPx) : 24) + HEADER_BOTTOM_GAP_PX;
  const minHeaderHeightPx = autoHeaderHeightPx;
  const maxHeaderHeightPx = 480;
  const effectiveHeaderHeightPx = Math.max(
    minHeaderHeightPx,
    Math.min(maxHeaderHeightPx, overrideHeight ?? autoHeaderHeightPx),
  );

  // Expertise column width: ≈ 6.5px/char (11pt Times regular), clamped.
  const maxExpertiseChars = rows.reduce(
    (m, r) => Math.max(m, (r.label || '').length),
    'Expertise'.length,
  );
  const expertiseColPx = Math.min(420, Math.max(80, Math.ceil(maxExpertiseChars * 6.5) + 16));

  // AUTO width logic (only used when no manual widths persisted):
  //  - Every check column capped at ONE_CM_PX (1cm), min ROTATED_COL_MIN_PX.
  //  - If no expertise label needs wrapping, table shrinks to its content.
  const ASSUMED_CONTAINER_PX = 680;
  const numChecks = orderedCols.length;
  const PX_PER_EXPERTISE_CHAR = 6.5;
  const expertiseContentNeedsPx = (label: string) =>
    Math.ceil(label.length * PX_PER_EXPERTISE_CHAR) + 16;
  const anyExpertiseWraps = rows.some(
    (r) => expertiseContentNeedsPx(r.label || '') > expertiseColPx,
  );
  const autoCheckColWidthPx = Math.max(
    ROTATED_COL_MIN_PX,
    Math.min(
      ONE_CM_PX,
      numChecks > 0
        ? Math.floor((ASSUMED_CONTAINER_PX - expertiseColPx) / numChecks)
        : ONE_CM_PX,
    ),
  );

  // Per-column width resolution: manual wins (no 1cm clamp), else auto default.
  const colWidthFor = (i: number): number => {
    if (hasManualWidths) return colWidths[i];
    return i === 0 ? expertiseColPx : autoCheckColWidthPx;
  };

  const autoContentWidthPx = expertiseColPx + numChecks * autoCheckColWidthPx;
  const manualContentWidthPx = hasManualWidths ? colWidths.reduce((s, w) => s + w, 0) : 0;
  const tableWidthStyle: React.CSSProperties = hasManualWidths
    ? { width: `${manualContentWidthPx}px` }
    : anyExpertiseWraps
      ? { width: '100%' }
      : { width: `${autoContentWidthPx}px` };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStateRef.current = {
      startY: e.clientY,
      startH: effectiveHeaderHeightPx,
      min: minHeaderHeightPx,
      max: maxHeaderHeightPx,
      latest: effectiveHeaderHeightPx,
    };
    const onMove = (ev: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const next = Math.max(st.min, Math.min(st.max, st.startH + (ev.clientY - st.startY)));
      st.latest = next;
      setOverrideHeight(next);
    };
    const onUp = async () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const final = dragStateRef.current?.latest ?? null;
      dragStateRef.current = null;
      if (final != null) {
        await supabase
          .from('proposals')
          .update({ expertise_matrix_header_height: final })
          .eq('id', proposalId);
        qc.invalidateQueries({ queryKey: ['expertise-matrix-mirror-enabled', proposalId] });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="b31-tables-container space-y-1 [&_p]:!my-0 mt-[2px]">
      <EditableCaption
        proposalId={proposalId}
        tableKey="b32-expertise-matrix"
        label="Table 3.2.a."
        defaultCaption="Expertise of participants"
      />
      <table
        ref={tableRef}
        className={`platform-table platform-table--tight ${tableFont}`}
        style={{ tableLayout: 'fixed', borderCollapse: 'collapse', ...tableWidthStyle }}
      >
        <colgroup>
          <col style={{ width: `${colWidthFor(0)}px` }} />
          {orderedCols.map((c, i) => (
            <col key={c.id} style={{ width: `${colWidthFor(i + 1)}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: `${effectiveHeaderHeightPx}px` }}>
            <th
              className="cell-pl-0 py-0 text-[10pt] text-left align-bottom"
              style={{ position: 'relative' }}
            >
              <span>Expertise</span>
              {canResize && 0 < lastColIdx && (
                <ColumnResizer onMouseDown={handleColResizeStart(0)} />
              )}
              {canResize && (
                <div
                  onMouseDown={onResizeMouseDown}
                  title="Drag to resize header height"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -3,
                    height: 6,
                    cursor: 'row-resize',
                    zIndex: 5,
                  }}
                />
              )}
            </th>
            {orderedCols.map((c, idx) => {
              const contentPx = headerContentPx[idx];
              const colIdx = idx + 1;
              return (
                <th
                  key={c.id}
                  className="cell-p0 align-bottom relative"
                  style={{ height: `${effectiveHeaderHeightPx}px`, padding: 0, verticalAlign: 'bottom' }}
                >
                  {/* Wrapper pinned to the cell bottom; its bottom edge = (cell bottom − 4px gap).
                      Inner rotated content is centered inside this wrapper, so the wrapper's
                      bottom edge IS the visual bottom of the rotated badge — independent of
                      header height. Growing the header only adds empty space ABOVE. */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: `${HEADER_BOTTOM_GAP_PX}px`,
                      transform: 'translateX(-50%)',
                      width: `${ROTATED_BADGE_THICKNESS_PX}px`,
                      height: `${contentPx}px`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'visible',
                    }}
                  >
                    <div
                      style={{
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'center center',
                        whiteSpace: 'nowrap',
                        lineHeight: 1,
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
                  {canResize && colIdx < lastColIdx && (
                    <ColumnResizer onMouseDown={handleColResizeStart(colIdx)} />
                  )}
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
