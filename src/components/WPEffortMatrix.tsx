import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users } from 'lucide-react';
import type { ParticipantSummary } from '@/types/proposal';

function formatPM(value: number): string {
  if (value === 0) return '0';
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? Math.round(value).toString() : fixed;
}

interface WPEffortEntry {
  participant_id: string;
  person_months: number;
}

interface WPEffortMatrixProps {
  wpNumber: number;
  wpId: string;
  participants: ParticipantSummary[];
  effort: WPEffortEntry[];
  onEffortChange: (participantId: string, personMonths: number) => Promise<boolean>;
  readOnly?: boolean;
}

export function WPEffortMatrix({
  wpNumber,
  wpId,
  participants,
  effort,
  onEffortChange,
  readOnly = false,
}: WPEffortMatrixProps) {
  const getEffort = (participantId: string): number => {
    const entry = effort.find(e => e.participant_id === participantId);
    return entry?.person_months || 0;
  };

  const getTotal = (): number => {
    return effort.reduce((sum, e) => sum + (e.person_months || 0), 0);
  };

  if (participants.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Staff effort (person months)
          </CardTitle>
          <CardDescription>
            Add participants to the proposal to enable effort tracking
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Staff effort (person months)
        </CardTitle>
        <CardDescription className="text-xs">
          Enter person months per participant for this work package. This data feeds into the B3.1 effort table and budget.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px] font-bold">Partner</TableHead>
                <TableHead className="text-center w-[120px] font-bold">WP{wpNumber} staff effort (person months)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell className="font-medium truncate max-w-[200px]">
                    {participant.participant_number}. {participant.organisation_short_name || participant.organisation_name}
                  </TableCell>
                  <EffortCell
                    value={getEffort(participant.id)}
                    onChange={(value) => onEffortChange(participant.id, value)}
                    readOnly={readOnly}
                  />
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-semibold">WP total</TableCell>
                <TableCell className="text-center font-bold">
                  {formatPM(getTotal())}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface EffortCellProps {
  value: number;
  onChange: (value: number) => Promise<boolean>;
  readOnly: boolean;
}

function EffortCell({ value, onChange, readOnly }: EffortCellProps) {
  const [localValue, setLocalValue] = useState(value.toString());
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      const numValue = parseFloat(newValue) || 0;
      // Round to 1 decimal place
      const rounded = Math.round(numValue * 10) / 10;
      onChange(rounded);
    }, 500);

    setDebounceTimeout(timeout);
  }, [onChange, debounceTimeout]);

  const handleBlur = useCallback(() => {
    // Flush any pending debounced save immediately so navigation/unmount can't drop the edit
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      setDebounceTimeout(null);
    }
    const numValue = parseFloat(localValue) || 0;
    const rounded = Math.round(numValue * 10) / 10;
    onChange(rounded);
    setLocalValue(rounded > 0 ? rounded.toString() : '0');
  }, [localValue, onChange, debounceTimeout]);

  return (
    <TableCell className="p-0.5">
      <Input
        type="number"
        step="0.1"
        min="0"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className="h-6 text-center text-xs [&::-webkit-inner-spin-button]:appearance-none"
        disabled={readOnly}
      />
    </TableCell>
  );
}

