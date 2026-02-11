

# Unified Contact Persons Section + Copy to Researchers

## Overview

Replace the separate "Main contact person" and "Other contact persons" sections with a single unified section called **"Contact persons to be added to Funding & Tenders Portal"**, with streamlined access management and an MCP designation feature. Additionally, allow copying a contact person's details into the Researchers table to avoid data duplication.

## Changes

### 1. Unified contact list

- Remove the standalone `MainContactSection` from the participant detail page.
- Rename/rebuild the "Other contact persons" card into **"Contact persons to be added to Funding & Tenders Portal"**.
- All contacts live in the `participant_members` table. The main contact's extra detail fields (title, gender, position, department, address, phones) remain on the `participants` table, linked to whichever member is flagged as MCP.

### 2. Adding a contact person

The "Add Contact" form includes:
- First name (required)
- Last name (required)
- Email (required)
- Phone
- **"Should this person have access to the proposal on Sitra Proposal Studio?"** -- required Yes/No dropdown (defaults to No), stored as `wants_platform_access` on the member row.

### 3. Contact list view

Each contact row shows name, email, phone, and:

- **MCP flag**: A star icon to designate one contact as the Main Contact Person. Toggling it on removes the flag from the previous MCP. When flagged, additional fields expand inline (title, gender, position, department, address, phones).
- **Access button** (Owners and Coordinators only):
  - Shown only if the contact answered "Yes" to platform access.
  - Before access is granted: a "Give access" button that grants **editor** access directly (no role picker).
  - After access is granted: status indicator ("Invite sent" or "Has access") plus a revoke (trash) button.
  - Revoking removes the `user_roles` row for that proposal only.
- **Copy to Researchers button**: A small icon button (e.g. copy/clipboard icon) on each contact row. Clicking it copies the contact's overlapping fields into the Researchers table as a new entry. The fields that copy across are:
  - First name
  - Last name
  - Email
  - Role in project

  After copying, a brief toast confirms "Copied to researchers list". The researcher entry is independent -- editing one does not update the other.

### 4. MCP expanded details

When a contact is flagged as MCP, an expandable area appears with the fields currently in `MainContactSection`:
- Title, Gender, Position
- Department (with "Same as organisation" checkbox)
- Address (with "Same as organisation address" checkbox)
- Website, Phone 1, Phone 2

These sync to the `participants` table's `main_contact_*` columns.

### 5. Copy to Researchers feature

This is a one-time copy action, not a sync. Contact persons and researchers are independent lists that can overlap but are maintained separately.

- A contact who is also a researcher appears in both lists independently.
- The copy button pre-fills shared fields only; researcher-specific fields (career stage, nationality, gender, identifier type/value) can be filled in manually afterward.
- If a researcher with the same first+last name already exists, a confirmation prompt asks whether to add a duplicate or cancel.

## Technical Details

### Database migration

Add one column to `participant_members`:
```text
wants_platform_access boolean DEFAULT false
```

### Files to modify

**`src/types/proposal.ts`**
- Add `wantsPlatformAccess?: boolean` to `ParticipantMember` interface.
- Remove or deprecate `accessRequested`/`accessRequestedBy` fields (keep `accessGranted`, `accessGrantedRole` for the simplified flow).

**`src/components/ParticipantDetailForm.tsx`**
- Remove `MainContactSection` import and usage.
- Rebuild the contact persons card as the unified section.
- Add MCP flagging logic with expandable detail fields.
- Add access granting/revoking buttons (visible to owners/coordinators).
- Add "Copy to Researchers" button on each contact row that calls the existing `addResearcher` function with mapped fields.

**`src/components/participant/ContactAccessControl.tsx`**
- Simplify to a single "Give access" / "Revoke" button flow (no request/approve, no role picker).
- Show status badge once access is granted.

**`src/components/participant/MainContactSection.tsx`**
- Repurpose as an inline expandable form for MCP detail fields only (no card wrapper). Used inside the unified contact list when a member is flagged as MCP.

**`src/hooks/useParticipantDetails.ts`** (or equivalent)
- Verify field mapping for the new `wants_platform_access` column.

### Access granting logic

1. Look up the contact's email in `profiles`.
2. If found: insert `user_roles` row with `(user_id, proposal_id, role='editor')`.
3. If not found: call `invite-user` edge function, then insert role.
4. Update member row: `access_granted = true`, `access_granted_role = 'editor'`.

### Access revoking logic

1. Look up the user by email in `profiles`.
2. Delete the `user_roles` row for that `(user_id, proposal_id)`.
3. Update member row: `access_granted = false`, clear `access_granted_role`.

### Copy to Researchers mapping

| Contact Person field | Researcher field |
|---------------------|-----------------|
| firstName | firstName |
| lastName | lastName |
| email | email |
| roleInProject | roleInProject |

All other researcher fields (title, gender, nationality, career stage, identifiers) are left blank for the user to fill in.

