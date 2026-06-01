import { useEffect, useRef } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { formatCurrency } from '@/lib/formatNumber';
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

  // Alert when totals don't add up (debounced via mismatch transition)
  const mismatchRef = useRef(false);
  useEffect(() => {
    if (hasMismatch && !mismatchRef.current) {
      toast.error('Personnel PMs don\u2019t add up to the staff effort total.');
    }
    mismatchRef.current = hasMismatch;
  }, [hasMismatch]);

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Personnel breakdown</div>
          <p className="text-xs text-muted-foreground italic">
            Add one row per staff member or category for a precise weighted PM rate. If you add a single row, it is treated as the average weighted PM rate for the organisation. Total PMs across rows must match the staff effort table.
          </p>
        </div>
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

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No personnel rows yet — add at least one row to set the PM rate for this organisation.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium px-2 py-1.5">Personnel category (optional staff name in brackets)</th>
                <th className="text-right font-medium px-2 py-1.5 w-[90px]">PMs</th>
                <th className="text-right font-medium px-2 py-1.5 w-[130px]">PM rate (€)</th>
                <th className="text-right font-medium px-2 py-1.5 w-[130px]">Cost</th>
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
                      value={item.pmCount}
                      onChange={(v) => onUpdate(item.id, 'pmCount', v)}
                      disabled={!editable}
                      decimals={1}
                      className="h-7 text-sm text-right"
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
                  <td className="px-2 py-1 text-right tabular-nums text-sm">
                    {formatCurrency((item.pmCount || 0) * (item.pmRate || 0))}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      disabled={!editable}
                      className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </td>
                </tr>
              ))}
              {hasMismatch && (
                <tr className="border-t bg-destructive/5">
                  <td className="px-2 py-1 font-semibold text-destructive">Undefined!</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold text-destructive">{formatPM(undefinedPm)}</td>
                  <td className="px-2 py-1" />
                  <td className="px-2 py-1" />
                  <td />
                </tr>
              )}
              {rows.length > 1 && (
                <tr className="border-t bg-muted/30">
                  <td className="px-2 py-1 font-semibold">Total / weighted avg.</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatPM(totalPm)}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{weightedRate.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatCurrency(totalCost)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
