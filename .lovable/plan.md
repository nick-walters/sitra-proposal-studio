
# WP Description Tables: Editable Fields, Participant Bubbles, and Styling Fixes

## Overview

Rewrite `B31WPDescriptionTables.tsx` to make task leader, partners, and start/end months editable inline via dropdowns. Add participant bubbles for leader/partners display. Fix spacer rows to be non-editable, enforce white bold text on all header rows, and remove automatic bullet from task descriptions.

## Changes

### File: `src/components/B31WPDescriptionTables.tsx` (full rewrite)

**1. Spacer rows -- non-editable**
- Use `contentEditable={false}` and `user-select: none` on spacer row cells
- Spacer cells get `pointer-events: none` so they cannot be clicked into or typed in
- Structure: `<td colSpan={3} style={{ fontSize: '1pt', lineHeight: '1pt', height: '4px', padding: 0, userSelect: 'none' }} contentEditable={false}>&nbsp;</td>`

**2. Header rows -- always white bold text**
- Both WP header row and task header rows always use `color: '#FFFFFF'` (white) and `font-weight: bold`
- Remove the dynamic `getContrastingTextColor()` call -- always white regardless of WP color

**3. Participant bubbles for task leader and partners**
- Task leader: rendered as a colored rounded pill/bubble with format "X. SHORT_NAME" using the WP color
- Partners: rendered as a comma-separated list of similar bubbles
- Both are clickable to open dropdown selectors

**4. Editable fields via dropdowns**
- **Task leader**: Single-select dropdown (popover) listing all participants. Selecting one updates `wp_draft_tasks.lead_participant_id` via direct Supabase update
- **Partners**: Multi-select dropdown (reuse pattern from `ParticipantMultiSelect`) listing all participants. Selecting updates `wp_draft_task_participants` via delete-and-reinsert pattern (same as `useWPDrafts.setTaskParticipants`)
- **Start month / End month**: Number input dropdowns (select with M01-M60 options). Selecting updates `wp_draft_tasks.start_month` / `end_month`
- All edits save directly to the database and invalidate the `b31-wp-data` query key for reactivity

**5. Task description -- no automatic bullet**
- Remove any bullet prefix from task descriptions
- Render description HTML as-is using `dangerouslySetInnerHTML` (preserving formatting from WP drafts)

**6. Layout structure per WP table (matching screenshot)**
- 3-column layout (not 4): columns span the full width naturally
- Row sequence per WP:
  1. **WP Header**: full-width colored row, white bold text: "WPX: SHORT_NAME -- TITLE"
  2. **Spacer row** (non-editable, 4px height)
  3. **Objectives label row**: "Objectives" bold, full width
  4. **Objectives content row**: objectives HTML content, full width
  5. For each task:
     - **Spacer row** (non-editable)
     - **Task header row**: colored, white bold: "TX.N: TASK TITLE"
     - **Task metadata row**: 3 cells -- "Task leader: [bubble]" | "Partners: [bubbles]" | "MXX--MXX"
     - **Task description row**: full-width, description HTML content

**7. Remove methodology and deliverables**
- Filter condition changes: `populatedWPs` checks `wp.objectives || wp.tasks.length > 0` (no methodology check)
- No methodology row rendered
- No deliverables row rendered

### File: `src/components/B31SectionContent.tsx`

- Pass `proposalId` to `B31WPDescriptionTables` so it can perform mutations and invalidate queries

### File: `src/hooks/useB31SectionData.ts`

- No structural changes needed -- already fetches task participants and lead_participant_id

## Technical Details

### Inline editing approach

Each editable field uses a Popover component directly in the table cell. When clicked, a dropdown opens for selection. On selection, a direct Supabase mutation fires:

```typescript
// Task leader update
await supabase.from('wp_draft_tasks').update({ lead_participant_id: selectedId }).eq('id', taskId);

// Task participants update (delete + reinsert)
await supabase.from('wp_draft_task_participants').delete().eq('task_id', taskId);
await supabase.from('wp_draft_task_participants').insert(selectedIds.map(pid => ({ task_id: taskId, participant_id: pid })));

// Month update
await supabase.from('wp_draft_tasks').update({ start_month: value }).eq('id', taskId);
```

After each mutation, call `queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] })` to refresh.

### Participant bubble component (inline)

A small reusable render function within the component:

```typescript
const ParticipantBubble = ({ participant, color }: { participant: B31Participant; color: string }) => (
  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9pt] font-bold whitespace-nowrap"
    style={{ backgroundColor: color, color: '#FFFFFF' }}>
    {participant.participant_number}. {participant.organisation_short_name || participant.organisation_name}
  </span>
);
```

### Month selector

A simple Select component with options M01 through M60 (or whatever the proposal duration is). Falls back to 60 months max.

### Files to modify
- `src/components/B31WPDescriptionTables.tsx` -- full rewrite
- `src/components/B31SectionContent.tsx` -- pass proposalId prop

### No database changes required
All mutations use existing tables: `wp_draft_tasks`, `wp_draft_task_participants`.
