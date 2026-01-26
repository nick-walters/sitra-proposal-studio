import { useState, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Participant, ParticipantMember } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';
import { Upload, X, Loader2, Search, GripVertical, Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { generateParticipantLogoPath, uploadProposalFile } from '@/lib/proposalStorage';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { InviteToProposalDialog } from './InviteToProposalDialog';
import { getContrastingTextColor } from '@/lib/wpColors';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// WP Leadership info
export interface WPLeadershipInfo {
  wpNumber: number;
  color: string;
  shortName?: string;
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
  proposalAcronym?: string;
  isEditing?: boolean;
  canInvite?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<ExtendedParticipant>) => void;
  onReorderParticipants?: (reorderedParticipants: ExtendedParticipant[]) => void;
  onMemberAdded?: (member: Omit<ParticipantMember, 'id'>) => void;
  wpLeadership?: Record<string, WPLeadershipInfo[]>; // participantId -> WPs they lead
}

// All countries combined for the dropdown
const ALL_COUNTRIES = [
  { label: 'EU Member States', countries: EU_MEMBER_STATES },
  { label: 'Associated Countries', countries: ASSOCIATED_COUNTRIES },
  { label: 'Third Countries', countries: THIRD_COUNTRIES },
];

// Sortable row component
function SortableParticipantRow({
  participant,
  isEditing,
  onUpdateParticipant,
  proposalId,
  uploadingLogoId,
  fetchingLogoId,
  fileInputRefs,
  handleLogoUpload,
  handleRemoveLogo,
  handleAutoFetchLogo,
  wpLeadership,
}: {
  participant: ExtendedParticipant;
  isEditing: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<ExtendedParticipant>) => void;
  proposalId?: string;
  uploadingLogoId: string | null;
  fetchingLogoId: string | null;
  fileInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  handleLogoUpload: (id: string, file: File) => void;
  handleRemoveLogo: (id: string) => void;
  handleAutoFetchLogo: (id: string, name: string, shortName?: string) => void;
  wpLeadership?: WPLeadershipInfo[];
}) {
  const [countryOpen, setCountryOpen] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: participant.id, disabled: !isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleShortNameChange = (value: string) => {
    onUpdateParticipant?.(participant.id, { organisationShortName: value });
  };

  const handleNameChange = (value: string) => {
    onUpdateParticipant?.(participant.id, { organisationName: value });
  };

  const handleEnglishNameChange = (value: string) => {
    onUpdateParticipant?.(participant.id, { englishName: value });
  };

  const handleCountryChange = (country: string) => {
    onUpdateParticipant?.(participant.id, { country });
    setCountryOpen(false);
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className={cn("hover:bg-muted/30", isDragging && "bg-muted/50")}
    >
      {/* Drag handle + Number */}
      <TableCell className="py-0.5 px-1 font-medium align-top">
        <div className="flex items-center gap-1">
          {isEditing && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          <span>{participant.participantNumber}</span>
        </div>
      </TableCell>
      
      {/* Short name */}
      <TableCell className="py-0.5 px-1 font-medium align-top whitespace-nowrap">
        {isEditing ? (
          <Input
            defaultValue={participant.organisationShortName || ''}
            onBlur={(e) => handleShortNameChange(e.target.value)}
            className="h-6 text-[11px] px-1 py-0 w-20"
            placeholder="Short"
          />
        ) : (
          participant.organisationShortName || '—'
        )}
      </TableCell>
      
      {/* Participant name */}
      <TableCell className="py-0.5 px-1 align-top text-left">
        <div className="flex flex-col gap-0.5">
          {isEditing ? (
            <Input
              defaultValue={participant.organisationName}
              onBlur={(e) => handleNameChange(e.target.value)}
              className="h-6 text-[11px] px-1 py-0 font-medium"
              placeholder="Organisation name"
            />
          ) : (
            <span className="font-medium">
              {toNameCase(participant.organisationName)}
            </span>
          )}
          {isEditing ? (
            <input
              type="text"
              defaultValue={(participant as ExtendedParticipant).englishName || ''}
              onBlur={(e) => handleEnglishNameChange(e.target.value)}
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
      
      {/* Logo */}
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
              className="w-8 h-8 object-contain"
            />
          ) : (
            <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-[9px] text-muted-foreground">
              —
            </div>
          )
        )}
      </TableCell>
      
      {/* Leadership */}
      <TableCell className="py-0.5 px-1 align-top">
        <div className="flex flex-wrap gap-1">
          {/* Coordinator badge for first participant */}
          {participant.participantNumber === 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium cursor-default bg-primary text-primary-foreground">
                  Coord
                </span>
              </TooltipTrigger>
              <TooltipContent>Project Coordinator</TooltipContent>
            </Tooltip>
          )}
          {/* WP leadership badges */}
          {wpLeadership && wpLeadership.length > 0 && (
            wpLeadership.map((wp) => (
              <Tooltip key={wp.wpNumber}>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium cursor-default"
                    style={{
                      backgroundColor: wp.color,
                      color: getContrastingTextColor(wp.color),
                    }}
                  >
                    WP{wp.wpNumber}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {wp.shortName ? `${wp.shortName} (Lead)` : `WP${wp.wpNumber} Lead`}
                </TooltipContent>
              </Tooltip>
            ))
          )}
          {/* Show dash only if no leadership roles */}
          {participant.participantNumber !== 1 && (!wpLeadership || wpLeadership.length === 0) && (
            <span className="text-muted-foreground text-[10px]">—</span>
          )}
        </div>
      </TableCell>
      
      {/* Country */}
      <TableCell className="py-0.5 px-1 align-top">
        {isEditing ? (
          <Popover open={countryOpen} onOpenChange={setCountryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={countryOpen}
                className="h-6 w-[130px] justify-between text-[11px] px-1"
              >
                <span className="truncate">{participant.country || 'Select...'}</span>
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 z-[9999]" align="start">
              <Command>
                <CommandInput placeholder="Search country..." className="h-8 text-[11px]" />
                <CommandList className="max-h-[200px] overflow-y-auto">
                  <CommandEmpty>No country found.</CommandEmpty>
                  {ALL_COUNTRIES.map((group) => (
                    <CommandGroup key={group.label} heading={group.label}>
                      {group.countries.map((country) => (
                        <CommandItem
                          key={country.code}
                          value={country.name}
                          onSelect={() => handleCountryChange(country.name)}
                          className="text-[11px]"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3 w-3",
                              participant.country === country.name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {country.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="font-medium">
            {participant.country || '—'}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ParticipantTable({ 
  participants, 
  proposalId,
  proposalAcronym = '',
  isEditing = false,
  canInvite = false,
  onUpdateParticipant,
  onReorderParticipants,
  onMemberAdded,
  wpLeadership = {},
}: ParticipantTableProps) {
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const [fetchingLogoId, setFetchingLogoId] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sort participants by participantNumber
  const sortedParticipants = [...participants].sort((a, b) => {
    return (a.participantNumber || 999) - (b.participantNumber || 999);
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedParticipants.findIndex((p) => p.id === active.id);
      const newIndex = sortedParticipants.findIndex((p) => p.id === over.id);
      
      const newOrder = arrayMove(sortedParticipants, oldIndex, newIndex);
      
      // Update participant numbers and call reorder callback with full participant objects
      const reorderedWithNumbers = newOrder.map((p, index) => ({
        ...p,
        participantNumber: index + 1,
      }));
      onReorderParticipants?.(reorderedWithNumbers);
    }
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
    // Use null (not undefined) to ensure the database update includes the deletion
    onUpdateParticipant?.(participantId, { logoUrl: null as unknown as string });
  };

  // Auto-fetch logo from the web - always fetches fresh, never uses cached
  const handleAutoFetchLogo = async (participantId: string, organisationName: string, shortName?: string) => {
    if (!proposalId) return;
    
    // Clear existing logo first to ensure fresh fetch
    onUpdateParticipant?.(participantId, { logoUrl: undefined });
    
    setFetchingLogoId(participantId);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-logo', {
        body: { organisationName, shortName, convertToGray: false }
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
        
        // Use timestamp in filename to ensure fresh URL (prevents browser caching)
        const timestamp = Date.now();
        const filePath = generateParticipantLogoPath(proposalId, participantNumber, `logo-${timestamp}.png`);
        const { url, error: uploadError } = await uploadProposalFile(blob, filePath, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        onUpdateParticipant?.(participantId, { logoUrl: url || undefined });
        toast.success('Logo fetched and saved');
      } else {
        // It's a direct URL - add cache buster
        const cacheBustedUrl = `${data.logoUrl}${data.logoUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        onUpdateParticipant?.(participantId, { logoUrl: cacheBustedUrl });
        toast.success('Logo found');
      }
    } catch (error) {
      console.error('Error fetching logo:', error);
      toast.error('Failed to fetch logo');
    } finally {
      setFetchingLogoId(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table className="text-[11px]" style={{ fontFamily: 'Arial, sans-serif' }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 py-0.5 px-1 font-bold">№</TableHead>
                <TableHead className="py-0.5 px-1 font-bold">Short name</TableHead>
                <TableHead className="py-0.5 px-1 font-bold" colSpan={2}>Participant</TableHead>
                <TableHead className="py-0.5 px-1 font-bold">Leadership</TableHead>
                <TableHead className="py-0.5 px-1 font-bold">Country</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={sortedParticipants.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedParticipants.map((participant) => (
                  <SortableParticipantRow
                    key={participant.id}
                    participant={participant}
                    isEditing={isEditing}
                    onUpdateParticipant={onUpdateParticipant}
                    proposalId={proposalId}
                    uploadingLogoId={uploadingLogoId}
                    fetchingLogoId={fetchingLogoId}
                    fileInputRefs={fileInputRefs}
                    handleLogoUpload={handleLogoUpload}
                    handleRemoveLogo={handleRemoveLogo}
                    handleAutoFetchLogo={handleAutoFetchLogo}
                    wpLeadership={wpLeadership[participant.id]}
                  />
                ))}
              </SortableContext>
              {sortedParticipants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-4 text-center text-muted-foreground">
                    No participants added yet. Add participants using the button above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>

      {/* Invite Button */}
      {canInvite && proposalId && onMemberAdded && (
        <div className="flex justify-end mt-4">
          <Button 
            variant="outline" 
            onClick={() => setIsInviteDialogOpen(true)} 
            className="gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Invite Collaborator
          </Button>
        </div>
      )}

      {/* Invite to Proposal Dialog */}
      {proposalId && onMemberAdded && (
        <InviteToProposalDialog
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
          proposalId={proposalId}
          proposalAcronym={proposalAcronym}
          participants={participants}
          onMemberAdded={onMemberAdded}
        />
      )}
    </TooltipProvider>
  );
}
