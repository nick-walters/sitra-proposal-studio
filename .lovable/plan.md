
# Plan: Fix A4 and A5 Parent Section Assignment

## Problem

A4 (Ethics & Security) and A5 (Other Questions) sections were inserted into the database without the `parent_section_id` field, causing them to render as top-level sections instead of nested under "Part A" like A1, A2, and A3.

## Solution

Run a database migration to set the correct `parent_section_id` for A4 and A5 sections.

## Database Migration

```sql
UPDATE template_sections 
SET parent_section_id = '00000000-0002-0000-0000-000000000002'
WHERE section_number IN ('A4', 'A5') 
AND template_type_id = '33333333-3333-3333-3333-333333333333';
```

## Expected Result

After the fix:

| Section | parent_section_id |
|---------|-------------------|
| Part A | `null` (root) |
| A1 | Part A |
| A2 | Part A |
| A3 | Part A |
| A4 | Part A |
| A5 | Part A |

This will render A4 and A5 at the same indentation level as A1-A3 in the left navigation panel.

## Technical Details

- Parent section ID: `00000000-0002-0000-0000-000000000002` (the "Part A: Administrative forms" section)
- Template type ID: `33333333-3333-3333-3333-333333333333` (Full RIA template)
- No code changes required - this is purely a database fix
