import { useEffect, useRef } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import type { PersonnelBreakdownItem } from '@/hooks/useBudgetRows';

interface Props {
  budgetRowId: string;
  totalPersonMonths: number;
  items: PersonnelBreakdownItem[];
  editable: boolean;
  onAdd: () => void;
  onUpdate: (id: string, field: 'category' | 'pmCount' | 'pmRate', value: string | number) => void;
  onDelete: (id: string) => void;
}

function formatPM(value: number): string {
  if (value === 0) return '0';
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function BudgetPersonnelBreakdown({
  budgetRowId,
  totalPersonMonths,
  items,
  editable,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const rows = items.filter(i => i.budgetRowId === budgetRowId);
  const totalPm = rows.reduce((s, i) => s + (i.pmCount || 0), 0);
  const totalCost = rows.reduce((s, i) => s + (i.pmCount || 0) * (i.pmRate || 0), 0);
  const weightedRate = totalPm > 0 ? totalCost / totalPm : 0;
  const undefinedPm = Math.round((totalPersonMonths - totalPm) * 100) / 100;
  const hasMismatch = rows.length > 0 && Math.abs(undefinedPm) > 0.001;

  // Ensure at least one row always exists
  const seededRef = useRef(false);
  useEffect(() => {
    if (!editable) return;
    if (rows.length === 0 && !seededRef.current) {
      seededRef.current = true;
      onAdd();
    }
    if (rows.length > 0) {
      seededRef.current = false;
    }
  }, [rows.length, editable, onAdd]);

  // Alert when staff effort total changes while rows exist
  const lastTotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastTotalRef.current === null) {
      lastTotalRef.current = totalPersonMonths;
      return;
    }
    if (lastTotalRef.current !== totalPersonMonths) {
      if (rows.length > 0) {
        toast.warning('Staff effort total has changed — please review the personnel rows below.');
      }
      lastTotalRef.current = totalPersonMonths;
    }
  }, [totalPersonMonths, rows.length]);

  // Alert on mismatch transition
  const mismatchRef = useRef(false);
  useEffect(() => {
    if (hasMismatch && !mismatchRef.current) {
      toast.error('Personnel PMs don\u2019t add up to the staff effort total.');
    }
    mismatchRef.current = hasMismatch;
  }, [hasMismatch]);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground italic flex-1">
          Add one row per staff member or category. The total row below calculates the average weighted PM rate from each category's rate and share of total PMs — this is the rate used in all downstream calculations. Total PMs across rows should match the staff effort table ({formatPM(totalPersonMonths)}).
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAdd}
          disabled={!editable}
          className="shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add row
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-bold px-2 py-1.5">Personnel category (optional staff name in brackets)</th>
              <th className="text-right font-bold px-2 py-1.5 w-[130px]">PM rate (&euro;)</th>
              <th className="text-right font-bold px-2 py-1.5 w-[90px]">PMs</th>
              <th className="text-right font-bold px-2 py-1.5 w-[130px]">Cost</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map(item => (
              <tr key={item.id} className="border-t">
                <td className="px-2 py-1">
                  <Input
                    value={item.category}
                    onChange={(e) => onUpdate(item.id, 'category', e.target.value)}
                    disabled={!editable}
                    placeholder="e.g. Senior researcher (J. Smith)"
                    className="h-7 text-sm"
                  />
                </td>
                <td className="px-2 py-1">
                  <FormattedNumberInput
                    value={item.pmRate}
                    onChange={(v) => onUpdate(item.id, 'pmRate', v)}
                    disabled={!editable}
                    decimals={2}
                    className="h-7 text-sm text-right"
                  />
                </td>
                <td className="px-2 py-1">
                  <FormattedNumberInput
                    value={item.pmCount}
                    onChange={(v) => onUpdate(item.id, 'pmCount', v)}
                    disabled={!editable}
                    decimals={1}
                    className="h-7 text-sm text-right"
                  />
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-sm">
                  {formatCurrency((item.pmCount || 0) * (item.pmRate || 0))}
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    disabled={!editable || rows.length <= 1}
                    className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40"
                    title={rows.length <= 1 ? 'At least one row is required' : 'Delete row'}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </td>
              </tr>
            ))}
            {hasMismatch && (
              <tr className="border-t bg-destructive/5">
                <td className="px-2 py-1 font-semibold text-destructive">Undefined!</td>
                <td className="px-2 py-1" />
                <td className="pl-2 pr-3 py-1 text-right tabular-nums font-semibold text-destructive">{formatPM(undefinedPm)}</td>
                <td className="px-2 py-1" />
                <td />
              </tr>
            )}
            <tr className="border-t bg-muted/30">
              <td className="px-2 py-1 font-semibold">Total PMs &amp; average weighted PM rate</td>
              <td className="pl-2 pr-3 py-1 text-right tabular-nums font-semibold">{formatNumber(weightedRate, 2)}</td>
              <td className="pl-2 pr-3 py-1 text-right tabular-nums font-semibold">{formatNumber(totalPm, 1)}</td>
              <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatCurrency(totalCost)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {hasMismatch && (
        <Alert className="border-destructive/50 bg-destructive/5 py-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive text-xs">
            Personnel PMs ({formatPM(totalPm)}) don’t add up to the staff effort total ({formatPM(totalPersonMonths)}). Adjust the rows so the numbers match.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
