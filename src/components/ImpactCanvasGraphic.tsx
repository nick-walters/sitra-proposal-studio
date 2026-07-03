import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';

interface Props {
  proposalId: string;
  /** Wrapper class override (e.g. remove Card chrome for B2.1 mirror). */
  className?: string;
}

/**
 * Sanitiser preserves cross-reference badge markup produced by the WP /
 * Case / Inline (task, deliverable) TipTap nodes: data-* attrs, inline
 * styles, contenteditable="false", and the SVG pentagon used for
 * deliverable badges. Shared by the builder preview AND the B2.1 mirror
 * so both render identically.
 */
const CELL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'span', 'svg', 'path'],
  ALLOWED_ATTR: [
    'class',
    'style',
    'contenteditable',
    'width', 'height', 'viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin',
  ],
  ALLOW_DATA_ATTR: true,
};

function sanitize(html: string) {
  return DOMPurify.sanitize(html || '', CELL_SANITIZE_CONFIG);
}

/**
 * ImpactCanvasGraphic — the structured blocks-per-row grid rendering of
 * the impact canvas. Single source used by both the ImpactCanvasBuilder
 * "Canvas preview" and the B2.1 read-only mirror (ImpactCanvasSection).
 *
 * Read-only: cells are rendered as sanitised HTML — no editing here.
 * Editing lives on the figure/builder page only.
 */
export function ImpactCanvasGraphic({ proposalId, className }: Props) {
  const qc = useQueryClient();
  const { columns, isLoading: colsLoading } = useImpactCanvasColumns(proposalId);
  const { rows, isLoading: rowsLoading } = useImpactCanvasRows(proposalId);

  // Re-fetch when upstream reference data changes (WP colours renamed,
  // case abbreviations toggled, task/deliverable renumbering, etc.) so
  // baked badge markup in cells is refreshed alongside builder edits.
  useEffect(() => {
    if (!proposalId) return;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['impact-canvas-columns', proposalId] });
      qc.invalidateQueries({ queryKey: ['impact-canvas-rows', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [proposalId, qc]);

  if (colsLoading || rowsLoading) {
    return <div className={className ?? 'p-4 text-xs text-muted-foreground'}>Loading impact canvas…</div>;
  }

  const columnOrder = columns.slice().sort((a, b) => a.order_index - b.order_index);

  if (columnOrder.length === 0) {
    return (
      <p className={`${className ?? ''} text-xs text-muted-foreground italic py-6 text-center`}>
        No columns defined.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className={`${className ?? ''} text-xs text-muted-foreground italic py-6 text-center`}>
        No rows yet.
      </p>
    );
  }

  return (
    <div
      className={`${className ?? ''} grid gap-2 font-['Times_New_Roman',Times,serif]`}
      style={{ gridTemplateColumns: `repeat(${columnOrder.length}, minmax(0, 1fr))` }}
      data-impact-canvas-graphic="true"
    >
      {columnOrder.map((c) => (
        <div
          key={`h-${c.id}`}
          className="text-[11px] font-bold text-black text-left pb-1 whitespace-pre-line flex items-center"
          style={{ fontFamily: '"Arial Black", Arial, sans-serif' }}
        >
          {c.heading}
        </div>
      ))}
      {rows.map((row) =>
        columnOrder.map((c) => (
          <div
            key={`${row.id}-${c.id}`}
            className="border border-border rounded-md bg-muted/30 p-2 min-h-[80px] text-xs flex items-center"
          >
            <div
              className="prose prose-sm max-w-none w-full"
              dangerouslySetInnerHTML={{ __html: sanitize(row.content[c.key] || '') }}
            />
          </div>
        )),
      )}
    </div>
  );
}
