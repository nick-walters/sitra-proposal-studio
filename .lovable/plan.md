

# Fix PDF Export Scaling — Root Cause and Solution

## Root Cause

The bug is a **single line**: `scale: 2` in the html2canvas options.

jsPDF v4's `html()` method internally computes the correct html2canvas `scale` from the relationship between `width` (mm) and `windowWidth` (px):

```text
internalScale = scaleFactor × (96/72) × width / windowWidth
             = 2.8346    × 1.333   × 180  / 680
             ≈ 1.0
```

When we explicitly pass `scale: 2`, it **overrides** this internal computation, rendering everything at 2x the intended size. That is why 11pt text appears as ~22pt, content overflows the page, and the file balloons to 47MB (double-resolution canvas images).

The `windowWidth` and `windowHeight` inside the html2canvas options block may also conflict with jsPDF's own windowWidth handling.

## Fix (3 lines changed in one file)

### File: `src/hooks/usePdfExport.ts`

Remove `scale`, `windowWidth`, and `windowHeight` from the `html2canvas` options object. Keep them at the `pdf.html()` level where jsPDF expects them. The html2canvas block becomes:

```typescript
html2canvas: {
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  logging: false,
  scrollX: 0,
  scrollY: 0,
},
```

Everything else stays the same — `width: 180`, `windowWidth: 680`, margins, `autoPaging: 'text'`, headers/footers, watermark.

## Why this works
- jsPDF computes `scale ≈ 1.0` internally, producing correctly-sized vector text
- Text remains selectable and searchable (no rasterization)
- File size drops from ~47MB to a normal range
- No other files need changes

## Why previous attempts failed
- `scale: 0.264583` — wrong (scale is a multiplier, not a unit conversion)
- `scale: 2` — overrides jsPDF's internal calculation, doubling everything

