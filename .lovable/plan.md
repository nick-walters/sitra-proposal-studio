

# Legacy Code Cleanup Plan

## Summary of Findings

After scanning all imports and references across the codebase, the following files and functions are confirmed unused (zero imports or references from any other file).

---

## 1. Entirely Unused Files (safe to delete)

| File | Description | Confidence |
|------|-------------|------------|
| `src/lib/bubbleStyles.ts` | Unified bubble style system -- 7 exported functions, 0 imports anywhere | High |
| `src/components/GanttChart.tsx` | Demo/standalone Gantt chart with hardcoded demo data -- superseded by `GanttChartFigure.tsx` | High |
| `src/components/BudgetSpreadsheet.tsx` | Original budget spreadsheet -- superseded by `BudgetSpreadsheetEnhanced.tsx` | High |
| `src/components/ConsortiumMap.tsx` | Consortium map component -- 0 imports | High |
| `src/components/ProposalSchedule.tsx` | Proposal schedule component -- 0 imports | High |
| `src/components/ProposalSummaryPage.tsx` | Proposal summary page -- 0 imports | High |
| `src/components/ImageGeneratorDialog.tsx` | AI image generator dialog -- 0 imports | High |
| `src/lib/fundingRateCalculator.ts` | Funding rate calculator utility -- 0 imports | High |

## 2. Unused Exported Functions Within Active Files

| File | Unused Export | Still-used Exports |
|------|--------------|-------------------|
| `src/lib/b31Population.ts` | `generateDefaultB31Tables()` | `populateB31`, `appendCostJustificationsToB31` |
| `src/lib/b31Population.ts` | `getRiskLevelBadge()` (internal helper, never imported) | -- |
| `src/lib/figureExport.ts` | `exportAsPptxImage()` | `exportAsPng`, `exportGanttAsPptx`, `exportPERTAsPptx` |
| `src/lib/wpColors.ts` | `hexToHSL()`, `hexToHSLString()`, `WP_COLOR_NAMES` | `DEFAULT_WP_COLORS`, `getContrastingTextColor`, `lightenColor`, `getDefaultWPColor`, `hexToHSL` (only used internally by `hexToHSLString`) |

## 3. Technical Steps

### Step 1: Delete unused files
Delete these 8 files outright -- they have no dependents:
- `src/lib/bubbleStyles.ts`
- `src/components/GanttChart.tsx`
- `src/components/BudgetSpreadsheet.tsx`
- `src/components/ConsortiumMap.tsx`
- `src/components/ProposalSchedule.tsx`
- `src/components/ProposalSummaryPage.tsx`
- `src/components/ImageGeneratorDialog.tsx`
- `src/lib/fundingRateCalculator.ts`

### Step 2: Remove dead exports from active files
- **`src/lib/b31Population.ts`**: Remove `generateDefaultB31Tables()` function (lines 975-1061) and `getRiskLevelBadge()` helper
- **`src/lib/figureExport.ts`**: Remove `exportAsPptxImage()` function
- **`src/lib/wpColors.ts`**: Remove `WP_COLOR_NAMES` constant and `hexToHSLString()` function. Keep `hexToHSL()` only if it's used internally by remaining code

### Step 3: Verify build
Run a build check to confirm no breakage. No database or migration changes are involved -- this is purely frontend cleanup.

---

## Risk Assessment

- **Low risk**: All deletions are confirmed by zero-import analysis across the entire `src/` directory
- **No runtime impact**: None of these files or functions are dynamically imported or referenced by string
- **Reversible**: All changes are file deletions or function removals that can be reverted from version control

## Estimated Impact

- Removes approximately 2,500-3,000 lines of dead code
- Eliminates 8 unused component/utility files
- Cleans up 4 dead exports from 3 active files
