import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';

interface MethodologyEditorFocusValue {
  activeEditor: Editor | null;
  registerFocus: (editor: Editor) => void;
  unregister: (editor: Editor) => void;
}

const MethodologyEditorFocusContext = createContext<MethodologyEditorFocusValue | null>(null);

/**
 * Tracks which Methodologies-page editor the single page-wide formatting
 * toolbar should act on.
 *
 * The active editor is NEVER cleared on blur: clicking a toolbar button blurs
 * the editor, so clearing there would drop the target mid-action. It only
 * changes when another editor gains focus, or when the active editor unmounts.
 */
export function MethodologyEditorFocusProvider({ children }: { children: ReactNode }) {
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  const registerFocus = useCallback((editor: Editor) => {
    setActiveEditor((prev) => (prev === editor ? prev : editor));
  }, []);

  const unregister = useCallback((editor: Editor) => {
    setActiveEditor((prev) => (prev === editor ? null : prev));
  }, []);

  const value = useMemo(
    () => ({ activeEditor, registerFocus, unregister }),
    [activeEditor, registerFocus, unregister]
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
