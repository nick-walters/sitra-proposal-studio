import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useB31JustificationToggles, type B31JustificationToggles } from '@/hooks/useB31JustificationToggles';
import { toast } from 'sonner';

interface Props {
  proposalId: string;
  canEdit: boolean; // coordinator+
}

const OPTIONS: Array<{ key: keyof B31JustificationToggles; label: string; hint: string }> = [
  { key: 'equipment_all',       label: 'C.2 — Include all equipment costs',     hint: 'By default Table C.2 only lists participants whose equipment costs exceed 15% of their personnel costs (the "major equipment" rule). Tick to include every participant with equipment cost items.' },
  { key: 'travel',              label: 'C.1 — Travel and subsistence',          hint: 'Adds a B3.1 cost-justification table with per-participant travel cost items.' },
  { key: 'other_goods',         label: 'C.3 — Other goods, works & services',   hint: 'Adds a B3.1 cost-justification table with per-participant other goods cost items.' },
  { key: 'fstp',                label: 'D.1 — Financial support to third parties', hint: 'Adds a B3.1 cost-justification table with per-participant FSTP cost items.' },
  { key: 'internally_invoiced', label: 'D.2 — Internally invoiced goods & services', hint: 'Adds a B3.1 cost-justification table with per-participant internally invoiced cost items.' },
];

export function B31OptionalJustificationsCard({ proposalId, canEdit }: Props) {
  const { toggles, setToggle } = useB31JustificationToggles(proposalId);

  const handleChange = async (key: keyof B31JustificationToggles, value: boolean) => {
    try {
      await setToggle(key, value);
    } catch (e: any) {
      toast.error(`Could not update setting: ${e.message || e}`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Optional cost-justification tables in B3.1</CardTitle>
        <CardDescription>
          B.1 (subcontracting) and C.2 (major equipment, when above the 15% threshold) appear in B3.1 automatically.
          Coordinators can opt to also include the tables below — each will be sourced live from the per-participant cost items.
          Tables appear in B3.1 in cost-category order (B, then C.2, C.1, C.3, D.1, D.2) and are numbered sequentially from Table 3.1.g onwards.
          {!canEdit && <span className="block mt-1 italic">Only coordinators can change these settings.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {OPTIONS.map(opt => (
          <div key={opt.key} className="flex items-start gap-3">
            <Checkbox
              id={`b31-opt-${opt.key}`}
              checked={toggles[opt.key]}
              disabled={!canEdit}
              onCheckedChange={(v) => handleChange(opt.key, v === true)}
              className="mt-0.5"
            />
            <Label htmlFor={`b31-opt-${opt.key}`} className="flex-1 cursor-pointer font-normal">
              <span className="font-medium">{opt.label}</span>
              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
            </Label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
