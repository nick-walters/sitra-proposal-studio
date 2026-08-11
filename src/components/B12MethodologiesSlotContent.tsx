import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';
import { splitMethodologyRunsWithPlaceholder } from '@/lib/b12MethodologyRuns';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';


/**
 * B1.2 mirror — 'methodologies' slot.
 *
 * Read-only mirror of methodology_items. Each methodology item is rendered as
 * an inline bold-italic heading + colon, with the first paragraph of the stored
 * body continuing on the same line. A case placeholder that follows the run is
 * rendered the same way, with a heading DERIVED from the case type's plural
 * label, so it labels the cases table beneath.
 */

interface MethodologyItemRow {
  id: string;
  kind: string;
  caseTypeId: string | null;
  heading: string;
  contentHtml: string | null;
  orderIndex: number;
}

/** Same query key as the Methodologies page, so edits propagate live. */
function useMethodologyItemsMirror(proposalId: string) {
  return useQuery({
    queryKey: ['methodology-items', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<MethodologyItemRow[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('methodology_items')
        .select('id, proposal_id, kind, case_type_id, heading, content_html, assigned_participant_id, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        kind: r.kind,
        caseTypeId: r.case_type_id,
        heading: r.heading,
        contentHtml: r.content_html,
        orderIndex: r.order_index,
      }));
    },
  });
}

interface CaseTypeRow {
  id: string;
  type_code: string | null;
  custom_type_name: string | null;
  order_index: number | null;
}

/** Same query key as the Methodologies page, so renames propagate live. */
function useCaseTypesMirror(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-case-types-methodology-placeholders', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<CaseTypeRow[]> => {
      const { data } = await supabase
        .from('proposal_case_types')
        .select('id, type_code, custom_type_name, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index', { ascending: true, nullsFirst: false });
      return (data ?? []) as CaseTypeRow[];
    },
  });
}


function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isBlank(html: string | null | undefined): boolean {
  const s = (html ?? '').toString();
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').replace(/\u00a0/g, '').trim() === '';
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'SECTION', 'ARTICLE',
]);

function firstContentBlock(root: ParentNode): Element | null {
  for (const child of Array.from(root.children) as Element[]) {
    if (!BLOCK_TAGS.has(child.tagName)) return null;
    const text = (child.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (!text) continue;
    return child;
  }
  return null;
}

/**
 * Splices `prefixHtml` (the bold italic heading + colon) into the first
 * paragraph-like block of the body so they share a line. Lists and tables
 * cannot host inline content, so the heading stays on its own line above.
 */
function buildItemHtml(headingText: string, bodyHtml: string | null): string {
  const heading = (headingText || '').trim();
  const prefixHtml = heading
    ? `<strong><em>${escapeHtml(heading)}:</em></strong>`
    : '';
  const body = isBlank(bodyHtml) ? '' : sanitizeEditorHtml((bodyHtml ?? '').toString());

  if (!prefixHtml && !body) return '';
  if (!body) return `<p>${prefixHtml}</p>`;
  if (!prefixHtml) return body;

  if (typeof document === 'undefined') {
    return `<p>${prefixHtml}</p>${body}`;
  }

  const tpl = document.createElement('template');
  tpl.innerHTML = body;
  const first = firstContentBlock(tpl.content);

  if (first && first.tagName !== 'UL' && first.tagName !== 'OL' && first.tagName !== 'LI' && first.tagName !== 'TABLE') {
    const prefixTpl = document.createElement('template');
    prefixTpl.innerHTML = `${prefixHtml} `;
    const nodes = Array.from(prefixTpl.content.childNodes);
    for (let i = nodes.length - 1; i >= 0; i--) {
      first.insertBefore(nodes[i], first.firstChild);
    }
    return tpl.innerHTML;
  }

  if (first) return `<p>${prefixHtml}</p>${body}`;
  return `<p>${prefixHtml} ${body}</p>`;
}

export interface B12MethodologiesSlotContentProps {
  proposalId: string;
  /** Which run of methodology items to render (0-based). */
  runIndex?: number | null;
}

export function B12MethodologiesSlotContent({
  proposalId,
  runIndex = 0,
}: B12MethodologiesSlotContentProps) {
  const { data: items = [] } = useMethodologyItemsMirror(proposalId);
  const { data: caseTypes = [] } = useCaseTypesMirror(proposalId);

  const runs = splitMethodologyRunsWithPlaceholder(items);
  const run = runs[runIndex ?? 0] ?? { items: [], placeholder: null };

  const blocks = run.items
    .map((i) => ({ id: i.id, html: buildItemHtml(i.heading, i.contentHtml) }))
    .filter((b) => b.html);

  const placeholder = run.placeholder;
  if (placeholder) {
    const type = caseTypes.find((t) => t.id === placeholder.caseTypeId);
    if (type) {
      const label = getCaseTypeLabel(type.type_code, type.custom_type_name, { plural: true });
      // Heading is derived and always rendered — it labels the table beneath.
      const html = buildItemHtml(label, placeholder.contentHtml);
      if (html) blocks.push({ id: placeholder.id, html });
    }
  }

  if (blocks.length === 0) return null;



  return (
    <div data-b12-methodologies-mirror="">
      {blocks.map((b) => (
        <div
          key={b.id}
          data-b12-methodology-item={b.id}
          className="font-['Times_New_Roman',Times,serif] text-[11pt] text-justify [&_p]:mt-[3pt] [&_p]:mb-[3pt] [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[calc(1.5em-4pt)] [&_ol]:pl-[calc(1.5em-4pt)] [&_li::marker]:text-[0.85em] [&_li]:my-[1pt]"
          dangerouslySetInnerHTML={{ __html: b.html }}
        />
      ))}
    </div>
  );
}

export default B12MethodologiesSlotContent;
