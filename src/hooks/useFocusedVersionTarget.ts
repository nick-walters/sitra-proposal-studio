import { useEffect, useState } from 'react';
import { useMethodologyEditorFocus } from '@/components/MethodologyEditorFocusContext';
import type { VersionTargetType } from '@/hooks/useTargetVersions';

export interface FocusedVersionTarget {
  targetType: VersionTargetType;
  targetId: string;
  textBox: string;
  label: string;
}

/**
 * Serialises a version target into the DOM marker the toolbar reads.
 *
 * Version history is addressed the same way guidance is (`data-guideline-key`):
 * a surface marks an ancestor of the field, and the focused editor inherits the
 * nearest one. That keeps every WP and case field version-aware without
 * threading a target through the shared toolbar.
 */
export function versionTargetAttr(
  targetType: VersionTargetType,
  targetId: string,
  textBox: string,
): string {
  return `${targetType}|${targetId}|${textBox}`;
}

/** Resolves the version target for whichever field currently owns the toolbar. */
export function useFocusedVersionTarget(): FocusedVersionTarget | null {
  const { activeEditor, scalarField } = useMethodologyEditorFocus();
  const [target, setTarget] = useState<FocusedVersionTarget | null>(null);

  useEffect(() => {
    const from = (activeEditor?.view.dom as HTMLElement | undefined) ?? scalarField;
    if (!from) {
      setTarget(null);
      return;
    }
    const holder = from.closest('[data-version-target]') as HTMLElement | null;
    const raw = holder?.getAttribute('data-version-target') || '';
    const [targetType, targetId, textBox] = raw.split('|');
    if (!targetType || !targetId || !textBox) {
      setTarget(null);
      return;
    }
    setTarget({
      targetType: targetType as VersionTargetType,
      targetId,
      textBox,
      label: holder?.getAttribute('data-version-label') || textBox,
    });
  }, [activeEditor, scalarField]);

  return target;
}

export default useFocusedVersionTarget;
