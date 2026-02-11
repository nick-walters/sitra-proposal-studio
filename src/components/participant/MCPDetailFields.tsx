import { Label } from '@/components/ui/label';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Participant } from '@/types/proposal';
import { CONTACT_TITLES, GENDER_OPTIONS } from '@/types/participantDetails';
import { CountrySelect } from '@/components/CountrySelect';

interface MCPDetailFieldsProps {
  participant: Participant;
  onUpdate: (field: string, value: unknown) => void;
  canEdit: boolean;
}

interface MCPFields {
  mainContactTitle?: string | null;
  mainContactFirstName?: string | null;
  mainContactLastName?: string | null;
  mainContactGender?: string | null;
  mainContactPosition?: string | null;
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
}

export function MCPDetailFields({ participant, onUpdate, canEdit }: MCPDetailFieldsProps) {
  const fields = participant as unknown as MCPFields;
  const useOrgAddress = fields.useOrganisationAddress ?? true;
  const deptSameAsOrg = fields.mainContactDeptSameAsOrg ?? true;

  return (
    <div className="space-y-4 pl-4 border-l-2 border-primary/20 mt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Main contact additional details</p>

      {/* Title, Gender, Position */}
      <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="space-y-2">
          <Label>Position in organisation</Label>
          <DebouncedInput
            value={fields.mainContactPosition || ''}
            onDebouncedChange={(v) => onUpdate('mainContactPosition', v)}
            placeholder="e.g., Professor, Director"
            disabled={!canEdit}
          />
        </div>
      </div>

      {/* Department */}
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="mcp-dept-same"
            checked={deptSameAsOrg}
            onCheckedChange={(checked) => onUpdate('mainContactDeptSameAsOrg', !!checked)}
            disabled={!canEdit}
          />
          <Label htmlFor="mcp-dept-same" className="font-normal cursor-pointer">
            Department same as organisation
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
            id="mcp-use-org-addr"
            checked={useOrgAddress}
            onCheckedChange={(checked) => onUpdate('useOrganisationAddress', !!checked)}
            disabled={!canEdit}
          />
          <Label htmlFor="mcp-use-org-addr" className="font-normal cursor-pointer">
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
    </div>
  );
}
