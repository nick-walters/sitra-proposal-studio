

## Remove section boxes in A4 Ethics form

**What changes:**
The current layout wraps each numbered ethics section (1-9) inside individual Card boxes with full borders, padding, and rounded corners. This will be replaced with a flat, borderless layout where:

- Each section is separated by a horizontal line (divider) instead of being in its own box
- Left and right borders are added to the overall container for visual framing
- Section-level Card wrappers, padding, and indentation are removed
- The section headers and question rows flow naturally without card nesting

**Technical details:**

**File: `src/components/EthicsForm.tsx`**

1. In the "Ethics issues table" `<CardContent>` (around lines 925-969), replace the inner `<Card>` wrapper per section with a simple `<div>` that has:
   - A top border (`border-t`) as section separator (except the first section)
   - No rounded corners, no shadow, no card padding
   - Left/right borders on the overall container

2. Remove the `<CardHeader>` and `<CardContent>` nesting inside each section and render the section title and questions directly.

3. The outer "Ethics issues table" Card keeps its wrapper but the inner sections become flat divs separated by horizontal rules.

4. Similarly update the Security sections (around lines 1061-1160) to match the same flat style.

