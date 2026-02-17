

# Fix Bubble Height Inconsistencies in Table 3.1.c (Deliverables)

## Problems Identified

1. **Deliverable number bubbles appear taller** than WP/participant bubbles because they contain a `contentEditable` span (`EditableTextInline`) which adds extra internal height compared to plain text.

2. **WP and participant bubbles are cut off at the bottom** because:
   - The `SingleWPSelector`'s SelectTrigger is missing `min-h-0` (the participant selector already has it)
   - Cell padding `!py-0` combined with `overflow-visible` still clips the 1.5px border due to table row constraints

## Technical Changes

### File: `src/components/B31TablesEditor.tsx`

**1. Fix deliverable number bubble height (lines ~800-812)**
- Add `height: 'fit-content'` and ensure the `EditableTextInline` inside does not inflate the bubble by adding a `lineHeight: 1` style to the contentEditable span
- Alternatively, ensure the bubble span itself constrains height consistently with other bubble types

**2. Fix WP bubble clipping in SingleWPSelector (line 346)**
- Add `min-h-0` to the SelectTrigger className to match the participant selector pattern
- Change from: `"h-auto py-0 px-0 ..."`
- Change to: `"h-auto min-h-0 py-0 px-0 ..."`

**3. Fix cell padding to prevent bottom clipping**
- Update `bubbleCellStyles` to use a minimal vertical padding (`!py-[1px]`) instead of `!py-0` so the 1.5px border of bubbles is not clipped by the table row boundary
- This change applies uniformly to all bubble cells in all 3.1 tables (deliverables, milestones, risks, etc.)

## Files to Modify
- `src/components/B31TablesEditor.tsx` (3 targeted edits)

