import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The one collapse control every board uses — Part B blocks, WP draft blocks
 * and task modules. Chevron up means "collapse me", chevron down means
 * "expand me", matching the page-wide Collapse all button in the toolbar.
 * Collapse state is a per-user view preference only; it never touches the
 * document, its visibility, its numbering or any export.
 */
export function CollapseChevron({
  collapsed,
  onToggle,
  label = 'block',
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}) {
  const tip = collapsed ? `Expand this ${label}` : `Collapse this ${label}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={tip}
          aria-expanded={!collapsed}
          className={cn('h-7 w-7 shrink-0', className)}
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export default CollapseChevron;
