

## Add "RP" and "Y" prefixes to Gantt chart header

### Changes

**File: `src/components/GanttChartFigure.tsx`**

Two small text changes in the header rendering:

1. **Reporting Period row (line 334)**: Change `{rp.number}` to `{`RP${rp.number}`}` so it displays "RP1", "RP2", etc.

2. **Year row (line 347)**: Change `{yr.year}` to `{`Y${yr.year}`}` so it displays "Y1", "Y2", "Y3", etc.

No logic or layout changes needed -- just prefixing the displayed text.

