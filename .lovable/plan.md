# Fix Typst content typography

## Scope
Correct cross-reference chip geometry, authored-table styling, H3 spacing, and derived caption labels in Typst preview/export. B3.1’s purpose-built table and caption emitters remain unchanged.

## Implementation

1. **Measure and correct chip geometry**
   - Compile a small deterministic Typst fixture with body text and each chip shape using the production preamble and bundled fonts.
   - Inspect the generated PDF’s text and vector bounding boxes programmatically, recording before/after: painted chip height, label font size, box baseline offset, label bounds within the shape, and shape position relative to the surrounding text baseline.
   - Replace the current zero-baseline/paint-outset arrangement with measured vertical placement shared by pill and polygon chips, so the label is optically centred and the chip itself sits correctly on the body-text baseline without increasing line leading.
   - Recompile and remeasure the same fixture; retain the measurement script/output as verification evidence rather than using browser inspection.

2. **Apply the shared authored-table specification**
   - Route HTML-authored tables through a dedicated shared Typst helper instead of Typst’s global simple-grid default.
   - Preserve proportional column widths and spanning cells while applying: no vertical rules, bold header, 1.5pt black rule below the header, 1px-equivalent light body separators, no rule below the final row, tight padding, and an 18cm maximum width.
   - Keep B3.1’s specialised tables on their existing emitters.

3. **Normalise H3 spacing**
   - Ensure H3 output is exactly 3pt before and 3pt after, including when stored spacing attributes are present, so outer wrapping cannot reintroduce a larger gap.

4. **Emit automatic caption labels**
   - Extend Typst conversion context with the section number and per-field table/figure offsets already derived by the block board’s caption-slot rules.
   - Walk cards and fields in document order, count table and figure caption slots separately, and generate labels such as `Table 1.2.a.` and `Figure 2.1.b.` at conversion time.
   - Ignore missing/stale editable label text in stored HTML; emit the derived bold-italic label followed by the editable caption text in italics.
   - Leave B3.1 caption handling unchanged.

## Verification
- Compile the chip fixture before and after and report its measured PDF geometry.
- Add or update focused converter tests for authored-table rules, exact H3 spacing, independent table/figure sequences, and caption text retention.
- Run `tsgo --noEmit` and confirm exit code 0.
- Do not perform any other browser verification.
