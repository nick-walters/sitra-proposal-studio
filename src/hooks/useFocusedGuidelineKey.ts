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
  const { activeEditor } = useMethodologyEditorFocus();
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (!activeEditor) {
      setKey(null);
      return;
    }
    const dom = activeEditor.view.dom as HTMLElement;
    const holder = dom.closest('[data-guideline-key]') as HTMLElement | null;
    setKey(holder?.getAttribute('data-guideline-key') || null);
  }, [activeEditor]);

  return key;
}

export default useFocusedGuidelineKey;
