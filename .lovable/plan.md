

# Combined Plan: Clickable Global Role Badges + Contact Person Access Control

## Part A: Clickable Global Role Badges in User Rights Manager

### What changes

The global role badge (Admin/Owner) displayed below each user's name in the User Rights Manager becomes a clickable dropdown -- but only for Owners.

### Behavior by viewer role

| Viewer | See global roles? | Edit global roles? |
|--------|-------------------|-------------------|
| Owner | Yes, as clickable dropdown | Yes (except own role and other Owners) |
| Admin (with coordinator role) | Yes, as static badge | No |
| Others | No access to page | No access to page |

### File: `src/pages/admin/UserRightsAdmin.tsx`

1. **Replace lines 375-405** (the global role badges, trash buttons, and "+ Make Admin" button) with a role-aware UI:
   - When `isOwner` and the target user is not an Owner: render a `Select` dropdown below the name with options "None", "Admin", "Owner"
   - When the target is an Owner or the current user is viewing themselves: render a static read-only `Badge`
   - When the viewer is an Admin (not Owner): render a static `Badge`

2. **Add `handleChangeGlobalRole(targetUser, existingRoleId, newValue)` function** that handles all transitions:
   - "none" to "admin" or "owner": insert a new `user_roles` row with `proposal_id = null`
   - "admin" to "owner" or reverse: update the existing row
   - Any role to "none": delete the row
   - Refresh local user state after each operation

3. **Remove** the old `handleAddGlobalRole` function and inline trash buttons for global roles -- replaced by the unified dropdown.

---

## Part B: Contact Person Access Request and Invite

### What changes

Every contact person listed under a participant (in the "Other contact persons" section) gets access controls. Editors can request access on their behalf; coordinators/owners can directly invite them with a role assignment.

### Behavior by role

| Role | What they see | What they can do |
|------|--------------|-----------------|
| Editor | "Request access" button (UserPlus icon) | Flag a contact for platform access |
| Coordinator/Owner | Direct "Invite" button | Open role picker and send invitation immediately |
| All users | "Invited as [role]" badge | View invitation status (read-only) |

When an editor has flagged a contact, coordinators/owners see:
- "Access requested" badge
- "Invite" button to approve (sends invitation)
- Dismiss button to reject the request

### Files modified

**1. `src/types/proposal.ts`** -- Add access control fields to `ParticipantMember`:

```text
accessRequested?: boolean
accessRequestedBy?: string
accessGranted?: boolean
accessGrantedRole?: string
accessGrantedBy?: string
accessGrantedAt?: string
```

**2. `src/components/participant/ContactAccessControl.tsx`** -- Redesign the component:

- Replace `Flag` icon with `UserPlus` throughout
- For editors (`canFlag` but not `canGrant`): show "Request access" button; once requested, show "Access requested" badge with cancel option
- For coordinators/owners (`canGrant`): show direct "Invite" button that opens role-selection popover immediately (no flagging step needed); if an editor already flagged the contact, show both the "Access requested" badge and "Invite" button; add dismiss button to reject requests
- After invitation sent: show "Invited as [role]" badge (visible to all)

**3. `src/components/ParticipantDetailForm.tsx`** -- Wire `ContactAccessControl` into each member row (around lines 517-549):

- Add `ContactAccessControl` between the contact info and the delete button for each member
- Pass: `member.email`, `member.fullName`, `member.accessRequested`, `member.accessGranted`, `member.accessGrantedRole`
- Pass: `canFlag`, `canGrant`, `proposalId`, `proposalAcronym` from props
- `onFlagAccess` calls `onUpdateMember(member.id, { accessRequested: value })`
- `onAccessGranted` calls `onUpdateMember(member.id, { accessGranted: true, accessGrantedRole: role })`

**4. `src/hooks/useProposalData.ts`** -- Verify the member update function maps camelCase fields (`accessRequested`, `accessGranted`, `accessGrantedRole`) to their snake_case DB columns (`access_requested`, `access_granted`, `access_granted_role`).

### No database migration needed

The `participant_members` table already has all required columns: `access_requested`, `access_requested_by`, `access_granted`, `access_granted_role`, `access_granted_by`, `access_granted_at`.

---

## Implementation Order

1. Update `ParticipantMember` type in `src/types/proposal.ts`
2. Redesign `ContactAccessControl.tsx` (icons, direct invite path, reject capability)
3. Wire `ContactAccessControl` into member rows in `ParticipantDetailForm.tsx`
4. Verify field mapping in `useProposalData.ts`
5. Add `handleChangeGlobalRole` and clickable badge UI in `UserRightsAdmin.tsx`

