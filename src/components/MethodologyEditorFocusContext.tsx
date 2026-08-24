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
  /**
   * The focused SCALAR control (select, date picker, assign button) that
   * belongs to an editing block, marked in the DOM with `data-scalar-field`.
   *
   * Scalar fields carry no rich text, so they never become the active editor
   * — but they still belong to a block, and the block's guidelines and
   * version history must stay reachable while the caret sits on them. The
   * features tier therefore opens for them too; the formatting tier does not.
   */
  scalarField: HTMLElement | null;
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
        // Focus moved into the toolbars, a dialog/menu/popover raised from
        // them (Radix renders those in a PORTAL, outside the chrome subtree),
        // or another editor: the toolbars stay, still pointed at their target.
        if (
          el &&
          (el.closest('[data-editor-chrome]') ||
            el.closest('[role="dialog"]') ||
            el.closest('[role="menu"]') ||
            el.closest('[role="listbox"]') ||
            el.closest('[data-radix-popper-content-wrapper]') ||
            el.closest('[data-radix-portal]') ||
            el.closest('[data-radix-menu-content]') ||
            el.closest('[data-radix-popover-content]') ||
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

  /**
   * Scalar focus is observed in the DOM rather than wired per control: a
   * surface marks the wrapper of a non-rich control with `data-scalar-field`
   * and everything else follows, exactly as `data-guideline-key` does for
   * guidance lookup.
   */
  const [scalarField, setScalarField] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      const scalar = el?.closest?.('[data-scalar-field]') as HTMLElement | null;
      if (scalar) {
        setScalarField(scalar);
        return;
      }
      // Focus in the toolbars, or a menu/dialog they raised, keeps the scalar
      // field selected — the same grace the active editor gets.
      if (
        el &&
        (el.closest('[data-editor-chrome]') ||
          el.closest('[role="dialog"]') ||
          el.closest('[role="menu"]') ||
          el.closest('[role="listbox"]') ||
          el.closest('[data-radix-popper-content-wrapper]') ||
          el.closest('[data-radix-portal]'))
      ) {
        return;
      }
      setScalarField(null);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const value = useMemo(
    () => ({ activeEditor, registerFocus, notifyBlur, unregister, scalarField }),
    [activeEditor, registerFocus, notifyBlur, unregister, scalarField]
  );

  return (
    <MethodologyEditorFocusContext.Provider value={value}>
      {children}
    </MethodologyEditorFocusContext.Provider>
  );
}

/**
 * Registers ANY TipTap instance with the shared toolbars, using exactly the
 * same focus/blur bookkeeping as the Methodologies fields. Surfaces that build
 * their editor themselves (the legacy Part B editor, for instance) call this
 * so the three-tier toolbar behaves identically there.
 */
export function useRegisterEditorFocus(editor: Editor | null | undefined) {
  const ctx = useContext(MethodologyEditorFocusContext);

  useEffect(() => {
    if (!ctx || !editor) return;
    const { registerFocus, notifyBlur, unregister } = ctx;
    const dom = editor.view.dom as HTMLElement;
    const handler = () => registerFocus(editor);
    const blurHandler = () => notifyBlur(editor);
    dom.addEventListener('focus', handler);
    dom.addEventListener('blur', blurHandler);
    editor.on('focus', handler);
    editor.on('blur', blurHandler);
    if (editor.isFocused || dom.contains(document.activeElement)) registerFocus(editor);
    return () => {
      dom.removeEventListener('focus', handler);
      dom.removeEventListener('blur', blurHandler);
      editor.off('focus', handler);
      editor.off('blur', blurHandler);
      unregister(editor);
    };
    // ctx identity changes whenever the active editor changes; only the
    // callbacks matter and they are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ctx?.registerFocus, ctx?.notifyBlur, ctx?.unregister]);
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
