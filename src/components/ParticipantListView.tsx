import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { DebouncedInput } from '@/components/ui/debounced-input';
import { Checkbox } from '@/components/ui/checkbox';

import { Participant, ParticipantMember, Section, ParticipantType } from '@/types/proposal';
import { Building2, GripVertical, UserPlus, Plus, Check, Upload, X, Loader2, Hash, FileText, Download } from 'lucide-react';
import { SaveIndicator } from './SaveIndicator';
import { BulkPicLookupDialog } from './BulkPicLookupDialog';
import { ParticipantCompletenessChecker } from './ParticipantCompletenessChecker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ParticipantListTable } from './ParticipantListTable';
import { generateParticipantLogoPath, uploadProposalFile } from '@/lib/proposalStorage';
import { StorageImage } from './StorageImage';
import { CountrySelect } from './CountrySelect';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { PartAPageLayout } from './PartAPageLayout';

import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { InviteToProposalDialog } from './InviteToProposalDialog';
import { AddParticipantDialog } from './AddParticipantDialog';
import { B31Pill, WPBubble, ParticipantBubble } from './B31Pill';
import { getContrastingTextColor } from '@/lib/wpColors';
import { supabase } from '@/integrations/supabase/client';
import { useProposalRole } from '@/hooks/useProposalRole';
import { useOCD } from '@/hooks/useOCD';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

// WP Leadership info type
export interface WPLeadershipInfo {
  wpNumber: number;
  color: string;
  shortName?: string;
}

// Case Leadership info type
export interface CaseLeadershipInfo {
  caseNumber: number;
  color: string;
  shortName?: string;
  prefix: string; // CS, UC, LL, P, D, C
}

interface ParticipantListViewProps {
  participants: Participant[];
  proposalId: string;
  proposalAcronym: string;
  section?: Section;
  onSelectParticipant: (participant: Participant) => void;
  onReorderParticipants?: (participants: Participant[]) => Promise<void>;
  onMemberAdded: (member: Omit<ParticipantMember, 'id'>) => void;
  onAddParticipant?: (participant: {
    organisationName: string;
    organisationShortName?: string;
    organisationType: ParticipantType;
    country?: string;
    picNumber?: string;
    legalEntityType?: string;
    isSme: boolean;
    organisationCategory?: string;
    englishName?: string;
  }) => Promise<void>;
  onUpdateParticipant?: (id: string, updates: Partial<Participant>) => Promise<void>;
  canInvite: boolean;
  canReorder?: boolean;
  canAddParticipant?: boolean;
  canEdit?: boolean;
  wpLeadership?: Record<string, WPLeadershipInfo[]>;
  caseLeadership?: Record<string, CaseLeadershipInfo[]>;
}

interface ParticipantCardProps {
  participant: Participant;
  proposalId: string;
  onSelect: () => void;
  canReorder: boolean;
  canEdit: boolean;
  wpLeadership?: WPLeadershipInfo[];
  caseLeadership?: CaseLeadershipInfo[];
  caseIncludeNumber?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<Participant>) => Promise<void>;
}

interface SortableParticipantCardProps {
  participant: Participant;
  proposalId: string;
  onSelect: () => void;
  canReorder: boolean;
  canEdit: boolean;
  wpLeadership?: WPLeadershipInfo[];
  caseLeadership?: CaseLeadershipInfo[];
  caseIncludeNumber?: boolean;
  onFetchLogo?: () => void;
  isFetchingLogo?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<Participant>) => Promise<void>;
}




function ParticipantCard({ 
  participant, 
  proposalId,
  onSelect, 
  canReorder, 
  canEdit,
  wpLeadership,
  caseLeadership,
  caseIncludeNumber = true,
  dragHandleProps,
  isDragging,
  onFetchLogo,
  isFetchingLogo,
  onUpdateParticipant,
}: ParticipantCardProps) {
  // Local state for the country dropdown (CountrySelect commits on selection — no debounce needed)
  const [country, setCountry] = useState(participant.country || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Re-sync country when participant prop changes
  useEffect(() => {
    setCountry(participant.country || '');
  }, [participant.id, participant.country]);

  // Wrap a field save so we keep the existing saving indicator
  const saveField = useCallback(async (updates: Partial<Participant>) => {
    if (!canEdit || !onUpdateParticipant) return;
    setIsSaving(true);
    try {
      await onUpdateParticipant(participant.id, updates);
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, onUpdateParticipant, participant.id]);



  return (
    <Card className={`${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}>
      <CardContent className="py-2 px-2">
        <div className="flex items-center gap-1.5">
          {/* Drag handle */}
          {canReorder && dragHandleProps && (
            <button
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-0.5 -m-0.5 text-muted-foreground hover:text-foreground touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4 text-[#2563EB]" />
            </button>
          )}
          
          {/* Participant number and short name */}
          <div className="w-24 shrink-0 flex flex-col gap-0.5">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
              <span className="font-bold text-primary text-xs">{participant.participantNumber}</span>
            </div>
            {canEdit ? (
              <DebouncedInput
                value={participant.organisationShortName || ''}
                onDebouncedChange={(val) => saveField({ organisationShortName: val || undefined })}
                debounceMs={1000}
                placeholder="Short"
                className="h-7 text-sm font-bold px-1.5"
              />
            ) : (
              participant.organisationShortName ? (
                <ParticipantBubble style={{ fontSize: '12px', height: 'auto', padding: '1.5px 8px' }}>
                  {participant.organisationShortName}
                </ParticipantBubble>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )
            )}
          </div>
          
          {/* Names - editable - now flex-1 for more space */}
          <div className="flex-1 min-w-0 space-y-1">
            {canEdit ? (
              <>
                <DebouncedInput
                  value={participant.organisationName || ''}
                  onDebouncedChange={(val) => saveField({ organisationName: val })}
                  debounceMs={1000}
                  placeholder="Legal name"
                  className="h-7 text-sm px-1.5"
                />
                <DebouncedInput
                  value={participant.englishName || ''}
                  onDebouncedChange={(val) => saveField({ englishName: val || undefined })}
                  debounceMs={1000}
                  placeholder="English name (if different)"
                  className="h-7 text-sm px-1.5 italic text-muted-foreground"
                />
              </>
            ) : (
              <>
                <div className="text-sm truncate">
                  {participant.organisationName || 'Unnamed Organisation'}
                </div>
                {participant.englishName &&
                 participant.englishName.trim() &&
                 participant.englishName.trim().toLowerCase() !== (participant.organisationName || '').trim().toLowerCase() && (
                  <div className="text-sm text-muted-foreground italic truncate">
                    {participant.englishName}
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Logo with fetch/upload/delete buttons */}
          <div className="w-10 h-10 shrink-0 flex items-center justify-center relative group">
            {/* Hidden file input for logo upload */}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !onUpdateParticipant || !proposalId) return;
                
                if (!file.type.startsWith('image/')) {
                  toast.error('Please upload an image file');
                  return;
                }
                if (file.size > 2 * 1024 * 1024) {
                  toast.error('Image must be less than 2MB');
                  return;
                }
                
                setIsUploadingLogo(true);
                try {
                  const filePath = generateParticipantLogoPath(proposalId, participant.participantNumber || 0, file.name);
                  const { error } = await uploadProposalFile(file, filePath, { upsert: true });
                  
                  if (error) {
                    toast.error('Failed to upload logo');
                    return;
                  }
                  
                  // Store the file path, not the signed URL
                  await onUpdateParticipant(participant.id, { logoUrl: filePath });
                  toast.success('Logo uploaded');
                } catch (err) {
                  console.error('Upload error:', err);
                  toast.error('Failed to upload logo');
                } finally {
                  setIsUploadingLogo(false);
                  if (logoInputRef.current) logoInputRef.current.value = '';
                }
              }}
            />
            
            {participant.logoUrl ? (
              <StorageImage 
                storedPath={participant.logoUrl} 
                alt="" 
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                <Building2 className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            
            {/* Hover overlay with action buttons */}
            {canEdit && onUpdateParticipant && (
              <div className="absolute inset-0 bg-background/90 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-0.5 transition-opacity">
                {isUploadingLogo || isFetchingLogo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {/* Fetch logo from web */}
                    {onFetchLogo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFetchLogo();
                        }}
                        className="p-1 hover:bg-muted rounded"
                        title="Fetch logo from web"
                      >
                        <Search className="w-3 h-3" />
                      </button>
                    )}
                    {/* Upload logo from file */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        logoInputRef.current?.click();
                      }}
                      className="p-1 hover:bg-muted rounded"
                      title="Upload logo"
                    >
                      <Upload className="w-3 h-3" />
                    </button>
                    {/* Delete logo - only show if there's a logo */}
                    {participant.logoUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateParticipant(participant.id, { logoUrl: null as unknown as string });
                          toast.success('Logo removed');
                        }}
                        className="p-1 hover:bg-destructive/20 rounded text-destructive"
                        title="Remove logo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Roles/Leadership badges */}
          <div className="w-28 shrink-0 flex flex-col gap-0.5 items-start">
            {participant.participantNumber === 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-xs py-0 px-1.5 w-fit">Coordinator</Badge>
                </TooltipTrigger>
                <TooltipContent>Project coordinator</TooltipContent>
              </Tooltip>
            )}
            {wpLeadership && wpLeadership.length > 0 && (
              wpLeadership.map((wp) => (
                <Tooltip key={`wp-${wp.wpNumber}`}>
                  <TooltipTrigger asChild>
                    <WPBubble
                      wpColor={wp.color}
                      style={{ fontSize: '12px', height: 'auto', padding: '1.5px 6px' }}
                    >
                      WP{wp.wpNumber}
                    </WPBubble>
                  </TooltipTrigger>
                  <TooltipContent>
                    {wp.shortName ? `${wp.shortName} (Lead)` : `WP${wp.wpNumber} Lead`}
                  </TooltipContent>
                </Tooltip>
              ))
            )}
            {caseLeadership && caseLeadership.length > 0 && (
              caseLeadership.map((c) => {
                const numberLabel = c.prefix ? `${c.prefix}${c.caseNumber}` : String(c.caseNumber);
                const displayLabel = caseIncludeNumber
                  ? numberLabel
                  : (c.shortName || numberLabel);
                return (
                  <Tooltip key={`case-${c.caseNumber}`}>
                    <TooltipTrigger asChild>
                      <B31Pill
                        variant="outline"
                        color="#000000"
                        style={{ fontSize: '12px', height: 'auto', padding: '1.5px 6px' }}
                      >
                        {displayLabel}
                      </B31Pill>
                    </TooltipTrigger>
                    <TooltipContent>
                      {c.shortName ? `${c.shortName} (Lead)` : `${numberLabel} Lead`}
                    </TooltipContent>
                  </Tooltip>
                );
              })
            )}
          </div>
          
          {/* Country - searchable dropdown */}
          <div className="shrink-0" style={{ width: '140px' }}>
            {canEdit ? (
              <CountrySelect
                value={country}
                onValueChange={(val) => {
                  setCountry(val);
                  saveField({ country: val || undefined });
                }}
                className="h-7 text-xs px-1.5"
                placeholder="Country"
              />
            ) : (
              <span className="text-sm text-muted-foreground block leading-tight">
                {country || '—'}
              </span>
            )}
          </div>
          
          {/* Save indicator / Edit button */}
          <div className="shrink-0 flex items-center justify-end">
            {canEdit && isSaving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="animate-pulse">Saving...</span>
              </span>
            )}
            {canEdit && (
              <Button
                size="sm"
                className="h-auto py-1.5 px-3 text-xs leading-tight font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
              >
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableParticipantCard({ participant, proposalId, onSelect, canReorder, canEdit, wpLeadership, caseLeadership, caseIncludeNumber, onFetchLogo, isFetchingLogo, onUpdateParticipant }: SortableParticipantCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: participant.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ParticipantCard
        participant={participant}
        proposalId={proposalId}
        onSelect={onSelect}
        canReorder={canReorder}
        canEdit={canEdit}
        wpLeadership={wpLeadership}
        caseLeadership={caseLeadership}
        caseIncludeNumber={caseIncludeNumber}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
        onFetchLogo={onFetchLogo}
        isFetchingLogo={isFetchingLogo}
        onUpdateParticipant={onUpdateParticipant}
      />
    </div>
  );
}

export function ParticipantListView({
  participants,
  proposalId,
  proposalAcronym,
  section,
  onSelectParticipant,
  onReorderParticipants,
  onMemberAdded,
  onAddParticipant,
  onUpdateParticipant,
  canInvite,
  canReorder = false,
  canAddParticipant = false,
  canEdit = false,
  wpLeadership = {},
  caseLeadership = {},
}: ParticipantListViewProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isAddParticipantDialogOpen, setIsAddParticipantDialogOpen] = useState(false);
  const [isBulkPicOpen, setIsBulkPicOpen] = useState(false);
  const [fetchingLogoFor, setFetchingLogoFor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('participants');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';
  const ocd = useOCD(proposalId);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch case display setting (whether to show numbers vs short names on case bubbles)
  const { data: caseSettings } = useQuery({
    queryKey: ['case-settings', proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('case_include_number')
        .eq('id', proposalId)
        .maybeSingle() as { data: { case_include_number: boolean | null } | null };
      return data;
    },
    enabled: !!proposalId,
  });
  const caseIncludeNumber: boolean = caseSettings?.case_include_number !== false;

  // Listen for cross-ref data changes so WP / Case leadership badges update in real time
  // when a lead is changed in WPManagementCard or CaseManagementCard.
  useEffect(() => {
    if (!proposalId) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['wp-leadership', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['case-leadership', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['case-settings', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [proposalId, queryClient]);

  // Extract guidelines from section
  const officialGuidelines = useMemo(() => {
    return (section?.guidelinesArray || [])
      .filter(g => g.type === 'official' || g.type === 'evaluation')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(g => ({
        id: g.id,
        title: g.title,
        content: g.content,
        type: g.type,
      }));
  }, [section?.guidelinesArray]);

  const sitraTips = useMemo(() => {
    return (section?.guidelinesArray || [])
      .filter(g => g.type === 'sitra_tip')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(g => ({
        id: g.id,
        title: g.title,
        content: g.content,
      }));
  }, [section?.guidelinesArray]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = participants.findIndex((p) => p.id === active.id);
      const newIndex = participants.findIndex((p) => p.id === over.id);

      const reorderedParticipants = arrayMove(participants, oldIndex, newIndex).map(
        (p, index) => ({ ...p, participantNumber: index + 1 })
      );

      if (onReorderParticipants) {
        await onReorderParticipants(reorderedParticipants);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
        }, 100);
      }
    }
  };

  const handleFetchLogo = async (participant: Participant) => {
    if (!onUpdateParticipant) return;
    
    setFetchingLogoFor(participant.id);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-logo', {
        body: { 
          organisationName: participant.organisationName,
          shortName: participant.organisationShortName 
        },
      });

      if (error) throw error;

      if (data?.logoUrl) {
        await onUpdateParticipant(participant.id, { logoUrl: data.logoUrl });
        toast.success('Logo fetched successfully');
      } else {
        toast.info('No logo found');
      }
    } catch (err) {
      console.error('Failed to fetch logo:', err);
      toast.error('Failed to fetch logo');
    } finally {
      setFetchingLogoFor(null);
    }
  };

  // Sort participants by participantNumber for display
  const sortedParticipants = [...participants].sort(
    (a, b) => (a.participantNumber || 999) - (b.participantNumber || 999)
  );

  return (
    <TooltipProvider>
      <PartAPageLayout
        title="Part A2: Participants"
        titleRightSlot={
          <div className="flex gap-2">
            {canAddParticipant && onAddParticipant && (
              <Button size="sm" onClick={() => setIsAddParticipantDialogOpen(true)} className="gap-1.5 h-8">
                <Plus className="w-3.5 h-3.5" />
                Add participant
              </Button>
            )}
            {canInvite && (
              <Button variant="outline" size="sm" onClick={() => setIsInviteDialogOpen(true)} className="gap-1.5 h-8">
                <UserPlus className="w-3.5 h-3.5" />
                Invite
              </Button>
            )}
          </div>
        }
        guidelines={
          <PartAGuidelinesDialog
            sectionTitle="Part A2: Participants"
            officialGuidelines={officialGuidelines}
            sitraTips={sitraTips}
          />
        }
        saveIndicator={<SaveIndicator saving={false} lastSaved={lastSaved} onSaveNow={() => {}} />}
      >


          {/* OCD Controls - coordinator+ only */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requires-ocd"
                  checked={ocd.requiresOcd}
                  onCheckedChange={(checked) => ocd.toggleRequiresOcd(!!checked)}
                />
                <label htmlFor="requires-ocd" className="text-sm font-medium cursor-pointer">
                  This topic requires Ownership Control Declarations
                </label>
              </div>

              {ocd.requiresOcd && (
                <>
                  <input
                    ref={templateInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await ocd.uploadTemplate(file);
                      if (templateInputRef.current) templateInputRef.current.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => templateInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {ocd.templatePath ? 'Replace OCD template' : 'Upload OCD template'}
                  </Button>
                  {ocd.templatePath && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="w-3 h-3 text-green-600" /> Template uploaded
                    </span>
                  )}
                  {ocd.templatePath && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const isOcdExempt = (p: Participant) =>
                          p.ocdExempt === true || (p.ocdExempt == null && p.organisationCategory === 'PUB');
                        const missing = participants.filter(p => !ocd.uploads[p.id] && !isOcdExempt(p));
                        if (missing.length > 0) {
                          const names = missing.map(p => p.organisationShortName || p.organisationName).join(', ');
                          const proceed = window.confirm(
                            `The following partners have not uploaded their signed OCD:\n\n${names}\n\nDo you wish to proceed with compiling the available declarations?`
                          );
                          if (!proceed) return;
                        }
                        await ocd.compileOcds();
                      }}
                      disabled={ocd.compiling}
                      className="gap-1.5"
                    >
                      {ocd.compiling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      Compile Ownership Control Declarations
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="participants">Participants</TabsTrigger>
              {isAdmin && <TabsTrigger value="completeness">Completeness</TabsTrigger>}
            </TabsList>

            <TabsContent value="participants">
              {sortedParticipants.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <h3 className="text-base font-medium text-muted-foreground">No participants yet</h3>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {canAddParticipant ? 'Click "Add participant" to add your first partner' : 'Participants will appear here once added'}
                    </p>
                  </CardContent>
                </Card>
              ) : !canEdit && !canReorder ? (
                <div className="bg-white rounded-lg border p-4">
                  <ParticipantListTable
                    participants={sortedParticipants}
                    wpLeadership={wpLeadership}
                    caseLeadership={caseLeadership}
                    onRowClick={onSelectParticipant}
                  />
                </div>
              ) : canReorder && onReorderParticipants ? (
                <div>
                  <div className="flex items-center gap-1.5 px-2 pb-[3px] text-xs text-muted-foreground font-bold">
                    {canReorder && <div className="w-4" />}
                    <div className="w-24 text-left"># / Short</div>
                    <div className="flex-1 min-w-0 text-left">Organisation</div>
                    <div className="w-10 text-left">Logo</div>
                    <div className="w-28 text-left">Lead roles</div>
                    <div className="text-left" style={{ width: '140px' }}>Country</div>
                    <div className="w-10" />
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={sortedParticipants.map((p) => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {sortedParticipants.map((participant) => (
                          <SortableParticipantCard
                            key={participant.id}
                            participant={participant}
                            proposalId={proposalId}
                            onSelect={() => onSelectParticipant(participant)}
                            canReorder={canReorder}
                            canEdit={canEdit}
                            wpLeadership={wpLeadership[participant.id]}
                            caseLeadership={caseLeadership[participant.id]}
                            caseIncludeNumber={caseIncludeNumber}
                            onFetchLogo={() => handleFetchLogo(participant)}
                            isFetchingLogo={fetchingLogoFor === participant.id}
                            onUpdateParticipant={onUpdateParticipant}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 px-2 pb-[3px] text-xs text-muted-foreground font-bold">
                    <div className="w-24 text-left"># / Short</div>
                    <div className="flex-1 min-w-0 text-left">Organisation</div>
                    <div className="w-10 text-left">Logo</div>
                    <div className="w-28 text-left">Lead roles</div>
                    <div className="text-left" style={{ width: '140px' }}>Country</div>
                    <div className="w-10" />
                  </div>
                  <div className="space-y-1.5">
                    {sortedParticipants.map((participant) => (
                      <ParticipantCard
                        key={participant.id}
                        participant={participant}
                        proposalId={proposalId}
                        onSelect={() => onSelectParticipant(participant)}
                        canReorder={false}
                        canEdit={canEdit}
                        wpLeadership={wpLeadership[participant.id]}
                        caseLeadership={caseLeadership[participant.id]}
                        caseIncludeNumber={caseIncludeNumber}
                        onFetchLogo={onUpdateParticipant ? () => handleFetchLogo(participant) : undefined}
                        isFetchingLogo={fetchingLogoFor === participant.id}
                        onUpdateParticipant={onUpdateParticipant}
                      />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {isAdmin && (
              <TabsContent value="completeness">
                <ParticipantCompletenessChecker proposalId={proposalId} />
              </TabsContent>
            )}
          </Tabs>

        {/* Invite to Proposal Dialog */}

        <InviteToProposalDialog
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
          proposalId={proposalId}
          proposalAcronym={proposalAcronym}
          participants={participants}
          onMemberAdded={onMemberAdded}
        />

        {/* Add participant Dialog */}
        {onAddParticipant && (
          <>
            <AddParticipantDialog
              open={isAddParticipantDialogOpen}
              onOpenChange={setIsAddParticipantDialogOpen}
              onAddParticipant={async (participantData) => {
                await onAddParticipant(participantData);
              }}
              participantCount={participants.length}
            />
            <BulkPicLookupDialog
              isOpen={isBulkPicOpen}
              onClose={() => setIsBulkPicOpen(false)}
              proposalId={proposalId}
              existingPics={new Set(participants.map(p => p.picNumber).filter(Boolean) as string[])}
              onAddParticipant={onAddParticipant}
            />
          </>
        )}
      </PartAPageLayout>
    </TooltipProvider>

  );
}
