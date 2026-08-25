import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { FootnoteCitation } from '@/components/FootnoteCitation';
import { useSectionCitedReferences } from '@/hooks/useSectionCitedReferences';
import { citationHtml } from '@/lib/sectionCitations';

/**
 * The per-section reference list.
 *
 * It lists every reference cited by the VISIBLE content of the section —
 * card blocks and the legacy `section_content` body alike — ordered by the
 * derived display number, so a reference first cited in an earlier section
 * keeps its lower number here. References cited only in hidden blocks follow
 * at the end, unnumbered and labelled as such.
 *
 * This is NOT the PDF/DOCX footnote apparatus (Phase 5); it is the on-screen
 * per-section list.
 */

/** Scrolls to the first citation of this reference inside the section. */
function jumpToFirstCitation(refKey: number) {
  const target = document.querySelector<HTMLElement>(`[data-citation="${refKey}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('ring-2', 'ring-primary', 'rounded');
  window.setTimeout(() => target.classList.remove('ring-2', 'ring-primary', 'rounded'), 1600);
}

export function ReferencesBlock({
  proposalId,
  sectionId,
}: {
  proposalId: string;
  sectionId: string;
}) {
  const { entries } = useSectionCitedReferences(proposalId, sectionId);

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        html: DOMPurify.sanitize(
          `<sup data-cite-number="">${entry.displayNumber ?? '—'}</sup> ` +
            `<span data-cite-title="">${citationHtml(entry.reference)}</span>`,
          {
            ALLOWED_TAGS: ['em', 'strong', 'sup', 'span', 'i', 'b'],
            ALLOWED_ATTR: ['style', 'data-cite-title', 'data-cite-number'],
          },
        ),
      })),
    [entries],
  );

  // Nothing cited: the EDITOR still shows the block, with a note, so the author
  // knows the tail block exists. The EXPORT omits it entirely — that rule lives
  // in `printRenderer.tsx` (`appendSectionReferences` returns early when empty).
  if (rows.length === 0) {
    return (
      <p
        data-references-block=""
        contentEditable={false}
        suppressContentEditableWarning
        className="text-sm italic text-muted-foreground"
      >
        This section cites no references yet. This block stays empty and is left out of the
        exported document until something in the section is cited.
      </p>
    );
  }


  return (
    <div data-references-block="" contentEditable={false} suppressContentEditableWarning>
      {rows.map((row) => (
        <div key={row.refKey} className="group flex items-baseline gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left hover:underline"
            onClick={() => jumpToFirstCitation(row.refKey)}
            title="Jump to the first citation of this reference in this section"
          >
            <FootnoteCitation html={row.html} />
          </button>
          {row.displayNumber === null && (
            <span className="shrink-0 text-[8pt] italic text-muted-foreground">
              not currently cited in visible content
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default ReferencesBlock;
