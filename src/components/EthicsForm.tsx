import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

// Extended ethics assessment interface for full proposals
export interface EthicsAssessment {
  id?: string;
  proposalId: string;
  // Section 1: Human Embryonic Stem Cells
  humanEmbryonicStemCells?: boolean | null;
  humanEmbryonicStemCellsPage?: string;
  // Section 2: Humans
  humanParticipants?: boolean | null;
  humanParticipantsPage?: string;
  humanVolunteersNonMedical?: boolean | null;
  humanVolunteersNonMedicalPage?: string;
  humanVolunteersMedical?: boolean | null;
  humanVolunteersMedicalPage?: string;
  humanPatients?: boolean | null;
  humanPatientsPage?: string;
  humanVulnerable?: boolean | null;
  humanVulnerablePage?: string;
  humanChildren?: boolean | null;
  humanChildrenPage?: string;
  humanUnableConsent?: boolean | null;
  humanUnableConsentPage?: string;
  humanInterventions?: boolean | null;
  humanInterventionsPage?: string;
  humanInvasive?: boolean | null;
  humanInvasivePage?: string;
  humanBiologicalSamples?: boolean | null;
  humanBiologicalSamplesPage?: string;
  clinicalStudy?: boolean | null;
  clinicalStudyPage?: string;
  clinicalTrial?: boolean | null;
  clinicalTrialPage?: string;
  lowInterventionTrial?: boolean | null;
  lowInterventionTrialPage?: string;
  // Section 3: Human Cells/Tissues
  humanCells?: boolean | null;
  humanCellsPage?: string;
  humanCellsCommercial?: boolean | null;
  humanCellsCommercialPage?: string;
  humanCellsEuApproved?: boolean | null;
  humanCellsEuApprovedPage?: string;
  humanCellsNonEu?: boolean | null;
  humanCellsNonEuPage?: string;
  humanEmbryos?: boolean | null;
  humanEmbryosPage?: string;
  humanFoetalTissue?: boolean | null;
  humanFoetalTissuePage?: string;
  // Section 4: Personal Data
  personalData?: boolean | null;
  personalDataPage?: string;
  personalDataSpecialCategories?: boolean | null;
  personalDataSpecialCategoriesPage?: string;
  personalDataGenetic?: boolean | null;
  personalDataGeneticPage?: string;
  personalDataProfiling?: boolean | null;
  personalDataProfilingPage?: string;
  personalDataPreviouslyCollected?: boolean | null;
  personalDataPreviouslyCollectedPage?: string;
  personalDataExportNonEu?: boolean | null;
  personalDataExportNonEuPage?: string;
  personalDataExportNonEuDetails?: string;
  personalDataImportNonEu?: boolean | null;
  personalDataImportNonEuPage?: string;
  personalDataImportNonEuDetails?: string;
  personalDataCriminal?: boolean | null;
  personalDataCriminalPage?: string;
  // Section 5: Animals
  animals?: boolean | null;
  animalsPage?: string;
  animalsVertebrates?: boolean | null;
  animalsVertebratesPage?: string;
  animalsNonHumanPrimates?: boolean | null;
  animalsNonHumanPrimatesPage?: string;
  animalsTransgenic?: boolean | null;
  animalsTransgenicPage?: string;
  animalsCloned?: boolean | null;
  animalsClonedPage?: string;
  animalsEndangered?: boolean | null;
  animalsEndangeredPage?: string;
  // Section 6: Non-EU Countries
  nonEuCountries?: boolean | null;
  nonEuCountriesPage?: string;
  nonEuCountriesLmic?: boolean | null;
  nonEuCountriesLmicPage?: string;
  nonEuCountriesLocalEthics?: boolean | null;
  nonEuCountriesLocalEthicsPage?: string;
  nonEuCountriesGeneticResources?: boolean | null;
  nonEuCountriesGeneticResourcesPage?: string;
  // Section 7: Environment, Health & Safety
  environmentHealth?: boolean | null;
  environmentHealthPage?: string;
  environmentHealthGmo?: boolean | null;
  environmentHealthGmoPage?: string;
  environmentHealthHarmful?: boolean | null;
  environmentHealthHarmfulPage?: string;
  environmentHealthNanoparticles?: boolean | null;
  environmentHealthNanoparticlesPage?: string;
  // Section 8: Artificial Intelligence
  artificialIntelligence?: boolean | null;
  artificialIntelligencePage?: string;
  aiHumanOversight?: boolean | null;
  aiHumanOversightPage?: string;
  aiTransparency?: boolean | null;
  aiTransparencyPage?: string;
  aiBias?: boolean | null;
  aiBiasPage?: string;
  // Section 9: Other Ethics Issues
  dualUse?: boolean | null;
  dualUsePage?: string;
  misuse?: boolean | null;
  misusePage?: string;
  otherEthics?: boolean | null;
  otherEthicsPage?: string;
  otherEthicsDetails?: string;
}

interface EthicsFormProps {
  ethics: EthicsAssessment | null;
  onUpdateEthics: (updates: Partial<EthicsAssessment>) => void;
  canEdit: boolean;
}

// Define the structure for ethics sections with sub-questions
interface EthicsQuestion {
  id: keyof EthicsAssessment;
  pageId: keyof EthicsAssessment;
  label: string;
  indent?: number;
  parentId?: keyof EthicsAssessment;
  detailsId?: keyof EthicsAssessment; // For questions needing text input
  detailsPlaceholder?: string;
}

interface EthicsSection {
  id: string;
  number: number;
  title: string;
  questions: EthicsQuestion[];
}

const ETHICS_SECTIONS: EthicsSection[] = [
  {
    id: 'hesc',
    number: 1,
    title: 'HUMAN EMBRYONIC STEM CELLS',
    questions: [
      {
        id: 'humanEmbryonicStemCells',
        pageId: 'humanEmbryonicStemCellsPage',
        label: 'Does this activity involve Human Embryonic Stem Cells (hESCs)?',
      },
    ],
  },
  {
    id: 'humans',
    number: 2,
    title: 'HUMANS',
    questions: [
      {
        id: 'humanParticipants',
        pageId: 'humanParticipantsPage',
        label: 'Does this activity involve human participants?',
      },
      {
        id: 'humanVolunteersNonMedical',
        pageId: 'humanVolunteersNonMedicalPage',
        label: 'Are they volunteers for non-medical studies (e.g. social or human sciences research)?',
        indent: 1,
        parentId: 'humanParticipants',
      },
      {
        id: 'humanVolunteersMedical',
        pageId: 'humanVolunteersMedicalPage',
        label: 'Are they healthy volunteers for medical studies?',
        indent: 1,
        parentId: 'humanParticipants',
      },
      {
        id: 'humanPatients',
        pageId: 'humanPatientsPage',
        label: 'Are they patients for medical studies?',
        indent: 1,
        parentId: 'humanParticipants',
      },
      {
        id: 'humanVulnerable',
        pageId: 'humanVulnerablePage',
        label: 'Are they potentially vulnerable individuals or groups?',
        indent: 1,
        parentId: 'humanParticipants',
      },
      {
        id: 'humanChildren',
        pageId: 'humanChildrenPage',
        label: 'Are they children/minors?',
        indent: 1,
        parentId: 'humanParticipants',
      },
      {
        id: 'humanUnableConsent',
        pageId: 'humanUnableConsentPage',
        label: 'Are they other persons unable to give informed consent?',
        indent: 1,
        parentId: 'humanParticipants',
      },
      {
        id: 'humanInterventions',
        pageId: 'humanInterventionsPage',
        label: 'Does this activity involve interventions (physical also including imaging technology, behavioural treatments, etc.) on the study participants?',
      },
      {
        id: 'humanInvasive',
        pageId: 'humanInvasivePage',
        label: 'Does it involve invasive techniques?',
        indent: 1,
        parentId: 'humanInterventions',
      },
      {
        id: 'humanBiologicalSamples',
        pageId: 'humanBiologicalSamplesPage',
        label: 'Does it involve collection of biological samples?',
        indent: 1,
        parentId: 'humanInterventions',
      },
      {
        id: 'clinicalStudy',
        pageId: 'clinicalStudyPage',
        label: 'Does this activity involve conducting a clinical study as defined by the Clinical Trial Regulation (EU 536/2014)?',
      },
      {
        id: 'clinicalTrial',
        pageId: 'clinicalTrialPage',
        label: 'Is it a clinical trial?',
        indent: 1,
        parentId: 'clinicalStudy',
      },
      {
        id: 'lowInterventionTrial',
        pageId: 'lowInterventionTrialPage',
        label: 'Is it a low-intervention clinical trial?',
        indent: 1,
        parentId: 'clinicalStudy',
      },
    ],
  },
  {
    id: 'humanCells',
    number: 3,
    title: 'HUMAN CELLS / TISSUES',
    questions: [
      {
        id: 'humanCells',
        pageId: 'humanCellsPage',
        label: 'Does this activity involve human cells or tissues (other than hESCs)?',
      },
      {
        id: 'humanCellsCommercial',
        pageId: 'humanCellsCommercialPage',
        label: 'Are they available commercially?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanCellsEuApproved',
        pageId: 'humanCellsEuApprovedPage',
        label: 'Are they obtained from a tissue bank/biobank operating under EU or national ethics approval?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanCellsNonEu',
        pageId: 'humanCellsNonEuPage',
        label: 'Are they obtained from non-EU countries?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanEmbryos',
        pageId: 'humanEmbryosPage',
        label: 'Does this activity involve the use of human embryos?',
      },
      {
        id: 'humanFoetalTissue',
        pageId: 'humanFoetalTissuePage',
        label: 'Does this activity involve the use of human foetal tissues / cells?',
      },
    ],
  },
  {
    id: 'personalData',
    number: 4,
    title: 'PERSONAL DATA',
    questions: [
      {
        id: 'personalData',
        pageId: 'personalDataPage',
        label: 'Does this activity involve processing of personal data?',
      },
      {
        id: 'personalDataSpecialCategories',
        pageId: 'personalDataSpecialCategoriesPage',
        label: 'Does it involve the processing of special categories of personal data (e.g. sexual lifestyle, ethnicity, genetic, biometric and health data, political opinion, religious or philosophical beliefs)?',
        indent: 1,
        parentId: 'personalData',
      },
      {
        id: 'personalDataGenetic',
        pageId: 'personalDataGeneticPage',
        label: 'Does it involve processing of genetic, biometric or health data?',
        indent: 2,
        parentId: 'personalDataSpecialCategories',
      },
      {
        id: 'personalDataProfiling',
        pageId: 'personalDataProfilingPage',
        label: 'Does it involve profiling, systematic monitoring of individuals, or processing of large scale of special categories of data or intrusive methods of data processing (such as surveillance, geolocation tracking etc.)?',
        indent: 1,
        parentId: 'personalData',
      },
      {
        id: 'personalDataPreviouslyCollected',
        pageId: 'personalDataPreviouslyCollectedPage',
        label: 'Does this activity involve further processing of previously collected personal data (including use of pre-existing data sets or sources, merging existing data sets)?',
      },
      {
        id: 'personalDataExportNonEu',
        pageId: 'personalDataExportNonEuPage',
        label: 'Is it planned to export personal data from the EU to non-EU countries?',
        detailsId: 'personalDataExportNonEuDetails',
        detailsPlaceholder: 'Specify the type of personal data and countries involved...',
      },
      {
        id: 'personalDataImportNonEu',
        pageId: 'personalDataImportNonEuPage',
        label: 'Is it planned to import personal data from non-EU countries into the EU or from a non-EU country to another non-EU country?',
        detailsId: 'personalDataImportNonEuDetails',
        detailsPlaceholder: 'Specify the type of personal data and countries involved...',
      },
      {
        id: 'personalDataCriminal',
        pageId: 'personalDataCriminalPage',
        label: 'Does this activity involve the processing of personal data related to criminal convictions or offences?',
      },
    ],
  },
  {
    id: 'animals',
    number: 5,
    title: 'ANIMALS',
    questions: [
      {
        id: 'animals',
        pageId: 'animalsPage',
        label: 'Does this activity involve animals?',
      },
      {
        id: 'animalsVertebrates',
        pageId: 'animalsVertebratesPage',
        label: 'Are they vertebrates?',
        indent: 1,
        parentId: 'animals',
      },
      {
        id: 'animalsNonHumanPrimates',
        pageId: 'animalsNonHumanPrimatesPage',
        label: 'Are they non-human primates (NHP)?',
        indent: 1,
        parentId: 'animals',
      },
      {
        id: 'animalsTransgenic',
        pageId: 'animalsTransgenicPage',
        label: 'Are they genetically modified animals?',
        indent: 1,
        parentId: 'animals',
      },
      {
        id: 'animalsCloned',
        pageId: 'animalsClonedPage',
        label: 'Are they cloned farm animals?',
        indent: 1,
        parentId: 'animals',
      },
      {
        id: 'animalsEndangered',
        pageId: 'animalsEndangeredPage',
        label: 'Are they endangered species?',
        indent: 1,
        parentId: 'animals',
      },
    ],
  },
  {
    id: 'nonEu',
    number: 6,
    title: 'NON-EU COUNTRIES',
    questions: [
      {
        id: 'nonEuCountries',
        pageId: 'nonEuCountriesPage',
        label: 'Is some of the research carried out in non-EU countries?',
      },
      {
        id: 'nonEuCountriesLmic',
        pageId: 'nonEuCountriesLmicPage',
        label: 'Is it carried out in a low or lower-middle income country (LMIC)?',
        indent: 1,
        parentId: 'nonEuCountries',
      },
      {
        id: 'nonEuCountriesLocalEthics',
        pageId: 'nonEuCountriesLocalEthicsPage',
        label: 'Is any material imported from non-EU countries?',
        indent: 1,
        parentId: 'nonEuCountries',
      },
      {
        id: 'nonEuCountriesGeneticResources',
        pageId: 'nonEuCountriesGeneticResourcesPage',
        label: 'Is it planned to use local resources (genetic, animal, plant, etc.)?',
        indent: 1,
        parentId: 'nonEuCountries',
      },
    ],
  },
  {
    id: 'environment',
    number: 7,
    title: 'ENVIRONMENT, HEALTH & SAFETY',
    questions: [
      {
        id: 'environmentHealth',
        pageId: 'environmentHealthPage',
        label: 'Does this activity involve activities or results that may have an impact on the environment, health and safety?',
      },
      {
        id: 'environmentHealthGmo',
        pageId: 'environmentHealthGmoPage',
        label: 'Does it involve the use of genetically modified organisms (GMOs)?',
        indent: 1,
        parentId: 'environmentHealth',
      },
      {
        id: 'environmentHealthHarmful',
        pageId: 'environmentHealthHarmfulPage',
        label: 'Does it involve the use of elements that may cause harm to humans, including research staff?',
        indent: 1,
        parentId: 'environmentHealth',
      },
      {
        id: 'environmentHealthNanoparticles',
        pageId: 'environmentHealthNanoparticlesPage',
        label: 'Does it involve the use of nanomaterials/nanoparticles?',
        indent: 1,
        parentId: 'environmentHealth',
      },
    ],
  },
  {
    id: 'ai',
    number: 8,
    title: 'ARTIFICIAL INTELLIGENCE',
    questions: [
      {
        id: 'artificialIntelligence',
        pageId: 'artificialIntelligencePage',
        label: 'Does this activity involve developing and/or using artificial intelligence (AI)?',
      },
      {
        id: 'aiHumanOversight',
        pageId: 'aiHumanOversightPage',
        label: 'Could the AI present risks of discrimination, biased outcomes, or lack of human oversight?',
        indent: 1,
        parentId: 'artificialIntelligence',
      },
      {
        id: 'aiTransparency',
        pageId: 'aiTransparencyPage',
        label: 'Could there be issues of transparency or explainability?',
        indent: 1,
        parentId: 'artificialIntelligence',
      },
      {
        id: 'aiBias',
        pageId: 'aiBiasPage',
        label: 'Could there be issues of bias in data/algorithms?',
        indent: 1,
        parentId: 'artificialIntelligence',
      },
    ],
  },
  {
    id: 'other',
    number: 9,
    title: 'OTHER ETHICS ISSUES',
    questions: [
      {
        id: 'dualUse',
        pageId: 'dualUsePage',
        label: 'Does this activity have the potential for misuse of research results (dual use)?',
      },
      {
        id: 'misuse',
        pageId: 'misusePage',
        label: 'Is there potential for malevolent/criminal/terrorist abuse of the research results?',
      },
      {
        id: 'otherEthics',
        pageId: 'otherEthicsPage',
        label: 'Are there any other ethics issues that should be taken into consideration?',
        detailsId: 'otherEthicsDetails',
        detailsPlaceholder: 'Please specify the ethics issues...',
      },
    ],
  },
];

// Component for a single ethics question row
function EthicsQuestionRow({
  question,
  value,
  pageValue,
  detailsValue,
  onChange,
  onPageChange,
  onDetailsChange,
  canEdit,
  isVisible,
}: {
  question: EthicsQuestion;
  value: boolean | null | undefined;
  pageValue: string | undefined;
  detailsValue?: string;
  onChange: (value: boolean | null) => void;
  onPageChange: (value: string) => void;
  onDetailsChange?: (value: string) => void;
  canEdit: boolean;
  isVisible: boolean;
}) {
  if (!isVisible) return null;

  const indent = question.indent || 0;

  return (
    <>
      <div 
        className={cn(
          "grid grid-cols-[1fr,auto,auto,80px] gap-2 items-start py-2 border-b border-border/50",
          indent > 0 && "bg-muted/30"
        )}
      >
        {/* Question text */}
        <div className={cn("text-sm", indent > 0 && `pl-${indent * 6}`)}>
          <span style={{ paddingLeft: `${indent * 24}px` }}>
            {indent > 0 && <span className="text-muted-foreground mr-1">↳</span>}
            {question.label}
          </span>
        </div>

        {/* Yes/No Radio Group */}
        <RadioGroup
          value={value === true ? 'yes' : value === false ? 'no' : ''}
          onValueChange={(v) => onChange(v === 'yes' ? true : v === 'no' ? false : null)}
          className="flex items-center gap-4"
          disabled={!canEdit}
        >
          <div className="flex items-center space-x-1">
            <RadioGroupItem value="yes" id={`${question.id}-yes`} className="h-4 w-4" />
            <Label htmlFor={`${question.id}-yes`} className="text-xs font-normal cursor-pointer">
              Yes
            </Label>
          </div>
          <div className="flex items-center space-x-1">
            <RadioGroupItem value="no" id={`${question.id}-no`} className="h-4 w-4" />
            <Label htmlFor={`${question.id}-no`} className="text-xs font-normal cursor-pointer">
              No
            </Label>
          </div>
        </RadioGroup>

        {/* Page reference input */}
        <Input
          value={pageValue || ''}
          onChange={(e) => onPageChange(e.target.value)}
          placeholder="Page"
          className="h-7 w-16 text-xs px-2"
          disabled={!canEdit || value !== true}
        />

        {/* Status indicator */}
        <div className="flex justify-center">
          {value === true && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/50 text-[10px] h-5">
              Yes
            </Badge>
          )}
        </div>
      </div>

      {/* Details input if applicable */}
      {question.detailsId && value === true && (
        <div className="py-2 pl-8 pr-4 bg-muted/20 border-b border-border/50">
          <Input
            value={detailsValue || ''}
            onChange={(e) => onDetailsChange?.(e.target.value)}
            placeholder={question.detailsPlaceholder || 'Please specify...'}
            className="h-8 text-xs"
            disabled={!canEdit}
          />
        </div>
      )}
    </>
  );
}

export function EthicsForm({ ethics, onUpdateEthics, canEdit }: EthicsFormProps) {
  const ethicsData: EthicsAssessment = ethics || { proposalId: '' };

  // Count total "Yes" answers
  const issuesCount = ETHICS_SECTIONS.reduce((count, section) => {
    return count + section.questions.filter(q => ethicsData[q.id] === true).length;
  }, 0);

  // Helper to check if a child question should be visible (parent must be "Yes")
  const isQuestionVisible = (question: EthicsQuestion): boolean => {
    if (!question.parentId) return true;
    return ethicsData[question.parentId] === true;
  };

  const handleValueChange = (questionId: keyof EthicsAssessment, value: boolean | null) => {
    onUpdateEthics({ [questionId]: value });
  };

  const handlePageChange = (pageId: keyof EthicsAssessment, value: string) => {
    onUpdateEthics({ [pageId]: value });
  };

  const handleDetailsChange = (detailsId: keyof EthicsAssessment, value: string) => {
    onUpdateEthics({ [detailsId]: value });
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-6">
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
                <h4 className="font-medium text-sm text-primary mb-1">Ethics Issues Table</h4>
                <p className="text-sm text-muted-foreground">
                  Complete the ethics self-assessment by answering all applicable questions. 
                  For each "Yes" answer, provide the page number in Part B where the issue is addressed. 
                  Sub-questions only appear when the parent question is answered "Yes".
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ethics Sections */}
        {ETHICS_SECTIONS.map((section) => {
          const sectionHasIssues = section.questions.some(q => ethicsData[q.id] === true);
          
          return (
            <Card key={section.id} className={cn(sectionHasIssues && 'border-warning/50')}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
                    {section.number}. {section.title}
                  </h3>
                  {sectionHasIssues && (
                    <AlertTriangle className="w-4 h-4 text-warning" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Table header */}
                <div className="grid grid-cols-[1fr,auto,auto,80px] gap-2 items-center py-2 border-b-2 border-border text-xs font-medium text-muted-foreground">
                  <div>Question</div>
                  <div className="w-24 text-center">Answer</div>
                  <div className="w-16 text-center">Page</div>
                  <div className="w-20 text-center">Status</div>
                </div>

                {/* Questions */}
                {section.questions.map((question) => (
                  <EthicsQuestionRow
                    key={question.id}
                    question={question}
                    value={ethicsData[question.id] as boolean | null | undefined}
                    pageValue={ethicsData[question.pageId] as string | undefined}
                    detailsValue={question.detailsId ? (ethicsData[question.detailsId] as string | undefined) : undefined}
                    onChange={(value) => handleValueChange(question.id, value)}
                    onPageChange={(value) => handlePageChange(question.pageId, value)}
                    onDetailsChange={question.detailsId ? (value) => handleDetailsChange(question.detailsId!, value) : undefined}
                    canEdit={canEdit}
                    isVisible={isQuestionVisible(question)}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* Summary note */}
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <CardDescription className="text-xs">
              <strong>Note:</strong> If you answered "Yes" to any of the questions above, you must address the ethics issues 
              in Section 5 of Part B (Ethics and Security). The page numbers should refer to where each issue is discussed 
              in your proposal.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
