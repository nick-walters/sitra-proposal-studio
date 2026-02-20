

## Lower Footnote Number Vertical Alignment

The footnote numbers in the footnote area are rendered as `<sup>` elements with `relative top-[-0.15em]`, which raises them too high relative to the footnote text content.

### Change

**File: `src/components/TopicRichTextArea.tsx` (line 168)**

Replace the `<sup>` element with a `<span>` and remove the upward offset so the number aligns with the baseline of the footnote text:

```
// Before:
<sup className="text-primary font-semibold text-[10px] relative top-[-0.15em] shrink-0">{displayNum}</sup>

// After:
<span className="text-primary font-semibold text-[10px] shrink-0 leading-none">{displayNum}</span>
```

By switching from `<sup>` (which has built-in vertical-align: super) to a regular `<span>`, the number sits at the same baseline as the footnote text. The `leading-none` prevents extra line-height from pushing it around.

This is a single-line change in one file.
