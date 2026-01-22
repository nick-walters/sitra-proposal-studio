import { useState, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Participant } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  RES: 'Research organisation',
  UNI: 'University',
  IND: 'Large enterprise',
  SME: 'Small/medium enterprise',
  NGO: 'Non-governmental organisation',
  CSO: 'Civil society organisation',
  PUB: 'Public organisation',
  INT: 'International organisation',
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
  proposalId?: string;
  isEditing?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<ExtendedParticipant>) => void;
}

export function ParticipantTable({ 
  participants, 
  proposalId,
  isEditing = false,
  onUpdateParticipant 
}: ParticipantTableProps) {
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const handleLogoUpload = async (participantId: string, file: File) => {
    if (!file || !proposalId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploadingLogoId(participantId);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${proposalId}/${participantId}/logo.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('participant-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Failed to upload logo');
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('participant-logos')
        .getPublicUrl(fileName);

      // Update participant with new logo URL
      onUpdateParticipant?.(participantId, { logoUrl: publicUrl });
      toast.success('Logo uploaded');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogoId(null);
    }
  };

  const handleRemoveLogo = (participantId: string) => {
    onUpdateParticipant?.(participantId, { logoUrl: undefined });
  };

  // Get country code from country name
  const getCountryCode = (countryName?: string): string => {
    if (!countryName) return '';
    const allCountries = [...EU_MEMBER_STATES, ...ASSOCIATED_COUNTRIES, ...THIRD_COUNTRIES];
    const country = allCountries.find(c => c.name === countryName || c.code === countryName);
    return country?.code || countryName;
  };

  return (
    <TooltipProvider>
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
              <TableCell className="py-0.5 px-1 w-12 align-top">
                {isEditing ? (
                  <div className="relative group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[participant.id] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(participant.id, file);
                      }}
                    />
                    {participant.logoUrl ? (
                      <div className="relative">
                        <img 
                          src={participant.logoUrl} 
                          alt="" 
                          className="w-8 h-8 object-contain cursor-pointer"
                          onClick={() => fileInputRefs.current[participant.id]?.click()}
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-1 -right-1 w-4 h-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveLogo(participant.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : uploadingLogoId === participant.id ? (
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 p-0"
                        onClick={() => fileInputRefs.current[participant.id]?.click()}
                      >
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ) : (
                  participant.logoUrl ? (
                    <img 
                      src={participant.logoUrl} 
                      alt="" 
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-[9px] text-muted-foreground">
                      —
                    </div>
                  )
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
                  (participant as ExtendedParticipant).organisationCategory ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-medium cursor-help">
                          {(participant as ExtendedParticipant).organisationCategory}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{ORGANISATION_CATEGORY_LABELS[(participant as ExtendedParticipant).organisationCategory as OrganisationCategory]}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="font-medium">—</span>
                  )
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
    </TooltipProvider>
  );
}
