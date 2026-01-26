import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Participant, ParticipantMember, PARTICIPANT_TYPE_LABELS, Section } from '@/types/proposal';
import { Building2, ChevronRight, GripVertical, UserPlus } from 'lucide-react';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { Badge } from './ui/badge';
import { InviteToProposalDialog } from './InviteToProposalDialog';
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

interface ParticipantListViewProps {
  participants: Participant[];
  proposalId: string;
  proposalAcronym: string;
  section?: Section;
  onSelectParticipant: (participant: Participant) => void;
  onReorderParticipants?: (participants: Participant[]) => Promise<void>;
  onMemberAdded: (member: Omit<ParticipantMember, 'id'>) => void;
  canInvite: boolean;
  canReorder?: boolean;
}

interface SortableParticipantCardProps {
  participant: Participant;
  onSelect: () => void;
  canReorder: boolean;
}

/**
 * Format organisation display name following EC conventions:
 * - If English name exists and differs from legal name: "English Name (Legal Name)"
 * - Otherwise: just the legal/organisation name
 */
function formatOrganisationDisplayName(participant: Participant): string {
  const legalName = participant.organisationName || 'Unnamed Organisation';
  const englishName = participant.englishName;
  
  // If there's an English name and it's different from the legal name
  if (englishName && englishName.trim() && englishName.trim().toLowerCase() !== legalName.trim().toLowerCase()) {
    return `${englishName} (${legalName})`;
  }
  
  return legalName;
}

function SortableParticipantCard({ participant, onSelect, canReorder }: SortableParticipantCardProps) {
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
      <Card
        className={`cursor-pointer hover:bg-muted/50 transition-colors ${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}
      >
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {canReorder && (
                <button
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground touch-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-5 h-5" />
                </button>
              )}
              <div 
                className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center cursor-pointer"
                onClick={onSelect}
              >
                <span className="font-bold text-primary">{participant.participantNumber}</span>
              </div>
              <div className="cursor-pointer" onClick={onSelect}>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">
                    {formatOrganisationDisplayName(participant)}
                  </h3>
                  {participant.organisationShortName && (
                    <span className="text-muted-foreground text-sm">
                      [{participant.organisationShortName}]
                    </span>
                  )}
                  {participant.participantNumber === 1 && (
                    <Badge variant="outline" className="text-xs">Coordinator</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {PARTICIPANT_TYPE_LABELS[participant.organisationType]}
                  {participant.country && ` • ${participant.country}`}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground cursor-pointer" onClick={onSelect} />
          </div>
        </CardContent>
      </Card>
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
  canInvite,
  canReorder = false,
}: ParticipantListViewProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

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
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto space-y-6">
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
          </div>
          <div className="flex gap-2">
            {canInvite && (
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(true)} className="gap-2">
                <UserPlus className="w-4 h-4" />
                Invite
              </Button>
            )}
          </div>
        </div>

        {/* Participants List */}
        {sortedParticipants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium text-muted-foreground">No participants yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add participants from the Proposal Overview page
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
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-2">
            {sortedParticipants.map((participant) => (
              <Card
                key={participant.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onSelectParticipant(participant)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary">{participant.participantNumber}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">
                            {formatOrganisationDisplayName(participant)}
                          </h3>
                          {participant.organisationShortName && (
                            <span className="text-muted-foreground text-sm">
                              [{participant.organisationShortName}]
                            </span>
                          )}
                          {participant.participantNumber === 1 && (
                            <Badge variant="outline" className="text-xs">Coordinator</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {PARTICIPANT_TYPE_LABELS[participant.organisationType]}
                          {participant.country && ` • ${participant.country}`}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
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
    </div>
  );
}
