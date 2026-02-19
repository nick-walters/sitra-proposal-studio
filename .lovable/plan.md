

## Fix: Trailing space before ellipsis in B3 heading

### Problem
CSS `text-overflow: ellipsis` is a browser-level limitation -- it never trims trailing whitespace before the ellipsis. When the B3 heading "Quality & efficiency of implementation" overflows right after the space in "of ", the result is `of ...` instead of `of...`.

This cannot be fixed with CSS alone (no combination of `word-break`, `overflow-wrap`, or `text-overflow` properties will trim that space).

### Solution
Replace CSS-based ellipsis with a small JavaScript-based truncation utility that:
1. Measures whether the text overflows its container
2. When truncated, trims any trailing whitespace before appending "..."

### Implementation

**File: `src/components/SectionNavigator.tsx`**

1. Create a small `TruncatedText` component (inline in the file) that:
   - Uses a `useRef` on the text span
   - Uses a `useLayoutEffect` + `ResizeObserver` to detect when text overflows
   - When overflowing, uses binary search on a hidden measurement span to find the last fitting character
   - Trims trailing spaces from the visible portion and appends "..."
   - When not overflowing, renders the full text normally

2. Replace the current title `<span>` (line 268) with `<TruncatedText text={formatTitle(section.title)} />`, removing the CSS `text-overflow: ellipsis` and `word-break: break-all` styles.

### Technical details

```text
TruncatedText component:
  - props: text (string), className (string)
  - refs: containerRef, measureRef (hidden span for measuring)
  - state: displayText (string | null)
  - ResizeObserver watches containerRef width
  - On resize: if scrollWidth > clientWidth, binary-search
    for max chars that fit, trim trailing spaces, append "..."
  - Otherwise: displayText = null (show full text)
```

This is a reliable, widely-used pattern for ellipsis truncation that gives full control over whitespace handling.

