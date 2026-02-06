import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Building2, ExternalLink } from 'lucide-react';
import { Participant } from '@/types/proposal';

interface GEPSectionProps {
  participant: Participant;
  onUpdate: (field: string, value: unknown) => void;
  canEdit: boolean;
  showGEPSection: boolean;
}

// Extended participant fields for GEP (from database)
interface GEPFields {
  hasGenderEqualityPlan?: boolean | null;
  gepPublication?: boolean | null;
  gepDedicatedResources?: boolean | null;
  gepDataCollection?: boolean | null;
  gepTraining?: boolean | null;
  gepWorkLifeBalance?: boolean | null;
  gepGenderLeadership?: boolean | null;
  gepRecruitmentProgression?: boolean | null;
  gepResearchTeaching?: boolean | null;
  gepGenderViolence?: boolean | null;
}

export function GEPSection({
  participant,
  onUpdate,
  canEdit,
  showGEPSection,
}: GEPSectionProps) {
  if (!showGEPSection) return null;

  const gepFields = participant as unknown as GEPFields;
  const hasGEP = gepFields.hasGenderEqualityPlan;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Gender Equality Plan (GEP)
        </CardTitle>
        <CardDescription>
          Public bodies, higher education establishments, and research organisations 
          from EU Member States or Associated Countries must have a GEP in place.{' '}
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
      <CardContent className="space-y-6">
        {/* Main GEP Question */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            Does your organisation have a Gender Equality Plan?
          </Label>
          <RadioGroup
            value={hasGEP === true ? 'yes' : hasGEP === false ? 'no' : ''}
            onValueChange={(v) => onUpdate('hasGenderEqualityPlan', v === 'yes' ? true : v === 'no' ? false : null)}
            disabled={!canEdit}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="gep-yes" />
              <Label htmlFor="gep-yes" className="font-normal cursor-pointer">
                Yes
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="gep-no" />
              <Label htmlFor="gep-no" className="font-normal cursor-pointer">
                No
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* GEP Details (shown if Yes) */}
        {hasGEP === true && (
          <>
            {/* Building Blocks */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Minimum process-related requirements (building blocks)
              </Label>
              <p className="text-xs text-muted-foreground">
                Select which building blocks your GEP includes:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-publication"
                    checked={!!gepFields.gepPublication}
                    onCheckedChange={(checked) => onUpdate('gepPublication', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-publication" className="text-sm font-normal cursor-pointer leading-tight">
                    Publication: formal document published on the institution's website and signed by the top management
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-resources"
                    checked={!!gepFields.gepDedicatedResources}
                    onCheckedChange={(checked) => onUpdate('gepDedicatedResources', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-resources" className="text-sm font-normal cursor-pointer leading-tight">
                    Dedicated resources: commitment of resources and expertise in gender equality to implement the plan
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-data"
                    checked={!!gepFields.gepDataCollection}
                    onCheckedChange={(checked) => onUpdate('gepDataCollection', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-data" className="text-sm font-normal cursor-pointer leading-tight">
                    Data collection and monitoring: sex/gender disaggregated data on personnel and students, and annual reporting based on indicators
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-training"
                    checked={!!gepFields.gepTraining}
                    onCheckedChange={(checked) => onUpdate('gepTraining', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-training" className="text-sm font-normal cursor-pointer leading-tight">
                    Training: awareness-raising/training on gender equality and unconscious gender biases for staff and decision-makers
                  </Label>
                </div>
              </div>
            </div>

            {/* Content Areas */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Recommended content areas
              </Label>
              <p className="text-xs text-muted-foreground">
                Select which content areas your GEP addresses:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-worklife"
                    checked={!!gepFields.gepWorkLifeBalance}
                    onCheckedChange={(checked) => onUpdate('gepWorkLifeBalance', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-worklife" className="text-sm font-normal cursor-pointer leading-tight">
                    Work-life balance and organisational culture
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-leadership"
                    checked={!!gepFields.gepGenderLeadership}
                    onCheckedChange={(checked) => onUpdate('gepGenderLeadership', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-leadership" className="text-sm font-normal cursor-pointer leading-tight">
                    Gender balance in leadership and decision-making
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-recruitment"
                    checked={!!gepFields.gepRecruitmentProgression}
                    onCheckedChange={(checked) => onUpdate('gepRecruitmentProgression', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-recruitment" className="text-sm font-normal cursor-pointer leading-tight">
                    Gender equality in recruitment and career progression
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="gep-research"
                    checked={!!gepFields.gepResearchTeaching}
                    onCheckedChange={(checked) => onUpdate('gepResearchTeaching', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-research" className="text-sm font-normal cursor-pointer leading-tight">
                    Integration of the gender dimension into research and teaching content
                  </Label>
                </div>
                <div className="flex items-start space-x-2 sm:col-span-2">
                  <Checkbox
                    id="gep-violence"
                    checked={!!gepFields.gepGenderViolence}
                    onCheckedChange={(checked) => onUpdate('gepGenderViolence', !!checked)}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="gep-violence" className="text-sm font-normal cursor-pointer leading-tight">
                    Measures against gender-based violence including sexual harassment
                  </Label>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
