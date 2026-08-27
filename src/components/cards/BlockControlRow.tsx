import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Plus, Recycle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The standard block control row, shared by every board: Part B modules, WP
 * drafts, case drafts and Part A cards. Order and spacing are fixed here so no
 * surface can drift — collapse, drag, title, visibility, add, restore, delete.
 *
 * Every control is optional: a block that cannot be hidden simply omits
 * `onToggleVisible`, and the row keeps its alignment.
 */
export function BlockControlRow({
  collapsed,
  onToggleCollapsed,
  dragHandleProps,
  title,
  isVisible,
  onToggleVisible,
  onAdd,
  addLabel = 'Add',
  onRestore,
  restoreLabel = 'Restore',
  onDelete,
  deleteLabel = 'Delete block',
  className = '',
  trailing,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  dragHandleProps?: Record<string, unknown>;
  title?: ReactNode;
  isVisible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  onAdd?: () => void;
  addLabel?: string;
  onRestore?: () => void;
  restoreLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {onToggleCollapsed && (
        <Tip label={collapsed ? 'Expand this block' : 'Collapse this block'}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggleCollapsed}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </Tip>
      )}

      {dragHandleProps && (
        <Tip label="Drag to reorder this block">
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none rounded hover:bg-muted active:cursor-grabbing"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4 text-blue-500" />
          </button>
        </Tip>
      )}

      <div className="min-w-0 flex-1 truncate text-draft font-medium">{title}</div>

      {onToggleVisible && (
        <Tip label={isVisible ? 'Hide this block from Part B' : 'Show this block in Part B'}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-pressed={!isVisible}
            onClick={() => onToggleVisible(!isVisible)}
          >
            {isVisible ? (
              <Eye className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
            )}
          </Button>
        </Tip>
      )}

      {onAdd && (
        <Tip label={addLabel}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </Tip>
      )}

      {onRestore && (
        <Tip label={restoreLabel}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRestore}>
            <Recycle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
          </Button>
        </Tip>
      )}

      {onDelete && (
        <Tip label={deleteLabel}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </Tip>
      )}

      {trailing}
    </div>
  );
}

export default BlockControlRow;
