

## Fix: Profile Photo Crop Tool -- CSS Transform Approach

### Problem

Previous attempts computed explicit `width`, `height`, `left`, and `top` pixel values for the preview image. This manual positioning math is fragile and causes the image to appear to slide diagonally rather than zoom from center, likely due to how absolute positioning interacts with the circular `overflow: hidden` container.

### New Approach: CSS `transform` Instead of Manual Positioning

Replace all manual size/position calculations in the preview with CSS `transform: scale()` and `translate()`. This is fundamentally different from previous attempts:

- The image is sized once (on load) so its shortest side fits the 200px crop circle
- Zoom uses `transform: scale(zoom)` which naturally scales from center
- Pan uses `transform: translate(x, y)` combined with the scale
- No manual `left`/`top`/`width`/`height` recalculation on every zoom change

### Changes to `src/components/ProfilePhotoUpload.tsx`

**Preview image rendering (lines 322-339):**
- Set the image to a fixed base size where its shortest dimension equals `CROP_SIZE` (200px)
- Position it centered in the container using `left: 50%; top: 50%; transform-origin: center`
- Apply zoom and pan via a single `transform` property:
  ```
  transform: translate(-50%, -50%) scale(zoom) translate(panX, panY)
  ```
- Remove `getScaledWidth`/`getScaledHeight` helper functions -- no longer needed for preview rendering

**Drag handling (unchanged logic, simpler values):**
- `position.x` and `position.y` become pixel offsets passed directly to `translate()` inside the transform
- Clamp logic updated to account for scale factor (divide overflow by zoom to keep bounds in pre-scale coordinates)

**Canvas crop output (lines 124-170):**
- Keep existing canvas-based crop logic, which already correctly uses `naturalDims` and `zoom` to draw the final 256x256 output -- this part works independently of the preview CSS

### Also apply the same fix to `src/components/admin/AdminAvatarUpload.tsx`

This component has identical crop logic and the same bug. Apply the same transform-based approach.

### Technical Details

The preview image style will change from:
```typescript
style={{
  width: `${w}px`,
  height: `${h}px`,
  left: `${(CROP_SIZE - w) / 2 + position.x}px`,
  top: `${(CROP_SIZE - h) / 2 + position.y}px`,
}}
```

To:
```typescript
style={{
  width: `${baseWidth}px`,
  height: `${baseHeight}px`,
  left: '50%',
  top: '50%',
  transformOrigin: 'center',
  transform: `translate(-50%, -50%) scale(${zoom[0]}) translate(${position.x / zoom[0]}px, ${position.y / zoom[0]}px)`,
}}
```

Where `baseWidth` and `baseHeight` are computed once when the image loads (shortest side = CROP_SIZE), and never change.

The clamp function updates to:
```typescript
const clampPosition = (pos, z) => {
  const maxX = Math.max(0, (baseWidth * z - CROP_SIZE) / 2);
  const maxY = Math.max(0, (baseHeight * z - CROP_SIZE) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pos.x)),
    y: Math.min(maxY, Math.max(-maxY, pos.y)),
  };
};
```

