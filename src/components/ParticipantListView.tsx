import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Participant, ParticipantMember, Section, ParticipantType } from '@/types/proposal';
import { Building2, ChevronRight, GripVertical, UserPlus, Plus } from 'lucide-react';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { InviteToProposalDialog } from './InviteToProposalDialog';
import { AddParticipantDialog } from './AddParticipantDialog';
import { getContrastingTextColor } from '@/lib/wpColors';
import { OrganisationCategory } from './ParticipantTable';
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
  canInvite: boolean;
  canReorder?: boolean;
  canAddParticipant?: boolean;
  wpLeadership?: Record<string, WPLeadershipInfo[]>;
}

interface SortableParticipantCardProps {
  participant: Participant;
  onSelect: () => void;
  canReorder: boolean;
  wpLeadership?: WPLeadershipInfo[];
}

/**
 * Format organisation display name following EC conventions:
 * - If English name exists and differs from legal name: "English Name (Legal Name)"
 * - Otherwise: just the legal/organisation name
 */
function formatOrganisationDisplayName(participant: Participant): { primary: string; secondary?: string } {
  const legalName = participant.organisationName || 'Unnamed Organisation';
  const englishName = participant.englishName;
  
  // If there's an English name and it's different from the legal name
  if (englishName && englishName.trim() && englishName.trim().toLowerCase() !== legalName.trim().toLowerCase()) {
    return { primary: englishName, secondary: legalName };
  }
  
  return { primary: legalName };
}

function ParticipantCard({ 
  participant, 
  onSelect, 
  canReorder, 
  wpLeadership,
  dragHandleProps,
  isDragging,
}: { 
  participant: Participant; 
  onSelect: () => void; 
  canReorder: boolean;
  wpLeadership?: WPLeadershipInfo[];
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}) {
  const { primary, secondary } = formatOrganisationDisplayName(participant);

  return (
    <Card
      className={`cursor-pointer hover:bg-muted/50 transition-colors ${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}
      onClick={onSelect}
    >
      <CardContent className="py-4 px-4">
        <div className="flex items-center gap-4">
          {/* Drag handle */}
          {canReorder && dragHandleProps && (
            <button
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-5 h-5" />
            </button>
          )}
          
          {/* Participant number */}
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="font-bold text-primary">{participant.participantNumber}</span>
          </div>
          
          {/* Short name */}
          <div className="w-20 shrink-0">
            {participant.organisationShortName ? (
              <span className="font-semibold text-sm">[{participant.organisationShortName}]</span>
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </div>
          
          {/* Names */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{primary}</h3>
            {secondary && (
              <p className="text-sm text-muted-foreground italic truncate">{secondary}</p>
            )}
          </div>
          
          {/* Roles/Leadership badges */}
          <div className="flex flex-wrap gap-1 shrink-0">
            {participant.participantNumber === 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-xs">Coord</Badge>
                </TooltipTrigger>
                <TooltipContent>Project Coordinator</TooltipContent>
              </Tooltip>
            )}
            {wpLeadership && wpLeadership.length > 0 && (
              wpLeadership.map((wp) => (
                <Tooltip key={wp.wpNumber}>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium cursor-default"
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
          
          {/* Logo */}
          <div className="w-12 h-12 shrink-0 flex items-center justify-center">
            {participant.logoUrl ? (
              <img 
                src={participant.logoUrl} 
                alt="" 
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                <Building2 className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
          
          {/* Country */}
          <div className="w-28 shrink-0 text-sm text-muted-foreground truncate">
            {participant.country || '—'}
          </div>
          
          {/* Arrow */}
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

function SortableParticipantCard({ participant, onSelect, canReorder, wpLeadership }: SortableParticipantCardProps) {
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
        wpLeadership={wpLeadership}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
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
  canInvite,
  canReorder = false,
  canAddParticipant = false,
  wpLeadership = {},
}: ParticipantListViewProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isAddParticipantDialogOpen, setIsAddParticipantDialogOpen] = useState(false);

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

  // Sort participants by participantNumber for display
  const sortedParticipants = [...participants].sort(
    (a, b) => (a.participantNumber || 999) - (b.participantNumber || 999)
  );

  return (
    <TooltipProvider>
      <div className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Guidelines Button */}
          <PartAGuidelinesDialog
            sectionTitle="Part A2: Participants"
            officialGuidelines={officialGuidelines}
            sitraTips={sitraTips}
          />

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Part A2: Participants</h1>
              <p className="text-sm text-muted-foreground">
                Manage consortium partners and their details
              </p>
            </div>
            <div className="flex gap-2">
              {canAddParticipant && onAddParticipant && (
                <Button onClick={() => setIsAddParticipantDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Participant
                </Button>
              )}
              {canInvite && (
                <Button variant="outline" onClick={() => setIsInviteDialogOpen(true)} className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Invite
                </Button>
              )}
            </div>
          </div>

          {/* Column Headers */}
          {sortedParticipants.length > 0 && (
            <div className="flex items-center gap-4 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {canReorder && <div className="w-5" />}
              <div className="w-10 text-center">№</div>
              <div className="w-20">Short</div>
              <div className="flex-1">Organisation</div>
              <div className="w-24 text-center">Roles</div>
              <div className="w-12 text-center">Logo</div>
              <div className="w-28">Country</div>
              <div className="w-5" />
            </div>
          )}

          {/* Participants List */}
          {sortedParticipants.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium text-muted-foreground">No participants yet</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
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
                <div className="space-y-2">
                  {sortedParticipants.map((participant) => (
                    <SortableParticipantCard
                      key={participant.id}
                      participant={participant}
                      onSelect={() => onSelectParticipant(participant)}
                      canReorder={canReorder}
                      wpLeadership={wpLeadership[participant.id]}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-2">
              {sortedParticipants.map((participant) => (
                <ParticipantCard
                  key={participant.id}
                  participant={participant}
                  onSelect={() => onSelectParticipant(participant)}
                  canReorder={false}
                  wpLeadership={wpLeadership[participant.id]}
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
