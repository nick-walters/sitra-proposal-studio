

## Fix: MS and D bubble positioning in Gantt chart for early months

### Problem

When MS1 (month 1) and D9.1 (month 2) are on the same task, the overlap resolution algorithm pushes MS1 to `leftX = -31.5`, placing it completely outside the task's timeline area. This happens because:

1. With 7px-wide month cells, bubble widths (17-27px) greatly exceed cell widths
2. D9.1 already has a negative leftX (-13.5) to sit left of its month boundary
3. The overlap resolution then pushes MS1 even further left to "sit left of D"

### Solution

Modify the overlap resolution logic in `GanttChartFigure.tsx` to handle the case where pushing a bubble left would place it at an extreme negative position. When the earlier bubble (MS) would be pushed too far left, instead:

1. Keep MS at or near its target position, pointing right
2. Push D to the right of MS instead of keeping D in its default position

### Technical Changes

**File: `src/components/GanttChartFigure.tsx` (lines ~496-531)**

Update the overlap resolution section to add a minimum leftX bound. When the calculated leftX for the earlier bubble would go below a threshold (e.g., more than one bubble-width to the left of x=0), flip the strategy: anchor the earlier bubble near its target and push the later bubble rightward.

Specifically, in the `prev is MS, curr is D` case (lines 503-511):
- Calculate the proposed MS position as before
- If the proposed position would place the MS tip more than ~20px before the timeline start (leftX < -20), switch strategy:
  - Place MS at its target pointing right: `prev.leftX = prevTX - prev.width`, `prev.triSide = 'right'`  
  - Push D to the right of MS: `curr.leftX = prev.leftX + prev.width + 1`, `curr.triSide = 'right'`

Similarly, handle the symmetric case (`prev is D, curr is MS`) to prevent extreme rightward displacement.

This preserves the existing positioning logic for normal cases while preventing bubbles from being pushed off-chart in tight early-month scenarios.

