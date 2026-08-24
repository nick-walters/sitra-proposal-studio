import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Editor } from '@tiptap/react';

interface MethodologyEditorFocusValue {
  activeEditor: Editor | null;
  registerFocus: (editor: Editor) => void;
  /** Editor lost DOM focus; the toolbars hide unless focus lands on chrome. */
  notifyBlur: (editor: Editor) => void;
  unregister: (editor: Editor) => void;
}

const MethodologyEditorFocusContext = createContext<MethodologyEditorFocusValue | null>(null);

/**
 * Tracks which Methodologies-page editor the single page-wide formatting
 * toolbar should act on.
 *
 * Clicking a toolbar button must not drop the target mid-action, so a blur
 * only clears the active editor after a short grace period, and only when
 * focus has genuinely left both the editors and the toolbar chrome. The
 * active editor also changes when another editor gains focus, and clears when
 * the active editor unmounts.
 */
export function MethodologyEditorFocusProvider({ children }: { children: ReactNode }) {
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  const clearTimer = useRef<number | null>(null);

  const cancelPendingClear = useCallback(() => {
    if (clearTimer.current !== null) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const registerFocus = useCallback(
    (editor: Editor) => {
      cancelPendingClear();
      setActiveEditor((prev) => (prev === editor ? prev : editor));
    },
    [cancelPendingClear],
  );

  const notifyBlur = useCallback(
    (editor: Editor) => {
      cancelPendingClear();
      clearTimer.current = window.setTimeout(() => {
        clearTimer.current = null;
        const el = document.activeElement as HTMLElement | null;
        // Focus moved into the toolbars, a dialog raised from them, or another
        // editor: the toolbars stay, still pointed at their target.
        if (
          el &&
          (el.closest('[data-editor-chrome]') ||
            el.closest('[role="dialog"]') ||
            el.closest('.ProseMirror'))
        ) {
          return;
        }
        setActiveEditor((prev) => (prev === editor ? null : prev));
      }, 200);
    },
    [cancelPendingClear],
  );

  useEffect(() => cancelPendingClear, [cancelPendingClear]);

  const unregister = useCallback(
    (editor: Editor) => {
      cancelPendingClear();
      setActiveEditor((prev) => (prev === editor ? null : prev));
    },
    [cancelPendingClear],
  );

  const value = useMemo(
    () => ({ activeEditor, registerFocus, notifyBlur, unregister }),
    [activeEditor, registerFocus, notifyBlur, unregister]
  );

  return (
    <MethodologyEditorFocusContext.Provider value={value}>
      {children}
    </MethodologyEditorFocusContext.Provider>
  );
}

export function useMethodologyEditorFocus(): MethodologyEditorFocusValue {
  const ctx = useContext(MethodologyEditorFocusContext);
  if (!ctx) {
    throw new Error(
      'useMethodologyEditorFocus must be used inside a <MethodologyEditorFocusProvider>'
    );
  }
  return ctx;
}
