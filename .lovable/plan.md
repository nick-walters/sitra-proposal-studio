

## Fix: Bubble Clipping in B31 Deliverables Table

### Problem
The WP and Partner pill-shaped badges (bubbles) in the Deliverables table (Table 3.1c) are being cut off at the top and bottom. The root cause is that the shared `cellStyles` uses `py-px` (1px padding) and `leading-none`, which provides insufficient vertical space for the taller bubble elements.

Previous attempts to fix this with `overflow-visible` on SelectTrigger did not work because CSS overflow clipping is enforced by parent containers -- a child cannot override its ancestor's clipping behavior.

### Solution
Instead of fighting overflow, give the bubble-containing cells enough vertical space by using a dedicated cell style with more padding.

### Changes (1 file)

**`src/components/B31TablesEditor.tsx`**

1. **Add a new `bubbleCellStyles` constant** (next to existing `cellStyles` on line 136):
   ```
   const bubbleCellStyles = "border border-black px-0.5 py-1 h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-normal";
   ```
   Key differences from `cellStyles`: `py-1` instead of `py-px`, `leading-normal` instead of `leading-none`.

2. **Apply `bubbleCellStyles` to the WP column cell** (line 702): Change `cellStyles` to `bubbleCellStyles`.

3. **Apply `bubbleCellStyles` to the Lead Participant column cell** (line 709): Change `cellStyles` to `bubbleCellStyles`.

4. **Simplify the Lead Participant SelectTrigger** (line 714): Remove the `overflow-visible` workaround since the extra cell padding makes it unnecessary. Change to:
   ```
   className="h-auto px-0 border-0 bg-transparent focus:ring-0 w-auto inline-flex items-center"
   ```

5. **Also apply `bubbleCellStyles` to the Milestones table WP column** (line 944) if multi-WP bubbles have the same clipping issue there.

### Why This Works
- The bubbles are approximately 18-20px tall; `py-1` (8px total) provides enough breathing room vs `py-px` (2px total)
- No overflow hacks needed -- content fits naturally within the cell
- Only the columns with bubbles get the extra padding; other columns stay compact
