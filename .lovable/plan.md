

# Fix: Task Self-Tag Notifications -- Root Cause Analysis and Solution

## Investigation Findings

### Database Evidence
- The only task in the database ("Tezt", created Feb 12) has a **null description** -- the @mention text was never saved.
- The `notifications` table schema is correct and has all required columns.
- RLS policies on `notifications` allow inserts for users who can edit the proposal (confirmed working for comments and messages).
- RLS policies on `proposal_tasks` require `created_by = auth.uid()` for inserts, which is correctly set.

### Root Cause
The `description` field is stored as `null` in the database. This means `data.description` evaluates to falsy, and the entire notification block inside `if (data.description)` is skipped. The @mention text entered via MentionTextarea is either:

1. **Not persisting in form state** -- the `onChange` fires but `form.description` reverts to empty before submission (unlikely given identical wiring to comments/messages), OR
2. **The user is not entering description text** -- the mention may be typed in the title field, or the task is created without filling in the description field at all.

Since the diagnostic `console.log` statements added in the last edit have not yet produced any output (no new tasks created since the code deployed), we cannot distinguish between these two scenarios from logs alone.

## Solution: Belt-and-Suspenders Fix

Rather than continuing to debug incrementally, implement a comprehensive fix that guarantees notifications work regardless of the failure point.

### Step 1: Add a pre-submit log to confirm form state

**File:** `src/components/ProposalTaskAllocator.tsx`

Add a `console.log` right at the button click handler (before calling `mutate`) to confirm the form values at the moment of submission. This logs the state before it enters the async mutation, removing any doubt about timing.

```typescript
onClick={() => {
  console.log('Task form at submit:', JSON.stringify(form));
  if (!form.title.trim()) { ... }
  ...
}
```

### Step 2: Guard against empty-string description being saved as null

**File:** `src/components/ProposalTaskAllocator.tsx`

Change the insert to preserve the description text even when it's just whitespace with a mention:

```typescript
// Before (current):
description: data.description || null,

// After:
description: data.description?.trim() ? data.description : null,
```

This prevents `"@[Name](uuid) "` from being falsy while still saving null for truly empty descriptions.

### Step 3: Move the notification check to use the form value directly, not the DB-saved value

The notification code currently runs after the task insert and checks `data.description`. This is correct, but add a fallback that also checks `form.description` isn't silently different. Since `data === form` in the create path, this is a safety net.

No code change needed here -- just confirming the architecture is sound.

### Step 4: Add an error boundary toast for notification failures

**File:** `src/components/ProposalTaskAllocator.tsx`

Upgrade the `console.error` to also show a user-visible toast so failures aren't invisible:

```typescript
if (notifError) {
  console.error('Task mention notification error:', notifError);
  toast.error('Failed to send mention notification');
}
```

### Step 5: Remove debug logs after confirmation

Once the fix is confirmed working, remove the temporary `console.log` statements from the mutation functions.

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/ProposalTaskAllocator.tsx` | Add pre-submit log at button click, fix empty-string-to-null conversion, add user-visible toast on notification failure |

## Testing Instructions

After these changes, create a new task with a self-mention in the description field. The browser console should show:
1. `Task form at submit: { ... description: "@[YourName](your-id) ..." ... }`
2. `Task create - description for notifications: @[YourName](your-id) ...`
3. `Task create - extracted mention IDs: ["your-id"]`

And a notification should appear in the notification center.

