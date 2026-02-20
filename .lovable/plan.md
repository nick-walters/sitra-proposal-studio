

## Fix: Restore Page Scrolling

### Problem
Pages (Dashboard, participant forms, and other content views within proposals) cannot be scrolled. This was introduced when CSS was modified to fix the "page loads at the bottom" issue. The current `html, body { height: 100%; overflow: auto; }` creates competing scroll containers that can block scrolling in certain browser/layout scenarios.

### Root Cause
In `src/index.css`, both `html` and `body` are set to `height: 100%` with `overflow: auto`. When two nested elements both have fixed heights and `overflow: auto`, the browser can get confused about which element should scroll, especially when content inside `#root` overflows.

### Solution
Update the CSS in `src/index.css` to use a proper scroll chain:

- **`html`**: Set to `height: 100%` only (no overflow property) -- this establishes the viewport baseline
- **`body`**: Set to `min-height: 100%` (not `height: 100%`) so it can grow with content, and remove the explicit `overflow: auto` so scrolling uses the browser's default behavior
- **`#root`**: Set to `min-height: 100vh` to ensure it fills the viewport but can also grow

This allows:
1. **Dashboard and other full-page views** to scroll naturally via body overflow
2. **ProposalEditor** to continue managing its own internal scrolling with `h-screen overflow-hidden` and internal `overflow-y-auto` panels (unaffected by this change)

### Technical Details

**File: `src/index.css` (lines 253-265)**

Replace:
```css
html, body {
  height: 100%;
  overflow: auto;
}

body {
  /* existing tailwind classes */
  font-family: Arial, Helvetica, sans-serif;
}

#root {
  min-height: 100%;
}
```

With:
```css
html {
  height: 100%;
}

body {
  /* existing tailwind classes */
  font-family: Arial, Helvetica, sans-serif;
  min-height: 100%;
}

#root {
  min-height: 100vh;
}
```

This is a single-file, 3-line change that restores the standard scrolling model while keeping the ProposalEditor's contained layout working correctly.
