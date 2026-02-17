

# Fix Uniform Bubble Height in Table 3.1.c

## Problem
Deliverable, WP, and participant bubbles in the 3.1.c table have inconsistent heights. The deliverable bubble uses `height: 'fit-content'` but the `contentEditable` span inside inflates it. WP and participant bubbles use `top: '-0.5px'` offsets to compensate for clipping but remain slightly different sizes.

## Solution
Apply a consistent explicit height to all three bubble types so they render identically, and remove the positional hacks.

## Technical Changes (src/components/B31TablesEditor.tsx)

**1. Deliverable number bubble (around line 800-814)**
- Remove `height: 'fit-content'` and `width: 'fit-content'`
- Add a fixed `height: '17px'` to match the natural rendered height of non-editable bubbles
- This constrains the `contentEditable` span from inflating the bubble

**2. WP bubble in SingleWPSelector (around line 311)**
- Remove `position: 'relative'` and `top: '-0.5px'`
- Add `height: '17px'` for consistency

**3. Participant bubble in deliverables table (around line 858)**
- Remove `position: 'relative'` and `top: '-0.5px'`
- Add `height: '17px'` for consistency

**4. Cell padding (bubbleCellStyles)**
- Verify `!py-[1px]` is already in place (from previous fix) to prevent border clipping

All three bubble types will share the same explicit 17px height, ensuring uniform appearance with no clipping.
