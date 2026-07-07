import type { Editor } from '@tiptap/react';

/**
 * A tiny observable of the currently-focused canvas TipTap editor. The
 * canvas text formatting toolbar dispatches its commands (bold/italic/
 * size/colour/header/etc) against this editor. Canvas editors register
 * on focus and unregister on blur.
 */
type Listener = (editor: Editor | null) => void;

let currentEditor: Editor | null = null;
const listeners = new Set<Listener>();

export function setFocusedCanvasEditor(editor: Editor | null) {
  currentEditor = editor;
  listeners.forEach((l) => l(currentEditor));
}

export function getFocusedCanvasEditor(): Editor | null {
  return currentEditor;
}

export function subscribeFocusedCanvasEditor(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentEditor);
  return () => {
    listeners.delete(listener);
  };
}
