import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { renderRefBadges } from '@/lib/renderRefBadges';
import { useReferenceData } from '@/lib/referenceData';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { ensureRichHtml } from '@/lib/richTextUpgrade';

interface Props {
  proposalId: string;
  /** Stored value — HTML, or legacy plain text which is upgraded on read. */
  value: string | null | undefined;
  /** Rendered when the value is empty. */
  fallback?: string;
  className?: string;
}

/**
 * Read-only mirror of a rich-text field: resolves cross-reference chips
 * against live proposal data, then sanitises. Used by the B3.1 tables that
 * mirror A3 cost justifications, which used to be plain strings and would
 * otherwise print their markup.
 */
export function MirroredRichText({ proposalId, value, fallback = '—', className }: Props) {
  const { data: refData } = useReferenceData(proposalId);
  const html = useMemo(() => {
    const source = ensureRichHtml(value);
    if (!source.trim()) return '';
    return DOMPurify.sanitize(renderRefBadges(source, refData), CROSS_REF_RICH_TEXT_CONFIG);
  }, [value, refData]);

  if (!html) return <>{fallback}</>;
  // The FIRST paragraph runs inline so a cell that prefixes the value (the
  // bold-italic cost category in tables 3.1.g / 3.1.h) keeps it on one line;
  // any further paragraphs stay blocks and break as authored.
  const base = '[&_p]:m-0 [&>p:first-child]:inline';
  return (
    <span
      className={className ? `${className} ${base}` : base}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

