import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, ArrowUpDown, Settings2, Hash, CalendarDays } from 'lucide-react';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { useUserRole } from '@/hooks/useUserRole';
import { DeliverableTaskMappingDialog } from './DeliverableTaskMappingDialog';
import { MilestoneTaskMappingDialog } from './MilestoneTaskMappingDialog';
import {
  B31SortableTable,
  B31Column,
  CaptionIconButton,
  cellStyles,
  bubbleCellStyles,
} from './B31SortableTable';
import { WPBubble, RiskBadge, ParticipantBubble } from './B31Pill';

interface B31TablesEditorProps {
  proposalId: string;
}

interface WorkPackage {
  id: string;
  number: number;
  title: string;
  short_name: string;
  color: string;
}

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface Deliverable {
  id: string;
  number: string;
  name: string;
  description: string;
  wp_number: number | null;
  lead_participant_id: string | null;
  type: string | null;
  dissemination_level: string | null;
  due_month: number | null;
  order_index: number;
}

interface Milestone {
  id: string;
  number: number;
  name: string;
  wps: string;
  due_month: number | null;
  means_of_verification: string;
  order_index: number;
}

interface Risk {
  id: string;
  number: number;
  description: string;
  wps: string;
  likelihood: 'L' | 'M' | 'H' | null;
  severity: 'L' | 'M' | 'H' | null;
  mitigation: string;
  order_index: number;
}

// Generate month options dynamically based on project duration
function getMonthOptions(projectDuration: number) {
  return Array.from({ length: projectDuration }, (_, i) => ({
    value: i + 1,
    label: `M${String(i + 1).padStart(2, '0')}`,
  }));
}

// Hook to fetch project duration
function useProjectDuration(proposalId: string) {
  const { data } = useQuery({
    queryKey: ['proposal-duration', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('duration')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data?.duration || 36;
    },
  });
  return data || 36;
}

// Risk level options with colors and sort order
const riskLevelOptions = [
  { value: 'H', label: 'High', borderColor: 'border-red-500', textColor: 'text-red-500', order: 0 },
  { value: 'M', label: 'Medium', borderColor: 'border-amber-500', textColor: 'text-amber-500', order: 1 },
  { value: 'L', label: 'Low', borderColor: 'border-green-500', textColor: 'text-green-500', order: 2 },
];

// Deliverable types
const deliverableTypes = [
  { value: 'R', label: 'Report' },
  { value: 'DEM', label: 'Demonstrator' },
  { value: 'DEC', label: 'Websites' },
  { value: 'DATA', label: 'Data sets' },
  { value: 'DMP', label: 'Data Management Plan' },
  { value: 'ETHICS', label: 'Ethics' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'OTHER', label: 'Other' },
];

// Dissemination levels
const disseminationLevels = [
  { value: 'PU', label: 'Public' },
  { value: 'SEN', label: 'Sensitive' },
  { value: 'EU-RES', label: 'EU Restricted' },
  { value: 'EU-CON', label: 'EU Confidential' },
  { value: 'EU-SEC', label: 'EU Secret' },
];

// Editable div that renders HTML content (e.g. WP reference spans) and saves as HTML
function EditableHtml({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFocused = useRef(false);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (divRef.current) {
      divRef.current.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isFocused.current && divRef.current && value !== lastValueRef.current) {
      divRef.current.innerHTML = value || '';
      lastValueRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const handleInput = () => {
    const html = divRef.current?.innerHTML || '';
    lastValueRef.current = html;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => { onChange(html); }, 500);
  };

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          const html = divRef.current?.innerHTML || '';
          if (html !== lastValueRef.current) onChange(html);
        }
      }}
      data-placeholder={placeholder}
      className="bg-transparent border-0 p-0 m-0 resize-none focus:outline-none focus:ring-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight w-full empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
      style={{ minHeight: '1em', lineHeight: '1.2' }}
    />
  );
}

// Inline editable text that expands to multiple lines
function EditableText({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  inline?: boolean;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current && divRef.current) {
      divRef.current.textContent = value || '';
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const text = divRef.current?.textContent || '';
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onChange(text);
    }, 500);
  }, [onChange]);

  const flushAndBlur = useCallback(() => {
    isFocused.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const text = divRef.current?.textContent || '';
    onChange(text);
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={() => { isFocused.current = true; }}
      onBlur={flushAndBlur}
      data-placeholder={placeholder}
      className={`bg-transparent focus:outline-none font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight w-full empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none ${className}`}
      style={{
        minHeight: '1em',
        lineHeight: '1.2',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    />
  );
}

// Inline editable text using contenteditable for true inline flow
function EditableTextInline({
  value,
  onChange,
  placeholder,
  inheritFont = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  inheritFont?: boolean;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFocused = useRef(false);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (spanRef.current) {
      spanRef.current.textContent = value || '';
    }
    lastValueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isFocused.current && spanRef.current && value !== lastValueRef.current) {
      spanRef.current.textContent = value || '';
      lastValueRef.current = value;
    }
  }, [value]);

  const handleInput = () => {
    const newValue = spanRef.current?.textContent || '';
    lastValueRef.current = newValue;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <span
      ref={spanRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          const text = spanRef.current?.textContent || '';
          if (text !== lastValueRef.current) onChange(text);
        }
      }}
      data-placeholder={placeholder}
      className={`outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground ${inheritFont ? '' : "font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"}`}
      style={{ display: 'inline', lineHeight: 1, ...(inheritFont ? { fontFamily: 'inherit', fontSize: 'inherit' } : {}) }}
    />
  );
}

// Compact month selector
function MonthSelect({
  value,
  onChange,
  projectDuration = 36,
}: {
  value: number | null;
  onChange: (val: number | null) => void;
  projectDuration?: number;
}) {
  const options = getMonthOptions(projectDuration);
  return (
    <Select
      value={value?.toString() || ''}
      onValueChange={(v) => onChange(v ? parseInt(v) : null)}
    >
      <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex font-['Times_New_Roman',Times,serif] text-[11pt]">
        <SelectValue placeholder="-">
          <span className="font-['Times_New_Roman',Times,serif] text-[11pt]">{value ? `M${String(value).padStart(2, '0')}` : '-'}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background z-50 max-h-60">
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value.toString()}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// WPBubble and RiskBadge are imported from './B31Pill'

function SingleWPSelector({
  value,
  onChange,
  workPackages,
}: {
  value: number | null;
  onChange: (val: number | null) => void;
  workPackages: WorkPackage[];
}) {
  const selectedWP = workPackages.find(wp => wp.number === value);

  return (
    <Select
      value={value?.toString() || ''}
      onValueChange={(v) => onChange(v ? parseInt(v) : null)}
    >
      <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex items-center overflow-visible">
        <SelectValue placeholder="-">
          {selectedWP ? <WPBubble wpNumber={selectedWP.number} wpColor={selectedWP.color || '#666'} style={{ position: 'relative', top: '-1px' }} /> : <span className="font-['Times_New_Roman',Times,serif] text-[11pt]">-</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background z-50">
        {workPackages.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">No WPs defined yet</div>
        ) : (
          workPackages.map(wp => (
            <SelectItem key={wp.id} value={wp.number.toString()}>
              <div className="flex items-center gap-2">
                <WPBubble wpNumber={wp.number} wpColor={wp.color || '#666'} style={{ position: 'relative', top: '-1px' }} />
                <span className="text-sm">{wp.short_name || wp.title}</span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function MultiWPSelector({
  value,
  onChange,
  workPackages,
}: {
  value: string;
  onChange: (val: string) => void;
  workPackages: WorkPackage[];
}) {
  const selectedNumbers = value ? value.split(',').map(n => parseInt(n.trim().replace(/^WP/i, ''))).filter(n => !isNaN(n)) : [];
  const selectedWPs = workPackages.filter(wp => selectedNumbers.includes(wp.number));
  const [open, setOpen] = useState(false);

  const toggleWP = (wpNumber: number) => {
    if (selectedNumbers.includes(wpNumber)) {
      onChange(selectedNumbers.filter(n => n !== wpNumber).join(', '));
    } else {
      onChange([...selectedNumbers, wpNumber].sort((a, b) => a - b).join(', '));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex flex-wrap gap-0.5 items-center min-h-[1.2em] text-left">
          {selectedWPs.length > 0 ? (
            selectedWPs.map(wp => (
              <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color || '#666'} style={{ position: 'relative', top: '-1px' }} />
            ))
          ) : (
            <span className="font-['Times_New_Roman',Times,serif] text-[11pt] text-muted-foreground">-</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-background z-50" align="start">
        {workPackages.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">No WPs defined yet</div>
        ) : (
          <div className="space-y-1">
            {workPackages.map(wp => (
              <label key={wp.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-muted rounded">
                <Checkbox
                  checked={selectedNumbers.includes(wp.number)}
                  onCheckedChange={() => toggleWP(wp.number)}
                />
                <WPBubble wpNumber={wp.number} wpColor={wp.color || '#666'} style={{ position: 'relative', top: '-1px' }} />
                <span className="text-sm truncate">{wp.short_name || wp.title}</span>
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// RiskBadge is imported from './B31Pill'

function useWorkPackages(proposalId: string) {
  return useQuery({
    queryKey: ['wp-drafts-for-b31', proposalId],
    queryFn: async () => {
      const { data: wps, error: wpError } = await supabase
        .from('wp_drafts')
        .select('id, number, title, color')
        .eq('proposal_id', proposalId)
        .order('number');
      if (wpError) throw wpError;

      return (wps || []).map(wp => ({
        id: wp.id,
        number: wp.number,
        title: wp.title || `WP${wp.number}`,
        short_name: wp.title?.split(':')[0]?.trim() || wp.title || `WP${wp.number}`,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
      })) as WorkPackage[];
    },
  });
}

function useParticipants(proposalId: string) {
  return useQuery({
    queryKey: ['participants', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as Participant[];
    },
  });
}

// ========== DELIVERABLES TABLE (3.1c) ==========
export function B31DeliverablesTable({ proposalId }: { proposalId: string }) {
  const projectDuration = useProjectDuration(proposalId);
  const { data: workPackages = [] } = useWorkPackages(proposalId);
  const { data: participants = [] } = useParticipants(proposalId);
  const { isAdminOrOwner } = useUserRole();

  const [deliverableOrderMode, setDeliverableOrderMode] = useState<'number' | 'month'>('number');

  const columns: B31Column<Deliverable>[] = [
    {
      key: 'no',
      header: 'No.',
      defaultHeaderStyle: { width: '48px', whiteSpace: 'nowrap' },
      minWidth: 48,
      cellClassName: bubbleCellStyles,
      cellStyle: { whiteSpace: 'nowrap', width: '48px', position: 'relative', zIndex: 2 },
      renderCell: (del, updateRow) => {
        const wpColor = del.wp_number != null
          ? workPackages.find(wp => wp.number === del.wp_number)?.color || '#000'
          : '#000';
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              height: '17px',
              padding: '0 10px 0 5px',
              fontFamily: "'Times New Roman', Times, serif",
              fontSize: '11pt',
              fontWeight: 700,
              lineHeight: 1,
              color: wpColor,
              whiteSpace: 'nowrap',
              verticalAlign: 'baseline',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: wpColor,
                clipPath: 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: '1.5px',
                bottom: '1.5px',
                left: '1.5px',
                right: '2.5px',
                backgroundColor: '#ffffff',
                clipPath: 'polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)',
              }}
            />
            <span style={{ position: 'relative', zIndex: 1 }}>
              <EditableTextInline
                value={del.number}
                onChange={(val) => updateRow(del.id, { number: val })}
                placeholder="D#.#"
                inheritFont
              />
            </span>
          </span>
        );
      },
    },
    {
      key: 'title',
      header: 'Deliverable title',
      cellClassName: cellStyles,
      cellStyle: { lineHeight: 1.2 },
      renderCell: (del, updateRow) => (
        <span className="font-['Times_New_Roman',Times,serif] text-[11pt]" style={{ lineHeight: 1.2 }}>
          <EditableTextInline
            value={del.name}
            onChange={(val) => updateRow(del.id, { name: val })}
            placeholder="Deliverable name"
          />
        </span>
      ),
    },
    {
      key: 'wp',
      header: 'WP',
      defaultHeaderStyle: { width: '40px' },
      cellClassName: bubbleCellStyles,
      renderCell: (del, updateRow, allRows) => (
        <SingleWPSelector
          value={del.wp_number}
          onChange={(val) => {
            const wpNum = val != null ? val : 'X';
            const existingInWP = allRows.filter(d => d.wp_number === val && d.id !== del.id);
            const subNum = existingInWP.length + 1;
            updateRow(del.id, { wp_number: val, number: `D${wpNum}.${subNum}` });
          }}
          workPackages={workPackages}
        />
      ),
    },
    {
      key: 'lead',
      header: 'Lead',
      defaultHeaderStyle: { width: '60px' },
      cellClassName: bubbleCellStyles,
      renderCell: (del, updateRow) => (
        <Select
          value={del.lead_participant_id || ''}
          onValueChange={(v) => updateRow(del.id, { lead_participant_id: v || null })}
        >
          <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex items-center overflow-visible">
            <SelectValue placeholder="-">
              {del.lead_participant_id ? (
                <span
                  className="inline-flex items-center justify-center rounded-full font-bold text-white whitespace-nowrap relative"
                  style={{ backgroundColor: '#000', border: '1.5px solid #000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, fontStyle: 'normal', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px', height: '17px', position: 'relative', top: '-1px' }}
                >
                  {participants.find(p => p.id === del.lead_participant_id)?.organisation_short_name || '-'}
                </span>
              ) : (
                <span className="font-['Times_New_Roman',Times,serif] text-[11pt]">-</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {participants.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <span
                  className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
                  style={{ backgroundColor: '#000000', color: '#ffffff', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 5px', height: '17px' }}
                >
                  {p.organisation_short_name || p.organisation_name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      defaultHeaderStyle: { width: '40px' },
      cellClassName: cellStyles,
      renderCell: (del, updateRow) => (
        <Select
          value={del.type || ''}
          onValueChange={(v) => updateRow(del.id, { type: v || null })}
        >
          <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto font-['Times_New_Roman',Times,serif] text-[11pt]">
            <SelectValue placeholder="-">
              <span className="font-['Times_New_Roman',Times,serif] text-[11pt]">{del.type || '-'}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {deliverableTypes.map(t => (
              <SelectItem key={t.value} value={t.value}>
                {t.value} - {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'diss',
      header: 'Diss.',
      defaultHeaderStyle: { width: '50px' },
      cellClassName: cellStyles,
      renderCell: (del, updateRow) => (
        <Select
          value={del.dissemination_level || ''}
          onValueChange={(v) => updateRow(del.id, { dissemination_level: v || null })}
        >
          <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto font-['Times_New_Roman',Times,serif] text-[11pt]">
            <SelectValue placeholder="-">
              <span className="font-['Times_New_Roman',Times,serif] text-[11pt]">{del.dissemination_level || '-'}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {disseminationLevels.map(l => (
              <SelectItem key={l.value} value={l.value}>
                {l.value} - {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      defaultHeaderStyle: { width: '40px' },
      cellClassName: cellStyles,
      renderCell: (del, updateRow) => (
        <MonthSelect
          value={del.due_month}
          onChange={(val) => updateRow(del.id, { due_month: val })}
          projectDuration={projectDuration}
        />
      ),
    },
  ];

  const recomputeNumbers = (dels: Deliverable[]) => {
    const byWP = new Map<number | null, Deliverable[]>();
    dels.forEach(d => {
      const key = d.wp_number;
      if (!byWP.has(key)) byWP.set(key, []);
      byWP.get(key)!.push(d);
    });

    return dels.map((del, index) => {
      const wpGroup = byWP.get(del.wp_number) || [];
      const sortedGroup = [...wpGroup].sort((a, b) => (a.due_month ?? 999) - (b.due_month ?? 999));
      const subIndex = sortedGroup.findIndex(d => d.id === del.id) + 1;
      const wpNum = del.wp_number != null ? del.wp_number : 'X';
      return { id: del.id, updates: { order_index: index, number: `D${wpNum}.${subIndex}` } };
    });
  };

  return (
    <B31SortableTable<Deliverable>
      proposalId={proposalId}
      dbTable="b31_deliverables"
      queryKey="b31-deliverables"
      columnResizeKey="deliverables"
      columns={columns}
      captionTableKey="table-3.1.c"
      captionLabel="Table 3.1.c."
      captionDefaultText="Deliverables, including the partner responsible, type, dissemination level & month due"
      createDefaultRow={(rows) => ({
        number: 'DX.X',
        name: '',
        description: '',
        order_index: rows.length,
      })}
      recomputeNumbers={recomputeNumbers}
      reorderToastLabel="Deliverables reordered"
      invalidateGantt
      tableWidthMode="sum"
      captionLeftButtons={(api) => {
        const orderByNumber = () => {
          const sorted = [...api.rows].sort((a, b) => {
            const wpA = a.wp_number ?? 999;
            const wpB = b.wp_number ?? 999;
            if (wpA !== wpB) return wpA - wpB;
            const subA = parseInt(a.number.replace(/^D?\d+\./, '')) || 0;
            const subB = parseInt(b.number.replace(/^D?\d+\./, '')) || 0;
            return subA - subB;
          });
          setDeliverableOrderMode('number');
          api.reorder(sorted);
        };
        const orderByMonth = () => {
          const sorted = [...api.rows].sort((a, b) => {
            const monthA = a.due_month ?? 999;
            const monthB = b.due_month ?? 999;
            if (monthA !== monthB) return monthA - monthB;
            const wpA = a.wp_number ?? 999;
            const wpB = b.wp_number ?? 999;
            return wpA - wpB;
          });
          setDeliverableOrderMode('month');
          api.reorder(sorted);
        };
        const toggleOrder = () => {
          if (deliverableOrderMode === 'month') orderByNumber();
          else orderByMonth();
        };
        return (
          <>
            <CaptionIconButton tooltip="Add deliverable" onClick={api.add}>
              <Plus className="h-3 w-3" />
            </CaptionIconButton>
            <DeliverableTaskMappingDialog
              proposalId={proposalId}
              trigger={
                <CaptionIconButton tooltip="Assign deliverables to tasks">
                  <Settings2 className="h-3 w-3" />
                </CaptionIconButton>
              }
            />
            {isAdminOrOwner && (
              <CaptionIconButton
                tooltip={deliverableOrderMode === 'month' ? 'Order by deliverable number' : 'Order by month due'}
                onClick={toggleOrder}
              >
                {deliverableOrderMode === 'month' ? <Hash className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
              </CaptionIconButton>
            )}
          </>
        );
      }}
    />
  );
}

// ========== MILESTONES TABLE (3.1d) ==========
export function B31MilestonesTable({ proposalId }: { proposalId: string }) {
  const projectDuration = useProjectDuration(proposalId);
  const { data: workPackages = [] } = useWorkPackages(proposalId);
  const { isAdminOrOwner } = useUserRole();

  const columns: B31Column<Milestone>[] = [
    {
      key: 'no',
      header: 'No.',
      defaultHeaderStyle: { width: '50px', whiteSpace: 'nowrap' },
      minWidth: 50,
      cellClassName: bubbleCellStyles,
      cellStyle: { lineHeight: 1.2, whiteSpace: 'nowrap', width: '50px' },
      renderCell: (ms) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#fff',
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '11pt',
            fontWeight: 700,
            lineHeight: '18px',
            height: '18px',
            padding: '0 4px',
            clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
            verticalAlign: 'baseline',
          }}
        >
          MS{ms.number}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Milestone name',
      cellClassName: cellStyles,
      cellStyle: { lineHeight: 1.2 },
      renderCell: (ms, updateRow) => (
        <EditableTextInline
          value={ms.name}
          onChange={(val) => updateRow(ms.id, { name: val })}
          placeholder="Milestone name"
        />
      ),
    },
    {
      key: 'wps',
      header: 'WPs',
      defaultHeaderStyle: { width: '40px', whiteSpace: 'nowrap' },
      cellClassName: bubbleCellStyles,
      renderCell: (ms, updateRow) => (
        <MultiWPSelector
          value={ms.wps}
          onChange={(val) => updateRow(ms.id, { wps: val })}
          workPackages={workPackages}
        />
      ),
    },
    {
      key: 'due',
      header: 'Due',
      defaultHeaderStyle: { width: '40px', whiteSpace: 'nowrap' },
      cellClassName: cellStyles,
      renderCell: (ms, updateRow) => (
        <MonthSelect
          value={ms.due_month}
          onChange={(val) => updateRow(ms.id, { due_month: val })}
          projectDuration={projectDuration}
        />
      ),
    },
    {
      key: 'mov',
      header: 'Means of verification',
      cellClassName: cellStyles,
      renderCell: (ms, updateRow) => (
        <EditableHtml
          value={ms.means_of_verification}
          onChange={(val) => updateRow(ms.id, { means_of_verification: val })}
          placeholder="How will this be verified?"
        />
      ),
    },
  ];

  return (
    <B31SortableTable<Milestone>
      proposalId={proposalId}
      dbTable="b31_milestones"
      queryKey="b31-milestones"
      columnResizeKey="milestones"
      columns={columns}
      captionTableKey="table-3.1.d"
      captionLabel="Table 3.1.d."
      captionDefaultText="Milestones"
      createDefaultRow={(rows) => ({
        number: rows.length + 1,
        name: '',
        wps: '',
        means_of_verification: '',
        order_index: rows.length,
      })}
      recomputeNumbers={(items) =>
        items.map((m, i) => ({ id: m.id, updates: { order_index: i, number: i + 1 } }))
      }
      reorderToastLabel="Milestones reordered"
      invalidateGantt
      autoFitFullWidth
      tableWidthMode="sum"
      captionLeftButtons={(api) => {
        const autoReorder = () => {
          const sorted = [...api.rows].sort((a, b) => {
            const monthA = a.due_month ?? 999;
            const monthB = b.due_month ?? 999;
            if (monthA !== monthB) return monthA - monthB;
            const wpA = a.wps ? parseInt(a.wps.split(',')[0].trim()) || 999 : 999;
            const wpB = b.wps ? parseInt(b.wps.split(',')[0].trim()) || 999 : 999;
            return wpA - wpB;
          });
          api.reorder(sorted);
        };
        return (
          <>
            <CaptionIconButton tooltip="Add milestone" onClick={api.add}>
              <Plus className="h-3 w-3" />
            </CaptionIconButton>
            <MilestoneTaskMappingDialog
              proposalId={proposalId}
              trigger={
                <CaptionIconButton tooltip="Assign milestones to tasks">
                  <Settings2 className="h-3 w-3" />
                </CaptionIconButton>
              }
            />
            {isAdminOrOwner && (
              <CaptionIconButton tooltip="Auto-reorder" onClick={autoReorder}>
                <ArrowUpDown className="h-3 w-3" />
              </CaptionIconButton>
            )}
          </>
        );
      }}
    />
  );
}

// ========== RISKS TABLE (3.1e) ==========
export function B31RisksTable({ proposalId }: { proposalId: string }) {
  const { data: workPackages = [] } = useWorkPackages(proposalId);
  const { isAdminOrOwner } = useUserRole();

  const columns: B31Column<Risk>[] = [
    {
      key: 'risk',
      header: 'Risk',
      defaultHeaderStyle: { width: '25%' },
      cellClassName: cellStyles,
      renderCell: (risk, updateRow) => (
        <EditableText
          value={risk.description}
          onChange={(val) => updateRow(risk.id, { description: val })}
          placeholder="Description of risk"
        />
      ),
    },
    {
      key: 'likelihood',
      header: 'i.',
      headerClassName: 'text-center',
      defaultHeaderStyle: { width: '24px' },
      cellClassName: `${cellStyles} text-center`,
      renderCell: (risk, updateRow) => (
        <Select
          value={risk.likelihood || ''}
          onValueChange={(v) => updateRow(risk.id, { likelihood: (v as 'L' | 'M' | 'H') || null })}
        >
          <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex justify-center">
            <SelectValue>
              {risk.likelihood ? <RiskBadge level={risk.likelihood} /> : <span className="text-muted-foreground">-</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {riskLevelOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <RiskBadge level={opt.value as 'L' | 'M' | 'H'} />
                  <span>{opt.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'severity',
      header: 'ii.',
      headerClassName: 'text-center',
      defaultHeaderStyle: { width: '24px' },
      cellClassName: `${cellStyles} text-center`,
      renderCell: (risk, updateRow) => (
        <Select
          value={risk.severity || ''}
          onValueChange={(v) => updateRow(risk.id, { severity: (v as 'L' | 'M' | 'H') || null })}
        >
          <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex justify-center">
            <SelectValue>
              {risk.severity ? <RiskBadge level={risk.severity} /> : <span className="text-muted-foreground">-</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {riskLevelOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <RiskBadge level={opt.value as 'L' | 'M' | 'H'} />
                  <span>{opt.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'wps',
      header: 'WPs',
      defaultHeaderStyle: { width: '84px' },
      cellClassName: cellStyles,
      renderCell: (risk, updateRow) => (
        <MultiWPSelector
          value={risk.wps}
          onChange={(val) => updateRow(risk.id, { wps: val })}
          workPackages={workPackages}
        />
      ),
    },
    {
      key: 'mitigation',
      header: 'Mitigation & adaptation measures',
      cellClassName: cellStyles,
      renderCell: (risk, updateRow) => (
        <EditableText
          value={risk.mitigation}
          onChange={(val) => updateRow(risk.id, { mitigation: val })}
          placeholder="Proposed mitigation measures"
        />
      ),
    },
  ];

  const getRiskOrder = (level: string | null): number => {
    const opt = riskLevelOptions.find(o => o.value === level);
    return opt?.order ?? 3;
  };

  return (
    <B31SortableTable<Risk>
      proposalId={proposalId}
      dbTable="b31_risks"
      queryKey="b31-risks"
      columnResizeKey="risks"
      columns={columns}
      captionTableKey="table-3.1.e"
      captionLabel="Table 3.1.e."
      captionDefaultText="Critical risks"
      captionSuffix={
        <>(<span className="font-bold">i.</span> likelihood; <span className="font-bold">ii.</span> severity; <RiskBadge level="L" /> = low, <RiskBadge level="M" /> = medium, <RiskBadge level="H" /> = high)</>
      }
      captionClassName="flex items-center gap-1 flex-wrap"
      createDefaultRow={(rows) => ({
        number: rows.length + 1,
        description: '',
        wps: '',
        mitigation: '',
        order_index: rows.length,
      })}
      recomputeNumbers={(items) =>
        items.map((r, i) => ({ id: r.id, updates: { order_index: i, number: i + 1 } }))
      }
      reorderToastLabel="Risks reordered"
      tableWidthMode="maxFull"
      captionLeftButtons={(api) => {
        const autoReorder = () => {
          const sorted = [...api.rows].sort((a, b) => {
            const likelihoodA = getRiskOrder(a.likelihood);
            const likelihoodB = getRiskOrder(b.likelihood);
            if (likelihoodA !== likelihoodB) return likelihoodA - likelihoodB;
            const severityA = getRiskOrder(a.severity);
            const severityB = getRiskOrder(b.severity);
            return severityA - severityB;
          });
          api.reorder(sorted);
        };
        return (
          <>
            <CaptionIconButton tooltip="Add risk" onClick={api.add}>
              <Plus className="h-3 w-3" />
            </CaptionIconButton>
            {isAdminOrOwner && (
              <CaptionIconButton tooltip="Auto-reorder" onClick={autoReorder}>
                <ArrowUpDown className="h-3 w-3" />
              </CaptionIconButton>
            )}
          </>
        );
      }}
    />
  );
}

// ========== MAIN COMPONENT ==========
export function B31TablesEditor({ proposalId }: B31TablesEditorProps) {
  return (
    <div className="space-y-8">
      <B31DeliverablesTable proposalId={proposalId} />
      <B31MilestonesTable proposalId={proposalId} />
      <B31RisksTable proposalId={proposalId} />
    </div>
  );
}
