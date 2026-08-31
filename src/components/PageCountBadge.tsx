/**
 * "Part B1.1 est. 3 pages · Part B 32 / 45 pages" in the proposal top bar.
 *
 * Two numbers, because the whole-document count alone never tells an author
 * what THEIR section costs. Each is the real compiled count where one exists —
 * the full document publishes its count from `PartBDocumentView`, a section
 * publishes its own from the Typst section preview — and a word-derived
 * estimate otherwise, marked "est." so an approximation never looks
 * authoritative.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePageCount, useSectionPageCount } from '@/hooks/usePageCount';
import { cn } from '@/lib/utils';

interface Props {
  proposalId: string;
  /** The section currently open, so its own cost can be shown beside the total. */
  sectionId?: string | null;
  /** Its display label, e.g. "Part B1.1" or "B3.1". */
  sectionLabel?: string | null;
}

export function PageCountBadge({ proposalId, sectionId, sectionLabel }: Props) {
  const { pages, isCompiled, isStale, words, limit, overLimit, isLoading } = usePageCount(proposalId);
  const section = useSectionPageCount(proposalId, sectionId);

  if (!proposalId || (isLoading && pages === null)) return null;
  if (pages === null) return null;

  const showSection = !!sectionId && !!sectionLabel && section.pages !== null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden md:flex flex-col items-end leading-tight px-2 cursor-default">
          <span className="text-[11px] font-semibold tabular-nums">
            {showSection && (
              <span className="font-normal text-muted-foreground">
                {sectionLabel} {section.isCompiled ? '' : 'est. '}
                {section.pages} {section.pages === 1 ? 'page' : 'pages'}
                <span className="mx-1.5">&middot;</span>
              </span>
            )}
            <span className={cn(overLimit ? 'text-destructive' : 'text-foreground')}>
              Part B {pages} / {limit} pages
              {!isCompiled && <span className="ml-1 font-normal text-muted-foreground">(est.)</span>}
              {isCompiled && isStale && (
                <span className="ml-1 font-normal text-muted-foreground">(changed)</span>
              )}
            </span>
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
        {showSection && (
          <p>
            {sectionLabel} is {section.pages} {section.pages === 1 ? 'page' : 'pages'}
            {section.isCompiled
              ? section.isStale
                ? ', compiled before the latest change.'
                : ', compiled.'
              : `, estimated from ${section.words.toLocaleString('en-GB')} words.`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Page limit {limit}, including any modifiers applied to this proposal.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default PageCountBadge;
