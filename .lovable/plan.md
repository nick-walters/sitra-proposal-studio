

# Version History UI Fixes and Save Indicator Update

## Changes

### 1. Fix version list scrollability

The `ScrollArea` wrapping the version list (line 334) needs a fixed height so the scroll container works. Currently it has `flex-1` but the parent `div` uses `min-h-[400px]` which doesn't constrain the ScrollArea's max height. Add `max-h-[400px]` (or similar) to the ScrollArea so overflow triggers scrolling.

### 2. Reorganize left panel version items into aligned columns

Remove the inline "X words" and "+Xw" delta text from the metadata row. Instead, arrange the remaining metadata (relative time, file size, editor name) in a structured grid/table-like layout so they align vertically across entries.

Current layout (line 403-421):
```
Clock 3m ago | 245 words | 12.4 KB | +5w | User Name
```

New layout -- a compact grid under each version title:
```
Version 5                    [Major] [Pinned]
  Final submitted version
  3m ago        12.4 KB        John Smith
```

Each row uses a 3-column CSS grid (`grid grid-cols-3`) with consistent widths so time, size, and name line up across all version entries.

### 3. Make user-added label text bold

Change the label display in the version list (line 398) from `text-xs text-primary` to `text-xs text-primary font-bold`.

### 4. Major/minor sub-numbering (Version 1.0, 1.1, 1.2, Version 2.0)

Currently all versions use a flat incrementing `version_number`. The plan introduces composite numbering:

- **Major versions** (`is_major = true`): Increment the major number, reset minor to 0. Display as "Version 2.0", "Version 3.0".
- **Minor versions** (`is_major = false`): Keep the same major number, increment minor. Display as "Version 2.1", "Version 2.2".

This is a **display-only** computation -- no schema changes needed. The raw `version_number` stays as-is in the database. A `useMemo` will compute a map of `version.id -> "X.Y"` string by iterating versions sorted by `version_number` ascending:
- Start at major=1, minor=0
- For each version: if `is_major`, increment major, set minor=0; else increment minor
- Store the formatted string "major.minor"

The "Major" badge stays alongside the new numbering for extra clarity.

### 5. Save indicator: grey "Autosaves every 5 seconds" instead of red

In `SaveIndicator.tsx`, change the `saving` / `hasUnsavedChanges` state:
- Remove the red (`text-destructive`) color and `animate-pulse`
- Use grey (`text-muted-foreground`) for both icon and text
- Change the label from "Autosaving" to "Autosaves every 5 seconds"
- Keep the `saved` state green with "Autosaved" + timestamp as-is
- Keep the `idle` state unchanged

---

## Technical Details

### Files modified

1. **`src/components/SectionVersionHistoryDialog.tsx`**
   - Add `max-h-[400px]` to the ScrollArea for the version list
   - Add a `useMemo` to compute `displayVersionNumber` map (id to "X.Y" string)
   - Replace flat `Version {version_number}` with `Version {displayVersionNumber}`
   - Restructure the metadata row into a `grid grid-cols-3` layout with time, size, and name columns (remove words and word-delta)
   - Make label text bold (`font-bold`)

2. **`src/components/SaveIndicator.tsx`**
   - Change `saving` state colors from `text-destructive` to `text-muted-foreground`
   - Remove `animate-pulse` from saving state
   - Change label from "Autosaving" to "Autosaves every 5 seconds"

