import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * B1.1 overview-canvas slot reconciler.
 *
 * Ensures exactly one <overviewCanvasSlot> node exists in the B1.1 editor,
 * placed at the END of the "Objectives" subsection (immediately before the
 * next top-level heading). If the Objectives heading is missing, the slot is
 * appended at the end of the document. Duplicates are removed.
 * All transactions: addToHistory:false + trackChangesInternal:true.
 */
export function useOverviewCanvasSlotReconciler({
  editor,
  sectionNumber,
  isReady,
  enabled,
}: {
  editor: Editor | null;
  sectionNumber: string | undefined | null;
  isReady: boolean;
  enabled: boolean;
}) {
  const active = !!editor && isReady && sectionNumber === 'B1.1';
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !editor) return;
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        try {
          if (!editor || editor.isDestroyed || !editor.schema) return;
          reconcile(editor, enabled);
        } catch {
          // best-effort — never throw out of an effect
        }
      }, 300);
    };
    schedule();
    editor.on('update', schedule);
    return () => {
      editor.off('update', schedule);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [active, editor, enabled]);
}

function reconcile(editor: Editor, enabled: boolean) {
  const doc = editor.state.doc;
  const slotType = editor.state.schema.nodes.overviewCanvasSlot;
  if (!slotType) return;
  if (doc.content.size <= 2) return;

  const slots: Array<{ pos: number; size: number }> = [];
  const headingPositions: Array<{ pos: number; size: number; text: string }> = [];

  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      headingPositions.push({ pos, size: node.nodeSize, text: (node.textContent || '').trim().toLowerCase() });
      return false;
    }
    if (node.type?.name === 'overviewCanvasSlot') {
      slots.push({ pos, size: node.nodeSize });
      return false;
    }
    return true;
  });

  const removals = enabled ? slots.slice(1) : slots.slice();
  const needsInsert = enabled && slots.length === 0;
  if (removals.length === 0 && !needsInsert) return;

  let tr = editor.state.tr;

  removals.sort((a, b) => b.pos - a.pos);
  for (const r of removals) {
    const from = tr.mapping.map(r.pos);
    const to = tr.mapping.map(r.pos + r.size);
    if (to > from) tr = tr.delete(from, to);
  }

  if (needsInsert) {
    const objectives = headingPositions.find((h) => h.text === 'objectives');
    let at = doc.content.size;
    if (objectives) {
      const next = headingPositions.find((h) => h.pos > objectives.pos);
      at = next ? next.pos : doc.content.size;
    }
    tr = tr.insert(tr.mapping.map(at), slotType.create());
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
}
