import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useB31JustificationToggles, type B31JustificationToggles } from '@/hooks/useB31JustificationToggles';
import { useB31CostPresence } from '@/hooks/useB31CostPresence';
import { toast } from 'sonner';

interface Props {
  proposalId: string;
  canEdit: boolean;
}

function Row({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
  indent = 0,
  dimmed = false,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange?: (v: boolean) => void;
  indent?: number;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-start gap-3" style={{ paddingLeft: indent * 24 }}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange?.(v === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className={cn(
          'flex-1 font-normal',
          disabled ? 'cursor-default' : 'cursor-pointer',
          dimmed && 'opacity-50',
        )}
      >
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </Label>
    </div>
  );
}

export function B31OptionalJustificationsCard({ proposalId, canEdit }: Props) {
  const { toggles, setToggle } = useB31JustificationToggles(proposalId);
  const presence = useB31CostPresence(proposalId);

  const handle = async (key: keyof B31JustificationToggles, value: boolean) => {
    try { await setToggle(key, value); }
    catch (e: any) { toast.error(`Could not update setting: ${e.message || e}`); }
  };

  // ---- B. Subcontracting ----
  const bHasData = presence.subcontracting;
  const bChecked = bHasData; // forced on/off by data

  // ---- C. Purchase costs umbrella ----
  const cHasData = presence.travel || presence.equipment || presence.otherGoods;
  const c2ForcedOn = presence.equipmentAboveThreshold;
  // Umbrella effective: if any forced sub on, umbrella must be on
  const cUmbrellaForced = c2ForcedOn;
  const cChecked = cHasData && (cUmbrellaForced || toggles.purchase_costs);

  // ---- D. Other direct cost categories umbrella ----
  const dHasData = presence.fstp || presence.internallyInvoiced;
  const dChecked = dHasData && toggles.other_direct_costs;

  const lockedNote = !canEdit ? <span className="block mt-1 italic">Only coordinators can change these settings.</span> : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cost-justification tables in B3.1</CardTitle>
        <CardDescription>
          Tables are added to B3.1 in cost-category order and numbered sequentially from Table 3.1.g. Subcategories merge into a single table per group (Table 3.1.h for purchase costs, Table 3.1.i for other direct costs).
          {lockedNote}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ---- B ---- */}
        <Row
          id="b31-grp-b"
          label="B. Subcontracting costs"
          description={
            bHasData
              ? 'Subcontracting cost values have been entered, so Table 3.1.g (Subcontracting cost items) is automatically included in B3.1.'
              : 'No subcontracting cost values entered, so no subcontracting cost-justification table will be included in B3.1.'
          }
          checked={bChecked}
          disabled // always locked
          dimmed={!bHasData}
        />

        {/* ---- C ---- */}
        <div className="space-y-2">
          <Row
            id="b31-grp-c"
            label="C. Purchase costs"
            description={
              !cHasData
                ? 'No travel, equipment, or other-goods cost values entered, so no purchase-costs table will be included in B3.1.'
                : cUmbrellaForced
                  ? 'At least one participant\'s equipment costs exceed 15% of their personnel costs, so Table 3.1.h is automatically included.'
                  : 'Include Table 3.1.h (Purchase costs) in B3.1. Subcategories selected below are merged into one table with a Category column (Travel, Equipment, Other).'
            }
            checked={cChecked}
            disabled={!canEdit || !cHasData || cUmbrellaForced}
            onChange={(v) => handle('purchase_costs', v)}
            dimmed={!cHasData}
          />

          {cHasData && (
            <div className="space-y-2">
              {presence.travel && (
                <Row
                  id="b31-grp-c1"
                  label="C.1 Travel and subsistence"
                  description="Include travel and subsistence cost items in Table 3.1.h."
                  checked={cChecked && toggles.travel}
                  disabled={!canEdit || !cChecked}
                  onChange={(v) => handle('travel', v)}
                  indent={1}
                  dimmed={!cChecked}
                />
              )}
              {presence.equipment && (
                <>
                  <Row
                    id="b31-grp-c2"
                    label="C.2 Equipment"
                    description={
                      c2ForcedOn
                        ? 'Auto-included because at least one participant\'s equipment costs exceed 15% of their personnel costs.'
                        : 'Include equipment cost items in Table 3.1.h.'
                    }
                    checked={cChecked && (c2ForcedOn || toggles.equipment)}
                    disabled={!canEdit || !cChecked || c2ForcedOn}
                    onChange={(v) => handle('equipment', v)}
                    indent={1}
                    dimmed={!cChecked}
                  />
                  {presence.equipmentBelowThreshold && (
                    <Row
                      id="b31-grp-c2-all"
                      label="Include equipment costs below the 15% threshold"
                      description="By default only participants whose equipment costs exceed 15% of personnel costs are listed. Tick to include every participant with equipment cost items."
                      checked={cChecked && toggles.equipment_all}
                      disabled={!canEdit || !cChecked || !(c2ForcedOn || toggles.equipment)}
                      onChange={(v) => handle('equipment_all', v)}
                      indent={2}
                      dimmed={!cChecked || !(c2ForcedOn || toggles.equipment)}
                    />
                  )}
                </>
              )}
              {presence.otherGoods && (
                <Row
                  id="b31-grp-c3"
                  label="C.3 Other goods, works and services"
                  description="Include other-goods cost items in Table 3.1.h."
                  checked={cChecked && toggles.other_goods}
                  disabled={!canEdit || !cChecked}
                  onChange={(v) => handle('other_goods', v)}
                  indent={1}
                  dimmed={!cChecked}
                />
              )}
            </div>
          )}
        </div>

        {/* ---- D ---- */}
        <div className="space-y-2">
          <Row
            id="b31-grp-d"
            label="D. Other direct cost categories"
            description={
              !dHasData
                ? 'No FSTP or internally-invoiced cost values entered, so no other-direct-costs table will be included in B3.1.'
                : 'Include Table 3.1.i (Other direct cost categories) in B3.1. Subcategories selected below are merged into one table with a Category column (FSTP, Internally invoiced).'
            }
            checked={dChecked}
            disabled={!canEdit || !dHasData}
            onChange={(v) => handle('other_direct_costs', v)}
            dimmed={!dHasData}
          />
          {dHasData && (
            <div className="space-y-2">
              {presence.fstp && (
                <Row
                  id="b31-grp-d1"
                  label="D.1 FSTP"
                  description="Include financial-support-to-third-parties cost items in Table 3.1.i."
                  checked={dChecked && toggles.fstp}
                  disabled={!canEdit || !dChecked}
                  onChange={(v) => handle('fstp', v)}
                  indent={1}
                  dimmed={!dChecked}
                />
              )}
              {presence.internallyInvoiced && (
                <Row
                  id="b31-grp-d2"
                  label="D.2 Internally invoiced"
                  description="Include internally-invoiced goods & services cost items in Table 3.1.i."
                  checked={dChecked && toggles.internally_invoiced}
                  disabled={!canEdit || !dChecked}
                  onChange={(v) => handle('internally_invoiced', v)}
                  indent={1}
                  dimmed={!dChecked}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
