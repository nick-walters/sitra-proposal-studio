

## Reduce spacing after H2 headings to 0pt

Currently, the space after Level 2 headings is 6pt in both the editor and PDF export. This plan reduces it to 0pt in all relevant places.

### Changes

**1. CSS (Editor view) -- `src/index.css`**

In the editor, the gap after an H2 comes from the following paragraph's `margin-top: 6pt`. To eliminate it specifically after H2, add a CSS rule:

```css
.document-h2 + p,
.ProseMirror h2 + p {
  margin-top: 0 !important;
}
```

Also add `margin-bottom: 0 !important` to the `.document-h2` class for explicitness.

**2. PDF Export -- `src/hooks/usePdfExport.ts`**

In the `addH2` helper (line 292), remove the `paragraphSpacingH2` added after the heading:

- Change: `yPosition += 4.5 + paragraphSpacingH2` to `yPosition += 4.5`
- Update the comment from "6pt before, 6pt after" to "6pt before, 0pt after"

### Technical Details

| Location | Current | New |
|---|---|---|
| `src/index.css` `.document-h2` | No explicit margin-bottom | `margin-bottom: 0 !important` |
| `src/index.css` new rule | N/A | `.document-h2 + p, .ProseMirror h2 + p { margin-top: 0 !important }` |
| `src/hooks/usePdfExport.ts` line 292 | `yPosition += 4.5 + paragraphSpacingH2` | `yPosition += 4.5` |

