

## Fix: Proposal editors and global owners/admins unable to add participants

### Root Cause

The issue is **not in the frontend** -- it's in the **database security functions**. When a user tries to add a participant, the database RLS policy on the `participants` table calls `can_edit_proposal()`, which only checks for roles with a matching `proposal_id`. Global roles (owner/admin with `proposal_id = NULL`) are never matched because `NULL = 'some-uuid'` evaluates to NULL in SQL, not TRUE.

The same problem exists in three core database functions:
- `can_edit_proposal()` -- used for INSERT/UPDATE/DELETE on participants
- `has_any_proposal_role()` -- used for SELECT on participants and many other tables
- `is_proposal_admin()` -- used for admin-level operations

### Why the frontend appears to work

The frontend code in `useProposalData.ts` correctly fetches both global and proposal-specific roles and picks the highest-privilege one. So the UI shows the "Add Participant" button. But when the user clicks it and the INSERT query runs, the database rejects it because the RLS policy function doesn't account for global roles.

### Solution

Update three database functions to also check for global roles (where `proposal_id IS NULL`):

**1. `can_edit_proposal`** -- Add a check for global owner/admin roles:
```sql
CREATE OR REPLACE FUNCTION public.can_edit_proposal(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (proposal_id = _proposal_id AND role IN ('owner', 'admin', 'editor'))
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;
```

**2. `has_any_proposal_role`** -- Add a check for global roles:
```sql
CREATE OR REPLACE FUNCTION public.has_any_proposal_role(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        proposal_id = _proposal_id
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;
```

**3. `is_proposal_admin`** -- Add a check for global owner/admin:
```sql
CREATE OR REPLACE FUNCTION public.is_proposal_admin(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (proposal_id = _proposal_id AND role IN ('owner', 'admin'))
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;
```

### What this fixes

- Global owners and admins will be able to add/edit/delete participants on any proposal
- Proposal-level editors will be able to add/edit participants (they already had `can_edit_proposal` matching their role, but only if stored with the correct `proposal_id`)
- SELECT access will also work for global roles across all tables using `has_any_proposal_role`

### Files changed

| Change | Description |
|--------|-------------|
| Database migration (SQL) | Update 3 security functions to recognize global roles |
| No frontend changes needed | The frontend already handles global roles correctly |

