# Proposal Management Section

## Overview

Add a new **"Proposal management"** section at the top of the left navigation panel (before Part A) containing three tool pages: Messaging Board, Task Allocator, and Progress Tracker.

## Navigation Structure

The left sidebar will show:

```text
Proposal management  (bold heading, collapsible, not a page)
  ├── Message board
  ├── Tasks
  └── Progress
Part A
  ...
Part B
  ...
```

## 1. Messaging Board

### Database Tables

`**proposal_messages**`

- `id` (uuid, PK)
- `proposal_id` (uuid, FK to proposals)
- `parent_id` (uuid, nullable, FK to self for threading)
- `author_id` (uuid, references auth.users)
- `content` (text)
- `visibility` (text, default 'all' -- 'all' or 'private')
- `is_high_priority` (boolean, default false)
- `is_pinned` (boolean, default false)
- `created_at`, `updated_at` (timestamptz)

`**proposal_message_recipients**` (for private visibility tagging)

- `id` (uuid, PK)
- `message_id` (uuid, FK to proposal_messages)
- `user_id` (uuid, references auth.users)

### Features

- Thread-based messaging: top-level messages start threads, replies nest underneath
- Visibility toggle: default "All" or tag specific people to make it private
- Tagged users selected from all users with proposal access (via `user_roles`)
- High priority flag, pinning (coordinators/owners), edit/delete (author + coordinators)
- Reverse date order by last reply; pinned threads always on top
- Text search across messages
- Realtime updates via Supabase channel

### RLS

- Read: user has any role on the proposal AND (visibility = 'all' OR user is author OR user is in recipients)
- Write: user has any role on the proposal
- Update/Delete: user is author OR coordinator/owner on the proposal

## 2. Task Allocator

Built as a Monday.com-style project management timeline (no "Gantt" terminology in the UI).

### Database Tables

`**proposal_tasks**`

- `id` (uuid, PK)
- `proposal_id` (uuid, FK to proposals)
- `title` (text)
- `description` (text, nullable)
- `responsible_user_id` (uuid, references auth.users)
- `start_date` (date)
- `end_date` (date)
- `status` (text, default 'not_started' -- 'not_started', 'in_progress', 'completed', 'blocked')
- `order_index` (integer)
- `created_by` (uuid, references auth.users)
- `created_at`, `updated_at` (timestamptz)

`**proposal_task_assignees**` (multiple assignees per task)

- `id` (uuid, PK)
- `task_id` (uuid, FK to proposal_tasks)
- `user_id` (uuid, references auth.users)

### Features

- Timeline view with horizontal bars on a date axis (Monday.com-style)
- Task list on the left, timeline bars on the right
- Each task: title, responsible person (highlighted), additional assignees, start/end dates, status badge
- Clear due date display
- Status colour coding: Not Started (grey), In Progress (blue), Completed (green), Blocked (red)
- Only coordinators/owners can create/edit/delete tasks
- All proposal members can view

### RLS

- Read: user has any role on the proposal
- Write/Update/Delete: user is coordinator/owner on the proposal

## 3. Progress Tracker (Expanded)

### Database Table

`**proposal_progress**`

- `id` (uuid, PK)
- `proposal_id` (uuid, FK to proposals)
- `section_id` (text)
- `section_label` (text)
- `progress_percent` (integer, 0-100)
- `notes` (text, nullable)
- `updated_by` (uuid, references auth.users)
- `updated_at` (timestamptz)
- Unique constraint on (proposal_id, section_id)

### Features

- Moves the existing WP Progress Tracker here (removed from WP Drafts page)
- Adds section-level progress for all Part A and Part B sections
- Coordinators can manually set progress percentage via inline slider
- Optional notes per section
- Overall proposal progress as weighted average
- WP progress auto-calculated (existing logic preserved)

### RLS

- Read: user has any role on the proposal
- Write/Update: user is coordinator/owner on the proposal

## Technical Implementation

### Files to Create

- `src/components/ProposalMessagingBoard.tsx` -- messaging UI with threads, search, compose
- `src/components/ProposalTaskAllocator.tsx` -- Monday.com-style timeline view
- `src/components/ProposalProgressTracker.tsx` -- expanded progress tracker incorporating WP progress

### Files to Modify

- `src/hooks/useProposalSections.ts` -- insert "Proposal management" parent with 3 children before Part A
- `src/components/SectionNavigator.tsx` -- add icons (MessageSquare, ListTodo, BarChart3) and bold styling for the new heading; add it to collapsible heading logic
- `src/pages/ProposalEditor.tsx` -- add render cases for `messaging`, `task-allocator`, `progress-tracker`; remove `WPProgressTracker` from the `wp-drafts` block

### Database Migration

Single migration creating all 5 tables with RLS policies, enabling realtime on `proposal_messages`, and adding update triggers for `updated_at` columns.