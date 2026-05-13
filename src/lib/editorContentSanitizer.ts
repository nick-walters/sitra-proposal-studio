// Re-export of the canonical sanitiser. The implementation lives in
// `shared/sanitizeEditorHtml.ts` so it can be imported by both the client
// and Supabase edge functions.
export { sanitizeEditorHtml } from '../../shared/sanitizeEditorHtml';
