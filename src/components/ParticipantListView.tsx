import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { PartACard } from '@/components/PartACard';
import { PART_A_FIELD_DENSITY } from '@/components/partAFieldDensity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { DebouncedInput } from '@/components/ui/debounced-input';
import { Checkbox } from '@/components/ui/checkbox';

import { Participant, ParticipantMember, Section, ParticipantType } from '@/types/proposal';
import { Building2, GripVertical, UserPlus, Plus, Upload, X, Loader2, FileText, Lock, Unlock, Users } from 'lucide-react';
import { ParticipantDetailForm } from './ParticipantDetailForm';
import { ParticipantPermissionsDialog } from './ParticipantPermissionsDialog';
import { useParticipantAccess } from '@/hooks/useParticipantAccess';
import { useAuth } from '@/hooks/useAuth';
import { useProposalData } from '@/hooks/useProposalData';

import { SaveIndicator } from './SaveIndicator';
import { BulkPicLookupDialog } from './BulkPicLookupDialog';
import { ParticipantCompletenessChecker } from './ParticipantCompletenessChecker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ParticipantListTable } from './ParticipantListTable';
// (logo uploads go directly to the public participant-logos bucket)
import { StorageImage } from './StorageImage';
import { CountrySelect } from './CountrySelect';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { PartAPageLayout } from './PartAPageLayout';

import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { InviteToProposalDialog } from './InviteToProposalDialog';
import { AddParticipantDialog } from './AddParticipantDialog';
import { B31Pill, WPBubble, ParticipantBubble } from './B31Pill';
import { ExpertiseMatrixCard } from './ExpertiseMatrixCard';
import { buildCaseLabel } from '@/lib/caseTypeLabels';

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
  includeNumber?: boolean;
  includeAbbreviation?: boolean;
  outlineColor?: string;
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
                  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
                  const filePath = `logos/${participant.id}-${Date.now()}.${ext}`;
                  const { error: uploadError } = await supabase.storage
                    .from('participant-logos')
                    .upload(filePath, file, { upsert: true, contentType: file.type });

                  if (uploadError) {
                    console.error('Upload error:', uploadError);
                    toast.error('Failed to upload logo');
                    return;
                  }

                  // Store the storage path (not a public URL); bucket is private and
                  // StorageImage will resolve it to a signed URL at render time.
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
                {isUploadingLogo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
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
                const inclNum = c.includeNumber ?? caseIncludeNumber;
                const inclAbbr = c.includeAbbreviation ?? true;
                const displayLabel = buildCaseLabel({
                  prefix: c.prefix,
                  number: c.caseNumber,
                  shortName: c.shortName ?? null,
                  includeNumber: inclNum,
                  includeAbbreviation: inclAbbr,
                  withShortName: false,
                });
                const numberLabel = c.prefix ? `${c.prefix}${c.caseNumber}` : String(c.caseNumber);
                return (
                  <Tooltip key={`case-${c.caseNumber}`}>
                    <TooltipTrigger asChild>
                      <B31Pill
                        variant="outline"
                        color={c.outlineColor || '#000000'}
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

          {/* Horizon Europe legal entity type abbreviation. */}
          <div className="w-12 shrink-0 text-sm font-normal">
            {participant.organisationCategory || '—'}
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

function SortableParticipantCard({ participant, proposalId, onSelect, canReorder, canEdit, wpLeadership, caseLeadership, caseIncludeNumber, onUpdateParticipant }: SortableParticipantCardProps) {
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
  const [lastSaved] = useState<Date | null>(null);
  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';
  const ocd = useOCD(proposalId);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const access = useParticipantAccess(proposalId);
  const {
    participantMembers,
    deleteParticipant,
    addParticipantMember,
    updateParticipantMember,
    deleteParticipantMember,
  } = useProposalData(proposalId);

  // ── Three views: Overview (read-only, everyone), Enter participant info,
  //    Completeness check. Default Overview; the choice persists per user per
  //    proposal and falls back to Overview when the stored view is unavailable.
  type A2View = 'overview' | 'enter' | 'completeness';
  const viewKey = user?.id ? `a2-view:${user.id}:${proposalId}` : null;
  const [view, setView] = useState<A2View>('overview');
  const restoredViewKeyRef = useRef<string | null>(null);
  const viewChosenRef = useRef(false);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [permissionsParticipantId, setPermissionsParticipantId] = useState<string | null>(null);

  useEffect(() => {
    if (!viewKey || restoredViewKeyRef.current === viewKey) return;
    restoredViewKeyRef.current = viewKey;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(viewKey);
    } catch {
      stored = null;
    }
    const isView = (value: string | null): value is A2View =>
      value === 'overview' || value === 'enter' || value === 'completeness';
    if (!viewChosenRef.current) setView(isView(stored) ? stored : 'overview');
  }, [viewKey]);

  const allowedViews: A2View[] = isAdmin ? ['overview', 'enter', 'completeness'] : ['overview', 'enter'];
  const accessibleView: A2View = allowedViews.includes(view) ? view : 'overview';

  const chooseView = (next: A2View) => {
    viewChosenRef.current = true;
    setView(next);
    if (!viewKey) return;
    try {
      window.localStorage.setItem(viewKey, next);
    } catch {
      // The view preference is optional when browser storage is unavailable.
    }
  };


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
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.type === 'case-settings') {
        queryClient.invalidateQueries({ queryKey: ['case-settings', proposalId] });
      }
      queryClient.invalidateQueries({ queryKey: ['wp-leadership', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['case-leadership', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [proposalId, queryClient]);

  // Extract guidelines from section
  const officialGuidelines = useMemo(() => {
    return (section?.guidelinesArray || [])
      .filter(g => g.type === 'official' || g.type === 'criteria')
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

  // Sort participants by participantNumber for display
  const sortedParticipants = [...participants].sort(
    (a, b) => (a.participantNumber || 999) - (b.participantNumber || 999)
  );

  // The first participant opens by default in the editing view.
  const activeParticipant = sortedParticipants.find(p => p.id === activeParticipantId) ?? sortedParticipants[0] ?? null;
  const permissionsParticipant = sortedParticipants.find(p => p.id === permissionsParticipantId) ?? null;



  return (
    <TooltipProvider>
      <PartAPageLayout
        title="Part A2: Participants"
        proposalId={proposalId}
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
        save={{ saving: false, lastSaved }}
      >
        <div className={`${PART_A_FIELD_DENSITY} space-y-6`}>
          {/* OCD Controls - coordinator+ only */}
          {isAdmin && (
            <PartACard
              collapseKey="a2.ownership-control-declarations"
              title="Ownership Control Declarations"
              icon={<FileText className="w-4 h-4" />}
              contentClassName="pb-4"
            >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="requires-ocd"
                      checked={ocd.requiresOcd}
                      onCheckedChange={(checked) => ocd.toggleRequiresOcd(!!checked)}
                    />
                    <label htmlFor="requires-ocd" className="text-sm font-medium cursor-pointer">
                      This topic requires OCDs
                    </label>
                  </div>

                  {ocd.requiresOcd && (
                    <>
                      <input
                        ref={templateInputRef}
                        type="file"
                        accept=".rtf,application/rtf,text/rtf"
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
                          Compile OCDs
                        </Button>
                      )}
                    </>
                  )}
                </div>
            </PartACard>
          )}

          {/* Three views, mirroring the lump sum budget panel: a read-only
              Overview open to everyone with proposal access, an editing
              surface with per-participant tabs, and the completeness check. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex shrink-0 rounded-md border border-border p-0.5" role="group" aria-label="Participants view">
              <Button type="button" variant={accessibleView === 'overview' ? 'default' : 'ghost'} className="h-10 px-4 py-2 text-sm" aria-pressed={accessibleView === 'overview'} onClick={() => chooseView('overview')}>Overview</Button>
              <Button type="button" variant={accessibleView === 'enter' ? 'default' : 'ghost'} className="h-10 px-4 py-2 text-sm" aria-pressed={accessibleView === 'enter'} onClick={() => chooseView('enter')}>Enter participant info</Button>
              {isAdmin && <Button type="button" variant={accessibleView === 'completeness' ? 'default' : 'ghost'} className="h-10 px-4 py-2 text-sm" aria-pressed={accessibleView === 'completeness'} onClick={() => chooseView('completeness')}>Completeness check</Button>}
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                className="gap-2"
                aria-label={access.lockState === 'all' ? 'Unlock all participant information' : 'Lock all participant information'}
                title={access.lockState === 'some' ? 'Some participants are locked — lock all participants' : undefined}
                onClick={() => access.setLockAll(access.lockState !== 'all')}
              >
                {access.lockState === 'all'
                  ? <Lock className="w-4 h-4 text-destructive" />
                  : <Unlock className={`w-4 h-4 ${access.lockState === 'some' ? 'text-warning' : 'text-green-600'}`} />}
                {access.lockState === 'all' ? 'Unlock all participants' : 'Lock all participants'}
              </Button>
            )}
          </div>

          {accessibleView === 'overview' && (
            <div>

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
                    <div className="w-12 text-left">Type</div>
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
                        onUpdateParticipant={onUpdateParticipant}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <ExpertiseMatrixCard proposalId={proposalId} participants={participants} />
              </div>
            </div>
          )}

          {accessibleView === 'enter' && (
            <div className="space-y-2">
              {/* Wrapping badge strip: every participant stays visible on
                  further rows rather than scrolling sideways. */}
              <div className="flex flex-wrap items-center gap-y-1 overflow-visible border-b border-border pb-1.5">
                {sortedParticipants.map((participant) => {
                  const active = participant.id === activeParticipant?.id;
                  const locked = access.isLocked(participant.id);
                  return (
                    <div key={participant.id} className={`flex min-w-max items-center gap-0 border-b-2 ${active ? 'border-primary' : 'border-transparent'} mr-1 border-r border-r-border/60 pr-1`}>
                      <button
                        type="button"
                        onClick={() => setActiveParticipantId(participant.id)}
                        className={`flex items-center px-1 py-1.5 text-left transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {/* ParticipantBubble paints its own colour inline, so the
                            wrapper is faded rather than the badge itself. */}
                        <span className={`inline-flex transition-opacity ${active ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}>
                          <ParticipantBubble number={participant.participantNumber} shortName={participant.organisationShortName || participant.organisationName} />
                        </span>
                      </button>
                      {isAdmin && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5"
                            aria-label={locked ? `Unlock information for participant ${participant.participantNumber ?? ''}` : `Lock information for participant ${participant.participantNumber ?? ''}`}
                            title={locked ? 'Unlock participant information' : 'Lock participant information'}
                            onClick={() => access.setLock(participant.id, !locked)}
                          >
                            {locked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-green-600" />}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                            aria-label={`Manage information permissions for participant ${participant.participantNumber ?? ''}`}
                            title="Manage participant information permissions"
                            onClick={() => setPermissionsParticipantId(participant.id)}
                          >
                            <Users className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {activeParticipant ? (
                <ParticipantDetailForm
                  participant={activeParticipant}
                  participantMembers={participantMembers}
                  allParticipants={sortedParticipants.map(p => ({
                    id: p.id,
                    participant_number: p.participantNumber,
                    organisation_short_name: p.organisationShortName || null,
                    organisation_name: p.organisationName || '',
                  }))}
                  onUpdateParticipant={onUpdateParticipant ?? (async () => {})}
                  onDeleteParticipant={(participantId) => {
                    deleteParticipant(participantId);
                    setActiveParticipantId(null);
                  }}
                  onAddMember={addParticipantMember}
                  onUpdateMember={updateParticipantMember}
                  onDeleteMember={deleteParticipantMember}
                  canEdit={canEdit}
                  canDelete={canEdit}
                  canGrant={isAdmin}
                  proposalId={proposalId}
                  proposalAcronym={proposalAcronym}
                  onBackToParticipants={() => chooseView('overview')}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No participants found for this proposal.</p>
              )}
            </div>
          )}

          {accessibleView === 'completeness' && isAdmin && (
            <ParticipantCompletenessChecker proposalId={proposalId} />
          )}

          {permissionsParticipant && (
            <ParticipantPermissionsDialog
              proposalId={proposalId}
              participant={{
                id: permissionsParticipant.id,
                participant_number: permissionsParticipant.participantNumber,
                organisation_short_name: permissionsParticipant.organisationShortName || null,
                organisation_name: permissionsParticipant.organisationName || '',
              }}
              open={Boolean(permissionsParticipantId)}
              onOpenChange={open => { if (!open) setPermissionsParticipantId(null); }}
            />
          )}


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
              existingPics={participants.map(p => p.picNumber).filter(Boolean) as string[]}
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
        </div>
      </PartAPageLayout>
    </TooltipProvider>

  );
}
