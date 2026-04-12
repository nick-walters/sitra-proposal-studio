

# Plan: Dynamic Case Study Tables and Default "Ongoing Projects" Table in B1.2

## Overview

When section B1.2 is rendered in the DocumentEditor, append two React component blocks **below** the TipTap editor content (following the B3.1 pattern). These are read-only, auto-synced from the database, and rendered as styled HTML tables matching HE formatting conventions.

## Architecture

Follow the existing B3.1 pattern: a new `B12SectionContent` component rendered conditionally in `DocumentEditor.tsx` after the `EditorContent`, just like `B31SectionContent` is rendered for B3.1.

```text
DocumentEditor
  └─ EditorContent (user's free text for B1.2)
  └─ B12SectionContent (new, rendered only for B1.2)
       ├─ B12CaseStudyTables (dynamic, from case_drafts)
       └─ B12OngoingProjectsTable (static structure, editable cells)
```

## Component 1: Case Study Tables (`B12CaseStudyTables`)

**Condition**: Only rendered when the proposal has case drafts.

**Data source**: Fetched via `useQuery` from `case_drafts` (+ `participants` for leader bubble). Subscribes to realtime changes via the existing `case-drafts` channel.

**Layout**:
- Single caption at top: `EditableCaption` with label `"Table 1.2.x."` and default caption `"{Case type plural}"` (e.g. "Case studies", "Living Labs") — derived from the proposal's case type.
- One HTML table per case, separated by an empty body-text row (`<p>&nbsp;</p>`).
- Each table:
  - **Header row**: Left-aligned "`{short_name} – {title}`", right-aligned participant bubble for the case leader (matching the existing bubble styling from B3.1 WP description tables).
  - **5 body rows**, one per subsection: each cell contains a **bold italic** inline heading (e.g. "Background context") followed by the content from the corresponding `case_drafts` field (`background_context`, `key_stakeholders`, `proposed_solutions`, `expected_outcomes`, `replicability`). The heading text comes from the case draft's `heading_*` fields (falling back to defaults). No guideline/instruction text is included.
- Tables reorder according to `order_index` from the case manager.
- Hidden cases (`is_hidden = true`) are excluded.
- Read-only — content auto-syncs from case manager data.

**Styling**: 11pt Times New Roman, 1.0 line spacing, max-width 18cm, `table-layout: fixed`, bold black header row with 1.5px bottom border (matching B3.1 style).

## Component 2: Ongoing Projects Table (`B12OngoingProjectsTable`)

**Position**: Always rendered **below** the case study tables (or directly after the editor if no cases exist).

**Layout**:
- `EditableCaption` with auto-numbered label (e.g. `"Table 1.2.y."`) and default caption `"Ongoing & recently completed projects & initiatives with which the project will collaborate"`.
- A table with a header row containing columns: **Project acronym/name**, **Funding programme**, **Period**, **Coordinator**, **Relation to this project**.
- 8 empty body rows by default.

**Data storage**: New DB table `b12_ongoing_projects` with columns: `id`, `proposal_id`, `acronym_name`, `funding_programme`, `period`, `coordinator`, `relation`, `order_index`. Rows are editable inline (like B3.1 deliverables/milestones).

**Behavior**: Users can add/delete rows. Inline editing with debounced saves. Drag-and-drop reordering.

## Component 3: Ensure Leading Paragraph

In the `useSectionContent` hook or in the `B12SectionContent` component, if the editor content for B1.2 is empty or starts with a table, prepend an empty `<p></p>` paragraph. This ensures no table ever appears as the first element in the section.

## Database Migration

Create one new table:

```sql
CREATE TABLE public.b12_ongoing_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE NOT NULL,
  acronym_name text DEFAULT '',
  funding_programme text DEFAULT '',
  period text DEFAULT '',
  coordinator text DEFAULT '',
  relation text DEFAULT '',
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.b12_ongoing_projects ENABLE ROW LEVEL SECURITY;

-- RLS: users with any proposal role can read/write
CREATE POLICY "Users with proposal role can select"
  ON public.b12_ongoing_projects FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users who can edit can insert"
  ON public.b12_ongoing_projects FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users who can edit can update"
  ON public.b12_ongoing_projects FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users who can edit can delete"
  ON public.b12_ongoing_projects FOR DELETE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- Initialize 8 empty rows when a proposal is created
-- (handled in the component on first load, not via trigger, to avoid complexity)
```

Also enable realtime for this table:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.b12_ongoing_projects;
```

## Files to Create/Edit

1. **Create** `src/components/B12SectionContent.tsx` — wrapper that renders case tables + ongoing projects table
2. **Create** `src/components/B12CaseStudyTables.tsx` — dynamic case study tables from `case_drafts`
3. **Create** `src/components/B12OngoingProjectsTable.tsx` — editable ongoing projects table with inline editing, add/delete rows, drag-and-drop
4. **Edit** `src/components/DocumentEditor.tsx` — add conditional rendering of `B12SectionContent` for B1.2 sections (same pattern as B3.1)
5. **DB migration** — create `b12_ongoing_projects` table

## Caption Numbering

The case study tables caption uses the next available letter in the 1.2 sequence (e.g., if user has tables a, b in the editor, case tables get "Table 1.2.c."). The ongoing projects table gets the next letter after that. The `EditableCaption` component handles this via its `label` prop — the parent component computes the correct letter by counting existing captions in the editor content.

For simplicity in the initial implementation, use fixed letters: case tables = "Table 1.2.x." and ongoing projects = the next letter. These can be refined later with the auto-numbering system.

## Realtime Sync

- Case tables: subscribe to `case_drafts` changes for the proposal (reuse existing channel pattern).
- Ongoing projects: subscribe to `b12_ongoing_projects` changes.
- Both invalidate their respective react-query caches on changes.

