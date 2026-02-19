

## Dynamic cross-reference sync — COMPLETED

All cross-references are now ID-linked and dynamically synced when items are renumbered or reordered.

### What was done

| Ref Type | Before | After |
|---|---|---|
| WP | ID-linked, synced | No change |
| Task | ID-linked, synced | No change |
| Deliverable | ID-linked, synced | No change |
| Milestone | ID-linked, synced | No change |
| **Case** | Had ID, **not synced** | ✅ Now synced (number, type, color) |
| **Participant** | Had ID, **not synced** | ✅ Now synced (number, short_name) |
| **Figure** | **No ID**, static text | ✅ Now stores `figureId`, synced |
| **Table** | **No ID**, static text | ✅ Now stores `tableKey` |

### Files changed

1. `src/extensions/FigureTableReferenceMark.ts` — Added `figureId`, `tableKey`, `refKind` attributes
2. `src/lib/syncCrossReferences.ts` — Added case, participant, and figure sync; fetches all reference data in parallel
3. `src/components/InsertCrossReferenceDialog.tsx` — Now passes `CrossRefInsertPayload` with IDs instead of plain string
4. `src/components/DocumentEditor.tsx` — Updated handler to forward IDs to the mark
5. `src/components/WPDraftEditor.tsx` — Updated handler to set data attributes on inserted spans
