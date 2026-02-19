

## Reduce Icon-to-Text Gap in Left Panel

Reduce the gap between icons and their adjacent text labels in the left navigation panel from the current `gap-2` (8px) to 6px.

### Technical Details

**File:** `src/components/SectionNavigator.tsx`

- Change the flex container class on the nav item from `gap-2` to a custom gap of 6px using inline style or Tailwind's arbitrary value syntax `gap-[6px]`.
- Location: the `className` string containing `"section-nav-item flex items-center gap-2 group"` (around line 120).

