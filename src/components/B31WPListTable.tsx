import { useCallback, useEffect } from 'react';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { WPBubble, ParticipantBubble } from '@/components/B31Pill';
import { EditableCaption } from '@/components/EditableCaption';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "!px-[1pt] !py-0 px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId?: string;
}

/**
 * Table 3.1.a — read-only live mirror of wp_drafts.
 * No editable fields. All edits happen in the WP manager / A3.
 */
export function B31WPListTable({ wpData, participants, proposalId }: Props) {
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart, setColWidths, saveWidths } = useColumnResize({ proposalId, tableKey: 'wp-list', canResize: isAdminOrOwner });

  const getComputedDuration = (wp: B31WPData) => {
    const months = wp.tasks.flatMap(t => [t.start_month, t.end_month]).filter((m): m is number => m != null);
    if (months.length === 0) return '';
    const min = Math.min(...months);
    const max = Math.max(...months);
    return `M${String(min).padStart(2, '0')}–M${String(max).padStart(2, '0')}`;
  };

  const getComputedPM = (wp: B31WPData) => {
    // Auto-calculated from A3 staff effort total (wp_draft_effort) per WP.
    return (wp.wp_effort || []).reduce((sum, e) => sum + (e.person_months || 0), 0);
  };

  const autoFitColumns = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const widths = computeAutoFitSmart(table);
    if (widths) {
      setColWidths(widths);
      saveWidths(widths);
    }
  }, [tableRef, setColWidths, saveWidths]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tableId?: string }>).detail;
      if (detail?.tableId !== 'b31-wp-list') return;
      autoFitColumns();
    };
    window.addEventListener('b31-table-autoresize', handler as EventListener);
    return () => window.removeEventListener('b31-table-autoresize', handler as EventListener);
  }, [autoFitColumns]);

  const dispatchToolbarFocus = useCallback(() => {
    window.dispatchEvent(new CustomEvent('b31-table-focus', {
      detail: { tableId: 'b31-wp-list' },
    }));
  }, []);

  if (wpData.length === 0) return null;

  return (
    <div onFocusCapture={dispatchToolbarFocus}>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.a"
        label="Table 3.1.a."
        defaultCaption="List of work packages"
        className="mb-0"
      />
      <Table className={`${tableStyles} [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto', width: colWidths.length > 0 ? `${colWidths.reduce((s, w) => s + w, 0)}px` : '100%', borderCollapse: 'collapse' }} ref={tableRef}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${cellStyles} relative font-bold`} style={colWidths.length > 0 ? { width: colWidths[0] } : undefined}>
              Work package
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
            </TableHead>
            <TableHead className={`${cellStyles} whitespace-nowrap relative font-bold`} style={colWidths.length > 0 ? { width: colWidths[1] } : undefined}>
              WP leader
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
            </TableHead>
            <TableHead className={`${cellStyles} relative font-bold`} style={colWidths.length > 0 ? { width: colWidths[2] } : { width: '60px' }}>
              Person months
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
            </TableHead>
            <TableHead className={`${cellStyles} whitespace-nowrap relative font-bold`} style={colWidths.length > 0 ? { width: colWidths[3] } : undefined}>
              Duration
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(3)} />}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {wpData.map(wp => {
            const computedPM = getComputedPM(wp);
            const computedDuration = getComputedDuration(wp);
            const displayPM = computedPM > 0 ? computedPM : '';
            const displayDuration = wp.manual_duration || computedDuration || '';
            const shortName = wp.short_name || '';
            const title = wp.title || '';
            const leader = participants.find(p => p.id === wp.lead_participant_id);

            return (
              <TableRow key={wp.id}>
                <TableCell className={`${cellStyles} leading-[0]`}>
                  <WPBubble wpColor={wp.color || '#666'}>
                    WP{wp.number}: {shortName}{shortName && title ? ' – ' : ''}{title}
                  </WPBubble>
                </TableCell>
                <TableCell className={`${cellStyles} whitespace-nowrap leading-[0]`}>
                  {leader ? (
                    <ParticipantBubble>
                      {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
                    </ParticipantBubble>
                  ) : '—'}
                </TableCell>
                <TableCell className={`${cellStyles} whitespace-nowrap`}>
                  {displayPM || '—'}
                </TableCell>
                <TableCell className={`${cellStyles} whitespace-nowrap`}>
                  {displayDuration || '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
