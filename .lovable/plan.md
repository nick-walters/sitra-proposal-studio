

# Role System Overhaul, Duplicate Proposal, and Status Management

## 1. Global Roles

| Capability | Owner | Admin | Standard user |
|---|:---:|:---:|:---:|
| See all proposals on dashboard | ✅ | ❌ | ❌ |
| Create new proposals | ✅ | ✅ | ❌ |
| See "Create new proposal" button | ✅ | ✅ | ❌ |
| Automatically becomes Coordinator of proposals they create | ✅ | ✅ | ❌ |
| Access Backend page (user rights) | ✅ | Only if Coordinator of 1+ proposal | ❌ |
| Access Admin pages (Setup, Templates) | ✅ | ❌ | ❌ |
| Manage global roles (in Cloud Settings) | ✅ | ❌ | ❌ |
| Can assign roles to any proposal (in Backend) | ✅ | ❌ | ❌ |

A Standard user with no proposal assignments sees an empty dashboard.

## 2. Per-Proposal Roles

| Capability | Coordinator | Editor | Viewer |
|---|:---:|:---:|:---:|
| View proposal | ✅ | ✅ | ✅ |
| See assigned proposals on dashboard | ✅ | ✅ | ✅ |
| A1 - Edit General Information | ✅ | ❌ | ❌ |
| A2 - Add/edit/delete participants | ✅ | ✅ | ❌ |
| A2 - Reorder participants | ✅ | ❌ | ❌ |
| A3 - Edit budget items | ✅ | ✅ | ❌ |
| A4 - Edit Ethics and Security | ✅ | ✅ | ❌ |
| A5 - Edit Other Questions | ✅ | ✅ | ❌ |
| Part B - Edit text sections | ✅ | ✅ | ❌ |
| Figures - Add/edit/delete | ✅ | ✅ | ❌ |
| Work Packages - Edit content | ✅ | ✅ | ❌ |
| Work Packages - Add/delete WPs | ✅ | ❌ | ❌ |
| WP drafts - Populate B3.1 from WP drafts | ✅ | ❌ | ❌ |
| WP drafts - Copy staff effort to A3 | ✅ | ❌ | ❌ |
| B3.1 - Populate cost justifications from A3 | ✅ | ❌ | ❌ |
| Cases - Add/delete/edit | ✅ | ❌ | ❌ |
| WP Color Palette - Edit | ✅ | ❌ | ❌ |
| WP Themes - Manage | ✅ | ❌ | ❌ |
| Change proposal status | ✅ | ❌ | ❌ |
| Duplicate proposal | ✅ | ❌ | ❌ |
| Manage collaborators / invite users | ✅ | ❌ | ❌ |
| Delete proposal | ✅ | ❌ | ❌ |
| Indicate contact person should have platform access | ✅ | ✅ | ❌ |
| Grant platform access to contact person | ✅ | ❌ | ❌ |

Note: A global Owner has all Coordinator capabilities on every proposal automatically. A global Admin only gets these capabilities on proposals where they are assigned as Coordinator.

## 3. Participant Reorder Restriction

Currently `canReorder={canEdit}` allows Editors to reorder. This will change to `canReorder={isCoordinator}` so only Coordinators and Owners can reorder participants.

## 4. Contact Person Access Granting

A new feature on each participant organisation page:

- Next to the **main contact person** and each **other contact person**, a dropdown menu will appear allowing any Editor, Coordinator, or Owner to indicate that the person should be granted platform access (a "flag for access" toggle).
- This allows someone from that organisation to fill in their colleagues' details and flag that a colleague needs access, without being able to grant it themselves.
- **Coordinators and Owners only** can click a "Grant Access" button next to a flagged contact person. This opens a prompt asking which role to assign: Coordinator, Editor, or Viewer.
- Granting access will invoke the existing `invite-user` edge function to send an invitation and create a `user_roles` entry for that proposal.
- Once access has been granted, all users with access to the proposal can see that the contact person has been invited and which role they were assigned (shown as a small badge, e.g. "Invited as Editor").

### Database changes for this feature

- Add columns to `participant_members` table:
  - `access_requested` (boolean, default false) -- flagged by editor/coordinator/owner
  - `access_requested_by` (uuid, nullable) -- who flagged it
  - `access_granted` (boolean, default false) -- set when invitation sent
  - `access_granted_role` (text, nullable) -- coordinator/editor/viewer
  - `access_granted_by` (uuid, nullable) -- who granted it
  - `access_granted_at` (timestamptz, nullable)
- Similarly for the main contact person, add equivalent columns to the `participants` table (since main contact data lives there):
  - `main_contact_access_requested`, `main_contact_access_granted`, `main_contact_access_granted_role`, etc.

### UI changes

- In `ParticipantDetailForm.tsx`: add a dropdown/button next to each contact person row and the main contact section
- In `MainContactSection.tsx`: add the access request/grant UI
- New component `ContactAccessControl.tsx`: shared UI for the flag/grant workflow

## 5. Backend Page Redesign

The Backend link in the Header will be visible to:
- Owners: always
- Admins: only if they are Coordinator of at least one proposal
- Everyone else: hidden

**What the Backend page shows**:

- No global role column -- global Owner/Admin roles are managed in Cloud Settings only
- Table columns: User | Email | Proposal Roles | Actions
- **Proposal Roles column**: Each user's proposal roles displayed as a mini-table with rows containing:
  - Column 1: Dropdown for proposal acronym
  - Column 2: Dropdown for role (Coordinator, Editor, Viewer)
  - A delete button per row
- **Adding a role**: An Owner sees all proposals in the dropdown. A Coordinator sees only proposals they coordinate.
- **Removing a role**: Owners can remove any role. Coordinators can only remove roles on proposals they coordinate.

## 6. Dashboard -- "Create New Proposal" Button

Currently gated behind `isSitraStaff` (email domain check). This will change to check for `owner` or `admin` global role -- only Owners and Admins see the button. The `isSitraStaff` check will be removed.

## 7. Status Change and Auto-Downgrade

- Status dropdown (Coordinator/Owner only): Draft / Under Evaluation / Funded / Not Funded
- Auto-downgrade trigger: when status becomes "submitted", all `editor` roles on that proposal become `viewer`
- Confirmation dialog warns about the downgrade before submission

## 8. Duplicate Proposal

- Button placed to the left of the delete proposal button
- Only Owners and Coordinators can duplicate
- Copies all data except Editor and Viewer access
- Only Coordinators from the original get access to the duplicate
- New proposal created as Draft
- **Acronym naming**: the duplicate will have the acronym format `OriginalAcronym (copy 1)`. If copies already exist, the number increments (e.g. `GreenTech (copy 1)`, `GreenTech (copy 2)`). The edge function will query for existing proposals matching the pattern to determine the next copy number.
- The dialog will pre-populate the acronym with the next available copy name instead of appending "-v2"

## Technical Implementation

### Phase 1: Database Migration

**1a. Add `coordinator` to enum:**
```sql
ALTER TYPE app_role ADD VALUE 'coordinator';
```

**1b. Migrate existing roles:**
```sql
-- Proposal-level admins become coordinators
UPDATE user_roles SET role = 'coordinator' WHERE role = 'admin' AND proposal_id IS NOT NULL;
-- Global admins stay as admin
-- Global owners stay as owner
```

**1c. Update security-definer functions** to recognise `coordinator`:
- `can_edit_proposal`: add `coordinator` to proposal-level check
- `is_proposal_admin`: add `coordinator` to proposal-level check
- `has_any_proposal_role`: add `coordinator`
- `create_proposal_with_role`: assign `coordinator` instead of `admin`

**1d. Auto-downgrade trigger:**
```sql
CREATE FUNCTION downgrade_editors_on_submit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status != 'submitted' THEN
    UPDATE user_roles SET role = 'viewer'
    WHERE proposal_id = NEW.id AND role = 'editor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER on_proposal_submit
BEFORE UPDATE ON proposals
FOR EACH ROW EXECUTE FUNCTION downgrade_editors_on_submit();
```

**1e. RLS policy for Coordinators managing roles:**
```sql
CREATE POLICY "Proposal coordinators can manage proposal roles"
ON user_roles FOR ALL TO authenticated
USING (proposal_id IS NOT NULL AND is_proposal_admin(auth.uid(), proposal_id))
WITH CHECK (proposal_id IS NOT NULL AND is_proposal_admin(auth.uid(), proposal_id));
```

**1f. Add contact access columns:**
```sql
ALTER TABLE participant_members ADD COLUMN access_requested boolean DEFAULT false;
ALTER TABLE participant_members ADD COLUMN access_requested_by uuid REFERENCES auth.users(id);
ALTER TABLE participant_members ADD COLUMN access_granted boolean DEFAULT false;
ALTER TABLE participant_members ADD COLUMN access_granted_role text;
ALTER TABLE participant_members ADD COLUMN access_granted_by uuid REFERENCES auth.users(id);
ALTER TABLE participant_members ADD COLUMN access_granted_at timestamptz;

ALTER TABLE participants ADD COLUMN main_contact_access_requested boolean DEFAULT false;
ALTER TABLE participants ADD COLUMN main_contact_access_requested_by uuid REFERENCES auth.users(id);
ALTER TABLE participants ADD COLUMN main_contact_access_granted boolean DEFAULT false;
ALTER TABLE participants ADD COLUMN main_contact_access_granted_role text;
ALTER TABLE participants ADD COLUMN main_contact_access_granted_by uuid REFERENCES auth.users(id);
ALTER TABLE participants ADD COLUMN main_contact_access_granted_at timestamptz;
```

### Phase 2: TypeScript Types

| File | Change |
|---|---|
| `src/types/templates.ts` | `AppRole = 'owner' \| 'admin' \| 'coordinator' \| 'editor' \| 'viewer'`. Update labels and helpers. |
| `src/types/proposal.ts` | Update `UserRole` to include `coordinator` |

### Phase 3: Hook Updates

| File | Change |
|---|---|
| `src/hooks/useProposalData.ts` | Add `coordinator` to `rolePriority`. Rename `isAdmin` to `isCoordinator`: true when role is `owner`, `admin`, or `coordinator`. |
| `src/hooks/useUserRole.ts` | Expose `isOwner`, `isGlobalAdmin`, `isAdminOrOwner`, and `hasAnyCoordinatorRole`. |

### Phase 4: Frontend Updates (~15 files)

| File | Change |
|---|---|
| `src/pages/ProposalEditor.tsx` | Rename `isAdmin` to `isCoordinator`. Change participant reorder to `canReorder={isCoordinator && canEdit}`. |
| `src/components/GeneralInfoForm.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/BudgetSpreadsheetEnhanced.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/WPManagementCard.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/CaseManagementCard.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/ProposalSchedule.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/ProposalSummaryPage.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/SectionNavigator.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/WPDependencySelector.tsx` | Rename `isAdmin` to `isCoordinator` |
| `src/components/ProposalCollaboratorsPanel.tsx` | Replace `admin` with `coordinator` in labels |
| `src/components/InviteToProposalDialog.tsx` | Replace `admin` with `coordinator` |
| `src/components/Header.tsx` | Update Backend visibility logic |
| `src/pages/Dashboard.tsx` | Replace `isSitraStaff` with `isOwner \|\| isGlobalAdmin` for "Create new proposal" button |

### Phase 5: Contact Access Control UI

| File | Change |
|---|---|
| New: `src/components/participant/ContactAccessControl.tsx` | Shared component: shows "Request access" toggle (editor+), "Grant access" button with role picker (coordinator+), and "Invited as [role]" badge (all users) |
| `src/components/ParticipantDetailForm.tsx` | Add `ContactAccessControl` next to each contact person in the "Other contact persons" list |
| `src/components/participant/MainContactSection.tsx` | Add `ContactAccessControl` for the main contact person |

### Phase 6: UserRightsAdmin Redesign

Complete redesign of `src/pages/admin/UserRightsAdmin.tsx`: remove Global Roles column, replace badge-based proposal roles with editable mini-table rows (proposal dropdown + role dropdown). Gate access to owners + users with at least one coordinator role.

### Phase 7: Duplicate Proposal Edge Function

| File | Change |
|---|---|
| `supabase/functions/duplicate-proposal/index.ts` | Query for existing copies matching `OriginalAcronym (copy N)` to determine next number. Default acronym to `Acronym (copy N)`. Copy only `coordinator` and `owner` roles from original (not `editor`/`viewer`). Assign duplicating user as `coordinator`. |
| `src/components/DuplicateProposalDialog.tsx` | Pre-populate acronym with `Acronym (copy N)` pattern. Update the "what will be copied" list to mention that only coordinators retain access. |

### Phase 8: Status Change UI

Add status dropdown in proposal top bar (Coordinator/Owner only). Confirmation dialog on submission warning about editor downgrade.

### Sequencing

1. Database migration (enum, function updates, trigger, RLS, new columns)
2. Type updates
3. Hook updates
4. Frontend renaming (all component files)
5. Contact access control UI
6. UserRightsAdmin redesign
7. Dashboard "Create new proposal" gating
8. Duplicate proposal edge function
9. Status change UI

