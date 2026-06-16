import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Building2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface GEPSectionProps {
  showGEPSection: boolean;
  hasGenderEqualityPlan?: boolean;
  onChangeHasGEP?: (value: boolean | null) => void;
  canEdit?: boolean;
}

export function GEPSection({ showGEPSection, hasGenderEqualityPlan, onChangeHasGEP, canEdit = true }: GEPSectionProps) {
  if (!showGEPSection) return null;

  const value = hasGenderEqualityPlan;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Gender Equality Plan (GEP)
        </CardTitle>
        <CardDescription>
          Public bodies, higher education establishments, and research organisations 
          from EU Member States or Associated countries must have a GEP in place.{' '}
          <a 
            href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/aga_en.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            See AGA Article 7 <ExternalLink className="w-3 h-3" />
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Yes/No status */}
        <div className="flex items-center justify-between gap-4 p-3 rounded-md border bg-muted/30">
          <Label className="text-sm font-medium">
            Does this organisation have a Gender Equality Plan in place?
          </Label>
          <RadioGroup
            value={value === true ? 'yes' : value === false ? 'no' : ''}
            onValueChange={(v) => onChangeHasGEP?.(v === 'yes' ? true : v === 'no' ? false : null)}
            className="flex items-center gap-4"
            disabled={!canEdit}
          >
            <div className="flex items-center space-x-1">
              <RadioGroupItem value="yes" id="gep-yes" className="h-4 w-4" />
              <Label htmlFor="gep-yes" className="text-xs font-normal cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center space-x-1">
              <RadioGroupItem value="no" id="gep-no" className="h-4 w-4" />
              <Label htmlFor="gep-no" className="text-xs font-normal cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Building Blocks */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            Minimum process-related requirements (building blocks)
          </h4>
          <p className="text-xs text-muted-foreground mb-2">
            Your GEP must include all of the following:
          </p>
          <ul className="space-y-1.5 text-sm text-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span><strong>Publication:</strong> formal document published on the institution's website and signed by the top management</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span><strong>Dedicated resources:</strong> commitment of resources and expertise in gender equality to implement the plan</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span><strong>Data collection and monitoring:</strong> sex/gender disaggregated data on personnel and students, and annual reporting based on indicators</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span><strong>Training:</strong> awareness-raising/training on gender equality and unconscious gender biases for staff and decision-makers</span>
            </li>
          </ul>
        </div>

        {/* Content Areas */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            Recommended content areas
          </h4>
          <p className="text-xs text-muted-foreground mb-2">
            Your GEP should also address:
          </p>
          <ul className="space-y-1.5 text-sm text-foreground">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
              Work-life balance and organisational culture
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
              Gender balance in leadership and decision-making
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
              Gender equality in recruitment and career progression
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
              Integration of the gender dimension into research and teaching content
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
              Measures against gender-based violence including sexual harassment
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
