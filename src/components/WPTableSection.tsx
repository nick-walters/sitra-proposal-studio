import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Target, Plus, Trash2, GripVertical } from 'lucide-react';
import { ParticipantMultiSelect } from '@/components/ParticipantMultiSelect';
import type { WPDraftTask } from '@/hooks/useWPDrafts';

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface WPTableSectionProps {
  wpNumber: number;
  objectives: string | null;
  tasks: WPDraftTask[];
  participants: Participant[];
  onObjectivesChange: (value: string) => void;
  onTaskUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onTaskAdd: () => Promise<any>;
  onTaskDelete: (taskId: string) => Promise<boolean>;
  onTaskParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
}

export function WPTableSection({
  wpNumber,
  objectives,
  tasks,
  participants,
  onObjectivesChange,
  onTaskUpdate,
  onTaskAdd,
  onTaskDelete,
  onTaskParticipantsChange,
  readOnly = false,
  projectDuration = 36,
}: WPTableSectionProps) {
  const [localObjectives, setLocalObjectives] = useState(objectives || '');
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalObjectives(objectives || '');
  }, [objectives]);

  const handleObjectivesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalObjectives(newValue);

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      onObjectivesChange(newValue);
    }, 1000);

    setDebounceTimeout(timeout);
  }, [onObjectivesChange, debounceTimeout]);

  useEffect(() => {
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [debounceTimeout]);

  const monthOptions = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const formatTaskNumber = (taskNum: number) => `T${wpNumber}.${taskNum}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          WP Table (Objectives & Tasks)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Objectives section */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Objectives</label>
          <Textarea
            value={localObjectives}
            onChange={handleObjectivesChange}
            placeholder="• Objective 1&#10;• Objective 2&#10;• Objective 3"
            className="min-h-[100px] resize-y"
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">Use bullet points to list the main objectives of this work package.</p>
        </div>

        {/* Tasks table */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tasks</label>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Task</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[140px]">Leader</TableHead>
                  <TableHead className="w-[180px]">Participants</TableHead>
                  <TableHead className="w-[140px]">Timing (M)</TableHead>
                  {!readOnly && <TableHead className="w-[40px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    wpNumber={wpNumber}
                    participants={participants}
                    monthOptions={monthOptions}
                    onUpdate={onTaskUpdate}
                    onDelete={onTaskDelete}
                    onParticipantsChange={onTaskParticipantsChange}
                    readOnly={readOnly}
                    formatTaskNumber={formatTaskNumber}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTaskAdd}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TaskRowProps {
  task: WPDraftTask;
  wpNumber: number;
  participants: Participant[];
  monthOptions: number[];
  onUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onDelete: (taskId: string) => Promise<boolean>;
  onParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  readOnly: boolean;
  formatTaskNumber: (num: number) => string;
}

function TaskRow({
  task,
  wpNumber,
  participants,
  monthOptions,
  onUpdate,
  onDelete,
  onParticipantsChange,
  readOnly,
  formatTaskNumber,
}: TaskRowProps) {
  const [localTitle, setLocalTitle] = useState(task.title || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalTitle(task.title || '');
  }, [task.title]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);

    if (titleTimeout) clearTimeout(titleTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(task.id, { title: newValue });
    }, 500);
    setTitleTimeout(timeout);
  };

  const selectedParticipantIds = task.participants?.map(p => p.participant_id) || [];

  return (
    <TableRow>
      <TableCell className="font-mono text-sm text-muted-foreground">
        {formatTaskNumber(task.number)}
      </TableCell>
      <TableCell>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Task title..."
          className="h-8"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell>
        <Select
          value={task.lead_participant_id || ''}
          onValueChange={(value) => onUpdate(task.id, { lead_participant_id: value || null })}
          disabled={readOnly}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.organisation_short_name || p.organisation_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <ParticipantMultiSelect
          participants={participants}
          selectedIds={selectedParticipantIds}
          onChange={(ids) => onParticipantsChange(task.id, ids)}
          disabled={readOnly}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Select
            value={task.start_month?.toString() || ''}
            onValueChange={(value) => onUpdate(task.id, { start_month: value ? parseInt(value) : null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-8 w-[60px]">
              <SelectValue placeholder="M" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m.toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">-</span>
          <Select
            value={task.end_month?.toString() || ''}
            onValueChange={(value) => onUpdate(task.id, { end_month: value ? parseInt(value) : null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-8 w-[60px]">
              <SelectValue placeholder="M" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m.toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      {!readOnly && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
