

## Plan: Fix 5 Outstanding Issues

### 1. Empty task titles not editable in B3.1

**Root cause**: `EditableHeaderText` renders `{value}` as children. When `value` is empty string, the span has zero width/height, making it impossible to click into.

**Fix** in `src/components/B31WPDescriptionTables.tsx`, `EditableHeaderText` component (lines 439-449):
- When value is empty, render a placeholder text like "Click to add title" with muted styling
- Add `min-width` and `min-height` to the span so it's always clickable
- Add hover styling to indicate it's editable (e.g. `hover:bg-muted/30 cursor-text`)

### 2. Track change tooltip not appearing

**Root cause**: The `TrackChangeTooltip` attaches `mouseover`/`mouseout` listeners to `editorContainerRef`. However, ProseMirror renders its content inside a deeply nested `.ProseMirror` div. The event delegation should work via bubbling, but the issue is likely that TipTap's `EditorContent` renders the ProseMirror DOM inside a child component that may not be inside `editorContainerRef` at the time the effect runs, or the events are being swallowed.

**Diagnostic check needed**: The `containerRef.current` is the `div` wrapping `EditorContent`, and events bubble up from the ProseMirror spans. The code looks correct. The real issue could be that the tooltip renders but gets clipped — however it uses `fixed` positioning with `z-[9999]`.

**Alternative root cause**: The tooltip component IS rendered inside the `editorContainerRef` div. But the scroll container at line 1167 (`overflow-auto`) clips `fixed` positioned elements in some browsers? No — `fixed` is relative to viewport, never clipped by `overflow`.

**Most likely root cause**: The `mouseover` event fires but `e.target` is a text node inside a `<p>` inside the `<span data-track-insertion>`. The code normalizes text nodes at line 67. Then it calls `.closest('[data-track-insertion], [data-track-deletion]')`. This should work. But wait — ProseMirror may render track insertion marks as inline `<span>` elements, and the `closest()` traversal should find them. Let me look more carefully...

Actually, the issue could be that the **effect dependency** on `containerRef` never re-runs because `containerRef` is a `RefObject` whose `.current` changes without triggering re-render. If `containerRef.current` is `null` when the effect first runs (because the editor hasn't loaded yet), the listeners are never attached.

**Fix** in `src/components/TrackChangeTooltip.tsx`:
- Change the effect to also depend on `containerRef.current` or use a callback ref pattern
- Add a `MutationObserver` or use `editor` dependency to re-attach when content loads
- Simpler fix: attach the listener to `document` and check if the target is within the container, avoiding the stale ref problem entirely

### 3. Reduce notification polling to 5 seconds

5-second polling is fine — it's a single lightweight SELECT query. No performance concern.

**Fix** in `src/hooks/useNotifications.ts` (line 191): Change `15000` to `5000`.

### 4. Comments not clickable / don't jump to position

**Root cause**: The `onCommentClick` callback in `DocumentEditor.tsx` (lines 1337-1346) correctly calls `editor.chain().focus().setTextSelection(...)`. But the `CommentCard` only triggers `onClickHighlight` when clicking the **quoted text button** (line 122-129). There's no click handler on the **comment card itself**.

**Fix**: Make the entire `CommentCard` clickable, or add a visible "Jump to" affordance. The simplest approach: make clicking the quoted text more discoverable (it already works via `onClickHighlight`), AND also make the comment card border glow or add a small icon indicating the comment is linked to a position. Also ensure `onCommentClick` is actually wired — verify `onClickHighlight` prop is passed correctly.

Wait, looking again at lines 1337-1346, `onCommentClick` IS passed to `CommentsSidebar`, which passes it as `onClickHighlight` to `CommentCard`. And `CommentCard` uses it on the quoted text button (line 126). So clicking the quoted text SHOULD jump to position. The user says it doesn't work.

The issue is likely that `selection_start` and `selection_end` positions become stale after edits. When the document content changes, the character offsets stored in the DB no longer correspond to the correct positions. This is a fundamental limitation of storing absolute character positions.

For now, the pragmatic fix: make the click handler more visible (style the quote as clearly clickable), and ensure the `setTextSelection` call at least tries to focus near the position even if exact range is stale. Also add a visual indicator (e.g., cursor pointer, underline on hover) to make it obvious the quote is clickable.

### 5. Review panel stays expanded/collapsed across section switches

**Root cause**: `isCollaborationPanelOpen` is initialized as `useState(false)` at line 802. It resets every time the `DocumentEditor` component remounts — which happens when switching sections because `ProposalEditor` renders a new `DocumentEditor` for each section.

**Fix**: Persist `isCollaborationPanelOpen` in `localStorage` (keyed per user) or lift the state up to `ProposalEditor` and pass it as a prop. The simpler approach is localStorage:
- In `DocumentEditor.tsx` line 802, initialize from `localStorage`
- On toggle (line 949), persist to `localStorage`

---

### Summary

| # | File | Change |
|---|------|--------|
| 1 | `B31WPDescriptionTables.tsx` | Add placeholder + min-width to `EditableHeaderText` for empty titles |
| 2 | `TrackChangeTooltip.tsx` | Attach listener to `document` instead of container ref to avoid stale ref |
| 3 | `useNotifications.ts` | Change poll interval from 15s to 5s |
| 4 | `CommentsSidebar.tsx` + `DocumentEditor.tsx` | Improve click-to-jump affordance and resilience |
| 5 | `DocumentEditor.tsx` | Persist `isCollaborationPanelOpen` in localStorage |

