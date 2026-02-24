

# Fix: Task Self-Tag Notifications Not Working

## Root Cause

After investigating the database, the only task record has a `null` description -- meaning the @mention text entered via the `MentionTextarea` is either not being saved, or the notification insert is failing silently with no error logging.

The code structure is identical to comments and messages (which work), so the likely issue is a subtle bug in how the form state flows. Additionally, unlike comments/messages, the task notification insert has **no error logging**, making failures invisible.

## Plan

### 1. Add error logging to task notification inserts

Both `createTask` and `updateTask` mutations fire `supabase.from('notifications').insert(...)` without checking the result. Add `{ error }` destructuring and `console.error` logging (matching the pattern used in `CommentsSidebar.tsx`).

**File:** `src/components/ProposalTaskAllocator.tsx`
- Wrap both notification inserts (create ~line 172, update ~line 221) with error checking:
  ```typescript
  const { error: notifError } = await supabase.from('notifications').insert(...);
  if (notifError) console.error('Task mention notification error:', notifError);
  ```

### 2. Add a debug log to confirm the description value at mutation time

Add a temporary `console.log` to verify the `data.description` value and extracted mention IDs are non-empty when the mutation fires. This will confirm whether the MentionTextarea value is reaching the mutation correctly.

**File:** `src/components/ProposalTaskAllocator.tsx`
- Before the `if (data.description)` check in both mutations, log:
  ```typescript
  console.log('Task description for notifications:', data.description);
  ```

### 3. Ensure form description state is correctly wired

Verify that the `MentionTextarea` `onChange` handler correctly updates `form.description` with the raw `@[Name](id)` format. The current code looks correct:
```tsx
<MentionTextarea
  value={form.description}
  onChange={v => setForm(f => ({ ...f, description: v }))}
  ...
/>
```
No change needed here unless debug logs reveal an issue.

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/ProposalTaskAllocator.tsx` | Add error logging to notification inserts + debug logging for description value |

This is a diagnostic-first approach. Once we confirm the description value is reaching the mutation correctly, we can identify and fix the exact failure point. If the description is empty at mutation time, it points to a MentionTextarea state issue. If the description has mentions but the insert fails, the error log will reveal why.

