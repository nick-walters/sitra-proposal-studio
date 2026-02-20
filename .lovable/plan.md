

# A3 Budget Restructure: Per-Participant Pages + Overview

## Summary

Restructure A3 so that each participant gets their own budget page (like A2), accessible via participant bubbles in the left panel. The A3 overview page becomes a summary dashboard with lock controls. Both A2 and A3 participant bubbles render in italic text.

---

## Changes

### 1. Left Panel Navigation (SectionNavigator.tsx)

- Inject participant subsections under A3 (same pattern as A2), creating `a3-{participantId}` sections
- Both A2 and A3 participant bubble text gets `italic` styling added to the button class
- A3 subsections use the same multi-column grid layout as A2

### 2. A3 Overview Page (BudgetPortalSheet.tsx -- refactored)

Restore the A3 landing page to a summary/overview format:
- **Summary cards** at the top: Total Request, Total Eligible Costs, Indirect Costs, Requested EU Contribution (using `grandTotals` from `useBudgetRows`)
- **Summary table**: One row per participant showing key totals (personnel, subcontracting, travel, equipment, other goods, internally invoiced, indirect, total eligible, EU contribution) -- read-only
- **Lock controls**: Coordinators/admins/owners see a lock toggle per participant row
- **No inline editing** on this page -- editing happens on individual participant pages

### 3. New: Per-Participant Budget Form (new component: `BudgetParticipantForm.tsx`)

A user-friendly vertical form (not a wide spreadsheet) for a single participant's budget:
- **Header**: Participant name, number, country, role
- **Cost entry section**: Card-based layout with labeled fields for each cost category (Personnel, Subcontracting, Travel, Equipment, Other goods, Internally invoiced) using `FormattedNumberInput`
- **Justification buttons**: Inline with subcontracting, equipment, other goods, and internally invoiced fields -- opens `BudgetJustificationDialog`
- **Calculated section**: Read-only display of indirect costs, total eligible costs, funding rate, max EU contribution, requested EU contribution
- **Financial section**: Editable fields for income generated, financial contributions, own resources
- **Total estimated income**: Read-only calculated value
- **Locked state**: If the row is locked and user is not admin, all fields are disabled with a lock banner (similar to section locking pattern)

### 4. ProposalEditor.tsx Routing

- `a3` section ID renders the overview (`BudgetPortalSheet` refactored as overview)
- `a3-{participantId}` section IDs render `BudgetParticipantForm` for that participant
- Clicking a participant bubble in the A3 nav goes to their budget form

### 5. Data Flow

No database changes needed -- the existing `budget_rows` and `budget_cost_justifications` tables support this. The `useBudgetRows` hook is shared between the overview and per-participant views.

---

## Technical Details

### SectionNavigator.tsx changes

In the `SectionNavigator` component's `sectionsWithParticipants` memo, add a second injection block for A3:

```typescript
if (sub.id === 'a3' && visibleParticipants.length > 0) {
  return {
    ...sub,
    subsections: visibleParticipants.map(p => ({
      id: `a3-${p.id}`,
      number: `${p.participantNumber}`,
      title: p.organisationShortName || p.organisationName || 'Participant',
      isPartA: true,
    })),
  };
}
```

For italic styling, add `italic` to the button className for participant bubbles (where `!isWP && !isCase`) in lines ~514-531.

### BudgetPortalSheet.tsx refactored as overview

- Remove inline editing (FormattedNumberInput cells)
- Show read-only formatted numbers per participant row
- Add summary cards at top using the existing `grandTotals`
- Add lock toggle column for admins
- Each participant name is clickable, navigating to `a3-{participantId}`

### New BudgetParticipantForm.tsx

A vertical card-based form:

```text
+------------------------------------------+
| P1: Sitra (Coordinator)          [Locked] |
| Country: Finland                          |
+------------------------------------------+
| Cost Categories                           |
| Personnel costs          [___________] EUR|
| Subcontracting costs     [___________] [J]|
| Travel & subsistence     [___________] EUR|
| Equipment                [___________] [J]|
| Other goods & services   [___________] [J]|
| Internally invoiced      [___________] [J]|
+------------------------------------------+
| Calculated Values                         |
| Direct costs:              12,000 EUR     |
| Indirect costs (25%):       3,000 EUR     |
| Total eligible costs:      15,000 EUR     |
| Funding rate:                  100%       |
| Max EU contribution:      15,000 EUR     |
| Requested EU contribution: 15,000 EUR    |
+------------------------------------------+
| Financial Information                     |
| Income generated         [___________] EUR|
| Financial contributions  [___________] EUR|
| Own resources            [___________] EUR|
| Total estimated income:    15,000 EUR     |
+------------------------------------------+
```

[J] = justification button opening BudgetJustificationDialog

### ProposalEditor.tsx routing additions

Add handler for `a3-{participantId}` sections (similar to `a2-{participantId}` pattern at line 647):

```typescript
if (activeSection.id.startsWith('a3-')) {
  const participantId = activeSection.id.replace('a3-', '');
  return <BudgetParticipantForm 
    proposalId={id} 
    participantId={participantId}
    proposalType={proposal?.type}
    canEdit={canEdit}
    isCoordinator={isCoordinator}
  />;
}
```

---

## Files affected

| Action | File |
|--------|------|
| Edit | `src/components/SectionNavigator.tsx` -- inject A3 participant subsections + italic styling |
| Edit | `src/components/BudgetPortalSheet.tsx` -- refactor to overview/summary format |
| Create | `src/components/BudgetParticipantForm.tsx` -- per-participant budget form |
| Edit | `src/pages/ProposalEditor.tsx` -- add routing for `a3-{participantId}` |

