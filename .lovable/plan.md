

## Problem

When the user presses Ctrl+Z / Cmd+Z while focus is outside the Tiptap editor (e.g. after clicking a toolbar button), the browser's native undo triggers — which can close tabs or perform other unwanted browser actions.

## Solution

Add a global `keydown` listener at the app level that intercepts Ctrl+Z / Cmd+Z (and Ctrl+Shift+Z / Cmd+Shift+Z for redo) and calls `preventDefault()` — but only when the active element is **not** a text input, textarea, or contenteditable element (where native undo is expected and handled by the editor).

## Implementation

**Edit `src/App.tsx`** — Add a `useEffect` with a global `keydown` handler:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      const el = document.activeElement;
      const isEditable =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (!isEditable) {
        e.preventDefault();
      }
    }
  };
  window.addEventListener('keydown', handler, true); // capture phase
  return () => window.removeEventListener('keydown', handler, true);
}, []);
```

This uses the **capture phase** so it fires before any other handler, and only blocks the browser default when focus is on non-editable elements (buttons, toolbar items, etc.). The Tiptap editor's own undo remains unaffected since its contenteditable div is excluded.

