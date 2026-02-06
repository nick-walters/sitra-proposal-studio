import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

interface MainContactSectionProps {
  participant: Participant;
  onUpdate: (field: string, value: unknown) => void;
  canEdit: boolean;
}

// Extended participant fields for main contact (from database)
interface MainContactFields {
  mainContactTitle?: string | null;
  mainContactFirstName?: string | null;
  mainContactLastName?: string | null;
  mainContactGender?: string | null;
  mainContactPosition?: string | null;
  contactEmail?: string | null;
  mainContactPhone?: string | null;
  mainContactStreet?: string | null;
  mainContactTown?: string | null;
  mainContactPostcode?: string | null;
  mainContactCountry?: string | null;
  useOrganisationAddress?: boolean | null;
}

export function MainContactSection({
  participant,
  onUpdate,
  canEdit,
}: MainContactSectionProps) {
  const fields = participant as unknown as MainContactFields;
  const useOrgAddress = fields.useOrganisationAddress !== false; // Default to true

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="w-5 h-5" />
          Main contact person
        </CardTitle>
        <CardDescription>
          Primary contact for this organisation in the consortium
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Input
              value={fields.mainContactFirstName || ''}
              onChange={(e) => onUpdate('mainContactFirstName', e.target.value)}
              placeholder="First name"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <Input
              value={fields.mainContactLastName || ''}
              onChange={(e) => onUpdate('mainContactLastName', e.target.value)}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Position/Role</Label>
            <Input
              value={fields.mainContactPosition || ''}
              onChange={(e) => onUpdate('mainContactPosition', e.target.value)}
              placeholder="e.g., Project Manager"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={fields.contactEmail || ''}
              onChange={(e) => onUpdate('contactEmail', e.target.value)}
              placeholder="contact@organisation.eu"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              type="tel"
              value={fields.mainContactPhone || ''}
              onChange={(e) => onUpdate('mainContactPhone', e.target.value)}
              placeholder="+358..."
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Address section */}
        <div className="space-y-4 pt-2 border-t">
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
                <Input
                  value={fields.mainContactStreet || ''}
                  onChange={(e) => onUpdate('mainContactStreet', e.target.value)}
                  placeholder="Street address"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Town/City</Label>
                <Input
                  value={fields.mainContactTown || ''}
                  onChange={(e) => onUpdate('mainContactTown', e.target.value)}
                  placeholder="Town/City"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input
                  value={fields.mainContactPostcode || ''}
                  onChange={(e) => onUpdate('mainContactPostcode', e.target.value)}
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
      </CardContent>
    </Card>
  );
}
