/**
 * Shared TipTap editorProps fragment that wires the universal
 * stripWordHtml cleaner into a useEditor instance's paste pipeline.
 *
 * Usage:
 *   useEditor({
 *     editorProps: { ...wordCleanPasteProps, ...otherProps },
 *   });
 *
 * stripWordHtml keeps basic formatting and preserves every custom
 * TipTap node via ALLOWED_DATA_ATTRS / ALLOWED_CLASSES.
 */
import { stripWordHtml } from '@/lib/stripWordHtml';

export const wordCleanPasteProps = {
  transformPastedHTML: (html: string) => stripWordHtml(html),
};
