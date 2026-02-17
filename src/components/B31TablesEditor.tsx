import { useState, useEffect, useRef } from 'react';
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
import { Plus, Trash2, ChevronDown, GripVertical, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { useUserRole } from '@/hooks/useUserRole';
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

// Generate month options M01 to M72
const monthOptions = Array.from({ length: 72 }, (_, i) => ({
  value: i + 1,
  label: `M${String(i + 1).padStart(2, '0')}`,
}));

// Risk level options with colors and sort order
const riskLevelOptions = [
  { value: 'H', label: 'High', color: 'bg-red-500', order: 0 },
  { value: 'M', label: 'Medium', color: 'bg-amber-500', order: 1 },
  { value: 'L', label: 'Low', color: 'bg-green-500', order: 2 },
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
const cellStyles = "border border-black !px-0.5 !py-0 !p-0 px-0.5 h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";
const bubbleCellStyles = "border border-black !px-0.5 !py-0 !p-0 px-0.5 h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-none";
const headerCellStyles = "border border-black !px-0.5 !py-0 !p-0 px-0.5 h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";

// Inline editable text that expands to multiple lines - with debounced save
function EditableText({ 
  value, 
  onChange, 
  placeholder,
  className = '',
  inline = false
}: { 
  value: string; 
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  inline?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFocused = useRef(false);
  
  // Sync local value when prop changes (e.g., from another user) - but not while focused
  useEffect(() => {
    if (!isFocused.current) setLocalValue(value);
  }, [value]);
  
  // Auto-resize on mount and when value changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localValue]);
  
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    // Debounce the save
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
    <textarea
      ref={textareaRef}
      value={localValue}
      onChange={handleChange}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => { isFocused.current = false; }}
      placeholder={placeholder}
      rows={1}
      className={`bg-transparent border-0 p-0 m-0 resize-none focus:outline-none focus:ring-0 font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight ${inline ? '' : 'w-full'} ${className}`}
      style={{ 
        minHeight: '1em',
        lineHeight: '1.2',
        overflow: 'hidden',
        display: inline ? 'inline' : 'block'
      }}
    />
  );
}

// Inline editable text using contenteditable for true inline flow (no indent on wrap)
function EditableTextInline({ 
  value, 
  onChange, 
  placeholder
}: { 
  value: string; 
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const spanRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFocused = useRef(false);
  
  // Sync local value when prop changes - but not while focused
  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(value);
      if (spanRef.current && spanRef.current.textContent !== value) {
        spanRef.current.textContent = value;
      }
    }
  }, [value]);
  
  const handleInput = () => {
    const newValue = spanRef.current?.textContent || '';
    setLocalValue(newValue);
    
    // Debounce the save
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
      onBlur={() => { isFocused.current = false; }}
      data-placeholder={placeholder}
      className="outline-none min-w-[50px] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
      style={{ display: 'inline' }}
    >
      {value}
    </span>
  );
}

// Compact month selector with minimal padding
function MonthSelect({ 
  value, 
  onChange 
}: { 
  value: number | null; 
  onChange: (val: number | null) => void;
}) {
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
        {monthOptions.map(opt => (
          <SelectItem key={opt.value} value={opt.value.toString()}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// WP Bubble component - pill shape matching cross-reference style
function WPBubble({ wp, onRemove, topOffset = '-2pt' }: { wp: WorkPackage; onRemove?: () => void; topOffset?: string }) {
  return (
    <span 
      className="inline-flex items-center justify-center gap-0.5 px-1.5 rounded-full text-white text-[9pt] font-bold whitespace-nowrap relative"
      style={{ backgroundColor: wp.color || '#666', lineHeight: 1, verticalAlign: 'middle', top: topOffset }}
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
      <SelectTrigger hideArrow className="h-auto py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex items-center overflow-visible">
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
  workPackages 
}: { 
  value: string; // comma-separated WP numbers
  onChange: (val: string) => void;
  workPackages: WorkPackage[];
}) {
  const selectedNumbers = value ? value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)) : [];
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
              <WPBubble key={wp.id} wp={wp} topOffset="-1pt" />
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
  const option = riskLevelOptions.find(o => o.value === level);
  if (!option) return null;
  
  return (
    <span 
      className={`inline-flex items-center justify-center rounded-full text-white text-[9pt] font-bold not-italic ${option.color}`}
      style={{ width: '18px', height: '18px', minWidth: '18px', minHeight: '18px' }}
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
        .select('id, number, title')
        .eq('proposal_id', proposalId)
        .order('number');
      if (wpError) throw wpError;
      
      // Fetch color palette
      const { data: palette } = await supabase
        .from('wp_color_palette')
        .select('colors')
        .eq('proposal_id', proposalId)
        .single();
      
      const colors = (palette?.colors as string[]) || DEFAULT_WP_COLORS;
      
      // Map WPs with colors
      return (wps || []).map(wp => ({
        id: wp.id,
        number: wp.number,
        title: wp.title || `WP${wp.number}`,
        short_name: wp.title?.split(':')[0]?.trim() || wp.title || `WP${wp.number}`,
        color: colors[(wp.number - 1) % colors.length] || DEFAULT_WP_COLORS[0]
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

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/50 group relative">
      {children}
      {/* Drag handle - positioned in left page margin, close to table */}
      {canDrag && (
        <div 
          className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{ left: '-20px' }}
          {...attributes} 
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {/* Delete button - positioned in right page margin, vertically centered */}
      {onDelete && (
        <div 
          className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{ right: '-24px' }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
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

// ========== DELIVERABLES TABLE (3.1c) ==========
export function B31DeliverablesTable({ proposalId }: { proposalId: string }) {
  const queryClient = useQueryClient();
  const { data: workPackages = [] } = useWorkPackages(proposalId);
  const { data: participants = [] } = useParticipants(proposalId);
  const { isAdminOrOwner, loading: roleLoading } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ['b31-deliverables', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b31_deliverables')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as Deliverable[];
    },
  });

  const updateDeliverable = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Deliverable> & { id: string }) => {
      const { error } = await supabase
        .from('b31_deliverables')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-deliverables', proposalId] }),
  });

  const addDeliverable = useMutation({
    mutationFn: async () => {
      const nextIndex = deliverables.length;
      const { error } = await supabase
        .from('b31_deliverables')
        .insert({ 
          proposal_id: proposalId, 
          number: 'DX.X',
          name: '', 
          description: '',
          order_index: nextIndex
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-deliverables', proposalId] }),
  });

  const deleteDeliverable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('b31_deliverables')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-deliverables', proposalId] }),
  });

  // Recalculate deliverable sub-numbers within each WP based on due_month order
  const recalculateDeliverableNumbers = (dels: Deliverable[]): { id: string; number: string; order_index: number }[] => {
    // Group by WP number
    const byWP = new Map<number | null, Deliverable[]>();
    dels.forEach(d => {
      const key = d.wp_number;
      if (!byWP.has(key)) byWP.set(key, []);
      byWP.get(key)!.push(d);
    });

    // Within each WP group, sort by due_month to assign sub-numbers
    const updates: { id: string; number: string; order_index: number }[] = [];
    dels.forEach((del, index) => {
      const wpGroup = byWP.get(del.wp_number) || [];
      const sortedGroup = [...wpGroup].sort((a, b) => (a.due_month ?? 999) - (b.due_month ?? 999));
      const subIndex = sortedGroup.findIndex(d => d.id === del.id) + 1;
      const wpNum = del.wp_number != null ? del.wp_number : 'X';
      updates.push({ id: del.id, number: `D${wpNum}.${subIndex}`, order_index: index });
    });
    return updates;
  };

  const reorderDeliverables = useMutation({
    mutationFn: async (newOrder: Deliverable[]) => {
      const updates = recalculateDeliverableNumbers(newOrder);
      
      for (const update of updates) {
        const { error } = await supabase
          .from('b31_deliverables')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b31-deliverables', proposalId] });
      toast.success('Deliverables reordered');
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = deliverables.findIndex((d) => d.id === active.id);
    const newIndex = deliverables.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(deliverables, oldIndex, newIndex);
    reorderDeliverables.mutate(reordered);
  };

  const autoReorder = () => {
    const sorted = [...deliverables].sort((a, b) => {
      // First by due month
      const monthA = a.due_month ?? 999;
      const monthB = b.due_month ?? 999;
      if (monthA !== monthB) return monthA - monthB;
      // Then by WP number
      const wpA = a.wp_number ?? 999;
      const wpB = b.wp_number ?? 999;
      return wpA - wpB;
    });
    reorderDeliverables.mutate(sorted);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className={`${tableStyles} italic`}>
          <span className="font-bold italic">Table 3.1.c.</span> Deliverables
        </p>
        {isAdminOrOwner && (
          <Button variant="outline" size="sm" onClick={autoReorder} className="text-xs h-6 px-2 py-0">
            <ArrowUpDown className="h-3 w-3 mr-1" /> Auto-reorder
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <B31TableWrapper>
          <Table className={`${tableStyles} w-full [&_th]:border-0 [&_td]:border-0`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto' }} ref={tableRef}>
            <TableHeader>
              <TableRow className="bg-black text-white hover:bg-black">
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={{ ...(colWidths.length > 0 ? { width: colWidths[0] } : {}), borderRight: 'none' }}>
                  Deliverable
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={{ ...(colWidths.length > 0 ? { width: colWidths[1] } : { width: '40px' }), borderLeft: 'none', borderRight: 'none' }}>
                  WP
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={{ ...(colWidths.length > 0 ? { width: colWidths[2] } : { width: '60px' }), borderLeft: 'none' }}>
                  Lead
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[3] } : { width: '40px' }}>
                  Type
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(3)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[4] } : { width: '50px' }}>
                  Diss.
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(4)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[5] } : { width: '40px' }}>
                  Due
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(5)} />}
                </TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={deliverables.map(d => d.id)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {deliverables.map((del) => {
                  const wpColor = del.wp_number != null 
                    ? workPackages.find(wp => wp.number === del.wp_number)?.color || '#000'
                    : '#000';
                  // Estimate max bubble width: longest "DX.X: name" string × ~6.5px per char + padding
                  const maxLen = Math.max(...deliverables.map(d => `${d.number}: ${d.name}`.length), 10);
                  const bubbleMinWidth = Math.min(maxLen * 6.5 + 12, 400);
                  return (
                  <SortableTableRow key={del.id} id={del.id} canDrag={isAdminOrOwner} onDelete={() => deleteDeliverable.mutate(del.id)}>
                    <TableCell className={cellStyles} style={{ lineHeight: 1.2, borderRight: 'none' }}>
                      <span
                        className="inline-flex items-center rounded-full font-['Times_New_Roman',Times,serif] text-[9pt] align-middle"
                        style={{
                          backgroundColor: '#fff',
                          color: wpColor,
                          border: `1.5px solid ${wpColor}`,
                          padding: '0 5px',
                          lineHeight: 1.3,
                          whiteSpace: 'nowrap',
                          minWidth: bubbleMinWidth,
                        }}
                      >
                        <span className="font-bold">
                          <EditableTextInline
                            value={del.number}
                            onChange={(val) => updateDeliverable.mutate({ id: del.id, number: val })}
                            placeholder="D#.#"
                          />
                        </span>
                        <span className="font-bold">:&nbsp;</span>
                        <EditableTextInline
                          value={del.name}
                          onChange={(val) => updateDeliverable.mutate({ id: del.id, name: val })}
                          placeholder="Deliverable name"
                        />
                      </span>
                    </TableCell>
                    <TableCell className={bubbleCellStyles} style={{ borderLeft: 'none', borderRight: 'none' }}>
                      <SingleWPSelector
                        value={del.wp_number}
                        onChange={(val) => {
                          // When WP changes, update wp_number and recalculate the deliverable number
                          const wpNum = val != null ? val : 'X';
                          // Count existing deliverables in the target WP to determine sub-number
                          const existingInWP = deliverables.filter(d => d.wp_number === val && d.id !== del.id);
                          const subNum = existingInWP.length + 1;
                          updateDeliverable.mutate({ id: del.id, wp_number: val, number: `D${wpNum}.${subNum}` });
                        }}
                        workPackages={workPackages}
                      />
                    </TableCell>
                    <TableCell className={bubbleCellStyles} style={{ borderLeft: 'none' }}>
                      <Select 
                        value={del.lead_participant_id || ''} 
                        onValueChange={(v) => updateDeliverable.mutate({ id: del.id, lead_participant_id: v || null })}
                      >
                        <SelectTrigger hideArrow className="h-auto min-h-0 py-0 px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex items-center">
                          <SelectValue placeholder="-">
                            {del.lead_participant_id ? (
                              <span
                                className="inline-flex items-center justify-center px-1.5 rounded-full text-[9pt] font-bold italic text-white whitespace-nowrap relative"
                                style={{ backgroundColor: '#000', lineHeight: 1, verticalAlign: 'middle', top: '-2pt' }}
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
                              {p.organisation_short_name || p.organisation_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <Select 
                        value={del.type || ''} 
                        onValueChange={(v) => updateDeliverable.mutate({ id: del.id, type: v || null })}
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
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <Select 
                        value={del.dissemination_level || ''} 
                        onValueChange={(v) => updateDeliverable.mutate({ id: del.id, dissemination_level: v || null })}
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
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <MonthSelect
                        value={del.due_month}
                        onChange={(val) => updateDeliverable.mutate({ id: del.id, due_month: val })}
                      />
                    </TableCell>
                  </SortableTableRow>
                  );
                })}
              </TableBody>
            </SortableContext>
          </Table>
        </B31TableWrapper>
      </DndContext>
      <Button variant="outline" size="sm" onClick={() => addDeliverable.mutate()} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Add deliverable
      </Button>
    </div>
  );
}

// ========== MILESTONES TABLE (3.1d) ==========
export function B31MilestonesTable({ proposalId }: { proposalId: string }) {
  const queryClient = useQueryClient();
  const { data: workPackages = [] } = useWorkPackages(proposalId);
  const { isAdminOrOwner } = useUserRole();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ['b31-milestones', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b31_milestones')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as Milestone[];
    },
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Milestone> & { id: string }) => {
      const { error } = await supabase
        .from('b31_milestones')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] }),
  });

  const addMilestone = useMutation({
    mutationFn: async () => {
      const nextNumber = milestones.length + 1;
      const { error } = await supabase
        .from('b31_milestones')
        .insert({ 
          proposal_id: proposalId, 
          number: nextNumber, 
          name: '', 
          wps: '', 
          means_of_verification: '',
          order_index: milestones.length
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] }),
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('b31_milestones')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] }),
  });

  const reorderMilestones = useMutation({
    mutationFn: async (newOrder: Milestone[]) => {
      const updates = newOrder.map((ms, index) => ({
        id: ms.id,
        order_index: index,
        number: index + 1
      }));
      
      for (const update of updates) {
        const { error } = await supabase
          .from('b31_milestones')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] });
      toast.success('Milestones reordered');
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = milestones.findIndex((m) => m.id === active.id);
    const newIndex = milestones.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(milestones, oldIndex, newIndex);
    reorderMilestones.mutate(reordered);
  };

  const autoReorder = () => {
    const sorted = [...milestones].sort((a, b) => {
      // First by due month
      const monthA = a.due_month ?? 999;
      const monthB = b.due_month ?? 999;
      if (monthA !== monthB) return monthA - monthB;
      // Then by first WP number in the list
      const wpA = a.wps ? parseInt(a.wps.split(',')[0].trim()) || 999 : 999;
      const wpB = b.wps ? parseInt(b.wps.split(',')[0].trim()) || 999 : 999;
      return wpA - wpB;
    });
    reorderMilestones.mutate(sorted);
  };

  // Column resizing
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize([milestones]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className={`${tableStyles} italic`}>
          <span className="font-bold italic">Table 3.1.d.</span> Milestones
        </p>
        {isAdminOrOwner && (
          <Button variant="outline" size="sm" onClick={autoReorder} className="text-xs h-6 px-2 py-0">
            <ArrowUpDown className="h-3 w-3 mr-1" /> Auto-reorder
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <B31TableWrapper>
          <Table className={`${tableStyles} w-full`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto' }} ref={tableRef}>
            <TableHeader>
              <TableRow className="bg-black text-white hover:bg-black">
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[0] } : undefined}>
                  Milestone
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[1] } : { whiteSpace: 'nowrap' }}>
                  WPs
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[2] } : { whiteSpace: 'nowrap' }}>
                  Due
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[3] } : undefined}>
                  Means of verification
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(3)} />}
                </TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={milestones.map(m => m.id)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {milestones.map((ms) => (
                  <SortableTableRow key={ms.id} id={ms.id} canDrag={isAdminOrOwner} onDelete={() => deleteMilestone.mutate(ms.id)}>
                    <TableCell className={cellStyles} style={{ lineHeight: 1.2 }}>
                      <span className="font-bold font-['Times_New_Roman',Times,serif] text-[11pt]" style={{ lineHeight: 1.2 }}>MS{ms.number}:&nbsp;</span>
                      <span className="font-['Times_New_Roman',Times,serif] text-[11pt]" style={{ lineHeight: 1.2 }}>
                        <EditableTextInline
                          value={ms.name}
                          onChange={(val) => updateMilestone.mutate({ id: ms.id, name: val })}
                          placeholder="Milestone name"
                        />
                      </span>
                    </TableCell>
                    <TableCell className={bubbleCellStyles}>
                      <MultiWPSelector
                        value={ms.wps}
                        onChange={(val) => updateMilestone.mutate({ id: ms.id, wps: val })}
                        workPackages={workPackages}
                      />
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <MonthSelect
                        value={ms.due_month}
                        onChange={(val) => updateMilestone.mutate({ id: ms.id, due_month: val })}
                      />
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <EditableText
                        value={ms.means_of_verification}
                        onChange={(val) => updateMilestone.mutate({ id: ms.id, means_of_verification: val })}
                        placeholder="How will this be verified?"
                      />
                    </TableCell>
                  </SortableTableRow>
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </B31TableWrapper>
      </DndContext>
      <Button variant="outline" size="sm" onClick={() => addMilestone.mutate()} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Add milestone
      </Button>
    </div>
  );
}

// ========== RISKS TABLE (3.1e) ==========
export function B31RisksTable({ proposalId }: { proposalId: string }) {
  const queryClient = useQueryClient();
  const { data: workPackages = [] } = useWorkPackages(proposalId);
  const { isAdminOrOwner } = useUserRole();
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: risks = [], isLoading } = useQuery({
    queryKey: ['b31-risks', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b31_risks')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as Risk[];
    },
  });

  const updateRisk = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Risk> & { id: string }) => {
      const { error } = await supabase
        .from('b31_risks')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] }),
  });

  const addRisk = useMutation({
    mutationFn: async () => {
      const nextNumber = risks.length + 1;
      const { error } = await supabase
        .from('b31_risks')
        .insert({ 
          proposal_id: proposalId, 
          number: nextNumber, 
          description: '', 
          wps: '', 
          mitigation: '',
          order_index: risks.length
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] }),
  });

  const deleteRisk = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('b31_risks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] }),
  });

  const reorderRisks = useMutation({
    mutationFn: async (newOrder: Risk[]) => {
      const updates = newOrder.map((risk, index) => ({
        id: risk.id,
        order_index: index,
        number: index + 1
      }));
      
      for (const update of updates) {
        const { error } = await supabase
          .from('b31_risks')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] });
      toast.success('Risks reordered');
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = risks.findIndex((r) => r.id === active.id);
    const newIndex = risks.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(risks, oldIndex, newIndex);
    reorderRisks.mutate(reordered);
  };

  const getRiskOrder = (level: string | null): number => {
    const opt = riskLevelOptions.find(o => o.value === level);
    return opt?.order ?? 3; // null/undefined comes last
  };

  const autoReorder = () => {
    const sorted = [...risks].sort((a, b) => {
      // First by likelihood (H=0, M=1, L=2, null=3)
      const likelihoodA = getRiskOrder(a.likelihood);
      const likelihoodB = getRiskOrder(b.likelihood);
      if (likelihoodA !== likelihoodB) return likelihoodA - likelihoodB;
      // Then by severity
      const severityA = getRiskOrder(a.severity);
      const severityB = getRiskOrder(b.severity);
      return severityA - severityB;
    });
    reorderRisks.mutate(sorted);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className={`${tableStyles} italic flex items-center gap-1 flex-wrap`}>
          <span className="font-bold italic">Table 3.1.e.</span> Critical risks (<span className="font-bold">i.</span> likelihood; <span className="font-bold">ii.</span> severity; <RiskBadge level="L" /> = low, <RiskBadge level="M" /> = medium, <RiskBadge level="H" /> = high)
        </p>
        {isAdminOrOwner && (
          <Button variant="outline" size="sm" onClick={autoReorder} className="text-xs h-6 px-2 py-0">
            <ArrowUpDown className="h-3 w-3 mr-1" /> Auto-reorder
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <B31TableWrapper>
          <Table className={`${tableStyles} w-full`} style={{ tableLayout: colWidths.length > 0 ? 'fixed' : 'auto' }} ref={tableRef}>
            <TableHeader>
              <TableRow className="bg-black text-white hover:bg-black">
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[0] } : { width: '25%' }}>
                  Risk
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(0)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[1] } : { width: '24px' }}>
                  i.
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(1)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[2] } : { width: '24px' }}>
                  ii.
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(2)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[3] } : { width: '84px' }}>
                  WPs
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(3)} />}
                </TableHead>
                <TableHead className={`${headerCellStyles} text-white font-bold relative`} style={colWidths.length > 0 ? { width: colWidths[4] } : undefined}>
                  Mitigation &amp; adaptation measures
                  {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(4)} />}
                </TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={risks.map(r => r.id)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {risks.map((risk) => (
                  <SortableTableRow key={risk.id} id={risk.id} canDrag={isAdminOrOwner} onDelete={() => deleteRisk.mutate(risk.id)}>
                    <TableCell className={cellStyles}>
                      <EditableText
                        value={risk.description}
                        onChange={(val) => updateRisk.mutate({ id: risk.id, description: val })}
                        placeholder="Description of risk"
                      />
                    </TableCell>
                    {/* Likelihood (i) column */}
                    <TableCell className={`${cellStyles} text-center`}>
                      <Select value={risk.likelihood || ''} onValueChange={(v) => updateRisk.mutate({ id: risk.id, likelihood: v as 'L' | 'M' | 'H' || null })}>
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
                    </TableCell>
                    {/* Severity (ii) column */}
                    <TableCell className={`${cellStyles} text-center`}>
                      <Select value={risk.severity || ''} onValueChange={(v) => updateRisk.mutate({ id: risk.id, severity: v as 'L' | 'M' | 'H' || null })}>
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
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <MultiWPSelector
                        value={risk.wps}
                        onChange={(val) => updateRisk.mutate({ id: risk.id, wps: val })}
                        workPackages={workPackages}
                      />
                    </TableCell>
                    <TableCell className={cellStyles}>
                      <EditableText
                        value={risk.mitigation}
                        onChange={(val) => updateRisk.mutate({ id: risk.id, mitigation: val })}
                        placeholder="Proposed mitigation measures"
                      />
                    </TableCell>
                  </SortableTableRow>
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </B31TableWrapper>
      </DndContext>
      <Button variant="outline" size="sm" onClick={() => addRisk.mutate()} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Add risk
      </Button>
    </div>
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
