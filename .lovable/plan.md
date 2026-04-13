

# Plan: Clean Up Redundant Export Code

## Findings

After analyzing the export-related code across `usePdfExport.ts`, `useDocxExport.ts`, and `printRenderer.tsx`, here are the redundancies and dead code:

### 1. Duplicate `SectionContent` interface (3 copies)
The same interface is defined identically in:
- `src/hooks/usePdfExport.ts` (lines 7-11)
- `src/hooks/useDocxExport.ts` (lines 7-11)
- `src/lib/printRenderer.tsx` (lines 15-19)

**Fix**: Export it from `printRenderer.tsx`, import in both hooks.

### 2. Duplicate `ExportData` interface (2 copies)
Nearly identical in both hooks. The DOCX version has an extra unused `trackedChanges` field.

**Fix**: Define a shared `ExportData` in `printRenderer.tsx`, export it.

### 3. Dead `TrackedChange` interface in DOCX hook
Defined at lines 13-18 of `useDocxExport.ts` but never used — the `trackedChanges` field on `ExportData` is optional and never passed by the caller in `ProposalEditor.tsx`.

**Fix**: Remove both `TrackedChange` and the `trackedChanges` field.

### 4. Legacy `exportToPdf` function (dead code)
Lines 218-269 of `usePdfExport.ts` define a "legacy simple export" that manually draws text. It's destructured in `ProposalEditor.tsx` but never actually called — only `exportProposalToPdf` is used in `handleExport`.

**Fix**: Delete the legacy function and remove it from the return value and the destructuring in `ProposalEditor.tsx`.

### 5. Duplicate container-mounting boilerplate
Both `usePdfExport.ts` (lines 123-150) and `useDocxExport.ts` (lines 206-232) have identical code for:
- Setting container styles (position, zIndex, pointerEvents, etc.)
- Appending to `document.body`
- Waiting for images to load
- Calling `mountB31Components`
- 500ms delay

**Fix**: Extract into a shared `prepareExportContainer()` function in `printRenderer.tsx` that handles DOM attachment, B3.1 mounting, image loading, and cleanup.

### 6. Duplicate Word CSS vs index.css print styles
The `wrapInWordHtml()` function in `useDocxExport.ts` contains ~120 lines of CSS that largely duplicates what's in `index.css` under `.print-export-container`. The Word CSS is necessary for the standalone `.doc` file, so this isn't removable — but a comment should clarify this intentional duplication.

---

## Implementation

### File: `src/lib/printRenderer.tsx`
- Export `SectionContent` and a new shared `ExportData` interface
- Add `prepareExportContainer(options): Promise<{ container, cleanup }>` that handles DOM attachment, B3.1 mounting, image waiting, and returns a cleanup function

### File: `src/hooks/usePdfExport.ts`
- Remove local `SectionContent` and `ExportData` — import from `printRenderer`
- Delete `exportToPdf` legacy function (lines 218-269)
- Replace container-mounting boilerplate with `prepareExportContainer()`
- Return only `{ exportProposalToPdf }`

### File: `src/hooks/useDocxExport.ts`
- Remove local `SectionContent`, `ExportData`, `TrackedChange`
- Import shared types from `printRenderer`
- Replace container-mounting boilerplate with `prepareExportContainer()`

### File: `src/pages/ProposalEditor.tsx`
- Change `const { exportToPdf, exportProposalToPdf } = usePdfExport()` to `const { exportProposalToPdf } = usePdfExport()`

### Net effect
- ~120 lines of dead/duplicate code removed
- Single source of truth for types and container preparation
- No behavioral changes

