
# Unified Bubble System Across Part B

## Goal
Create a single, consistent bubble specification used everywhere in the proposal: tables, text cross-references, Gantt, WP descriptions, and captions.

## Bubble Specification

### Universal Properties (all bubble types)
- Font: 11pt Times New Roman, bold
- Shape: pill (rounded-full)
- Fixed height with minimal vertical padding (just enough to not clip text)
- Must not increase line spacing when used inline in text
- `vertical-align: baseline` and `line-height: 1` to prevent pushing lines apart

### Bubble Types

| Type | Fill | Border | Text colour | Font style | Content |
|------|------|--------|-------------|------------|---------|
| WP | WP colour | WP colour | White | Bold | "WPX" (or "WPX: ShortName" / "WPX: ShortName - Title" where already used) |
| Participant | Black | Black | White | Bold italic | Short name. Crown icon for WP/task leaders. Participant number only in tables where already shown |
| Task | White | WP colour (1.5px) | WP colour | Bold | "TX.X" |
| Deliverable | White | WP colour (1.5px) | WP colour | Bold | "DX.X" |
| Milestone | White | Black (1.5px) | Black | Bold | "MSX" |
| Risk (L/M/H) | White | Level colour (1.5px) | Level colour | Bold | "L" / "M" / "H" |

### Caption bubbles
Same parameters as their corresponding type (participant caption bubbles use black fill, crown where indicated).

---

## Technical Changes

### 1. Create shared bubble utility (new file)
**File: `src/lib/bubbleStyles.ts`**

Export a set of functions that return consistent inline style objects and class strings for each bubble type:
- `wpBubbleStyles(color)` -- fill + border = WP colour, white text
- `participantBubbleStyles()` -- fill + border = black, white italic text
- `taskBubbleStyles(wpColor)` -- white fill, WP colour border + text
- `deliverableBubbleStyles(wpColor)` -- white fill, WP colour border + text
- `milestoneBubbleStyles()` -- white fill, black border + text
- `riskBubbleStyles(levelColor)` -- white fill, level colour border + text

Each returns `{ className, style }` with:
- `font-family: Times New Roman`, `font-size: 11pt`, `font-weight: bold`
- `border-radius: 9999px`, `white-space: nowrap`
- `display: inline-flex`, `align-items: center`
- `line-height: 1`, `vertical-align: baseline`
- Minimal padding: `padding: 0px 5px`
- For italic types: `font-style: italic`

### 2. Update `src/extensions/WPReferenceMark.ts`
- Change font-size from `9pt` to `11pt`
- Add `border: 1.5px solid ${color}` (same as background colour)
- Keep `vertical-align: baseline` to prevent line height inflation
- Add `font-family: 'Times New Roman', Times, serif`

### 3. Update `src/extensions/ParticipantReferenceMark.ts`
- Change font-size from `9pt` to `11pt`
- Add `font-style: italic`
- Add `border: 1.5px solid #000000`
- Add `font-family: 'Times New Roman', Times, serif`

### 4. Update `src/components/B31TablesEditor.tsx`
- **WPBubble**: Change font from `9pt` to `11pt`, add `border` matching bg colour, add `font-family`
- **RiskBadge**: Change font from `9pt` to `11pt`, keep white bg + coloured border/text
- **Participant bubbles** (deliverables table, line ~856): Change to `11pt`, add border `1.5px solid #000`, italic
- **Deliverable number bubble** (line ~803): Change to `11pt`
- **Milestone bubble** (line ~1108): Change to `11pt`

### 5. Update `src/components/B31WPDescriptionTables.tsx`
- **ParticipantBubble**: Change from `9pt` to `11pt`, add `border: 1.5px solid #000`
- **CaptionBubble**: Change from `9pt` to `11pt`, adjust dimensions to fit 11pt text
- **Task bubbles** (line ~554-556): Change from `9pt` to `11pt`
- **WP header bubble** already at `11pt` -- add explicit `border` matching bg colour

### 6. Update `src/components/GanttChartFigure.tsx`
- **Task number bubbles** (lines ~401-403, ~567-569): Change from `9pt` to `11pt`
- **WP header bubble**: Add `border` matching bg colour, ensure `font-family: Times New Roman`
- **Deliverable/milestone indicator bubbles** (line ~496-512): Change from `9pt` to `11pt`

### 7. Update `src/components/WPDraftEditor.tsx`
- **WP reference spans** (line ~267-288): Add `border` matching bg colour, add `font-family: Times New Roman`, ensure `11pt` (already set)

### 8. Add CSS rule in `src/index.css`
Add a rule to prevent inline bubbles from affecting line height in document content:
```css
.wp-reference-badge,
.participant-reference-badge {
  line-height: 1 !important;
  vertical-align: baseline !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
```

### 9. Update PDF export (`src/hooks/usePdfExport.ts` and `src/hooks/useDocxExport.ts`)
Ensure any bubble rendering in exports follows the same 11pt Times New Roman bold specification.

## Files to modify
1. `src/lib/bubbleStyles.ts` (new)
2. `src/extensions/WPReferenceMark.ts`
3. `src/extensions/ParticipantReferenceMark.ts`
4. `src/components/B31TablesEditor.tsx`
5. `src/components/B31WPDescriptionTables.tsx`
6. `src/components/GanttChartFigure.tsx`
7. `src/components/WPDraftEditor.tsx`
8. `src/index.css`
9. PDF/DOCX export hooks (if bubble rendering exists there)
