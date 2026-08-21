/**
 * Browser-facing re-export of the canonical citation source collection.
 *
 * The implementation lives in `supabase/functions/_shared/citationSources.ts`
 * so the client and the edge functions build the numbering inputs from the
 * same code. Never assemble them anywhere else.
 */
export {
  buildCitationNumberMap,
  legacySectionKey,
  type CitationSources,
  type CitationSourceCard,
  type CitationSourceField,
  type CitationSourceLegacySection,
} from '../../supabase/functions/_shared/citationSources';
