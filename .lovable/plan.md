

# Fix: Duplicate Version Numbers and Multi-User Version Conflicts

## Problem

The version history system creates duplicate `version_number` entries for the same section. For example, section `b1-1` has **7 copies** of "Version 1" and multiple copies of versions 2, 4, and 5. This happens because:

1. **Race condition**: The async `saveVersion()`, the periodic interval, and the sync XHR `syncSaveVersion()` on unmount all independently query for the latest version number and insert -- without any database-level protection against duplicates
2. **No unique constraint**: There's no unique index on `(proposal_id, section_id, version_number)`, so the database happily accepts duplicates

## Solution

### Step 1: Database migration -- add a unique constraint

Add a unique constraint on `(proposal_id, section_id, version_number)` to prevent duplicates at the database level. First, clean up existing duplicates by keeping only the most recent entry for each version number.

```sql
-- Delete duplicate versions, keeping the latest by created_at
DELETE FROM section_versions a
USING section_versions b
WHERE a.proposal_id = b.proposal_id
  AND a.section_id = b.section_id
  AND a.version_number = b.version_number
  AND a.created_at < b.created_at;

-- Add unique constraint
ALTER TABLE section_versions
ADD CONSTRAINT section_versions_unique_version
UNIQUE (proposal_id, section_id, version_number);
```

### Step 2: Create a database function for safe version insertion

Create a `SECURITY DEFINER` function that atomically gets the next version number and inserts, avoiding the read-then-write race condition.

```sql
CREATE OR REPLACE FUNCTION public.insert_section_version(
  p_proposal_id uuid,
  p_section_id text,
  p_content text,
  p_created_by uuid,
  p_is_auto_save boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_ver integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_ver
  FROM section_versions
  WHERE proposal_id = p_proposal_id
    AND section_id = p_section_id
  FOR UPDATE;

  INSERT INTO section_versions (proposal_id, section_id, content, created_by, version_number, is_auto_save)
  VALUES (p_proposal_id, p_section_id, p_content, p_created_by, next_ver, p_is_auto_save);

  RETURN next_ver;
END;
$$;
```

### Step 3: Update `useSectionContent.ts` -- use the RPC function

**Replace the async `saveVersion` callback** to call the new RPC function instead of doing a manual SELECT + INSERT:

```typescript
const { data, error } = await supabase.rpc('insert_section_version', {
  p_proposal_id: proposalId,
  p_section_id: sectionId,
  p_content: contentToSave,
  p_created_by: user.id,
});
if (!error && data) {
  lastVersionContentRef.current = contentToSave;
  lastVersionTimeRef.current = now;
  lastVersionNumberRef.current = data;
}
```

**Replace the sync XHR `syncSaveVersion`** to also use the RPC endpoint (via POST to `/rest/v1/rpc/insert_section_version`) instead of directly inserting with a guessed version number.

**Remove the baseline version creation** in the fetch effect (lines ~260-275) and replace it with an RPC call too, since it also does an unprotected INSERT.

### Step 4: Deduplicate version display in `SectionVersionHistoryDialog.tsx`

As a safety net, group versions by `version_number` in the dialog query, ordering by `created_at DESC` and using `DISTINCT ON` -- or simply add client-side deduplication until all old duplicates are cleaned up.

## Files Changed

| File | Change |
|------|--------|
| Migration (SQL) | Clean duplicates, add unique constraint, create `insert_section_version` RPC |
| `src/hooks/useSectionContent.ts` | Replace manual SELECT+INSERT with `supabase.rpc('insert_section_version')` in all 3 paths (async, sync XHR, baseline creation) |
| `src/components/SectionVersionHistoryDialog.tsx` | Add client-side dedup as safety net |

## Risk Assessment

- **Low risk**: The unique constraint + RPC approach is a standard pattern for sequence generation
- The sync XHR on unmount calling an RPC endpoint works the same as a direct POST -- same auth headers, same synchronous behavior
- Existing version history UI continues to work; duplicates are cleaned up in migration
