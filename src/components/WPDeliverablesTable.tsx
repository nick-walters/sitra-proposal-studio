import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Plus, Trash2 } from 'lucide-react';
import type { WPDraftDeliverable } from '@/hooks/useWPDrafts';

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface WPDeliverablesTableProps {
  wpNumber: number;
  deliverables: WPDraftDeliverable[];
  participants: Participant[];
  onDeliverableUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDeliverableAdd: () => Promise<any>;
  onDeliverableDelete: (id: string) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
}

const DELIVERABLE_TYPES = [
  { value: 'R', label: 'Report' },
  { value: 'DEM', label: 'Demonstrator' },
  { value: 'DEC', label: 'Websites, patents, etc.' },
  { value: 'DATA', label: 'Data management' },
  { value: 'OTHER', label: 'Other' },
];

const DISSEMINATION_LEVELS = [
  { value: 'PU', label: 'Public' },
  { value: 'SEN', label: 'Sensitive' },
  { value: 'CO', label: 'Confidential' },
];

export function WPDeliverablesTable({
  wpNumber,
  deliverables,
  participants,
  onDeliverableUpdate,
  onDeliverableAdd,
  onDeliverableDelete,
  readOnly = false,
  projectDuration = 36,
}: WPDeliverablesTableProps) {
  const monthOptions = Array.from({ length: projectDuration }, (_, i) => i + 1);
  const formatDeliverableNumber = (num: number) => `D${wpNumber}.${num}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Deliverables
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">D#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[140px]">Responsible</TableHead>
                <TableHead className="w-[80px]">Diss.</TableHead>
                <TableHead className="w-[80px]">Due (M)</TableHead>
                {!readOnly && <TableHead className="w-[40px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliverables.map((deliverable) => (
                <DeliverableRow
                  key={deliverable.id}
                  deliverable={deliverable}
                  formatNumber={formatDeliverableNumber}
                  participants={participants}
                  monthOptions={monthOptions}
                  onUpdate={onDeliverableUpdate}
                  onDelete={onDeliverableDelete}
                  readOnly={readOnly}
                />
              ))}
            </TableBody>
          </Table>
        </div>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeliverableAdd}
            className="mt-2"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Deliverable
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface DeliverableRowProps {
  deliverable: WPDraftDeliverable;
  formatNumber: (num: number) => string;
  participants: Participant[];
  monthOptions: number[];
  onUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly: boolean;
}

function DeliverableRow({
  deliverable,
  formatNumber,
  participants,
  monthOptions,
  onUpdate,
  onDelete,
  readOnly,
}: DeliverableRowProps) {
  const [localTitle, setLocalTitle] = useState(deliverable.title || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalTitle(deliverable.title || '');
  }, [deliverable.title]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);

    if (titleTimeout) clearTimeout(titleTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(deliverable.id, { title: newValue });
    }, 500);
    setTitleTimeout(timeout);
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-sm text-muted-foreground">
        {formatNumber(deliverable.number)}
      </TableCell>
      <TableCell>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Deliverable title..."
          className="h-8"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell>
        <Select
          value={deliverable.type || ''}
          onValueChange={(value) => onUpdate(deliverable.id, { type: value })}
          disabled={readOnly}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {DELIVERABLE_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={deliverable.responsible_participant_id || ''}
          onValueChange={(value) => onUpdate(deliverable.id, { responsible_participant_id: value || null })}
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
        <Select
          value={deliverable.dissemination_level || 'PU'}
          onValueChange={(value) => onUpdate(deliverable.id, { dissemination_level: value })}
          disabled={readOnly}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DISSEMINATION_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={deliverable.due_month?.toString() || ''}
          onValueChange={(value) => onUpdate(deliverable.id, { due_month: value ? parseInt(value) : null })}
          disabled={readOnly}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="M" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m.toString()}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {!readOnly && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(deliverable.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
