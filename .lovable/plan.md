

## Implement 9-Color WP Palette

### Changes

1. **`src/lib/wpColors.ts`** — Replace `DEFAULT_WP_COLORS` with 9 colors:
   ```
   #2E6BC6, #881337, #166534, #C2410C, #0F766E, #7E57C2, #C2185B, #5C8C14, #B91C1C
   ```

2. **`src/components/WPColorPaletteEditor.tsx`** — Change from 12 slots to 9: update `colorNames` array (9 entries), padding loop limit, and `slice(0, 9)`.

3. **`src/test/wpColors.test.ts`** — Update the wrap-around test to use the new palette length (9).

4. **Delete `public/palette-preview.html`** — No longer needed.

