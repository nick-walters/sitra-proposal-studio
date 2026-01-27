

# Plan: Fix Logo Fetch to Return Properly Cropped Color Logos

## Problem Analysis

The participant logo fetch functionality currently displays logos as "black squares" rather than recognizable logo silhouettes. After investigation, here's what's happening:

1. **Edge function works correctly** - Logs confirm logos are being fetched from Logo.dev, cropped using imagescript, and uploaded to storage
2. **Logos are stored in the database** - Valid storage URLs exist for multiple participants
3. **CSS filter is intentional** - The `grayscale brightness-0` filter converts logos to solid black for formal EU proposal documents
4. **The issue**: When the background isn't properly removed during cropping, the entire rectangle (logo + background) becomes a solid black square

## Root Causes

### Cause 1: Background Detection Threshold Too Strict
The current `isEmptyPixel` function only considers pixels as "empty" if they are:
- Transparent (alpha < 10)
- Near-white (RGB all > 245)

This misses:
- Light gray backgrounds (e.g., RGB 240, 240, 240)
- Off-white backgrounds (e.g., RGB 250, 245, 240)
- Very light colored backgrounds

### Cause 2: No Alpha Channel Transparency
When images are cropped and re-encoded as PNG, the background pixels remain solid (just cropped to tight bounds). The CSS filter then turns everything black, including the background.

## Solution Overview

To display recognizable logo silhouettes, the cropped logos need to have their backgrounds made **transparent** rather than just being tightly cropped. This way, when the CSS filter is applied, only the actual logo content becomes black.

---

## Implementation Plan

### Step 1: Update Edge Function - Improve Background Detection

Modify `supabase/functions/fetch-logo/index.ts` to:
- Lower the white threshold from 245 to 240 for each RGB channel
- Add detection for light gray backgrounds (where all RGB values are similar and > 230)
- Add detection for near-white with slight color tints

```text
Updated isEmptyPixel logic:
- Transparent: alpha < 10
- Near-white: r > 240 AND g > 240 AND b > 240
- Light gray: all RGB > 230 AND difference between max/min RGB < 15
```

### Step 2: Update Edge Function - Make Background Transparent

After cropping, replace background pixels with transparent pixels:
1. Scan the cropped image
2. Identify background pixels using the improved `isEmptyPixel` logic
3. Set those pixels to fully transparent (RGBA 0,0,0,0)
4. Encode as PNG with alpha channel

This ensures that when displayed with the `brightness-0` CSS filter, only the actual logo content turns black while the background remains invisible.

### Step 3: Add Edge Case Handling

Handle special cases where logos might have:
- Dark backgrounds (rare but possible)
- Colored backgrounds that should be removed
- Logos that extend to the image edges

Implementation approach:
- Sample corners of the image to detect likely background color
- Use the dominant corner color as the "background" reference
- Apply transparency to pixels similar to this background color

### Step 4: Update Frontend Display (Optional Enhancement)

Consider adding a fallback display mode:
- If logo detection fails, show the original color logo without the black filter
- Add a visual indicator when auto-processing fails

---

## Technical Details

### Edge Function Changes (`supabase/functions/fetch-logo/index.ts`)

```text
File: supabase/functions/fetch-logo/index.ts

Changes:
1. Lines 320-331: Update isEmptyPixel function
   - Lower RGB threshold from 245 to 240
   - Add light gray detection (RGB > 230 with low variance)

2. Lines 304-374: Refactor cropEmptySpace to cropAndMakeTransparent
   - After finding content bounds, replace background pixels with transparent
   - Use flood-fill or pixel-by-pixel replacement based on background color detection

3. New function: detectBackgroundColor
   - Sample 4 corners of the image (5x5 pixel areas)
   - Find the most common color among corners
   - Return this as the probable background color

4. New function: makeBackgroundTransparent
   - Take the detected background color
   - Replace all similar pixels (within a tolerance) with transparent
   - Preserve logo content pixels
```

### Pixel Processing Logic

```text
For each pixel in the cropped image:
  1. Calculate color distance from detected background
  2. If distance < threshold (e.g., 30):
     - Set pixel to transparent (alpha = 0)
  3. Else:
     - Keep pixel as-is

Color distance formula:
  sqrt((r1-r2)^2 + (g1-g2)^2 + (b1-b2)^2)
```

### Testing Approach

1. Deploy updated edge function
2. Test with sample organizations:
   - Sitra (Finnish, known to work)
   - TU Delft (Dutch, complex logo)
   - CNR (Italian, text-heavy logo)
3. Verify logos display as silhouettes, not squares

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/fetch-logo/index.ts` | Update cropping logic, add transparency processing |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Logos with similar colors to background get holes | Use conservative tolerance; preserve logo integrity |
| Some logos might still show as squares | Allow manual upload as fallback (already exists) |
| Processing time increases | Keep algorithm simple; logos are small (200x200) |

## Success Criteria

- Fetched logos display as recognizable black silhouettes when CSS filter is applied
- No solid black squares for logos with white/light backgrounds
- Manual upload and delete functionality continues to work
- Logo fetch completes within 5 seconds

