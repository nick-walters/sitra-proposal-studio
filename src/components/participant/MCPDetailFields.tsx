import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GENDER_OPTIONS } from '@/types/participantDetails';
import { CountrySelect } from '@/components/CountrySelect';

/** The main-contact-only fields held on the participant row. */
export interface MCPFields {
  mainContactGender?: string | null;
  mainContactPosition?: string | null;
  mainContactDepartment?: string | null;
  mainContactDeptSameAsOrg?: boolean | null;
  mainContactStreet?: string | null;
  mainContactTown?: string | null;
  mainContactPostcode?: string | null;
  mainContactCountry?: string | null;
  mainContactWebsite?: string | null;
  useOrganisationAddress?: boolean | null;
}

export const MCP_FIELD_KEYS: (keyof MCPFields)[] = [
  'mainContactGender',
  'mainContactPosition',
  'mainContactDepartment',
  'mainContactDeptSameAsOrg',
  'mainContactStreet',
  'mainContactTown',
  'mainContactPostcode',
  'mainContactCountry',
  'mainContactWebsite',
  'useOrganisationAddress',
];

interface MCPDetailFieldsProps {
  /** Draft values while editing; the stored values when read-only. */
  values: MCPFields;
  onChange: (field: keyof MCPFields, value: unknown) => void;
  /** Mirrors the contact card: read-only until the pencil is pressed. */
  isEditing: boolean;
}

/** Read-only presentation matching the contact card's plain-text rows. */
function ReadOnly({ value }: { value?: string | null }) {
  return <p className="h-8 flex items-center text-sm truncate">{value || ''}</p>;
}

export function MCPDetailFields({ values, onChange, isEditing }: MCPDetailFieldsProps) {
  const useOrgAddress = values.useOrganisationAddress ?? true;
  const deptSameAsOrg = values.mainContactDeptSameAsOrg ?? true;
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === values.mainContactGender)?.label || '';

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Main contact additional details
      </p>

      {/* Gender, Position in organisation, Website */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-32 shrink-0">
          <Label className="text-xs">Gender</Label>
          {isEditing ? (
            <Select
              value={values.mainContactGender || ''}
              onValueChange={(v) => onChange('mainContactGender', v)}
            >
              <SelectTrigger className="h-8 text-sm" aria-label="Gender">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ReadOnly value={genderLabel} />
          )}
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <Label className="text-xs">Position in organisation</Label>
          {isEditing ? (
            <Input
              className="h-8 text-sm"
              value={values.mainContactPosition || ''}
              onChange={(e) => onChange('mainContactPosition', e.target.value)}
              placeholder="e.g., Professor, Director"
              aria-label="Position in organisation"
            />
          ) : (
            <ReadOnly value={values.mainContactPosition} />
          )}
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <Label className="text-xs">Website</Label>
          {isEditing ? (
            <Input
              className="h-8 text-sm"
              value={values.mainContactWebsite || ''}
              onChange={(e) => onChange('mainContactWebsite', e.target.value)}
              placeholder="https://..."
              aria-label="Website"
            />
          ) : (
            <ReadOnly value={values.mainContactWebsite} />
          )}
        </div>
      </div>

      {/* Department */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={deptSameAsOrg}
            onCheckedChange={(checked) => onChange('mainContactDeptSameAsOrg', !!checked)}
            disabled={!isEditing}
          />
          Department same as organisation
        </label>
        {!deptSameAsOrg && (
          <div className="min-w-0">
            <Label className="text-xs">Department</Label>
            {isEditing ? (
              <Input
                className="h-8 text-sm"
                value={values.mainContactDepartment || ''}
                onChange={(e) => onChange('mainContactDepartment', e.target.value)}
                placeholder="Department name"
                aria-label="Department"
              />
            ) : (
              <ReadOnly value={values.mainContactDepartment} />
            )}
          </div>
        )}
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={useOrgAddress}
            onCheckedChange={(checked) => onChange('useOrganisationAddress', !!checked)}
            disabled={!isEditing}
          />
          Same as organisation address
        </label>
        {!useOrgAddress && (
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1 basis-full">
              <Label className="text-xs">Street address</Label>
              {isEditing ? (
                <Input
                  className="h-8 text-sm"
                  value={values.mainContactStreet || ''}
                  onChange={(e) => onChange('mainContactStreet', e.target.value)}
                  placeholder="Street address"
                  aria-label="Street address"
                />
              ) : (
                <ReadOnly value={values.mainContactStreet} />
              )}
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <Label className="text-xs">Town/City</Label>
              {isEditing ? (
                <Input
                  className="h-8 text-sm"
                  value={values.mainContactTown || ''}
                  onChange={(e) => onChange('mainContactTown', e.target.value)}
                  placeholder="Town/City"
                  aria-label="Town/City"
                />
              ) : (
                <ReadOnly value={values.mainContactTown} />
              )}
            </div>
            <div className="w-32 shrink-0">
              <Label className="text-xs">Postcode</Label>
              {isEditing ? (
                <Input
                  className="h-8 text-sm"
                  value={values.mainContactPostcode || ''}
                  onChange={(e) => onChange('mainContactPostcode', e.target.value)}
                  placeholder="Postcode"
                  aria-label="Postcode"
                />
              ) : (
                <ReadOnly value={values.mainContactPostcode} />
              )}
            </div>
            <div className="min-w-0 flex-1 basis-48">
              <Label className="text-xs">Country</Label>
              {isEditing ? (
                <CountrySelect
                  value={values.mainContactCountry || ''}
                  onValueChange={(v) => onChange('mainContactCountry', v)}
                />
              ) : (
                <ReadOnly value={values.mainContactCountry} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
