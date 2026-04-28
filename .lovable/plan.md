## What appears to be broken

The freeze is most likely caused by the interaction between the recent table-control edits and the editor lifecycle after navigating from Part A to Part B/B3.1.

The strongest suspects are:

1. **B3.1 React tables now dispatch toolbar-focus events on every `mousedown` capture**
   - `B31WPListTable`, `B31DeliverablesTable`, `B31MilestonesTable`, `B31RisksTable`, and `B31EffortMatrix` all call `window.dispatchEvent(new CustomEvent('b31-table-focus', ...))` from `onMouseDownCapture`.
   - Clicking inside a table cell, selector, or contenteditable field can therefore trigger a React state update in `DocumentEditor` before the actual cell interaction finishes.
   - This is exactly in the interaction path the user describes: text cursor works briefly, then table clicks do not work and the browser asks to wait/exit.

2. **The B3.1 toolbar-focus state can cause avoidable re-renders of the full editor shell**
   - `DocumentEditor` stores `b31TableFocus` in React state and passes it into `FormattingToolbar`.
   - Repeated focus events can re-render the editor shell and table tree while selection/click handling is in progress.
   - The current handler sets state even when the focused B3.1 table is already focused, so repeated clicks inside the same table still schedule state updates.

3. **B3.1 table event wiring is global and not section-scoped enough**
   - The `b31-table-focus` / `b31-table-autoresize` events are global `window` events.
   - After navigating between sections, any leaked or stale listener would be bad. The current code removes listeners correctly in most places, but the global-event approach makes it easy to leave state stale or dispatch into a section that is no longer relevant.

4. **The earlier loading issue was real but separate**
   - The dev-server log still shows the prior CSS `@import` ordering warning, although the code was already corrected and the production build passed afterwards. This warning is not the main freeze, but I will re-check it after the stability fix to ensure the current server state is clean.

## Fix plan

### 1. Make B3.1 table focus updates idempotent and lightweight

In `DocumentEditor.tsx`:

- Change `handleB31TableFocus` so it only calls `setB31TableFocus` when the table id actually changes.
- Similarly avoid resetting B1.2 focus state if it is already clear.
- Keep the toolbar dropdown functionality, but stop repeated identical clicks from re-rendering the editor shell.

This should reduce unnecessary re-render pressure immediately.

### 2. Replace broad `onMouseDownCapture` dispatching with targeted focus/click handling

In B3.1 table components:

- Remove or narrow `onMouseDownCapture={dispatchToolbarFocus}` from table wrapper divs.
- Prefer `onFocusCapture` for keyboard/contenteditable focus and a targeted `onPointerDownCapture`/`onMouseDownCapture` that only dispatches when the event target is actually inside the table/caption, not when interacting with nested Radix dropdown portals or toolbar-adjacent controls.
- Use an idempotent helper such as:

```ts
const focusB31Table = (tableId: string) => {
  window.dispatchEvent(new CustomEvent('b31-table-focus', { detail: { tableId } }));
};
```

but call it only when needed.

Affected files:
- `src/components/B31WPListTable.tsx`
- `src/components/B31TablesEditor.tsx`
- `src/components/B31EffortMatrix.tsx`

### 3. Guard B3.1 auto-resize event listeners

In all B3.1 structured tables:

- Ensure `b31-table-autoresize` handlers return immediately unless the table is mounted and the target `tableId` matches.
- Ensure `computeAutoFitSmart` is only called from explicit toolbar/dropdown action, never from focus/click.
- Keep auto-resize behaviour intact, but separate it strictly from focusing/selecting cells.

### 4. Reduce table-click conflicts with dnd-kit

In `B31TablesEditor.tsx`:

- Keep drag activation at 8px, but ensure sortable drag listeners remain attached only to the visible grip handle, never the row/cell.
- Add `onMouseDown={(e) => e.stopPropagation()}` / pointer guards only on the hover-left caption buttons and drag/delete controls if needed, so table cell editing/select dropdowns do not compete with ordering controls.
- This is especially important for contenteditable fields and Radix `Select` triggers inside deliverable/milestone/risk tables.

### 5. Re-check editor lifecycle after A→B navigation

Review and, if needed, adjust:

- `useRichTextEditor` content sync (`editor.commands.setContent`) so it does not run unnecessarily after section changes.
- `DocumentEditor` selection update handler so it does not repeatedly clear B3.1 focus while another B3.1 focus event is being handled.
- `BlockDragHandle` mousemove handling. It runs on every editor mousemove and uses `posAtCoords`; it should not affect B3.1 React tables directly, but if it remains a performance hotspot after the table-focus fix, throttle it with `requestAnimationFrame`.

### 6. Verify the loading/freeze path

After implementing the code changes:

- Run `bun run build`.
- Check `/tmp/dev-server-logs/dev-server.log` for fresh errors/warnings after the latest HMR/build.
- If browser testing is available with an authenticated session, profile the exact path:
  1. refresh proposal page
  2. navigate to an A section
  3. navigate to B3.1 or another B section
  4. click into text
  5. click into B3.1 tables
  6. confirm no long task/freeze and that table cells/selects still respond
- If the browser session is unauthenticated, use build/log verification plus code-level checks, and state that preview reproduction requires logging in.

## Expected result

- Navigating A section → B section should no longer degrade into a browser “wait or exit” freeze.
- Clicking B3.1 React tables should focus the table for the formatting-bar dropdown without re-render storms.
- Text cursor placement in Part B should remain stable.
- Auto-resize from the formatting-bar dropdown should continue to work for B3.1 tables.
- The deliverables order toggle and caption-left hover buttons should remain intact.