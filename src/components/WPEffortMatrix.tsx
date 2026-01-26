import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users } from 'lucide-react';
import type { WPDraftTask } from '@/hooks/useWPDrafts';

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface WPEffortMatrixProps {
  wpNumber: number;
  tasks: WPDraftTask[];
  participants: Participant[];
  onEffortChange: (taskId: string, participantId: string, personMonths: number) => Promise<boolean>;
  readOnly?: boolean;
}

export function WPEffortMatrix({
  wpNumber,
  tasks,
  participants,
  onEffortChange,
  readOnly = false,
}: WPEffortMatrixProps) {
  const formatTaskNumber = (taskNum: number) => `T${wpNumber}.${taskNum}`;

  // Calculate totals
  const getEffort = (task: WPDraftTask, participantId: string): number => {
    const effort = task.effort?.find(e => e.participant_id === participantId);
    return effort?.person_months || 0;
  };

  const getParticipantTotal = (participantId: string): number => {
    return tasks.reduce((total, task) => total + getEffort(task, participantId), 0);
  };

  const getTaskTotal = (task: WPDraftTask): number => {
    if (!task.effort) return 0;
    return task.effort.reduce((total, e) => total + (e.person_months || 0), 0);
  };

  const getGrandTotal = (): number => {
    return tasks.reduce((total, task) => total + getTaskTotal(task), 0);
  };

  // Filter to tasks with titles
  const activeTasks = tasks.filter(t => t.title && t.title.trim().length > 0);

  if (activeTasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Staff effort (person-months)
          </CardTitle>
          <CardDescription>
            Add tasks with titles to enable effort tracking
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (participants.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Staff effort (person-months)
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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Staff effort (person-months)
        </CardTitle>
        <CardDescription>
          Enter person-months per participant per task. This data feeds into the budget spreadsheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 w-[120px]">Partner</TableHead>
                {activeTasks.map((task) => (
                  <TableHead key={task.id} className="text-center w-[80px]">
                    {formatTaskNumber(task.number)}
                  </TableHead>
                ))}
                <TableHead className="text-center w-[80px] bg-muted/50 font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium truncate max-w-[120px]">
                    {participant.organisation_short_name || participant.organisation_name}
                  </TableCell>
                  {activeTasks.map((task) => (
                    <EffortCell
                      key={`${task.id}-${participant.id}`}
                      value={getEffort(task, participant.id)}
                      onChange={(value) => onEffortChange(task.id, participant.id, value)}
                      readOnly={readOnly}
                    />
                  ))}
                  <TableCell className="text-center bg-muted/50 font-medium">
                    {getParticipantTotal(participant.id).toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Task totals row */}
              <TableRow className="bg-muted/30">
                <TableCell className="sticky left-0 bg-muted/30 z-10 font-semibold">Task Total</TableCell>
                {activeTasks.map((task) => (
                  <TableCell key={task.id} className="text-center font-medium">
                    {getTaskTotal(task).toFixed(1)}
                  </TableCell>
                ))}
                <TableCell className="text-center bg-primary/10 font-bold">
                  {getGrandTotal().toFixed(1)}
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
      onChange(numValue);
    }, 500);

    setDebounceTimeout(timeout);
  }, [onChange, debounceTimeout]);

  const handleBlur = useCallback(() => {
    // Normalize the display value
    const numValue = parseFloat(localValue) || 0;
    setLocalValue(numValue > 0 ? numValue.toString() : '0');
  }, [localValue]);

  return (
    <TableCell className="p-1">
      <Input
        type="number"
        step="0.1"
        min="0"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className="h-7 text-center text-sm [&::-webkit-inner-spin-button]:appearance-none"
        disabled={readOnly}
      />
    </TableCell>
  );
}
