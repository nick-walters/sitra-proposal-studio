import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Participant, PARTICIPANT_TYPE_LABELS, ParticipantType } from '@/types/proposal';
import { Plus, Building2, ChevronRight } from 'lucide-react';
import { InlineGuideline } from './GuidelineBox';
import { Badge } from './ui/badge';
import { AddParticipantDialog } from './AddParticipantDialog';
import { OrganisationCategory } from './ParticipantTable';

interface ParticipantListViewProps {
  participants: Participant[];
  onSelectParticipant: (participant: Participant) => void;
  onAddParticipant: (participant: {
    organisationName: string;
    organisationShortName?: string;
    organisationType: ParticipantType;
    country?: string;
    picNumber?: string;
    legalEntityType?: string;
    isSme: boolean;
    organisationCategory?: OrganisationCategory;
    englishName?: string;
  }) => Promise<void>;
  canAddParticipant: boolean;
}

export function ParticipantListView({
  participants,
  onSelectParticipant,
  onAddParticipant,
  canAddParticipant,
}: ParticipantListViewProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleAddParticipant = async (participant: {
    organisationName: string;
    organisationShortName?: string;
    organisationType: ParticipantType;
    country?: string;
    picNumber?: string;
    legalEntityType?: string;
    isSme: boolean;
    organisationCategory?: OrganisationCategory;
    englishName?: string;
  }) => {
    await onAddParticipant(participant);
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Part A2: Participants</h1>
            <InlineGuideline>
              Enter organisation details using PIC (Participant Identification Code) from the EC Participant Register. Coordinator is always Participant #1.
            </InlineGuideline>
          </div>
          {canAddParticipant && (
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Participant
            </Button>
          )}
        </div>

        {/* Participants List */}
        {participants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium text-muted-foreground">No participants yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add the first participant organisation to get started
              </p>
              {canAddParticipant && (
                <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Add Participant
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {participants.map((participant) => (
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
                            {participant.organisationName || 'Unnamed Organisation'}
                          </h3>
                          {participant.organisationShortName && (
                            <span className="text-muted-foreground">
                              ({participant.organisationShortName})
                            </span>
                          )}
                          {participant.participantNumber === 1 && (
                            <Badge variant="outline" className="text-xs">Coordinator</Badge>
                          )}
                          {participant.isSme && (
                            <Badge variant="secondary" className="text-xs">SME</Badge>
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

      {/* Add Participant Dialog */}
      <AddParticipantDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddParticipant={handleAddParticipant}
        participantCount={participants.length}
      />
    </div>
  );
}