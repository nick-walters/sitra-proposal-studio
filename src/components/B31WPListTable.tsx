import { useState, useCallback } from 'react';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import { supabase } from '@/integrations/supabase/client';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EditableCaption } from '@/components/EditableCaption';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "!px-[1pt] !py-0 px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId?: string;
}

/* Inline editable text cell */
function InlineEdit({
  value,
  onSave,
  className = '',
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const startEdit = () => {
    setEditValue(value);
    setEditing(true);
  };

  const save = () => {
    setEditing(false);
    if (editValue !== value) onSave(editValue);
  };

  if (editing) {
    return (
      <input
        type="text"
        className={`bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt] w-full ${className}`}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        autoFocus
      />
    );
  }

  return (
    <span className={`cursor-text hover:bg-muted/30 ${className}`} onClick={startEdit}>
      {value || '—'}
    </span>
  );
}

/* Participant picker for WP lead */
function LeadPicker({
  wpId,
  currentLeaderId,
  participants,
  proposalId,
}: {
  wpId: string;
  currentLeaderId: string | null;
  participants: B31Participant[];
  proposalId: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const leader = participants.find(p => p.id === currentLeaderId);

  const select = async (pid: string) => {
    setOpen(false);
    await supabase.from('wp_drafts').update({ lead_participant_id: pid }).eq('id', wpId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80">
          {leader ? (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold italic whitespace-nowrap align-middle"
              style={{ backgroundColor: '#000000', color: '#FFFFFF', lineHeight: 1 }}
            >
              {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
            </span>
          ) : (
            <span className="text-muted-foreground text-[9pt] italic">Select…</span>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {participants.map(p => (
            <button
              key={p.id}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                p.id === currentLeaderId && 'bg-accent',
              )}
              onClick={() => select(p.id)}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  p.id === currentLeaderId ? 'bg-primary border-primary' : 'border-muted-foreground',
                )}
              >
                {p.id === currentLeaderId && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="truncate">
                {p.participant_number}. {p.organisation_short_name || p.organisation_name}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function B31WPListTable({ wpData, participants, proposalId }: Props) {
  const queryClient = useQueryClient();
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, setColWidths, tableRef, handleColResizeStart, saveWidths } = useColumnResize({ proposalId, tableKey: 'wp-list', canResize: isAdminOrOwner });
  const [editingCell, setEditingCell] = useState<{ wpId: string; field: 'pm' | 'duration' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const getComputedDuration = (wp: B31WPData) => {
    const months = wp.tasks.flatMap(t => [t.start_month, t.end_month]).filter((m): m is number => m != null);
    if (months.length === 0) return '';
    const min = Math.min(...months);
    const max = Math.max(...months);
    return `M${String(min).padStart(2, '0')}–M${String(max).padStart(2, '0')}`;
  };

  const getComputedPM = (wp: B31WPData) => {
    let total = 0;
    wp.tasks.forEach(t => t.effort?.forEach(e => { total += e.person_months || 0; }));
    return total;
  };

  const startEdit = (wpId: string, field: 'pm' | 'duration', currentValue: string) => {
    setEditingCell({ wpId, field });
    setEditValue(currentValue);
  };

  const saveEdit = useCallback(async () => {
    if (!editingCell || !proposalId) return;
    const { wpId, field } = editingCell;

    const update: Record<string, any> = {};
    if (field === 'pm') {
      const num = parseFloat(editValue);
      update.manual_person_months = editValue.trim() === '' ? null : (isNaN(num) ? null : num);
    } else {
      update.manual_duration = editValue.trim() === '' ? null : editValue.trim();
    }

    await supabase.from('wp_drafts').update(update).eq('id', wpId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
    setEditingCell(null);
  }, [editingCell, editValue, proposalId, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') setEditingCell(null);
  };

  const saveWPField = async (wpId: string, field: string, value: string) => {
    if (!proposalId) return;
    await supabase.from('wp_drafts').update({ [field]: value || null }).eq('id', wpId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
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

  if (wpData.length === 0) return null;

  return (
    <div>
      {isAdminOrOwner && (
        <div className="print:hidden flex justify-end gap-1 mb-1">
          <Button variant="outline" size="sm" onClick={autoFitColumns} className="text-xs h-6 px-2 py-0">
            <Columns3 className="h-3 w-3 mr-1" /> Auto-resize columns
          </Button>
        </div>
      )}
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
            <TableHead className={`${cellStyles} whitespace-nowrap relative font-bold`} style={colWidths.length > 0 ? { width: colWidths[2] } : undefined}>
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
            const displayPM = wp.manual_person_months != null ? wp.manual_person_months : (computedPM > 0 ? computedPM : '');
            const displayDuration = wp.manual_duration || computedDuration || '';
            const shortName = wp.short_name || wp.title || `WP${wp.number}`;
            const title = wp.title || `Work Package ${wp.number}`;

            const isEditingPM = editingCell?.wpId === wp.id && editingCell.field === 'pm';
            const isEditingDur = editingCell?.wpId === wp.id && editingCell.field === 'duration';

            return (
              <TableRow key={wp.id}>
                <TableCell className={`${editableCellStyles} leading-[0]`}>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded-full text-white text-[9pt] font-bold whitespace-nowrap align-middle"
                    style={{ backgroundColor: wp.color || '#666', lineHeight: 1 }}
                  >
                    WP{wp.number}: {shortName} –&nbsp;
                    <InlineEdit
                      value={title}
                      onSave={(val) => saveWPField(wp.id, 'title', val)}
                      className="text-white text-[9pt] font-bold"
                    />
                  </span>
                </TableCell>
                <TableCell className={`${editableCellStyles} whitespace-nowrap leading-[0]`}>
                  {proposalId ? (
                    <LeadPicker
                      wpId={wp.id}
                      currentLeaderId={wp.lead_participant_id}
                      participants={participants}
                      proposalId={proposalId}
                    />
                  ) : '—'}
                </TableCell>
                <TableCell
                  className={`${editableCellStyles} whitespace-nowrap`}
                  onClick={() => !isEditingPM && startEdit(wp.id, 'pm', String(displayPM))}
                >
                  {isEditingPM ? (
                    <input
                      type="text"
                      className="w-full bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt]"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  ) : (
                    displayPM || '—'
                  )}
                </TableCell>
                <TableCell
                  className={`${editableCellStyles} whitespace-nowrap`}
                  onClick={() => !isEditingDur && startEdit(wp.id, 'duration', String(displayDuration))}
                >
                  {isEditingDur ? (
                    <input
                      type="text"
                      className="w-full bg-transparent outline-none border-none p-0 m-0 font-['Times_New_Roman',Times,serif] text-[11pt]"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  ) : (
                    displayDuration || '—'
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
