import { cloneElement, forwardRef, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Hover label for an icon-only or otherwise ambiguous control.
 *
 * The same string is used for the visible tooltip and the child's
 * `aria-label`, so screen-reader users and sighted users get identical
 * wording and the two can never drift apart. `title` is deliberately removed
 * from the child: the browser's native tooltip would otherwise appear
 * alongside ours.
 *
 * Radix triggers used with `asChild` (`AlertDialogTrigger`, `DropdownMenuTrigger`
 * …) hand their behaviour — onClick, aria-* and a ref — to whatever element they
 * wrap. When that element is a `Tip`, those props must be forwarded onto the
 * child control, otherwise the control renders but does nothing.
 */
export const Tip = forwardRef<
  HTMLElement,
  {
    label: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    children: ReactNode;
  } & Record<string, unknown>
>(function Tip({ label, side = 'top', children, ...rest }, ref) {
  if (!isValidElement(children)) return <>{children}</>;

  const trigger = cloneElement(
    children as ReactElement<{ 'aria-label'?: string; title?: string }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { ...(rest as object), ref, 'aria-label': label, title: undefined } as any,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
});
