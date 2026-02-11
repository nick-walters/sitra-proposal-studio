import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User } from 'lucide-react';
import { Participant } from '@/types/proposal';
import { CONTACT_TITLES, GENDER_OPTIONS } from '@/types/participantDetails';
import { CountrySelect } from '@/components/CountrySelect';
import { ContactAccessControl } from './ContactAccessControl';

interface MainContactSectionProps {
  participant: Participant;
  onUpdate: (field: string, value: unknown) => void;
  canEdit: boolean;
  /** Can the current user flag contacts for access (editor+) */
  canFlag?: boolean;
  /** Can the current user grant access (coordinator/owner) */
  canGrant?: boolean;
  /** Proposal ID for access granting */
  proposalId?: string;
  /** Proposal acronym for invitations */
  proposalAcronym?: string;
}

interface MainContactFields {
  mainContactTitle?: string | null;
  mainContactFirstName?: string | null;
  mainContactLastName?: string | null;
  mainContactGender?: string | null;
  mainContactPosition?: string | null;
  contactEmail?: string | null;
  mainContactPhone?: string | null;
  mainContactPhone2?: string | null;
  mainContactDepartment?: string | null;
  mainContactDeptSameAsOrg?: boolean | null;
  mainContactStreet?: string | null;
  mainContactTown?: string | null;
  mainContactPostcode?: string | null;
  mainContactCountry?: string | null;
  mainContactWebsite?: string | null;
  useOrganisationAddress?: boolean | null;
  // Organisation-level fields for reference
  street?: string | null;
  town?: string | null;
  postcode?: string | null;
  country?: string | null;
  website?: string | null;
  // Access control fields
  mainContactAccessRequested?: boolean | null;
  mainContactAccessGranted?: boolean | null;
  mainContactAccessGrantedRole?: string | null;
}

export function MainContactSection({
  participant,
  onUpdate,
  canEdit,
  canFlag = false,
  canGrant = false,
  proposalId,
  proposalAcronym,
}: MainContactSectionProps) {
  const fields = participant as unknown as MainContactFields;
  const useOrgAddress = fields.useOrganisationAddress ?? true;
  const deptSameAsOrg = fields.mainContactDeptSameAsOrg ?? true;
  const contactName = [fields.mainContactFirstName, fields.mainContactLastName].filter(Boolean).join(' ');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Main contact person
            </CardTitle>
            <CardDescription>
              Primary contact for this organisation in the consortium
            </CardDescription>
          </div>
          {proposalId && proposalAcronym && (
            <ContactAccessControl
              email={fields.contactEmail}
              name={contactName || null}
              accessRequested={fields.mainContactAccessRequested || false}
              accessGranted={fields.mainContactAccessGranted || false}
              accessGrantedRole={fields.mainContactAccessGrantedRole}
              canFlag={canFlag}
              canGrant={canGrant}
              proposalId={proposalId}
              proposalAcronym={proposalAcronym}
              onFlagAccess={(requested) => onUpdate('mainContactAccessRequested', requested)}
              onAccessGranted={(role) => {
                onUpdate('mainContactAccessGranted', true);
                onUpdate('mainContactAccessGrantedRole', role);
              }}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Select
              value={fields.mainContactTitle || ''}
              onValueChange={(v) => onUpdate('mainContactTitle', v)}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TITLES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>First name</Label>
            <DebouncedInput
              value={fields.mainContactFirstName || ''}
              onDebouncedChange={(v) => onUpdate('mainContactFirstName', v)}
              placeholder="First name"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <DebouncedInput
              value={fields.mainContactLastName || ''}
              onDebouncedChange={(v) => onUpdate('mainContactLastName', v)}
              placeholder="Last name"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={fields.mainContactGender || ''}
              onValueChange={(v) => onUpdate('mainContactGender', v)}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Position & Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Position in organisation</Label>
            <DebouncedInput
              value={fields.mainContactPosition || ''}
              onDebouncedChange={(v) => onUpdate('mainContactPosition', v)}
              placeholder="e.g., Professor, Director"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <DebouncedInput
              type="email"
              value={fields.contactEmail || ''}
              onDebouncedChange={(v) => onUpdate('contactEmail', v)}
              placeholder="contact@organisation.eu"
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Department */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dept-same-as-org"
              checked={deptSameAsOrg}
              onCheckedChange={(checked) => onUpdate('mainContactDeptSameAsOrg', !!checked)}
              disabled={!canEdit}
            />
            <Label htmlFor="dept-same-as-org" className="font-normal cursor-pointer">
              Same as organisation
            </Label>
          </div>
          {!deptSameAsOrg && (
            <div className="space-y-2">
              <Label>Department</Label>
              <DebouncedInput
                value={fields.mainContactDepartment || ''}
                onDebouncedChange={(v) => onUpdate('mainContactDepartment', v)}
                placeholder="Department name"
                disabled={!canEdit}
              />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-org-address"
              checked={useOrgAddress}
              onCheckedChange={(checked) => onUpdate('useOrganisationAddress', !!checked)}
              disabled={!canEdit}
            />
            <Label htmlFor="use-org-address" className="font-normal cursor-pointer">
              Same as organisation address
            </Label>
          </div>

          {!useOrgAddress && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Street address</Label>
                <DebouncedInput
                  value={fields.mainContactStreet || ''}
                  onDebouncedChange={(v) => onUpdate('mainContactStreet', v)}
                  placeholder="Street address"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Town/City</Label>
                <DebouncedInput
                  value={fields.mainContactTown || ''}
                  onDebouncedChange={(v) => onUpdate('mainContactTown', v)}
                  placeholder="Town/City"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <DebouncedInput
                  value={fields.mainContactPostcode || ''}
                  onDebouncedChange={(v) => onUpdate('mainContactPostcode', v)}
                  placeholder="Postcode"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                {canEdit ? (
                  <CountrySelect
                    value={fields.mainContactCountry || ''}
                    onValueChange={(v) => onUpdate('mainContactCountry', v)}
                  />
                ) : (
                  <Input value={fields.mainContactCountry || ''} disabled />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Website & Phones */}
        <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t">
          <div className="space-y-2">
            <Label>Website</Label>
            <DebouncedInput
              value={fields.mainContactWebsite || ''}
              onDebouncedChange={(v) => onUpdate('mainContactWebsite', v)}
              placeholder="https://..."
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone 1</Label>
            <DebouncedInput
              type="tel"
              value={fields.mainContactPhone || ''}
              onDebouncedChange={(v) => onUpdate('mainContactPhone', v)}
              placeholder="+358..."
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone 2</Label>
            <DebouncedInput
              type="tel"
              value={fields.mainContactPhone2 || ''}
              onDebouncedChange={(v) => onUpdate('mainContactPhone2', v)}
              placeholder="+358..."
              disabled={!canEdit}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
