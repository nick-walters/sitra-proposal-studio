import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Participant {
  id: string;
  participant_number: number;
  organisation_short_name: string | null;
  organisation_name: string;
}

interface InsertParticipantReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSelect: (participant: {
    id: string;
    participantNumber: number;
    shortName: string;
  }) => void;
}

export function InsertParticipantReferenceDialog({
  open,
  onOpenChange,
  proposalId,
  onSelect,
}: InsertParticipantReferenceDialogProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && proposalId) {
      fetchParticipants();
    }
  }, [open, proposalId]);

  const fetchParticipants = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('participants')
      .select('id, participant_number, organisation_short_name, organisation_name')
      .eq('proposal_id', proposalId)
      .order('participant_number');

    if (error) {
      console.error('Error fetching participants:', error);
    } else {
      setParticipants(data || []);
    }
    setLoading(false);
  };

  const handleSelect = (participant: Participant) => {
    onSelect({
      id: participant.id,
      participantNumber: participant.participant_number,
      shortName: participant.organisation_short_name || participant.organisation_name,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Insert Partner Reference
          </DialogTitle>
          <DialogDescription>
            Select a partner to insert as an inline reference badge.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : participants.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No partners found.
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {participants.map((participant) => (
                <button
                  key={participant.id}
                  onClick={() => handleSelect(participant)}
                  className={cn(
                    "w-full flex items-center p-3 rounded-md text-left",
                    "hover:bg-muted/80 transition-colors"
                  )}
                >
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-16 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: '#000000',
                      color: '#ffffff',
                    }}
                  >
                    {participant.organisation_short_name || `P${participant.participant_number}`}
                  </span>
                  <div className="flex-1 min-w-0 ml-3 text-sm truncate">
                    {participant.organisation_name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
