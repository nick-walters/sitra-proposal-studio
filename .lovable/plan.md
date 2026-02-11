

# Contact Persons: Role Protection, Crown Icon, and MCP Exclusivity

## Overview

Three changes to the Contact Persons section:

1. **No role demotion**: When granting access to a CP who already has a higher role (coordinator, owner, or global admin), skip inserting a new editor role and just mark them as having access.
2. **Crown icon instead of star**: Replace the Star icon with Crown for the MCP toggle.
3. **MCP exclusivity**: Once one CP is flagged as MCP, the crown button is hidden (or disabled) for all other CPs. The only way to assign a different MCP is to first click the crown on the current MCP to remove their status.

## Technical Details

All changes are in **`src/components/participant/ContactPersonsSection.tsx`**.

### 1. Role-aware access granting (`handleGrantAccess`)

Currently, when an existing user already has a `user_roles` entry for this proposal, the code shows "already has access". But if they have no proposal-specific role, it always inserts `editor`. The fix:

- After finding the existing profile, query their existing role for this proposal **and** check for global roles (owner/admin).
- If they already have a role equal to or higher than editor (coordinator, owner, admin), do NOT insert an editor role -- just update the member's `accessGranted` flag and show a toast like "Already has coordinator access".
- Only insert `editor` if they have no existing role at all.

### 2. Replace Star with Crown

- Change the import from `Star` to `Crown` (from `lucide-react`).
- Replace all `<Star ...>` references with `<Crown ...>` in the MCP toggle button.
- Update fill class from `fill-primary` to `fill-primary` (same, just on Crown now).

### 3. MCP exclusivity logic

- Derive `hasMCP` = `members.some(m => m.isPrimaryContact)` at the top of the render.
- For each member row, only show the crown button if:
  - The member IS the current MCP (so they can un-flag themselves), OR
  - There is NO MCP currently set (so any member can be flagged).
- If `hasMCP` is true and this member is not the MCP, the crown button is hidden (not shown at all), preventing accidental re-assignment.

### Files modified

- `src/components/participant/ContactPersonsSection.tsx` -- all three changes in this single file.

