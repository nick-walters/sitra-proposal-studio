/**
 * Browser-facing re-export of the canonical derived citation numbering.
 *
 * The implementation lives in `supabase/functions/_shared/citationNumbering.ts`
 * so the client and the edge functions run the SAME code — not two copies that
 * can drift. Never compute a citation number anywhere else.
 */
export {
  computeCitationNumbers,
  extractCitationRefKeys,
  type CitationInstance,
  type CitationNumberingBlock,
  type CitationNumberingField,
  type CitationNumberingSection,
} from '../../supabase/functions/_shared/citationNumbering';
