import { useEffect, useState } from 'react';
import { useMethodologyEditorFocus } from '@/components/MethodologyEditorFocusContext';

/**
 * Resolves the guidance key for whichever rich-text field currently owns the
 * shared toolbar.
 *
 * Keying is done in the DOM rather than through props: a surface marks any
 * ancestor of a field with `data-guideline-key="…"`, and the focused editor
 * inherits the nearest one. That keeps a per-field key from having to be
 * threaded through every intermediate component, and it works identically for
 * fields the surface renders itself and fields rendered by shared tables.
 */
export function useFocusedGuidelineKey(): string | null {
  const { activeEditor, scalarField } = useMethodologyEditorFocus();
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    // A focused scalar control (select, date picker, assign button) belongs to
    // a block just as much as a rich field does, so it resolves a key too.
    const from = (activeEditor?.view.dom as HTMLElement | undefined) ?? scalarField;
    if (!from) {
      setKey(null);
      return;
    }
    const holder = from.closest('[data-guideline-key]') as HTMLElement | null;
    setKey(holder?.getAttribute('data-guideline-key') || null);
  }, [activeEditor, scalarField]);

  return key;
}

export default useFocusedGuidelineKey;
