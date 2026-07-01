import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * B3.2 mirror-slots reconciler — Stage 3a.
 *
 * Ensures exactly one <b32MirrorSlot> node per slotKey exists in the B3.2
 * editor doc. Bindings are made via heading data-b32-slot-key ↔ node
 * slotKey attributes.
 *
 * Placement rule:
 *   - When a slot is MISSING, re-insert it directly AFTER its keyed heading's
 *     following intro paragraphs and before the next top-level heading.
 *   - When the HEADING itself is missing, re-insert the trio (heading +
 *     empty <p> + slot) at doc end as a last-resort recovery.
 *
 * Duplicates of the same slotKey (or slots with an unknown/absent slotKey)
 * are removed. All transactions: addToHistory:false + trackChangesInternal:true.
 */

const SLOT_KEYS = ['capacity', 'value-chain', 'international'] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

const HEADING_TEXT: Record<SlotKey, string> = {
  capacity: 'Participants\u2019 capacity, contributions & resources',
  'value-chain': 'Value chain coverage & industrial involvement',
  international:
    'Justification of the participation of international organisations & third countries',
};

export function useB32MirrorsReconciler({
  editor,
  sectionNumber,
  isReady,
}: {
  editor: Editor | null;
  sectionNumber: string | undefined | null;
  isReady: boolean;
}) {
  const active = !!editor && isReady && sectionNumber === 'B3.2';
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !editor) return;
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        try {
          if (!editor || editor.isDestroyed || !editor.schema) return;
          reconcile(editor);
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
  }, [active, editor]);
}

function reconcile(editor: Editor) {
  const doc = editor.state.doc;
  if (doc.content.size <= 2) return;

  const schema = editor.state.schema;
  const headingType = schema.nodes.heading;
  const paragraphType = schema.nodes.paragraph;
  const slotType = schema.nodes.b32MirrorSlot;
  if (!headingType || !paragraphType || !slotType) return;

  type Hit = { pos: number; size: number; node: any };
  const headingBySlot = new Map<SlotKey, Hit>();
  // Top-level heading positions in doc order (used to bound slot insertion).
  const headingPositions: number[] = [];
  const slotBySlot = new Map<SlotKey, Hit>();
  const removals: { pos: number; size: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      headingPositions.push(pos);
      const key = (node.attrs?.['data-b32-slot-key'] as string | null) || null;
      if (key && (SLOT_KEYS as readonly string[]).includes(key)) {
        const k = key as SlotKey;
        if (headingBySlot.has(k)) {
          // duplicate keyed heading — leave both; do not delete user content
        } else {
          headingBySlot.set(k, { pos, size: node.nodeSize, node });
        }
      }
      return false;
    }
    if (node.type?.name === 'b32MirrorSlot') {
      const key = (node.attrs?.slotKey as string | null) || null;
      if (!key || !(SLOT_KEYS as readonly string[]).includes(key)) {
        removals.push({ pos, size: node.nodeSize });
      } else {
        const k = key as SlotKey;
        if (slotBySlot.has(k)) {
          removals.push({ pos, size: node.nodeSize });
        } else {
          slotBySlot.set(k, { pos, size: node.nodeSize, node });
        }
      }
      return false;
    }
    return true;
  });

  // Build insertion plan: which slots need to be inserted, and at which pos.
  type Insert =
    | { kind: 'slot-under-heading'; key: SlotKey; insertPos: number }
    | { kind: 'trio-at-end'; key: SlotKey };
  const inserts: Insert[] = [];

  for (const k of SLOT_KEYS) {
    if (slotBySlot.has(k)) continue;
    const h = headingBySlot.get(k);
    if (h) {
      // insertPos = after the heading's following paragraphs, before the next top-level heading
      const nextHeadingPos = headingPositions.find((p) => p > h.pos);
      const boundary = nextHeadingPos ?? doc.content.size;
      // walk forward from immediately after heading; stop at the last paragraph
      // whose end is <= boundary; insert there. Simplest robust choice: insert
      // right after the heading + any immediately-following empty paragraphs.
      let cursor = h.pos + h.size;
      // consume up to 1 empty paragraph (the intro <p> the template seeds)
      const nextNode = doc.nodeAt(cursor);
      if (nextNode?.type?.name === 'paragraph' && nextNode.content.size === 0) {
        cursor += nextNode.nodeSize;
      }
      if (cursor > boundary) cursor = boundary;
      inserts.push({ kind: 'slot-under-heading', key: k, insertPos: cursor });
    } else {
      inserts.push({ kind: 'trio-at-end', key: k });
    }
  }

  if (removals.length === 0 && inserts.length === 0) return;

  let tr = editor.state.tr;

  // 1. Removals in reverse doc order (positions before any inserts).
  removals.sort((a, b) => b.pos - a.pos);
  for (const r of removals) {
    const from = tr.mapping.map(r.pos);
    const to = tr.mapping.map(r.pos + r.size);
    if (to > from) tr = tr.delete(from, to);
  }

  // 2. Insertions. Do slot-under-heading first (sorted by descending insertPos
  //    so later inserts don't shift earlier positions), then trio-at-end.
  const positioned = inserts.filter((i): i is Extract<Insert, { kind: 'slot-under-heading' }> => i.kind === 'slot-under-heading')
    .sort((a, b) => b.insertPos - a.insertPos);
  for (const ins of positioned) {
    const at = tr.mapping.map(ins.insertPos);
    tr = tr.insert(at, slotType.create({ slotKey: ins.key }));
  }
  const trios = inserts.filter((i): i is Extract<Insert, { kind: 'trio-at-end' }> => i.kind === 'trio-at-end');
  for (const ins of trios) {
    const nodes = [
      headingType.create(
        {
          level: 3,
          'data-default-subheading': 'true',
          'data-b32-slot-key': ins.key,
        },
        schema.text(HEADING_TEXT[ins.key]),
      ),
      paragraphType.create(),
      slotType.create({ slotKey: ins.key }),
    ];
    for (const n of nodes) {
      tr = tr.insert(tr.doc.content.size, n);
    }
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
}
