import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WPDraftRisk } from '@/hooks/useWPDrafts';

interface WPRisksTableProps {
  wpNumber: number;
  risks: WPDraftRisk[];
  onRiskUpdate: (id: string, updates: Partial<WPDraftRisk>) => Promise<boolean>;
  onRiskAdd: () => Promise<any>;
  onRiskDelete: (id: string) => Promise<boolean>;
  readOnly?: boolean;
}

const RISK_LEVELS = [
  { value: 'H', label: 'High', color: 'text-red-600 bg-red-50' },
  { value: 'M', label: 'Medium', color: 'text-amber-600 bg-amber-50' },
  { value: 'L', label: 'Low', color: 'text-green-600 bg-green-50' },
];

function getRiskLevelColor(level: string | null): string {
  const found = RISK_LEVELS.find(l => l.value === level);
  return found?.color || '';
}

export function WPRisksTable({
  wpNumber,
  risks,
  onRiskUpdate,
  onRiskAdd,
  onRiskDelete,
  readOnly = false,
}: WPRisksTableProps) {
  const formatRiskNumber = (num: number) => `R${wpNumber}.${num}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          Risks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Risk #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px]">Likelih.</TableHead>
                <TableHead className="w-[80px]">Severity</TableHead>
                <TableHead className="w-[200px]">Mitigation</TableHead>
                {!readOnly && <TableHead className="w-[40px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.map((risk) => (
                <RiskRow
                  key={risk.id}
                  risk={risk}
                  formatNumber={formatRiskNumber}
                  onUpdate={onRiskUpdate}
                  onDelete={onRiskDelete}
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
            onClick={onRiskAdd}
            className="mt-2"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Risk
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface RiskRowProps {
  risk: WPDraftRisk;
  formatNumber: (num: number) => string;
  onUpdate: (id: string, updates: Partial<WPDraftRisk>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly: boolean;
}

function RiskRow({
  risk,
  formatNumber,
  onUpdate,
  onDelete,
  readOnly,
}: RiskRowProps) {
  const [localTitle, setLocalTitle] = useState(risk.title || '');
  const [localMitigation, setLocalMitigation] = useState(risk.mitigation || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);
  const [mitigationTimeout, setMitigationTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalTitle(risk.title || '');
  }, [risk.title]);

  useEffect(() => {
    setLocalMitigation(risk.mitigation || '');
  }, [risk.mitigation]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);

    if (titleTimeout) clearTimeout(titleTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(risk.id, { title: newValue });
    }, 500);
    setTitleTimeout(timeout);
  };

  const handleMitigationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalMitigation(newValue);

    if (mitigationTimeout) clearTimeout(mitigationTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(risk.id, { mitigation: newValue });
    }, 500);
    setMitigationTimeout(timeout);
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-sm text-muted-foreground">
        {formatNumber(risk.number)}
      </TableCell>
      <TableCell>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Risk description..."
          className="h-8"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell>
        <Select
          value={risk.likelihood || ''}
          onValueChange={(value) => onUpdate(risk.id, { likelihood: value })}
          disabled={readOnly}
        >
          <SelectTrigger className={cn("h-8", getRiskLevelColor(risk.likelihood))}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {RISK_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={risk.severity || ''}
          onValueChange={(value) => onUpdate(risk.id, { severity: value })}
          disabled={readOnly}
        >
          <SelectTrigger className={cn("h-8", getRiskLevelColor(risk.severity))}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {RISK_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Textarea
          value={localMitigation}
          onChange={handleMitigationChange}
          placeholder="Mitigation strategy..."
          className="min-h-[60px] resize-y text-sm"
          disabled={readOnly}
        />
      </TableCell>
      {!readOnly && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(risk.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
