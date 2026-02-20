

# Codebase Cleanup Plan

## 1. Delete Unused Files

The following files are not imported or rendered anywhere in the project:

**Components:**
- `src/components/TeamMemberCard.tsx` -- never imported
- `src/components/NavLink.tsx` -- never imported
- `src/components/FootnoteTextarea.tsx` -- never imported
- `src/components/EffortToBudgetSummary.tsx` -- never imported

**Hooks:**
- `src/hooks/useRealtimePresence.ts` -- never imported (superseded by `useCollaborativeCursors` / block locking)
- `src/hooks/useTemplateSystem.ts` -- never imported (template logic lives in `useTemplates` and `useProposalTemplateCreation`)
- `src/hooks/useEffortToBudget.ts` -- only consumer was `EffortToBudgetSummary` (also being deleted)

## 2. Refactor ParticipantTable Into a Constants-Only Module

`src/components/ParticipantTable.tsx` is a 660-line component that is **never rendered**. However, two exported constants (`ORGANISATION_CATEGORY_LABELS` and `OrganisationCategory` type) are imported by `AddParticipantDialog` and `ParticipantDetailForm`.

**Action:** Move `ORGANISATION_CATEGORY_LABELS` and `OrganisationCategory` into `src/types/proposal.ts` (where other participant types already live), update the two import sites, then delete `ParticipantTable.tsx`.

## 3. Summary of Files Affected

| Action | File |
|--------|------|
| Delete | `src/components/TeamMemberCard.tsx` |
| Delete | `src/components/NavLink.tsx` |
| Delete | `src/components/FootnoteTextarea.tsx` |
| Delete | `src/components/EffortToBudgetSummary.tsx` |
| Delete | `src/hooks/useRealtimePresence.ts` |
| Delete | `src/hooks/useTemplateSystem.ts` |
| Delete | `src/hooks/useEffortToBudget.ts` |
| Delete | `src/components/ParticipantTable.tsx` |
| Edit | `src/types/proposal.ts` -- add `OrganisationCategory` and `ORGANISATION_CATEGORY_LABELS` |
| Edit | `src/components/AddParticipantDialog.tsx` -- update import path |
| Edit | `src/components/ParticipantDetailForm.tsx` -- update import path |

**Total: 8 files deleted, 3 files edited.**

No functional behavior changes -- this is purely removing dead code and relocating shared constants.

