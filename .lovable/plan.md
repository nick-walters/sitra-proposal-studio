
# Update WP Column Header

## Summary
Change the column header from "№" to "WP" in the Work Package Manager table for clarity and consistency with the badge display.

## Change Required

**File:** `src/components/WPManagementCard.tsx`

**Line 463:** Change the header text from "№" to "WP"

```tsx
// Before
<div className="text-center">№</div>

// After
<div className="text-center">WP</div>
```

## Result
The table header will now read "WP" to match the badge format (WP1, WP2, WP3) displayed in each row.
