
Goal: fix text alignment in the online Part B editors, not the exports.

Diagnosis
```text
toolbar click
  -> editor loses focus/selection
  -> focus() scrolls the page
  -> alignment transaction runs in a fragile state
  -> custom track-changes middleware rewrites the transaction as if it were text insertion/deletion
  -> paragraph attrs often do not stick
```

Most likely underlying causes in the current code:
1. Toolbar buttons use plain click handlers, so clicking them lets ProseMirror blur before the command runs. That explains the page jump.
2. `setTextAlign(...)` creates a node-attribute change, but `TrackChanges.dispatchTransaction` currently treats every `docChanged` transaction like text edits. That is the strongest reason the alignment change can be neutralized.
3. Manual alignment is not durable enough because `normalizePartBBodyAlignment(content)` runs on editor initialization and strips paragraph `text-align` from loaded HTML.
4. The editor config and CSS contradict each other: alignment is enabled for headings, but headings are forced left in CSS. So the toolbar exposes states that should never be allowed.

Implementation plan

1. Stabilize toolbar behavior in the shared Part B editor layer
- Update the shared toolbar button component in `src/components/RichTextEditor.tsx` so formatting actions run on `onMouseDown` with `preventDefault()`, not only on `onClick`.
- Set toolbar buttons explicitly to `type="button"`.
- Wrap alignment actions in a shared helper that restores editor focus without scroll-jumping before applying the command.

2. Make alignment changes bypass the track-changes diff logic
- In `src/extensions/TrackChanges.ts`, add a safe bypass for formatting-only / attribute-only transactions.
- Tag text-alignment transactions with explicit meta from the toolbar/helper, then let those transactions pass through unchanged instead of being converted into insertion/deletion logic.
- Keep normal text typing/deletion behavior unchanged.

3. Preserve manual alignment after save/reload
- Stop normalizing loaded editor content on initial mount in `src/components/RichTextEditor.tsx`.
- Keep alignment cleanup at the paste boundary only, so pasted content defaults to justified body text, but user-applied left/center/right alignment survives round-trips through autosave and reload.
- Narrow the paste normalizer so captions and table content remain exempt.

4. Remove the mismatch between allowed commands and rendered styles
- Since headings should stay left-aligned, remove heading alignment from the editable alignment scope for Part B body editing, or disable the alignment buttons when the current selection is in a heading/caption/table context.
- Keep paragraph alignment enabled.
- This makes the UI match the actual styling rules instead of offering impossible states.

5. Tighten CSS only where needed
- Keep paragraph default justification as the fallback style.
- Do not use CSS that masks explicit paragraph `style="text-align: ..."` values.
- Keep captions/table cells/figures/headings exempt exactly as requested.

Validation checklist
- Paragraph typed directly in the editor: left/center/right/justify all work.
- Pasted paragraph: initially becomes justified, then can be manually re-aligned.
- Alignment change persists after autosave, manual save, section switch, and full reload.
- No page jump when clicking alignment buttons.
- Headings remain left-aligned.
- Table content and figure/table captions are unaffected.
- Verify with track changes both ON and OFF.

Technical details / likely files
- `src/components/RichTextEditor.tsx`
  - toolbar button interaction
  - alignment action helper
  - editor initialization / normalization behavior
- `src/extensions/TrackChanges.ts`
  - bypass formatting-only alignment transactions
- `src/index.css`
  - confirm paragraph defaults do not override explicit inline alignment
- Possibly `src/components/FstpTab.tsx`
  - if the same toolbar interaction pattern should be brought into parity there too, but Part B should be fixed first

Expected outcome
- The Part B alignment buttons will work reliably in the online editors.
- Body text will still default to justified.
- The current “jump but no change” behavior will be eliminated at the actual source, not just masked with CSS.
