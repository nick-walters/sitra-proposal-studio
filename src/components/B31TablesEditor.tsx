import React, { useState, useEffect, useRef, useCallback } from 'react';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown, GripVertical, ArrowUpDown, Settings2, Hash, CalendarDays } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { useUserRole } from '@/hooks/useUserRole';
import { DeliverableTaskMappingDialog } from './DeliverableTaskMappingDialog';
import { MilestoneTaskMappingDialog } from './MilestoneTaskMappingDialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EditableCaption } from '@/components/EditableCaption';

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

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellStyles = "!px-[1pt] !py-0 px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";
const bubbleCellStyles = "!px-[1pt] !py-[1px] px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-none overflow-visible";
const headerCellStyles = "!px-[1pt] !py-0 px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold";

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

  // Set initial HTML via ref on mount
  useEffect(() => {
    if (divRef.current) {
      divRef.current.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync HTML when prop changes externally (not while focused)
  useEffect(() => {
    if (!isFocused.current && divRef.current && value !== lastValueRef.current) {
      divRef.current.innerHTML = value || '';
      lastValueRef.current = value;
    }
  }, [value]);

  // Cleanup timeout on unmount
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
        // Flush any pending save on blur
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

// Inline editable text that expands to multiple lines - uses contentEditable to avoid textarea extra space
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
  
  // Set initial text content via ref (not dangerouslySetInnerHTML to avoid React conflicts)
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
  
  // Cleanup timeout on unmount
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

// Inline editable text using contenteditable for true inline flow (no indent on wrap)
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
  
  // Set initial text via ref on mount
  useEffect(() => {
    if (spanRef.current) {
      spanRef.current.textContent = value || '';
    }
    lastValueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync text when prop changes externally (not while focused)
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
  
  // Cleanup timeout on unmount
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

// Compact month selector with minimal padding
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

// WP Bubble component - pill shape matching cross-reference style
function WPBubble({ wp, onRemove }: { wp: WorkPackage; onRemove?: () => void }) {
  return (
    <span 
      className="inline-flex items-center justify-center gap-0.5 rounded-full text-white font-bold whitespace-nowrap"
      style={{ backgroundColor: wp.color || '#666', border: `1.5px solid ${wp.color || '#666'}`, color: '#ffffff', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px', height: '17px', position: 'relative', top: '-1px' }}
    >
      WP{wp.number}
      {onRemove && (
        <button 
          onClick={onRemove}
          className="ml-0.5 hover:bg-black/20 rounded-full w-3 h-3 flex items-center justify-center text-[8pt]"
        >
          ×
        </button>
      )}
    </span>
  );
}

// Single WP selector (for deliverables)
function SingleWPSelector({ 
  value, 
  onChange, 
  workPackages 
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
          {selectedWP ? <WPBubble wp={selectedWP} /> : <span className="font-['Times_New_Roman',Times,serif] text-[11pt]">-</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background z-50">
        {workPackages.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">No WPs defined yet</div>
        ) : (
          workPackages.map(wp => (
            <SelectItem key={wp.id} value={wp.number.toString()}>
              <div className="flex items-center gap-2">
                <WPBubble wp={wp} />
                <span className="text-sm">{wp.short_name || wp.title}</span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// Multi WP selector (for milestones and risks)
function MultiWPSelector({ 
  value, 
  onChange, 
  workPackages,
}: { 
  value: string; // comma-separated WP numbers
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
              <WPBubble key={wp.id} wp={wp} />
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
                <WPBubble wp={wp} />
                <span className="text-sm truncate">{wp.short_name || wp.title}</span>
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Risk level badge - 9pt font
function RiskBadge({ level }: { level: 'L' | 'M' | 'H' }) {
  const colorMap: Record<string, string> = { H: '#ef4444', M: '#f59e0b', L: '#22c55e' };
  const levelColor = colorMap[level] || '#000';
  
  return (
    <span 
      className="inline-flex items-center justify-center rounded-full font-bold not-italic whitespace-nowrap"
      style={{ backgroundColor: '#ffffff', color: levelColor, border: `1.5px solid ${levelColor}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, verticalAlign: 'baseline', padding: '0px', width: '19px', height: '17px', position: 'relative', top: '-1.4px' }}
    >
      {level}
    </span>
  );
}

// Removed InlineRiskLevelSelect - now using direct Select in table cell

// Hook to fetch work packages with colors - uses wp_drafts table
function useWorkPackages(proposalId: string) {
  return useQuery({
    queryKey: ['wp-drafts-for-b31', proposalId],
    queryFn: async () => {
      // Fetch from wp_drafts table (not work_packages)
      const { data: wps, error: wpError } = await supabase
        .from('wp_drafts')
        .select('id, number, title, color')
        .eq('proposal_id', proposalId)
        .order('number');
      if (wpError) throw wpError;
      
      // Map WPs with colors from wp_drafts.color
      return (wps || []).map(wp => ({
        id: wp.id,
        number: wp.number,
        title: wp.title || `WP${wp.number}`,
        short_name: wp.title?.split(':')[0]?.trim() || wp.title || `WP${wp.number}`,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length]
      })) as WorkPackage[];
    },
  });
}

// Hook to fetch participants
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

// ========== SORTABLE ROW WRAPPER ==========
function SortableTableRow({ 
  id, 
  children, 
  canDrag,
  onDelete
}: { 
  id: string; 
  children: React.ReactNode; 
  canDrag: boolean;
  onDelete?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // position:relative doesn't work on <tr> in most browsers, so we inject
  // the drag-handle into the first <td> and the delete button into the last <td>.
  const childArray = React.Children.toArray(children);

  const enhanced = childArray.map((child, index) => {
    if (!React.isValidElement(child)) return child;

    // Inject drag handle into first cell
    if (index === 0 && canDrag) {
      return React.cloneElement(child as React.ReactElement<any>, {
        style: { ...(child as React.ReactElement<any>).props.style, position: 'relative' as const },
        children: (
          <>
            <div 
              className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
              style={{ left: '-20px' }}
              {...attributes} 
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-[#2563EB]" />
            </div>
            {(child as React.ReactElement<any>).props.children}
          </>
        ),
      });
    }

    // Inject delete button into last cell
    if (index === childArray.length - 1 && onDelete) {
      return React.cloneElement(child as React.ReactElement<any>, {
        style: { ...(child as React.ReactElement<any>).props.style, position: 'relative' as const },
        children: (
          <>
            {(child as React.ReactElement<any>).props.children}
            <div 
              className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              style={{ right: '-24px' }}
            >
              <DeleteConfirmDialog
                itemLabel="this row"
                onConfirm={() => onDelete?.()}
                buttonClassName="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                iconSize="h-3 w-3"
              />
            </div>
          </>
        ),
      });
    }

    return child;
  });

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/50 group">
      {enhanced}
    </TableRow>
  );
}

// Table wrapper - full width with overflow visible for margin controls
function B31TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full [&>div]:overflow-visible">
      {children}
    </div>
  );
}

// ColumnResizer now imported from shared component

/** Small icon-only button used in the caption-left hover cluster. */
const CaptionIconButton = React.forwardRef<HTMLButtonElement, {
  tooltip: string;
  onClick?: () => void;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'>>(
  ({ tooltip, onClick, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      {...rest}
    >
      {children}
    </button>
  )
);
CaptionIconButton.displayName = 'CaptionIconButton';


