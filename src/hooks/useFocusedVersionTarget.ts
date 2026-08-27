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
 * Resolves the version-history target for whichever field currently owns the
 * shared toolbar, using the same DOM-marker approach as
 * `useFocusedGuidelineKey`: a surface marks the field's container with
 * `data-version-target="<type>|<row id>|<text box>"` and, optionally,
 * `data-version-label="…"`. Nothing has to be threaded through the
 * intermediate table and row components.
 */
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
      label: holder?.getAttribute('data-version-label') || 'This field',
    });
  }, [activeEditor, scalarField]);

  return target;
}

/** Builds the marker attribute value. */
export const versionTargetAttr = (
  targetType: VersionTargetType,
  targetId: string,
  textBox: string,
) => `${targetType}|${targetId}|${textBox}`;

export default useFocusedVersionTarget;
