import { useState, useRef, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Participant } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';
import { Upload, X, Loader2, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { generateParticipantLogoPath, uploadProposalFile } from '@/lib/proposalStorage';
import { supabase } from '@/integrations/supabase/client';

// Official EC organisation category types for Horizon Europe
export type OrganisationCategory = 
  | 'HES' 
  | 'RES' 
  | 'PRC' 
  | 'PUB' 
  | 'INT' 
  | 'OTH';

export const ORGANISATION_CATEGORY_LABELS: Record<OrganisationCategory, string> = {
  HES: 'Higher or secondary education establishment',
  RES: 'Research organisation',
  PRC: 'Private for-profit entity',
  PUB: 'Public body',
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
  const [fetchingLogoId, setFetchingLogoId] = useState<string | null>(null);
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
      // Find participant number for organized file naming
      const participant = participants.find(p => p.id === participantId);
      const participantNumber = participant?.participantNumber || 0;
      
      // Generate organized file path: {proposalId}/participants/partner-{number}-logo-{timestamp}.{ext}
      const filePath = generateParticipantLogoPath(proposalId, participantNumber, file.name);

      const { url, error } = await uploadProposalFile(file, filePath, { upsert: true });

      if (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload logo');
        return;
      }

      // Update participant with new logo URL
      onUpdateParticipant?.(participantId, { logoUrl: url || undefined });
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

  // Auto-fetch logo from the web
  const handleAutoFetchLogo = async (participantId: string, organisationName: string, shortName?: string) => {
    if (!proposalId) return;
    
    setFetchingLogoId(participantId);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-logo', {
        body: { organisationName, shortName, convertToGray: true }
      });

      if (error) throw error;

      if (!data.logoUrl) {
        toast.error('No logo found for this organization');
        return;
      }

      // If it's a data URL, we need to upload it to storage
      if (data.logoUrl.startsWith('data:')) {
        const participant = participants.find(p => p.id === participantId);
        const participantNumber = participant?.participantNumber || 0;
        
        // Convert data URL to blob
        const response = await fetch(data.logoUrl);
        const blob = await response.blob();
        
        const filePath = generateParticipantLogoPath(proposalId, participantNumber, 'auto-logo.png');
        const { url, error: uploadError } = await uploadProposalFile(blob, filePath, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        onUpdateParticipant?.(participantId, { logoUrl: url || undefined });
        toast.success('Logo fetched and saved');
      } else {
        // It's a direct URL, use it
        onUpdateParticipant?.(participantId, { logoUrl: data.logoUrl });
        toast.success('Logo found');
      }
    } catch (error) {
      console.error('Error fetching logo:', error);
      toast.error('Failed to fetch logo');
    } finally {
      setFetchingLogoId(null);
    }
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
            <TableHead className="py-0.5 px-1 font-bold">Country</TableHead>
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
              <TableCell className="py-0.5 px-1 align-top text-left">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {toNameCase(participant.organisationName)}
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={(participant as ExtendedParticipant).englishName || ''}
                      onChange={(e) => handleEnglishNameChange(participant.id, e.target.value)}
                      placeholder="English name (if different)"
                      className="flex h-6 w-full rounded-md border border-input bg-background px-1 py-0 text-[10px] text-muted-foreground italic ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              <TableCell className="py-0.5 px-1 w-16 align-top text-right">
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
                          className="w-8 h-8 object-contain cursor-pointer grayscale"
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
                    ) : uploadingLogoId === participant.id || fetchingLogoId === participant.id ? (
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 p-0"
                              onClick={() => handleAutoFetchLogo(participant.id, participant.organisationName, participant.organisationShortName || undefined)}
                            >
                              <Search className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Auto-fetch logo from web</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 p-0"
                              onClick={() => fileInputRefs.current[participant.id]?.click()}
                            >
                              <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Upload logo</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                ) : (
                  participant.logoUrl ? (
                    <img 
                      src={participant.logoUrl} 
                      alt="" 
                      className="w-8 h-8 object-contain grayscale"
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
                    value={participant.country || ''}
                    onValueChange={(v) => handleCountryChange(participant.id, v)}
                  >
                    <SelectTrigger className="h-6 text-[10px] px-1 w-full min-w-[120px]">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover max-h-60">
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground">EU Member States</div>
                      {EU_MEMBER_STATES.map((country) => (
                        <SelectItem key={country.code} value={country.name} className="text-[10px]">
                          {country.name}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground mt-1">Associated Countries</div>
                      {ASSOCIATED_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.name} className="text-[10px]">
                          {country.name}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground mt-1">Third Countries</div>
                      {THIRD_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.name} className="text-[10px]">
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-medium">
                    {participant.country || '—'}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {sortedParticipants.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
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
