# SaveIndicator Text Wrapping and Idle State Fix

## Changes

### 1. Wrap "Autosaves every 5 seconds" over two lines

Split the label into two lines: "Autosaves" on line 1, "every 5 seconds" on line 2. This reduces horizontal space consumption. Both lines use `text-[10px]` or the second line uses a slightly smaller size, keeping the component compact.

### 2. Show "Autosaves every 5 seconds" in idle state (before any edits)

Currently the `idle` state (no saves yet, no pending changes) shows "Autosave" in black. Change it so that the `idle` state shows the same two-line "Autosaves / every 5 seconds" text in grey (`text-muted-foreground`), matching the saving state. This way, when a user opens an editor before making any changes, they see the informational message instead of a bare "Autosave" label.

The three states become:

- **idle** (editor opened, no edits yet): Grey cloud icon, "Autosaves / every 5 sec" in grey
- **saving** (unsaved changes pending): Same as idle -- grey cloud, "Autosaves / every 5 sec" in grey
- **saved** (successfully saved): Green cloud icon, "Autosaved" in green, with timestamp below

### 3. Tab close/refresh protection -- already implemented

The `useSectionContent` hook already handles this: the `beforeunload` event listener fires a synchronous XHR save AND triggers the browser's native "Leave site?" confirmation dialog when there are pending unsaved changes. No changes needed here.

## Technical details

### File: `src/components/SaveIndicator.tsx`

- Merge `idle` and `saving` states to show the same text and color
- Replace the single `label` string with a two-line rendering for the "Autosaves every 5 seconds" case: first line "Autosaves", second line "every 5 seconds" (using `text-[10px]`)
- The `saved` state remains unchanged (single line "Autosaved" + timestamp)