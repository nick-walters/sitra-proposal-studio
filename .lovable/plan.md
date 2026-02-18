

## Reduce Month Column Width to 7px

Change the Gantt chart month column width from the current 10px to 7px.

### Technical Details

In `src/components/GanttChartFigure.tsx`:

1. Change `MIN_CELL_WIDTH` from `8` to `7` (line 58)
2. Change `minQuarterWidth` from `30` to `21` (line 209), so `Math.ceil(21/3) = 7`

This will make each month column 7px wide, which also increases the available label width since `labelWidth = TOTAL_WIDTH_PX - timelineWidth - MARGIN_GAP`.

