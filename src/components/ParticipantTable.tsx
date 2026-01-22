import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Participant } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';

// Organisation category types for Horizon Europe
export type OrganisationCategory = 
  | 'RES' 
  | 'UNI' 
  | 'IND' 
  | 'SME' 
  | 'NGO' 
  | 'CSO' 
  | 'PUB' 
  | 'INT' 
  | 'OTH';

export const ORGANISATION_CATEGORY_LABELS: Record<OrganisationCategory, string> = {
  RES: 'Research Organisation',
  UNI: 'University',
  IND: 'Large Enterprise',
  SME: 'Small/Medium Enterprise',
  NGO: 'Non-Governmental Organisation',
  CSO: 'Civil Society Organisation',
  PUB: 'Public Organisation',
  INT: 'International Organisation',
  OTH: 'Other',
};

// Extended participant with new fields
export interface ExtendedParticipant extends Participant {
  organisationCategory?: OrganisationCategory;
  englishName?: string;
}

// Convert name to name case (capitalize first letter of each word)
function toNameCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface ParticipantTableProps {
  participants: ExtendedParticipant[];
  isEditing?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<ExtendedParticipant>) => void;
}

export function ParticipantTable({ 
  participants, 
  isEditing = false,
  onUpdateParticipant 
}: ParticipantTableProps) {
  // Sort participants: Coordinator (1) first, then by WP lead, then others
  const sortedParticipants = [...participants].sort((a, b) => {
    return (a.participantNumber || 999) - (b.participantNumber || 999);
  });

  const handleCategoryChange = (id: string, category: OrganisationCategory) => {
    onUpdateParticipant?.(id, { organisationCategory: category });
  };

  const handleCountryChange = (id: string, country: string) => {
    onUpdateParticipant?.(id, { country });
  };

  const handleEnglishNameChange = (id: string, englishName: string) => {
    onUpdateParticipant?.(id, { englishName });
  };

  // Get country code from country name
  const getCountryCode = (countryName?: string): string => {
    if (!countryName) return '';
    const allCountries = [...EU_MEMBER_STATES, ...ASSOCIATED_COUNTRIES, ...THIRD_COUNTRIES];
    const country = allCountries.find(c => c.name === countryName || c.code === countryName);
    return country?.code || countryName;
  };

  return (
    <div className="overflow-x-auto">
      <Table className="text-[11px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 py-0.5 px-1 font-bold">№</TableHead>
            <TableHead className="py-0.5 px-1 font-bold">Short name</TableHead>
            <TableHead className="py-0.5 px-1 font-bold" colSpan={2}>Participant</TableHead>
            <TableHead className="w-20 py-0.5 px-1 font-bold">Type</TableHead>
            <TableHead className="w-20 py-0.5 px-1 font-bold">Country</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedParticipants.map((participant) => (
            <TableRow key={participant.id} className="hover:bg-muted/30">
              <TableCell className="py-0.5 px-1 font-medium align-top">
                {participant.participantNumber}
              </TableCell>
              <TableCell className="py-0.5 px-1 font-medium align-top whitespace-nowrap">
                {participant.organisationShortName || '—'}
              </TableCell>
              <TableCell className="py-0.5 px-1 align-top">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {toNameCase(participant.organisationName)}
                  </span>
                  {isEditing ? (
                    <Input
                      value={(participant as ExtendedParticipant).englishName || ''}
                      onChange={(e) => handleEnglishNameChange(participant.id, e.target.value)}
                      placeholder="English name (if different)"
                      className="h-6 text-[10px] px-1 py-0 text-muted-foreground italic"
                    />
                  ) : (
                    (participant as ExtendedParticipant).englishName && (
                      <span className="text-muted-foreground italic text-[10px]">
                        {toNameCase((participant as ExtendedParticipant).englishName || '')}
                      </span>
                    )
                  )}
                </div>
              </TableCell>
              <TableCell className="py-0.5 px-1 w-10 align-top">
                {participant.logoUrl ? (
                  <img 
                    src={participant.logoUrl} 
                    alt="" 
                    className="w-8 h-8 object-contain"
                  />
                ) : (
                  <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-[9px] text-muted-foreground">
                    —
                  </div>
                )}
              </TableCell>
              <TableCell className="py-0.5 px-1 align-top">
                {isEditing ? (
                  <Select
                    value={(participant as ExtendedParticipant).organisationCategory || ''}
                    onValueChange={(v) => handleCategoryChange(participant.id, v as OrganisationCategory)}
                  >
                    <SelectTrigger className="h-6 text-[10px] px-1 w-16">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {Object.entries(ORGANISATION_CATEGORY_LABELS).map(([code, label]) => (
                        <SelectItem key={code} value={code} className="text-[10px]">
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-medium">
                    {(participant as ExtendedParticipant).organisationCategory || '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className="py-0.5 px-1 align-top">
                {isEditing ? (
                  <Select
                    value={participant.country || ''}
                    onValueChange={(v) => handleCountryChange(participant.id, v)}
                  >
                    <SelectTrigger className="h-6 text-[10px] px-1 w-16">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover max-h-60">
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground">EU Member States</div>
                      {EU_MEMBER_STATES.map((country) => (
                        <SelectItem key={country.code} value={country.name} className="text-[10px]">
                          {country.code}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground mt-1">Associated Countries</div>
                      {ASSOCIATED_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.name} className="text-[10px]">
                          {country.code}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground mt-1">Third Countries</div>
                      {THIRD_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.name} className="text-[10px]">
                          {country.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-medium">
                    {getCountryCode(participant.country) || '—'}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {sortedParticipants.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-4 text-center text-muted-foreground">
                No participants added yet. Add participants in the A2 section.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
