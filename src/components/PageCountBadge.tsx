/**
 * "31 / 45 pages" in the proposal top bar.
 *
 * The number is the real compiled page count whenever Part B has been
 * compiled in this session; before that it falls back to the recalibrated
 * word estimate and says so, so an author is never shown an approximation
 * that looks authoritative.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePageCount } from '@/hooks/usePageCount';
import { cn } from '@/lib/utils';

interface Props {
  proposalId: string;
}

export function PageCountBadge({ proposalId }: Props) {
  const { pages, isCompiled, isStale, words, limit, overLimit, isLoading } = usePageCount(proposalId);

  if (!proposalId || (isLoading && pages === null)) return null;
  if (pages === null) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden md:flex flex-col items-end leading-tight px-2 cursor-default">
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums',
              overLimit ? 'text-destructive' : 'text-foreground',
            )}
          >
            {pages} / {limit} pages
            {!isCompiled && <span className="ml-1 font-normal text-muted-foreground">(est.)</span>}
            {isCompiled && isStale && (
              <span className="ml-1 font-normal text-muted-foreground">(changed)</span>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {words.toLocaleString('en-GB')} words
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isCompiled ? (
          <p>
            Compiled page count from the Part B document
            {isStale ? ' — content has changed since; open Part B to recompile.' : '.'}
          </p>
        ) : (
          <p>Estimated from the word count. Open Part B to compile the real page count.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Page limit {limit}, including any modifiers applied to this proposal.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default PageCountBadge;
