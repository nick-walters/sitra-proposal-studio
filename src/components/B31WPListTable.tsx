import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';
import { useQueryClient } from '@tanstack/react-query';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "border border-black px-0.5 py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle text-left";
const headerCellStyles = "border border-black px-0.5 py-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold text-white bg-black text-left align-middle";
const editableCellStyles = `${cellStyles} cursor-text hover:bg-muted/30`;

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId?: string;
}

export function B31WPListTable({ wpData, participants, proposalId }: Props) {
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<{ wpId: string; field: 'pm' | 'duration' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const getParticipant = (id: string | null) => participants.find(p => p.id === id);

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

  if (wpData.length === 0) return null;

  return (
    <div>
      <p className={`${tableStyles} italic mb-0`}>
        <span className="font-bold italic">Table 3.1.a.</span> List of work packages
      </p>
      <table className={`${tableStyles} w-full border-collapse`}>
        <thead>
          <tr>
            <th className={`${headerCellStyles} whitespace-nowrap`}>No. &amp; short name</th>
            <th className={headerCellStyles}>Work package title</th>
            <th className={`${headerCellStyles} whitespace-nowrap`}>Lead</th>
            <th className={`${headerCellStyles} whitespace-nowrap`}>Person months</th>
            <th className={`${headerCellStyles} whitespace-nowrap`}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {wpData.map(wp => {
            const lead = getParticipant(wp.lead_participant_id);
            const computedPM = getComputedPM(wp);
            const computedDuration = getComputedDuration(wp);
            const displayPM = wp.manual_person_months != null ? wp.manual_person_months : (computedPM > 0 ? computedPM : '');
            const displayDuration = wp.manual_duration || computedDuration || '';
            const shortName = wp.short_name || wp.title || `WP${wp.number}`;
            const title = wp.title || `Work Package ${wp.number}`;

            const isEditingPM = editingCell?.wpId === wp.id && editingCell.field === 'pm';
            const isEditingDur = editingCell?.wpId === wp.id && editingCell.field === 'duration';

            return (
              <tr key={wp.id}>
                <td className={`${cellStyles} whitespace-nowrap leading-[0]`}>
                  <span
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-white text-[9pt] font-bold whitespace-nowrap align-middle"
                    style={{ backgroundColor: wp.color || '#666', lineHeight: 1 }}
                  >
                    WP{wp.number}: {shortName}
                  </span>
                </td>
                <td className={cellStyles}>
                  {title && shortName !== title ? title : (shortName !== `WP${wp.number}` ? title || '' : `Work Package ${wp.number}`)}
                </td>
                <td className={`${cellStyles} whitespace-nowrap leading-[0]`}>
                  {lead ? (
                     <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold italic whitespace-nowrap align-middle"
                      style={{ backgroundColor: '#000000', color: '#FFFFFF', lineHeight: 1 }}
                    >
                      {lead.participant_number}. {lead.organisation_short_name || lead.organisation_name}
                    </span>
                  ) : '—'}
                </td>
                <td
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
                </td>
                <td
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
