import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Hover label for an icon-only or otherwise ambiguous control.
 *
 * The same string is used for the visible tooltip and the child's
 * `aria-label`, so screen-reader users and sighted users get identical
 * wording and the two can never drift apart. `title` is deliberately removed
 * from the child: the browser's native tooltip would otherwise appear
 * alongside ours.
 */
export function Tip({
  label,
  side = 'top',
  children,
}: {
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}) {
  if (!isValidElement(children)) return <>{children}</>;

  const trigger = cloneElement(
    children as ReactElement<{ 'aria-label'?: string; title?: string }>,
    { 'aria-label': label, title: undefined },
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
