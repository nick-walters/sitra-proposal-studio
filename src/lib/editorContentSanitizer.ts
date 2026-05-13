// Re-export of the canonical sanitiser. The implementation lives in
// `supabase/functions/_shared/sanitizeEditorHtml.ts` so it can be imported
// by both the client (Vite) and Supabase edge functions (Deno).
export { sanitizeEditorHtml } from '../../supabase/functions/_shared/sanitizeEditorHtml';
