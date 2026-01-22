import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Shield } from 'lucide-react';

interface EthicsAssessment {
  id?: string;
  proposalId: string;
  humanSubjects: boolean;
  humanSubjectsDetails?: string;
  personalData: boolean;
  personalDataDetails?: string;
  animals: boolean;
  animalsDetails?: string;
  humanCells: boolean;
  humanCellsDetails?: string;
  thirdCountries: boolean;
  thirdCountriesDetails?: string;
  environment: boolean;
  environmentDetails?: string;
  dualUse: boolean;
  dualUseDetails?: string;
  misuse: boolean;
  misuseDetails?: string;
  otherEthics: boolean;
  otherEthicsDetails?: string;
}

interface EthicsFormProps {
  ethics: EthicsAssessment | null;
  onUpdateEthics: (updates: Partial<EthicsAssessment>) => void;
  canEdit: boolean;
}

const ETHICS_QUESTIONS = [
  {
    id: 'humanSubjects',
    detailsId: 'humanSubjectsDetails',
    label: 'Human participants',
    description: 'Does the research involve human participants (including surveys, interviews, clinical trials)?',
    guidance: 'If yes, provide details about informed consent procedures, participant recruitment, and ethical approval.',
  },
  {
    id: 'personalData',
    detailsId: 'personalDataDetails',
    label: 'Personal data',
    description: 'Does the research involve the collection or processing of personal data?',
    guidance: 'If yes, describe data protection measures, GDPR compliance, and data management plans.',
  },
  {
    id: 'animals',
    detailsId: 'animalsDetails',
    label: 'Animals',
    description: 'Does the research involve animals?',
    guidance: 'If yes, provide details about animal species, numbers, and procedures for minimizing suffering.',
  },
  {
    id: 'humanCells',
    detailsId: 'humanCellsDetails',
    label: 'Human cells/tissues',
    description: 'Does the research involve human embryos, foetuses, human cells, or tissues?',
    guidance: 'If yes, describe the source of materials and ethical approvals obtained.',
  },
  {
    id: 'thirdCountries',
    detailsId: 'thirdCountriesDetails',
    label: 'Third countries',
    description: 'Does the research involve third countries, including low/middle-income countries?',
    guidance: 'If yes, describe measures to ensure ethical compliance and benefit-sharing.',
  },
  {
    id: 'environment',
    detailsId: 'environmentDetails',
    label: 'Environment & health',
    description: 'Could the research have negative impacts on the environment or human health?',
    guidance: 'If yes, describe risk mitigation measures and environmental safeguards.',
  },
  {
    id: 'dualUse',
    detailsId: 'dualUseDetails',
    label: 'Dual use',
    description: 'Does the research have potential for dual-use (civilian and military applications)?',
    guidance: 'If yes, describe export control considerations and security measures.',
  },
  {
    id: 'misuse',
    detailsId: 'misuseDetails',
    label: 'Misuse',
    description: 'Could the research results be misused for harmful purposes?',
    guidance: 'If yes, describe measures to prevent misuse and responsible research practices.',
  },
  {
    id: 'otherEthics',
    detailsId: 'otherEthicsDetails',
    label: 'Other ethics issues',
    description: 'Are there any other ethics issues not covered above?',
    guidance: 'If yes, describe the issues and how they will be addressed.',
  },
];

export function EthicsForm({ ethics, onUpdateEthics, canEdit }: EthicsFormProps) {
  const ethicsData = ethics || {
    proposalId: '',
    humanSubjects: false,
    personalData: false,
    animals: false,
    humanCells: false,
    thirdCountries: false,
    environment: false,
    dualUse: false,
    misuse: false,
    otherEthics: false,
  };

  const issuesCount = ETHICS_QUESTIONS.filter(
    (q) => ethicsData[q.id as keyof typeof ethicsData] === true
  ).length;

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Part A4: Ethics self-assessment</h1>
          <Badge
            variant={issuesCount > 0 ? 'destructive' : 'default'}
            className="gap-2 px-3 py-1.5"
          >
            {issuesCount > 0 ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                {issuesCount} issue{issuesCount !== 1 ? 's' : ''} identified
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                No issues identified
              </>
            )}
          </Badge>
        </div>

        {/* Info Card */}
        <Card className="bg-accent/50 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-medium text-sm text-primary mb-1">Important</h4>
                <p className="text-sm text-muted-foreground">
                  Please answer all questions carefully. If you answer "Yes" to any question, 
                  you must provide details in the corresponding text field. All partners can 
                  edit this section. Ethics issues identified here will require additional 
                  documentation in the ethics deliverables.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ethics Questions */}
        <div className="space-y-4">
          {ETHICS_QUESTIONS.map((question) => {
            const isChecked = ethicsData[question.id as keyof typeof ethicsData] as boolean;
            const details = ethicsData[question.detailsId as keyof typeof ethicsData] as string | undefined;

            return (
              <Card key={question.id} className={isChecked ? 'border-warning/50' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      id={question.id}
                      checked={isChecked}
                      onCheckedChange={(checked) =>
                        onUpdateEthics({ [question.id]: !!checked })
                      }
                      disabled={!canEdit}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label htmlFor={question.id} className="text-base font-medium cursor-pointer">
                        {question.label}
                      </Label>
                      <CardDescription className="mt-1">{question.description}</CardDescription>
                    </div>
                    {isChecked && (
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/50">
                        Yes
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                {isChecked && (
                  <CardContent className="pt-0">
                    <div className="ml-8 space-y-2">
                      <p className="text-xs text-muted-foreground">{question.guidance}</p>
                      <Textarea
                        value={details || ''}
                        onChange={(e) =>
                          onUpdateEthics({ [question.detailsId]: e.target.value })
                        }
                        placeholder="Provide details..."
                        disabled={!canEdit}
                        rows={3}
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
