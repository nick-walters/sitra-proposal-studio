

## Fix: Cursor Not Returning to Editor

### Root Cause

The `editorRef` (line 195) is a `useRef` that is **never assigned** the editor instance. It stays `null` forever. The track changes toggle (line 158) calls `editorRef.current?.commands.focus()` which silently does nothing because `current` is `null`.

The `onFocusEditor` prop passed to `CommentsSidebar` (line 1257) uses `editor?.commands.focus()` directly, which should work. If it's also not working, it may be because `editor.commands.focus()` alone doesn't reliably bring focus back when another element (like a button in the sidebar) just received the click -- the browser may re-focus the clicked element after the synchronous `.focus()` call completes.

### Fix

1. **`src/components/DocumentEditor.tsx`** -- Replace all `editorRef.current?.commands.focus()` calls with `editor?.commands.focus()`, and wrap them in a short `setTimeout` to ensure the browser has finished processing the click event before we steal focus back to the editor.

   - Line 158: change `editorRef.current?.commands.focus()` to `editor?.commands.focus()` (already inside setTimeout -- good)
   - Line 1257: change `onFocusEditor` to use `setTimeout(() => editor?.commands.focus(), 50)` for reliable refocusing after sidebar button clicks

2. **`src/components/CommentsSidebar.tsx`** -- Ensure all `onFocusEditor?.()` calls are wrapped in a small delay where they aren't already, so the browser finishes processing the current click before refocusing the editor.

### Technical Details

| Location | Current Code | Fix |
|---|---|---|
| `DocumentEditor.tsx:158` | `editorRef.current?.commands.focus()` | `editor?.commands.focus()` |
| `DocumentEditor.tsx:1257` | `() => editor?.commands.focus()` | `() => setTimeout(() => editor?.commands.focus(), 50)` |

The `editorRef` can then be removed entirely if it has no other uses (confirmed: only used at line 158 and declared at line 195).

