import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Copy } from 'lucide-react';
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

/** Compact input styling shared by contact cards and the main contact's details. */
export const FIELD_CLASS =
  'h-7 text-sm px-2 placeholder:italic placeholder:text-muted-foreground/70';

/** A dropdown's placeholder, italic and grey to match the text inputs. */
export function SelectPlaceholder({ text }: { text: string }) {
  return <span className="italic text-muted-foreground/70">{text}</span>;
}

/**
 * Read-only presentation. An empty field still shows its placeholder, so the
 * card explains itself without any field headings.
 */
export function ReadValue({ value, placeholder }: { value?: string | null; placeholder: string }) {
  const text = value?.trim() || '';
  return (
    <p
      className={`h-7 min-w-0 flex-1 flex items-center text-sm px-2 truncate ${
        text ? '' : 'italic text-muted-foreground/70'
      }`}
    >
      {text || placeholder}
    </p>
  );
}

/** Copy control matching the lump sum portal copy view. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked: still show the tick so the user keeps their place */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-5 w-5 shrink-0"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={copy}
      disabled={!text}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </Button>
  );
}

/**
 * A hairline between one field and the next, so a copy button reads as
 * belonging to the field on its left. Purely visual: no extra spacing.
 */
export function FieldDivider() {
  return <span aria-hidden className="self-stretch w-px bg-border shrink-0" />;
}

/**
 * One text field: placeholder instead of a heading, with a copy button beside
 * it. Dropdowns deliberately have no copy button.
 */
export function CompactTextField({
  value,
  onChange,
  onBlur,
  placeholder,
  isEditing,
  type = 'text',
  showDivider = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  isEditing: boolean;
  type?: string;
  showDivider?: boolean;
}) {
  const label = placeholder.replace('*', '');
  return (
    <div className="flex items-stretch gap-0.5">
      {isEditing ? (
        <Input
          className={FIELD_CLASS}
          type={type}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <ReadValue value={value} placeholder={placeholder} />
      )}
      <span className="flex items-center">
        <CopyButton text={value} label={label} />
      </span>
      {showDivider && <FieldDivider />}
    </div>
  );
}


interface MCPDetailFieldsProps {
  /** Draft values while editing; the stored values when read-only. */
  values: MCPFields;
  onChange: (field: keyof MCPFields, value: unknown) => void;
  /** Mirrors the contact card: read-only until the pencil is pressed. */
  isEditing: boolean;
}

export function MCPDetailFields({ values, onChange, isEditing }: MCPDetailFieldsProps) {
  const useOrgAddress = values.useOrganisationAddress ?? true;
  const deptSameAsOrg = values.mainContactDeptSameAsOrg ?? true;
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === values.mainContactGender)?.label || '';

  return (
    <div className="mt-1 space-y-1 border-t pt-1">
      {/* Gender, Position in organisation, Website */}
      <div className="flex flex-wrap items-stretch gap-1">
        <div className="w-32 shrink-0 flex items-stretch gap-0.5">
          <div className="min-w-0 flex-1">
          {isEditing ? (
            <Select
              value={values.mainContactGender || ''}
              onValueChange={(v) => onChange('mainContactGender', v)}
            >
              <SelectTrigger className={FIELD_CLASS} aria-label="Gender">
                <SelectValue placeholder={<SelectPlaceholder text="Gender*" />} />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center">
              <ReadValue value={genderLabel} placeholder="Gender*" />
            </div>
          )}
          </div>
          <FieldDivider />
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <CompactTextField
            value={values.mainContactPosition || ''}
            onChange={(v) => onChange('mainContactPosition', v)}
            placeholder="Position in organisation*"
            isEditing={isEditing}
          />
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <CompactTextField
            value={values.mainContactWebsite || ''}
            onChange={(v) => onChange('mainContactWebsite', v)}
            placeholder="Website"
            isEditing={isEditing}
            showDivider={false}
          />
        </div>
      </div>


      {/* Department */}
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={deptSameAsOrg}
            onCheckedChange={(checked) => onChange('mainContactDeptSameAsOrg', !!checked)}
            disabled={!isEditing}
          />
          Department same as organisation
        </label>
        {!deptSameAsOrg && (
          <CompactTextField
            value={values.mainContactDepartment || ''}
            onChange={(v) => onChange('mainContactDepartment', v)}
            placeholder="Department*"
            isEditing={isEditing}
          />
        )}
      </div>

      {/* Address */}
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={useOrgAddress}
            onCheckedChange={(checked) => onChange('useOrganisationAddress', !!checked)}
            disabled={!isEditing}
          />
          Same as organisation address
        </label>
        {!useOrgAddress && (
          <div className="flex flex-wrap items-center gap-1">
            <div className="min-w-0 flex-1 basis-full">
              <CompactTextField
                value={values.mainContactStreet || ''}
                onChange={(v) => onChange('mainContactStreet', v)}
                placeholder="Street address*"
                isEditing={isEditing}
              />
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <CompactTextField
                value={values.mainContactTown || ''}
                onChange={(v) => onChange('mainContactTown', v)}
                placeholder="Town/City*"
                isEditing={isEditing}
              />
            </div>
            <div className="w-36 shrink-0">
              <CompactTextField
                value={values.mainContactPostcode || ''}
                onChange={(v) => onChange('mainContactPostcode', v)}
                placeholder="Postcode*"
                isEditing={isEditing}
              />
            </div>
            <div className="min-w-0 flex-1 basis-48">
              {isEditing ? (
                <CountrySelect
                  value={values.mainContactCountry || ''}
                  onValueChange={(v) => onChange('mainContactCountry', v)}
                />
              ) : (
                <div className="flex items-center">
                  <ReadValue value={values.mainContactCountry} placeholder="Country*" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
