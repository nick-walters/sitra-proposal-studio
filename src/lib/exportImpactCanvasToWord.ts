import { supabase } from '@/integrations/supabase/client';

/**
 * Word-export swap for the Impact Canvas graphic.
 *
 * The prepared export container renders the canvas via
 * <ImpactCanvasGraphic /> which uses CSS grid + rounded boxes — layout
 * that Word's HTML renderer cannot honour. For .doc export we replace
 * the grid with a semantic <table> that RESEMBLES the graphic using
 * Word-compatible inline styles only (borders/padding/background/font).
 *
 * Caption stays intact (produced by <EditableCaption /> alongside the
 * graphic, same way other figures render their caption in Word).
 *
 * Called from useDocxExport BEFORE convertBadgesForWord so cross-ref
 * badges baked into cell HTML get converted alongside the rest of the
 * document in a single pass.
 */
export async function swapImpactCanvasForWord(
  container: HTMLElement,
  proposalId: string,
): Promise<void> {
  const graphic = container.querySelector<HTMLElement>(
    'div[data-impact-canvas-graphic="true"]',
  );
  if (!graphic) return;

  const [colsRes, rowsRes] = await Promise.all([
    supabase
      .from('impact_canvas_columns')
      .select('id, key, heading, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase
      .from('impact_canvas_rows')
      .select('id, content, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
  ]);

  const columns = (colsRes.data || []) as Array<{
    id: string;
    key: string;
    heading: string;
    order_index: number;
  }>;
  const rows = (rowsRes.data || []) as Array<{
    id: string;
    content: Record<string, string> | null;
    order_index: number;
  }>;

  if (columns.length === 0) {
    graphic.remove();
    return;
  }

  const escText = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');

  const headerStyle = [
    'border:1px solid #000',
    'padding:4pt 6pt',
    'background:#f2f2f2',
    'font-family:\'Arial Black\',Arial,sans-serif',
    'font-weight:900',
    'font-size:10pt',
    'color:#000',
    'text-align:left',
    'vertical-align:top',
  ].join(';');

  const cellStyle = [
    'border:1px solid #000',
    'padding:4pt 6pt',
    'font-family:Arial,sans-serif',
    'font-size:11pt',
    'color:#000',
    'text-align:left',
    'vertical-align:top',
  ].join(';');

  const headerCells = columns
    .map((c) => `<th style="${headerStyle}">${escText(c.heading || '')}</th>`)
    .join('');

  const bodyRows = rows
    .map((r) => {
      const tds = columns
        .map((c) => {
          const html = (r.content && r.content[c.key]) || '';
          return `<td style="${cellStyle}">${html || '&nbsp;'}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  const tableHtml = `<table data-impact-canvas-word="true" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin-top:4pt;margin-bottom:4pt;table-layout:fixed;"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = tableHtml;
  const replacement = wrapper.firstElementChild;
  if (replacement) graphic.replaceWith(replacement);
}
