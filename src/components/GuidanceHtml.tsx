/**
 * Guidance is authored in the admin rich text editor, so it arrives as HTML.
 * Rendering it as a text node showed the markup verbatim; rendering it raw
 * would trust admin-authored HTML blindly. Sanitise, then render.
 *
 * Legacy rows hold plain text with newlines, so the wrapper keeps
 * `whitespace-pre-wrap`: HTML block elements are unaffected by it, and plain
 * text keeps its line breaks.
 */
import DOMPurify from 'dompurify';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';

export function GuidanceHtml({
  html,
  className = '',
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={`guidance-html whitespace-pre-wrap [&_ol]:list-decimal [&_ul]:list-disc [&_li]:ml-5 [&_p]:mb-2 [&_p:last-child]:mb-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || '', RICH_TEXT_CONFIG) }}
    />
  );
}

export default GuidanceHtml;
