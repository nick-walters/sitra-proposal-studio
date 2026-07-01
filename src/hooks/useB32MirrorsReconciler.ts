import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * B3.2 mirror-slots reconciler — Stage 3a-iii.
 *
 * Ensures exactly one <b32MirrorSlot> node exists for each of the six slot
 * keys in the B3.2 editor doc. Bindings are made via a heading's
 * data-b32-slot-key ("primary" key) and each slot key's owning heading.
 *
 * Owning-heading map:
 *   interdisciplinarity → interdisciplinarity heading (primary: interdisciplinarity)
 *   capacity           → capacity heading            (primary: capacity)
 *   infrastructure     → capacity heading            (secondary, after capacity)
 *   value-chain        → value-chain heading         (primary: value-chain)
 *   industrial         → value-chain heading         (secondary, after value-chain)
 *   international      → international heading       (primary: international)
 *
 * Placement rule (missing slot):
 *   - Locate the owning heading via its data-b32-slot-key = primary.
 *   - Skip one immediately-following empty <p> (the intro paragraph).
 *   - Skip any already-present sibling slots that must precede this one
 *     (per ORDER_UNDER_HEADING) so ordering is preserved.
 *   - Insert there, before the next top-level heading.
 *   - If the owning heading is missing entirely, fall back to appending
 *     [heading + <p></p> + slot] at doc end.
 *
 * Duplicates of the same slotKey (or slots with an unknown/absent slotKey)
 * are removed. All transactions: addToHistory:false + trackChangesInternal:true.
 */

const SLOT_KEYS = [
  'interdisciplinarity',
  'capacity',
  'infrastructure',
  'value-chain',
  'industrial',
  'international',
] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

type PrimaryKey = 'interdisciplinarity' | 'capacity' | 'value-chain' | 'international';

// Which heading (by primary key) owns each slot key.
const OWNER: Record<SlotKey, PrimaryKey> = {
  interdisciplinarity: 'interdisciplinarity',
  capacity: 'capacity',
  infrastructure: 'capacity',
  'value-chain': 'value-chain',
  industrial: 'value-chain',
  international: 'international',
};

// Order of slot keys under each owning heading (first → last).
const ORDER_UNDER_HEADING: Record<PrimaryKey, SlotKey[]> = {
  interdisciplinarity: ['interdisciplinarity'],
  capacity: ['capacity', 'infrastructure'],
  'value-chain': ['value-chain', 'industrial'],
  international: ['international'],
};

// Fallback heading text for the trio-at-end recovery path.
const HEADING_TEXT: Record<PrimaryKey, string> = {
  interdisciplinarity:
    'Interdisciplinarity & complementarity of the consortium for addressing the project\u2019s objectives',
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
  const headingByPrimary = new Map<PrimaryKey, Hit>();
  const headingPositions: number[] = [];
  const slotBySlot = new Map<SlotKey, Hit>();
  const removals: { pos: number; size: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      headingPositions.push(pos);
      const key = (node.attrs?.['data-b32-slot-key'] as string | null) || null;
      if (key && (['interdisciplinarity', 'capacity', 'value-chain', 'international'] as string[]).includes(key)) {
        const k = key as PrimaryKey;
        if (!headingByPrimary.has(k)) {
          headingByPrimary.set(k, { pos, size: node.nodeSize, node });
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

  type Insert =
    | { kind: 'slot-under-heading'; key: SlotKey; insertPos: number }
    | { kind: 'trio-at-end'; key: SlotKey };
  const inserts: Insert[] = [];

  for (const k of SLOT_KEYS) {
    if (slotBySlot.has(k)) continue;
    const primary = OWNER[k];
    const h = headingByPrimary.get(primary);
    if (h) {
      const nextHeadingPos = headingPositions.find((p) => p > h.pos);
      const boundary = nextHeadingPos ?? doc.content.size;

      let cursor = h.pos + h.size;
      // consume up to 1 empty intro paragraph
      const nextNode = doc.nodeAt(cursor);
      if (nextNode?.type?.name === 'paragraph' && nextNode.content.size === 0) {
        cursor += nextNode.nodeSize;
      }
      // consume any preceding sibling slots that must come BEFORE this one.
      const order = ORDER_UNDER_HEADING[primary];
      const myIdx = order.indexOf(k);
      for (let i = 0; i < myIdx; i++) {
        const sib = slotBySlot.get(order[i]);
        if (sib && sib.pos + sib.size > cursor && sib.pos + sib.size <= boundary) {
          cursor = sib.pos + sib.size;
        }
      }
      if (cursor > boundary) cursor = boundary;
      inserts.push({ kind: 'slot-under-heading', key: k, insertPos: cursor });
    } else {
      inserts.push({ kind: 'trio-at-end', key: k });
    }
  }

  if (removals.length === 0 && inserts.length === 0) return;

  let tr = editor.state.tr;

  removals.sort((a, b) => b.pos - a.pos);
  for (const r of removals) {
    const from = tr.mapping.map(r.pos);
    const to = tr.mapping.map(r.pos + r.size);
    if (to > from) tr = tr.delete(from, to);
  }

  const positioned = inserts
    .filter((i): i is Extract<Insert, { kind: 'slot-under-heading' }> => i.kind === 'slot-under-heading')
    .sort((a, b) => b.insertPos - a.insertPos);
  for (const ins of positioned) {
    const at = tr.mapping.map(ins.insertPos);
    tr = tr.insert(at, slotType.create({ slotKey: ins.key }));
  }
  const trios = inserts.filter((i): i is Extract<Insert, { kind: 'trio-at-end' }> => i.kind === 'trio-at-end');
  for (const ins of trios) {
    const primary = OWNER[ins.key];
    // Only emit the heading if the primary heading is truly missing. For
    // secondary keys under an existing owner, the earlier slot-under-heading
    // branch already covered that case; a trio here means the owner heading
    // wasn't found at all — recreate it and drop the slot under it.
    const nodes = [
      headingType.create(
        {
          level: 3,
          'data-default-subheading': 'true',
          'data-b32-slot-key': primary,
        },
        schema.text(HEADING_TEXT[primary]),
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
