

# Unified Plan: Smart Version History, Track Changes, and Code Cleanup

---

## Part 1: Autosave and Version History Improvements

### 1a. Increase autosave debounce from 1s to 5s

**File:** `src/hooks/useSectionContent.ts`

Change `AUTOSAVE_DEBOUNCE` from `1000` to `5000`. This only affects writes to `section_content` (the live document). No data loss risk because `beforeunload` and `visibilitychange` handlers still flush immediately.

### 1b. Increase version snapshot interval from 2 min to 5 min

**File:** `src/hooks/useSectionContent.ts`

Change `VERSION_MIN_INTERVAL` from `2 * 60 * 1000` to `5 * 60 * 1000`.

### 1c. Significance threshold for version creation

**File:** `src/hooks/useSectionContent.ts`

Add a `hasSignificantChange(oldContent, newContent)` helper that strips HTML and compares:
- Word difference >= 5 words, OR
- Character difference >= 50 characters, OR
- Content went from empty to non-empty (or vice versa)

The `saveVersion` function will check this before creating a snapshot. Forced saves (unmount, focus loss, manual "Save Version") bypass the threshold but still require non-identical content.

**Important distinction:** This threshold only gates version snapshots (`section_versions` table). Autosave to `section_content` remains unchanged -- every edit is always saved to the live document.

### 1d. Database schema changes

**New migration** adding three columns to `section_versions`:

```text
label        text     DEFAULT NULL    -- Custom name e.g. "Final submitted version"
is_pinned    boolean  DEFAULT false   -- Protects from auto-thinning
is_major     boolean  DEFAULT false   -- Major vs minor categorization
```

Update the `prevent_section_version_update` trigger to ALLOW changes to `label`, `is_pinned`, and `is_major` while keeping `content`, `version_number`, and `created_at` immutable.

Update the `prevent_section_version_delete` trigger to allow deletion only when `current_setting('app.allow_thinning', true) = 'true'`, so the thinning function can clean up old minor versions while manual deletion remains blocked.

### 1e. Major/minor version categorization

- **Minor versions** (default): Auto-created every 5 minutes when significant changes are detected.
- **Major versions**: Created when user explicitly clicks "Save Version", or when a version is pinned/labeled. Marked with `is_major = true`.

### 1f. Intelligent retention thinning

**New database function:** `thin_section_versions()`

Automatically prunes redundant minor versions based on age:

| Age | Versions kept |
|---|---|
| 0--7 days | All versions |
| 7--30 days | 1 per hour |
| 30--90 days | 1 per day |
| 90+ days | 1 per week |

**Never deleted:** pinned versions, labeled versions, major versions, version 1 (baseline), the latest version per section.

The function sets `app.allow_thinning = 'true'` before deleting, then resets it. Called as an RPC when the version history dialog opens.

---

## Part 2: Version History Dialog UI Enhancements

**File:** `src/components/SectionVersionHistoryDialog.tsx`

### 2a. File size display

Add `getContentSize(content)` showing bytes/KB alongside word count in the version list and detail panel.

### 2b. Change deltas

Show difference from previous version: "+12 words", "+1.2 KB" badges on each entry.

### 2c. Major/minor visual distinction

- Major versions: bold text, filled badge, prominent styling
- Minor versions: lighter, smaller text
- Pinning or labeling auto-promotes to major

### 2d. Version labeling (custom name) -- role-restricted

Coordinators, admins, and owners can assign a custom descriptive name to any version. This appears as an editable text input in the detail panel (right side), below the version number.

**How it displays:**
- The version number itself (e.g. "Version 5") is always shown and is never editable.
- The label appears underneath or beside it, e.g. "Version 5 -- Final submitted version".
- In the version list (left side), labeled versions show the label as secondary text below the version number.

**Role enforcement:**
- The label input field is only rendered when the current user's role tier is `coordinator` (which includes global admin and owner, per the existing `useProposalRole` hook).
- Editors and viewers can see labels but cannot edit them.
- The database update call uses the existing Supabase client with RLS -- since `section_versions` already requires `has_any_proposal_role`, and the update trigger allows label changes, this is safe. An additional RLS policy restricts UPDATE to users with coordinator/admin/owner roles only.

**Interaction:**
- Clicking the label area reveals an inline text input (or shows an "Add label" placeholder if empty).
- Pressing Enter or blurring saves the label via a Supabase update to `section_versions.label`.
- Setting a label automatically sets `is_major = true` on that version.
- Labels can be cleared by emptying the input (which does NOT revert `is_major`).

### 2e. Version pinning

- Pin/unpin toggle button (pin icon) in the detail panel.
- Also role-restricted to coordinator tier.
- Pinning automatically sets `is_major = true`.

### 2f. Time-based grouping

Group versions with section headers: "Today", "Yesterday", "This Week", "This Month", "Older".

### 2g. Retention policy info box

Add a collapsible info section (collapsed by default) below the dialog description using the existing `Collapsible` component. When expanded, it shows:

- A small table explaining the retention tiers (same as Part 1f above)
- A note: "Pinned, labeled, and major versions are never automatically removed."

Styled with `text-xs text-muted-foreground` to remain subtle.

### 2h. Fetch limit increase

Change from 50 to 200 versions (thinning keeps the list manageable).

---

## Part 3: Track Changes Fixes

**File:** `src/extensions/TrackChanges.ts`

### 3a. Handle replacement operations

Add a case in `appendTransaction` where `oldEnd > oldStart && newEnd > newStart` (text was replaced). Re-insert old text with a deletion mark before the new text, and mark the new text with an insertion mark.

### 3b. Preserve formatting on tracked deletions

Instead of creating a flat `schema.text()` node, use `deletedSlice.content` and apply the deletion mark to each text node, preserving bold/italic/etc.

### 3c. Fix accept/reject all position invalidation

Process all changes by sorting ranges in reverse order and processing deletions before mark removals, so earlier positions remain valid.

### 3d. Improve merge window

Reduce from 10 seconds to 5 seconds and reset when the user pauses for > 1 second.

---

## Part 4: Code Cleanup

### Delete unused files:
- `src/components/VersionHistoryDialog.tsx`
- `src/components/CollaborationPanel.tsx`
- `src/components/GrammarChecker.tsx`
- `src/components/WordCountBadge.tsx`

### Inline `useTrackedChanges`:
Replace the hook import in `DocumentEditor.tsx` with direct `useState`/`useCallback`, then delete `src/hooks/useTrackedChanges.ts`.

---

## Implementation Order

1. Database migration (add columns, update triggers, create thinning function, add RLS policy for label/pin updates)
2. Update `useSectionContent.ts` (5s debounce, 5-min interval, significance threshold)
3. Update `SectionVersionHistoryDialog.tsx` (all UI enhancements including role-gated labeling/pinning and retention info box)
4. Fix track changes in `TrackChanges.ts`
5. Delete unused files and inline `useTrackedChanges`

## Technical Details

### Files Modified

1. **`src/hooks/useSectionContent.ts`** -- debounce, interval, significance threshold
2. **`src/components/SectionVersionHistoryDialog.tsx`** -- all UI enhancements; receives `proposalId` (already a prop) and uses `useProposalRole(proposalId)` to determine if the user can label/pin
3. **`src/extensions/TrackChanges.ts`** -- replacement handling, formatting preservation, accept/reject fixes
4. **`src/components/DocumentEditor.tsx`** -- inline `useTrackedChanges`, remove unused imports
5. **New migration SQL** -- schema changes, trigger updates, thinning function, RLS update policy

### RLS for Label/Pin Updates

A new RLS policy on `section_versions` for UPDATE:
- Allows authenticated users who are coordinators/admins/owners on the proposal (via `is_proposal_admin`) to update `label`, `is_pinned`, and `is_major`.
- The existing trigger ensures `content`, `version_number`, and `created_at` remain immutable regardless.

### Risks and Mitigations

- **Version history**: Existing content edited but never versioned won't retroactively get versions. New edits will create versions going forward.
- **Track changes formatting**: The `deletedSlice.content` approach needs careful handling of inline vs text nodes.
- **Deleting files**: Each file verified to have zero imports across `src/`.
- **Thinning function**: Idempotent and safe to run multiple times. Protected versions are never removed.
- **Role check for labeling**: Uses the same `useProposalRole` hook already in the codebase, so no new security surface.

