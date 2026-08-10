/**
 * fundingInstruments — single source of truth for funding-instrument codes,
 * abbreviations and full names used by the Methodologies "Linked research &
 * innovation activities" table and, later, its B1.2 mirror (including the
 * legend row that spells out the abbreviations).
 *
 * Nothing outside this file may hard-code the instrument list.
 */

export type FundingInstrumentCode = 'HE' | 'DEU' | 'RCF' | 'OTHER';

export interface FundingInstrumentDef {
  code: FundingInstrumentCode;
  abbreviation: string;
  fullName: string;
}

export const FUNDING_INSTRUMENTS: ReadonlyArray<FundingInstrumentDef> = [
  { code: 'HE', abbreviation: 'HE', fullName: 'Horizon Europe' },
  { code: 'DEU', abbreviation: 'DEU', fullName: 'Digital Europe' },
  { code: 'RCF', abbreviation: 'RCF', fullName: 'Research Council of Finland' },
  { code: 'OTHER', abbreviation: '', fullName: '' },
];

export function getInstrumentDef(
  code: FundingInstrumentCode | string | null | undefined,
): FundingInstrumentDef | undefined {
  if (!code) return undefined;
  return FUNDING_INSTRUMENTS.find((i) => i.code === code);
}

/** Short label. For OTHER, the custom text is returned exactly as typed. */
export function getInstrumentAbbreviation(
  code: FundingInstrumentCode | string | null | undefined,
  customName?: string | null,
): string {
  if (code === 'OTHER') return customName ?? '';
  return getInstrumentDef(code)?.abbreviation ?? '';
}

/** Full name. For OTHER, the custom text is returned exactly as typed. */
export function getInstrumentFullName(
  code: FundingInstrumentCode | string | null | undefined,
  customName?: string | null,
): string {
  if (code === 'OTHER') return customName ?? '';
  return getInstrumentDef(code)?.fullName ?? '';
}

/**
 * 2026 + 2028 → '2026-28'; 2026 + 2026 → '2026'; either missing → ''.
 * Plain hyphen, never an en dash.
 */
export function formatDurationShort(
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): string {
  if (startYear == null || endYear == null) return '';
  if (startYear === endYear) return String(startYear);
  const endShort = String(endYear).slice(-2);
  return `${startYear}-${endShort}`;
}
