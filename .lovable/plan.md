

## Fix: Profile Photo Zoom Squashing

### Problem
When zooming the profile photo in the crop dialog, the image gets distorted instead of maintaining its aspect ratio.

### Root Cause
The `<img>` element in the crop preview has both `width` and `height` set as explicit pixel values in the `style` attribute. While the calculated values should theoretically maintain the aspect ratio, browser rounding and edge cases (especially at low zoom levels) can cause slight mismatches. More importantly, adding `object-fit: contain` as a safeguard is missing, which means any calculation imprecision leads to visible distortion.

### Solution
In `src/components/ProfilePhotoUpload.tsx`, add `objectFit: 'contain'` to the preview image's inline style to ensure the browser always preserves the image's natural aspect ratio regardless of the explicit width/height values.

### Technical Details

**File: `src/components/ProfilePhotoUpload.tsx`**

- On the `<img>` element inside the crop preview (around line 309-321), add `objectFit: 'contain'` to the style object so it becomes a safety net against any dimensional rounding issues:

```tsx
style={{
  width: `${scaledWidth}px`,
  height: `${scaledHeight}px`,
  left: `${(cropSize - scaledWidth) / 2 + position.x}px`,
  top: `${(cropSize - scaledHeight) / 2 + position.y}px`,
  objectFit: 'contain',
}}
```

- Additionally, ensure the canvas crop logic (`cropAndUpload` function) also uses the correct aspect-preserving dimensions so the final uploaded image matches what the user sees in the preview.

