

# Plan: Rewrite PDF Export Using jsPDF.html() + Add HTML-to-DOCX Export

## Phase 1: PDF Export Rewrite (Priority — 48h deadline)

### Approach
Replace the 2,645-line manual rendering engine in `src/hooks/usePdfExport.ts` with a browser-based pipeline:

1. **Create a hidden print container** — a `<div>` styled at 180mm content width (A4 minus 2×15mm margins), with the same CSS as the editor (11pt Times New Roman, all editor classes loaded)
2. **Inject each section's HTML** into the container, including B3.1 tables, participant lists, figures, and charts rendered as actual React components
3. **Call `jsPDF.html()`** which uses the browser's native layout engine to render vector text onto paginated A4 pages
4. **Overlay headers, footers, and watermark** using existing jsPDF drawing code (this part already works)

### What changes
- **`src/hooks/usePdfExport.ts`** — complete rewrite (~400-500 lines replacing ~2,645)
- **`src/index.css`** — add a `@media print` / `.print-container` style block that mirrors editor styling but hides interactive elements (toolbars, drag handles, buttons)
- **New helper: `src/lib/printRenderer.tsx`** — a React component that renders B3.1 tables, participant lists, PERT/Gantt charts into the hidden container using the same components as the editor

### What stays the same
- Export dialog UI (`ExportDialog.tsx`)
- Section ordering and data fetching logic
- Header/footer/watermark overlay code

### What gets deleted
- All manual text rendering functions (renderRichTextJustified, drawJustifiedLine, etc.)
- All manual table rendering (addTable, addB31TableAdvanced, etc.)
- All manual bubble drawing (drawBubble, drawWPBubble, etc.)
- All HTML parsing (parseHtmlContent, extractSegments, etc.)

### Why this fixes everything
Every issue stems from the same root cause: a second rendering engine that differs from the browser. By using `jsPDF.html()`, the PDF output IS the browser's rendering — kerning, table widths, bubble styles, figure aspect ratios, vertical alignment, and borders all match automatically because the same CSS rules apply.

---

## Phase 2: DOCX Export via HTML-to-DOCX (after PDF is stable)

### Approach
Use `html-docx-js` (or the similar `html-to-docx` package) to convert the same print container HTML into a `.docx` file.

- Bubbles render as colored rectangles (no border-radius in Word) — acceptable
- Tables, text formatting, figures, and layout carry over via HTML/CSS
- Same hidden container approach as PDF, so visual consistency is maintained

### Tradeoffs
- Bubble pills become rectangles — visually close but not identical
- Complex CSS (flexbox, grid) may degrade — mitigated by using simple table-based layout in the print container
- Can be enhanced later with native `docx-js` bubble rendering if needed

---

## Implementation order
1. Rewrite `usePdfExport.ts` with jsPDF.html() approach
2. Create `printRenderer.tsx` helper for rendering sections
3. Add print-specific CSS
4. Test with ADDGenAI proposal
5. (Phase 2) Add HTML-to-DOCX export option

