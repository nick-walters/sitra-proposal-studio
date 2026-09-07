# Card chevrons, widths & selected-value alignment

## Scope
- Change only `src/components/participant/ResearchersTable.tsx` and `src/components/participant/ContactPersonsSection.tsx`.
- Do not change shared controls, data logic, migrations, or protected proposal areas.

## Implementation
1. Add a feature-local plain-select trigger style that hides the shared chevron, removes its reserved gap, left-aligns the value, replaces line-clamp layout with a normal shrinking block, and truncates overflow.
2. Apply it to contact Title and Gender, and researcher Title, Gender, Career stage, Role, and Identifier type; keep Nationality unchanged.
3. Add full selected text through each trigger’s `title` attribute.
4. Apply the requested width deltas to saved and new cards. Give the researcher Reference identifier the remainder of row two so it fills the available width.

## Verification
- Run exactly `tsc --noEmit -p tsconfig.app.json` and the project-local Vite build.
- At a 1280px viewport, measure every field, page width/overflow, chevron visibility, and selected-value left offsets for Categories A–D.
- Check all other plain selects on both card types for the same overflow indentation.
- On live SUSIE-Q, change one researcher’s career stage and role, reload to confirm persistence, then restore both. Delete nothing.
