
## Fix MS bubble direction in overlap resolution

### Problem
When an MS and a Deliverable on the same task row are close enough to overlap (within ~4 months / 28px), the overlap resolver always flips the **earlier** bubble to point right. When the MS is earlier (like MS7 at month 14 before D2.2 at month 18), it incorrectly gets forced to point right.

### Solution
Make the overlap resolution type-aware. When resolving overlaps between an MS and a D:
- The **MS** should keep its preferred direction (pointing left, sitting right of its month boundary)
- The **D** should flip to point left (sitting right of its boundary) instead

When both are the same type, keep the current behavior (earlier points right, later points left).

### Technical Details

**File: `src/components/GanttChartFigure.tsx` (lines 473-489)**

Update the overlap resolution block to check bubble types:

```
for (let ni = 1; ni < positioned.length; ni++) {
  const prev = positioned[ni - 1];
  const curr = positioned[ni];
  if (prev.month === curr.month) continue;
  const overlap = (prev.leftX + prev.width + 1) - curr.leftX;
  if (overlap > 0) {
    if (prev.type === 'ms' && curr.type === 'del') {
      // MS stays pointing left (right of its boundary), D flips to point left too
      const prevTX = getTargetX(prev.month);
      prev.leftX = prevTX;
      prev.triSide = 'left';
      const currTX = getTargetX(curr.month);
      curr.leftX = currTX;
      curr.triSide = 'left';
    } else if (prev.type === 'del' && curr.type === 'ms') {
      // D stays pointing right (left of its boundary), MS stays pointing left
      const prevTX = getTargetX(prev.month);
      prev.leftX = prevTX - prev.width;
      prev.triSide = 'right';
      const currTX = getTargetX(curr.month);
      curr.leftX = currTX;
      curr.triSide = 'left';
    } else {
      // Same type: earlier points right, later points left (existing behavior)
      const prevTX = getTargetX(prev.month);
      prev.leftX = prevTX - prev.width;
      prev.triSide = 'right';
      const currTX = getTargetX(curr.month);
      curr.leftX = currTX;
      curr.triSide = 'left';
    }
  }
}
```

This ensures MS bubbles maintain their natural left-pointing orientation whenever possible, while deliverables adjust instead.
