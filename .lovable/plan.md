

# Update Cell Padding to 1pt in All B3.1 Tables

Change horizontal cell padding from `0.1pt` to `1pt` in all B3.1 table components (excluding WP descriptions).

## Files to Update

### 1. `src/components/B31TablesEditor.tsx` (lines 139-141)
- `cellStyles`: `px-[0.1pt]` -> `px-[1pt]` (both occurrences)
- `bubbleCellStyles`: `px-[0.1pt]` -> `px-[1pt]` (both occurrences)
- `headerCellStyles`: `px-[0.1pt]` -> `px-[1pt]` (both occurrences)

### 2. `src/components/B31WPListTable.tsx` (line 14)
- `cellStyles`: `px-[0.1pt]` -> `px-[1pt]` (both occurrences)

### 3. `src/components/B31EffortMatrix.tsx` (lines 14-15, 238, 278)
- `cellStyles`: `px-[0.1pt]` -> `px-[1pt]`
- `headerCellStyles`: `px-[0.1pt]` -> `px-[1pt]`
- Two inline `className` strings on the participant name cell and total row cell

### 4. `src/components/B31SubcontractingTable.tsx` (lines 11-12)
- `cellStyles`: `px-[0.1pt]` -> `px-[1pt]`
- `headerCellStyles`: `px-[0.1pt]` -> `px-[1pt]`

### 5. `src/components/B31EquipmentTable.tsx` (lines 11-12)
- `cellStyles`: `px-[0.1pt]` -> `px-[1pt]`
- `headerCellStyles`: `px-[0.1pt]` -> `px-[1pt]`

This is a straightforward find-and-replace of `px-[0.1pt]` with `px-[1pt]` across all five files.
