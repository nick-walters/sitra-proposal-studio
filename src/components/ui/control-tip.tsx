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
  ...rest
}: {
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
} & Record<string, unknown>) {
  if (!isValidElement(children)) return <>{children}</>;

  // Radix triggers (`AlertDialogTrigger asChild`, `DropdownMenuTrigger asChild`
  // …) hand their behaviour — onClick, aria-* and a ref — to this component as
  // props. Without forwarding them onto the child the control renders but does
  // nothing, which is what broke the linked-activity delete button.
  const trigger = cloneElement(
    children as ReactElement<{ 'aria-label'?: string; title?: string }>,
    { ...(rest as object), 'aria-label': label, title: undefined },
  );


  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
