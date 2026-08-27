import {
  useTargetVersions,
  targetVersionsKey,
  type VersionTarget,
} from './useTargetVersions';
import type { CardTextBox } from '@/types/cards';

export const cardFieldVersionsKey = (fieldId: string, textBox: CardTextBox) =>
  targetVersionsKey({ targetType: 'card_field', targetId: fieldId, textBox });

/**
 * Version history for ONE text box of a module (header or content). History
 * survives soft deletion of the module and of its parent block.
 *
 * This is now a thin wrapper over the target-generic hook: a module is simply
 * the `card_field` target type.
 */
export function useCardFieldVersions(
  fieldId: string,
  textBox: CardTextBox,
  options?: { enabled?: boolean },
) {
  const target: VersionTarget = {
    targetType: 'card_field',
    targetId: fieldId,
    textBox,
  };

  return useTargetVersions(target, {
    enabled: options?.enabled,
    invalidateKeys: [['card-fields-batch'], ['card-fields']],
  });
}
