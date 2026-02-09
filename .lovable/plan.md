

## Fix: Full Proposal Template Sections Sometimes Missing (B2.2, B3.1, B3.2)

### Problem Analysis

After thorough investigation, the root cause is a **race condition** combined with an **incomplete fallback**, not a database issue. The database templates are correctly configured as two distinct templates:

- **Stage 1** (`22222222...`): Part A (A1-A3) + Part B (B1.1, B1.2, B2.1) -- 10 sections
- **Full Proposal** (`33333333...`): Part A (A1-A5) + Part B (B1.1, B1.2, B2.1, B2.2, B3.1, B3.2) -- 16 sections

The problem lies in how sections are loaded on the frontend:

1. `ProposalEditor` calls `useProposalSections(proposal?.templateTypeId, id)`
2. On initial load, `proposal` is `null`, so `templateTypeId` is `null`
3. When `templateTypeId` is `null`, the hook immediately returns the hardcoded `HORIZON_EUROPE_SECTIONS` fallback -- which only contains B1.1, B1.2, and B2.1 (the Stage 1 structure)
4. When `proposal` finishes loading and `templateTypeId` becomes available, a second async fetch starts for the real DB template sections
5. During this window, the navigation panel shows the incomplete fallback, and if the user interacts or `activeSection` is set during this period, sections like B2.2, B3.1, B3.2 appear missing

The "sometimes loads slower" behavior is explained by this two-phase loading: Phase 1 (instant fallback) shows Stage 1 sections, then Phase 2 (async DB fetch) replaces them with the full template. If the DB query is slow or the component re-renders, users see the gap.

### Solution

The fix has two parts:

**Part 1: Eliminate the race condition in `useProposalSections`**

Instead of showing fallback sections when `templateTypeId` is `null`, keep `loading = true` until the proposal data is available. Only fall back to hardcoded sections if the template fetch completes but returns zero sections (genuine fallback for legacy proposals without a `template_type_id`).

Changes to `src/hooks/useProposalSections.ts`:
- Add a new parameter or detect when `templateTypeId` is `null` but `proposalId` is present (meaning proposal is still loading) -- keep `loading = true` and return empty sections instead of fallback
- Only use `HORIZON_EUROPE_SECTIONS` fallback when `templateTypeId` is explicitly absent (proposal loaded but has no `template_type_id`, like the "AquaSense" legacy proposal)

**Part 2: Prevent navigation panel from rendering stale sections**

In `ProposalEditor.tsx`:
- While `sectionsLoading` is `true`, show a loading skeleton in the navigation panel instead of rendering potentially stale/fallback sections
- Defer setting `activeSection` until sections have fully loaded from the DB

### Technical Details

**File: `src/hooks/useProposalSections.ts`**

- Modify the hook signature to accept a `proposalLoading` flag or infer it from the combination of `proposalId` being present but `templateTypeId` being `null`:

```typescript
export function useProposalSections(
  templateTypeId: string | null, 
  proposalId?: string | null,
  proposalLoaded?: boolean  // new param
)
```

- When `proposalId` is present but `proposalLoaded` is `false` (or `templateTypeId` is still `null` while proposal hasn't loaded):
  - Keep `loading = true`
  - Return empty sections (don't fall back to hardcoded)
  
- When `proposalLoaded = true` and `templateTypeId` is `null`:
  - This is a legacy proposal -- use hardcoded fallback as today

- When `templateTypeId` is present:
  - Fetch from DB as today

**File: `src/pages/ProposalEditor.tsx`**

- Pass the proposal loading state to `useProposalSections`:

```typescript
const { sections: allSections, loading: sectionsLoading } = useProposalSections(
  proposal?.templateTypeId || null, 
  id,
  !loading  // proposalLoaded = proposal fetch is complete
);
```

- Guard the navigation panel and content area with `sectionsLoading` to prevent rendering incomplete section lists

**File: `src/types/proposal.ts`**

- No changes needed to the hardcoded `HORIZON_EUROPE_SECTIONS` -- it remains as a legacy fallback for proposals created before the template system existed

### Why This Works

- Full proposals will never flash the Stage 1 structure because the hook stays in "loading" state until the real template is fetched
- Legacy proposals (like AquaSense with `template_type_id = null`) still get the hardcoded fallback
- The navigation panel only renders once it has the correct, complete section list
- No database changes are needed -- the templates are already correctly separated

