import { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface ParticipantMultiSelectProps {
  participants: Participant[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ParticipantMultiSelect({
  participants,
  selectedIds,
  onChange,
  disabled = false,
  placeholder = 'Select...',
}: ParticipantMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleParticipant = (participantId: string) => {
    if (selectedIds.includes(participantId)) {
      onChange(selectedIds.filter(id => id !== participantId));
    } else {
      onChange([...selectedIds, participantId]);
    }
  };

  const removeParticipant = (participantId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedIds.filter(id => id !== participantId));
  };

  const getParticipantLabel = (id: string) => {
    const p = participants.find(p => p.id === id);
    if (!p) return '';
    return p.organisation_short_name || p.organisation_name;
  };

  const selectedParticipants = participants.filter(p => selectedIds.includes(p.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal",
            !selectedIds.length && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 overflow-hidden max-w-[140px]">
            {selectedIds.length === 0 ? (
              <span className="truncate">{placeholder}</span>
            ) : selectedIds.length <= 2 ? (
              selectedParticipants.map(p => (
                <Badge
                  key={p.id}
                  variant="secondary"
                  className="h-5 px-1 text-xs truncate max-w-[60px]"
                >
                  {p.organisation_short_name || p.organisation_name.substring(0, 8)}
                  {!disabled && (
                    <button
                      className="ml-1 hover:bg-muted rounded-sm"
                      onClick={(e) => removeParticipant(p.id, e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="h-5 px-1 text-xs">
                {selectedIds.length} selected
              </Badge>
            )}
          </div>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {participants.map((participant) => {
            const isSelected = selectedIds.includes(participant.id);
            return (
              <button
                key={participant.id}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                  isSelected && "bg-accent"
                )}
                onClick={() => toggleParticipant(participant.id)}
              >
                <div className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border",
                  isSelected ? "bg-primary border-primary" : "border-primary"
                )}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="truncate">
                  {participant.organisation_short_name || participant.organisation_name}
                </span>
              </button>
            );
          })}
          {participants.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No participants available
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
