import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Participant, ParticipantMember, Section, ParticipantType } from '@/types/proposal';
import { Building2, GripVertical, UserPlus, Plus, Search, Check } from 'lucide-react';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { InviteToProposalDialog } from './InviteToProposalDialog';
import { AddParticipantDialog } from './AddParticipantDialog';
import { getContrastingTextColor } from '@/lib/wpColors';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
}

interface ParticipantCardProps {
  participant: Participant;
  onSelect: () => void;
  canReorder: boolean;
  canEdit: boolean;
  wpLeadership?: WPLeadershipInfo[];
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  onFetchLogo?: () => void;
  isFetchingLogo?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<Participant>) => Promise<void>;
}

interface SortableParticipantCardProps {
  participant: Participant;
  onSelect: () => void;
  canReorder: boolean;
  canEdit: boolean;
  wpLeadership?: WPLeadershipInfo[];
  onFetchLogo?: () => void;
  isFetchingLogo?: boolean;
  onUpdateParticipant?: (id: string, updates: Partial<Participant>) => Promise<void>;
}

// Debounce hook for autosave
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function ParticipantCard({ 
  participant, 
  onSelect, 
  canReorder, 
  canEdit,
  wpLeadership,
  dragHandleProps,
  isDragging,
  onFetchLogo,
  isFetchingLogo,
  onUpdateParticipant,
}: ParticipantCardProps) {
  // Local state for editable fields
  const [shortName, setShortName] = useState(participant.organisationShortName || '');
  const [legalName, setLegalName] = useState(participant.organisationName || '');
  const [englishName, setEnglishName] = useState(participant.englishName || '');
  const [country, setCountry] = useState(participant.country || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Track if values have changed from original
  const originalRef = useRef({
    shortName: participant.organisationShortName || '',
    legalName: participant.organisationName || '',
    englishName: participant.englishName || '',
    country: participant.country || '',
  });

  // Update local state when participant prop changes
  useEffect(() => {
    setShortName(participant.organisationShortName || '');
    setLegalName(participant.organisationName || '');
    setEnglishName(participant.englishName || '');
    setCountry(participant.country || '');
    originalRef.current = {
      shortName: participant.organisationShortName || '',
      legalName: participant.organisationName || '',
      englishName: participant.englishName || '',
      country: participant.country || '',
    };
    setHasChanges(false);
  }, [participant.id, participant.organisationShortName, participant.organisationName, participant.englishName, participant.country]);

  // Debounced values for autosave
  const debouncedShortName = useDebounce(shortName, 1000);
  const debouncedLegalName = useDebounce(legalName, 1000);
  const debouncedEnglishName = useDebounce(englishName, 1000);
  const debouncedCountry = useDebounce(country, 1000);

  // Autosave effect
  useEffect(() => {
    if (!canEdit || !onUpdateParticipant) return;

    const updates: Partial<Participant> = {};
    let hasUpdates = false;

    if (debouncedShortName !== originalRef.current.shortName) {
      updates.organisationShortName = debouncedShortName || undefined;
      hasUpdates = true;
    }
    if (debouncedLegalName !== originalRef.current.legalName) {
      updates.organisationName = debouncedLegalName;
      hasUpdates = true;
    }
    if (debouncedEnglishName !== originalRef.current.englishName) {
      updates.englishName = debouncedEnglishName || undefined;
      hasUpdates = true;
    }
    if (debouncedCountry !== originalRef.current.country) {
      updates.country = debouncedCountry || undefined;
      hasUpdates = true;
    }

    if (hasUpdates) {
      setIsSaving(true);
      onUpdateParticipant(participant.id, updates)
        .then(() => {
          originalRef.current = {
            shortName: debouncedShortName,
            legalName: debouncedLegalName,
            englishName: debouncedEnglishName,
            country: debouncedCountry,
          };
          setHasChanges(false);
        })
        .finally(() => {
          setIsSaving(false);
        });
    }
  }, [debouncedShortName, debouncedLegalName, debouncedEnglishName, debouncedCountry, canEdit, onUpdateParticipant, participant.id]);

  // Track changes
  const handleChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setHasChanges(true);
    };
  }, []);

  return (
    <Card className={`${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}>
      <CardContent className="py-2 px-3">
        <div className="flex items-center gap-3">
          {/* Drag handle */}
          {canReorder && dragHandleProps && (
            <button
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-0.5 -m-0.5 text-muted-foreground hover:text-foreground touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          
          {/* Participant number */}
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <span className="font-bold text-primary text-sm">{participant.participantNumber}</span>
          </div>
          
          {/* Short name - editable */}
          <div className="w-24 shrink-0">
            {canEdit ? (
              <Input
                value={shortName}
                onChange={handleChange(setShortName)}
                placeholder="Short"
                className="h-7 text-sm font-bold px-1.5"
              />
            ) : (
              shortName ? (
                <span 
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: '#000000', color: '#ffffff' }}
                >
                  {shortName}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )
            )}
          </div>
          
          {/* Names - editable */}
          <div className="w-64 shrink-0 min-w-0 space-y-1">
            {canEdit ? (
              <>
                <Input
                  value={legalName}
                  onChange={handleChange(setLegalName)}
                  placeholder="Legal name"
                  className="h-7 text-sm px-1.5"
                />
                <Input
                  value={englishName}
                  onChange={handleChange(setEnglishName)}
                  placeholder="English name (if different)"
                  className="h-7 text-sm px-1.5 italic text-muted-foreground"
                />
              </>
            ) : (
              <>
                <div className="text-sm truncate">
                  {legalName || 'Unnamed Organisation'}
                </div>
                {englishName && 
                 englishName.trim() && 
                 englishName.trim().toLowerCase() !== legalName.trim().toLowerCase() && (
                  <div className="text-sm text-muted-foreground italic truncate">
                    {englishName}
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Roles/Leadership badges */}
          <div className="flex flex-wrap gap-1 shrink-0">
            {participant.participantNumber === 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-xs py-0 px-1.5">Coord</Badge>
                </TooltipTrigger>
                <TooltipContent>Project Coordinator</TooltipContent>
              </Tooltip>
            )}
            {wpLeadership && wpLeadership.length > 0 && (
              wpLeadership.map((wp) => (
                <Tooltip key={wp.wpNumber}>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center px-1.5 py-0 rounded text-xs font-medium cursor-default"
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
          </div>
          
          {/* Logo with fetch button */}
          <div className="w-10 h-10 shrink-0 flex items-center justify-center relative group">
            {participant.logoUrl ? (
              <img 
                src={participant.logoUrl} 
                alt="" 
                className="max-w-full max-h-full object-contain grayscale brightness-0"
              />
            ) : (
              <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                <Building2 className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            {canEdit && onFetchLogo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFetchLogo();
                }}
                disabled={isFetchingLogo}
                className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                title="Fetch logo"
              >
                <Search className={`w-4 h-4 ${isFetchingLogo ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          
          {/* Country - editable */}
          <div className="w-28 shrink-0">
            {canEdit ? (
              <Input
                value={country}
                onChange={handleChange(setCountry)}
                placeholder="Country"
                className="h-7 text-sm px-1.5 text-muted-foreground"
              />
            ) : (
              <span className="text-sm text-muted-foreground truncate block">
                {country || '—'}
              </span>
            )}
          </div>
          
          {/* Save indicator / Edit button */}
          <div className="shrink-0 flex items-center gap-2 justify-end">
            {canEdit && (isSaving || hasChanges) && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {isSaving ? (
                  <span className="animate-pulse">Saving...</span>
                ) : hasChanges ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-green-600" />
                    <span>Saved</span>
                  </>
                )}
              </span>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
              >
                Edit participant info
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableParticipantCard({ participant, onSelect, canReorder, canEdit, wpLeadership, onFetchLogo, isFetchingLogo, onUpdateParticipant }: SortableParticipantCardProps) {
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
        onSelect={onSelect}
        canReorder={canReorder}
        canEdit={canEdit}
        wpLeadership={wpLeadership}
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
}: ParticipantListViewProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isAddParticipantDialogOpen, setIsAddParticipantDialogOpen] = useState(false);
  const [fetchingLogoFor, setFetchingLogoFor] = useState<string | null>(null);

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
      <div className="flex-1 overflow-auto p-4 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Guidelines Button */}
          <PartAGuidelinesDialog
            sectionTitle="Part A2: Participants"
            officialGuidelines={officialGuidelines}
            sitraTips={sitraTips}
          />

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Part A2: Participants</h1>
              <p className="text-xs text-muted-foreground">
                Manage consortium partners and their details
              </p>
            </div>
            <div className="flex gap-2">
              {canAddParticipant && onAddParticipant && (
                <Button size="sm" onClick={() => setIsAddParticipantDialogOpen(true)} className="gap-1.5 h-8">
                  <Plus className="w-3.5 h-3.5" />
                  Add Participant
                </Button>
              )}
              {canInvite && (
                <Button variant="outline" size="sm" onClick={() => setIsInviteDialogOpen(true)} className="gap-1.5 h-8">
                  <UserPlus className="w-3.5 h-3.5" />
                  Invite
                </Button>
              )}
            </div>
          </div>

          {/* Column Headers */}
          {sortedParticipants.length > 0 && (
            <div className="flex items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
              {canReorder && <div className="w-4" />}
              <div className="w-8 text-center">No.</div>
              <div className="w-24">Short</div>
              <div className="w-64">Organisation</div>
              <div className="flex-1 text-center">Roles</div>
              <div className="w-10 text-center">Logo</div>
              <div className="w-28">Country</div>
              <div />
            </div>
          )}

          {/* Participants List */}
          {sortedParticipants.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <h3 className="text-base font-medium text-muted-foreground">No participants yet</h3>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {canAddParticipant ? 'Click "Add Participant" to add your first partner' : 'Participants will appear here once added'}
                </p>
              </CardContent>
            </Card>
          ) : canReorder && onReorderParticipants ? (
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
                      onSelect={() => onSelectParticipant(participant)}
                      canReorder={canReorder}
                      canEdit={canEdit}
                      wpLeadership={wpLeadership[participant.id]}
                      onFetchLogo={() => handleFetchLogo(participant)}
                      isFetchingLogo={fetchingLogoFor === participant.id}
                      onUpdateParticipant={onUpdateParticipant}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-1.5">
              {sortedParticipants.map((participant) => (
                <ParticipantCard
                  key={participant.id}
                  participant={participant}
                  onSelect={() => onSelectParticipant(participant)}
                  canReorder={false}
                  canEdit={canEdit}
                  wpLeadership={wpLeadership[participant.id]}
                  onFetchLogo={onUpdateParticipant ? () => handleFetchLogo(participant) : undefined}
                  isFetchingLogo={fetchingLogoFor === participant.id}
                  onUpdateParticipant={onUpdateParticipant}
                />
              ))}
            </div>
          )}
        </div>

        {/* Invite to Proposal Dialog */}
        <InviteToProposalDialog
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
          proposalId={proposalId}
          proposalAcronym={proposalAcronym}
          participants={participants}
          onMemberAdded={onMemberAdded}
        />

        {/* Add Participant Dialog */}
        {onAddParticipant && (
          <AddParticipantDialog
            open={isAddParticipantDialogOpen}
            onOpenChange={setIsAddParticipantDialogOpen}
            onAddParticipant={async (participantData) => {
              await onAddParticipant(participantData);
            }}
            participantCount={participants.length}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
