import { useMemo } from 'react';
import { B32MirrorSlotLiveView } from '@/components/B32MirrorSlotNodeView';
import type { B32SlotKey } from '@/extensions/B32MirrorSlotNode';
import type { CardField } from '@/types/cards';

/**
 * Source-fed mirrors for the B3.2 blocks.
 *
 * The B3.2 blocks are authored blocks (kind = 'text'), so the board renders
 * their card fields and nothing else. Their A2-sourced content — participant
 * capacity, critical infrastructure, value chain, industrial involvement and
 * the international justification — used to arrive through mirror slot nodes
 * embedded in the legacy section editor. This component re-attaches those same
 * renderers, above the authored modules, without turning the block into a
 * placeholder (its modules stay editable).
 *
 * Each slot renders nothing at all when the source has no content, so a
 * participant who wrote nothing produces no entry.
 */

const BLOCK_SLOTS: Record<string, B32SlotKey[]> = {
  'b32.interdisciplinarity': ['interdisciplinarity'],
  // The critical-infrastructure table is a stored module node
  // (`b32InfraTable`), not an auto-attached mirror slot.
  'b32.capacity': ['capacity'],
  // The value-chain slot now emits value chain content followed by industrial
  // involvement for each participant, so there is no separate industrial slot.
  'b32.value_chain_industrial': ['value-chain'],
  'b32.other_countries': ['international'],
};

export function b32BlockHasMirrors(templateKey: string | null | undefined): boolean {
  return !!templateKey && templateKey in BLOCK_SLOTS;
}

interface Props {
  proposalId: string;
  templateKey: string | null;
  /** Fields of the block — used to avoid double-rendering a slot the migrated HTML already carries. */
  fields: CardField[];
}

export function B32BlockMirrors({ proposalId, templateKey, fields }: Props) {
  const slots = useMemo(() => {
    const all = (templateKey && BLOCK_SLOTS[templateKey]) || [];
    if (all.length === 0) return [];
    const html = fields.map((f) => f.contentHtml || '').join('');
    // A migrated field may already embed the slot node; never render it twice.
    return all.filter((key) => !html.includes(`data-b32-slot-key="${key}"`));
  }, [templateKey, fields]);

  if (slots.length === 0) return null;

  return (
    <div className="space-y-2" data-b32-block-mirrors="">
      {slots.map((key) => (
        <B32MirrorSlotLiveView key={key} proposalId={proposalId} slotKey={key} />
      ))}
    </div>
  );
}

export default B32BlockMirrors;
