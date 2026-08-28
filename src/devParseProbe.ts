import { generateJSON, generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TRACK_CHANGE_MARKS } from '@/extensions/TrackChanges';

/** Temporary diagnostic: does this HTML keep its track marks through a parse? */
export function probe(html: string) {
  const ext = [StarterKit as any, ...TRACK_CHANGE_MARKS];
  const out = generateHTML(generateJSON(html, ext), ext);
  return {
    inCount: (html.match(/data-track-insertion/g) || []).length,
    outCount: (out.match(/data-track-insertion/g) || []).length,
    out: out.slice(0, 200),
  };
}

export async function probeSanitize(html: string) {
  const { sanitizeEditorHtml } = await import('@/lib/editorContentSanitizer');
  const out = sanitizeEditorHtml(html);
  return {
    inCount: (html.match(/data-track-insertion/g) || []).length,
    outCount: (out.match(/data-track-insertion/g) || []).length,
    out: out.slice(0, 200),
  };
}
