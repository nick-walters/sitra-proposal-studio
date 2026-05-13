The issue is not that 82.5 KB is “large”. It is small. The problem is that the editor currently treats that small document as expensive by repeatedly rebuilding, scanning, measuring, and broadcasting around it. A section with several tables simply exposes the weakness sooner. The fix should strengthen the shared editor path for B1.1, B1.2, B2.1, B2.2 and other normal Part B editors; B3.1 keeps its separate structured-table behaviour.

## What I will change

1. **Create the editor only after the section content has loaded**
   - Right now the editor can be created with empty content, then later have the real saved content pushed into it.
   - I will make the normal editor mount only once the saved content is ready, with that content already inside it.
   - Layman’s version: stop opening a blank document and then pasting the real document into it a moment later.

2. **Stop using broad `setContent` for ordinary loading**
   - `setContent` is heavy because it asks the editor to replace the whole document.
   - It should be reserved for deliberate whole-document actions, such as restoring a version or applying an assistant rewrite.
   - Ordinary section loading should be “initial content only”.

3. **Normalise loaded HTML once, not repeatedly**
   - The style-cleaning pass should run once when content comes from storage.
   - It should not run again because the cursor moved, a save status changed, a collaborator presence update arrived, or the toolbar re-rendered.

4. **Reduce full-document scans on startup and typing**
   - The shared editor currently has several helpers that can walk the whole document: track changes, cross-reference syncing, formula display, caption/table helpers and reference protection.
   - I will keep the features, but change when they run:
     - run after the editor is interactive, not during first tap/open;
     - skip entirely when the document does not contain the relevant markers;
     - for formula decorations, do not inspect every table unless a formula marker is present;
     - avoid re-scanning on selection-only cursor movement.

5. **Make tapping/cursor movement cheap**
   - Selection changes currently trigger several side jobs: collaborator cursor updates, block locking, selected-text tracking, caption refresh positioning and overlay positioning.
   - I will debounce/throttle those jobs and avoid duplicate state updates when nothing meaningful changed.
   - Layman’s version: the cursor should appear immediately; background collaboration bookkeeping can catch up milliseconds later.

6. **Ensure overlays cannot block editing**
   - I will make lock/cursor/caption overlays pass normal editor clicks through except for their actual small buttons/icons.
   - This addresses the “not clickable” symptom separately from the crash/performance symptom.

7. **Keep B3.1 special; keep all other Part B editors the same**
   - No B1.2-only fix.
   - No different B1.2 editor.
   - Normal Part B sections use one shared editor path.
   - B3.1 remains special only because it has its generated/structured tables outside the standard rich-text content.

## Technical implementation targets

- `src/components/DocumentEditor.tsx`
  - Gate standard editor rendering until `loading === false`.
  - Key the standard editor by `section.id` so section switches create a clean editor instance.
  - Move heavy startup jobs behind idle scheduling.
  - Throttle selection side effects and avoid duplicate state writes.
  - Ensure overlays use non-blocking pointer behaviour.

- `src/components/RichTextEditor.tsx`
  - Remove broad prop-driven `setContent` for normal editor loading.
  - Add an explicit version/replace path for true whole-document replacements only.
  - Add TipTap React performance options where supported, especially to avoid unnecessary React re-rendering on selection transactions.
  - Memoise/centralise loaded-content normalisation.

- `src/extensions/TableFormula.ts`
  - Add a fast text/marker check before table traversal.
  - Cache formula decorations in plugin state instead of rebuilding by scanning every table on every decoration request.

- `src/extensions/TrackChanges.ts`
  - Keep track changes functionality, but avoid whole-document collection/re-decoration on selection-only transactions.
  - Defer initial collection so it does not compete with first render/tap.

- `src/lib/syncCrossReferences.ts`
  - Add a cheap preflight: if the document has no relevant reference marks, do not fetch proposal-wide reference data and do not scan/update.
  - Run sync on idle after load and explicit reference-changing events, not as part of making the editor clickable.

- `src/components/BlockLockIndicator.tsx`, `src/components/CollaborativeCursors.tsx`, `src/components/CaptionRefreshButton.tsx`
  - Reduce layout measurement pressure (`coordsAtPos`, `getBoundingClientRect`, `nodeDOM`) on every cursor/transaction.
  - Keep visual indicators, but ensure they do not intercept editor clicks.

## Validation

After implementation I will verify the actual shared behaviour, not just the code:

1. Open a normal Part B section with content and tables.
2. Confirm the editor mounts after content load and is immediately clickable.
3. Click into table cells and ordinary paragraphs.
4. Check console errors/warnings.
5. Run a browser performance profile to confirm first interaction is not blocked by repeated whole-document work.
6. Confirm B3.1 still keeps its structured content and B3.2 is not inserted into B3.1 or B2.2.

## Expected result in plain English

All ordinary Part B editors will behave like the same robust document editor. They should handle documents far larger than 82.5 KB because they will no longer rebuild or sweep the whole document just to load, tap, move the cursor, or show collaboration indicators.