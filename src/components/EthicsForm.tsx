import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle, Shield, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';

// Extended ethics assessment interface for full proposals
export interface EthicsAssessment {
  id?: string;
  proposalId: string;
  // Section 1: Human Embryonic Stem Cells and Human Embryos
  humanEmbryonicStemCells?: boolean | null;
  humanEmbryonicStemCellsPage?: string;
  hescDerivedFromEmbryos?: boolean | null;
  hescDerivedFromEmbryosPage?: string;
  hescEstablishedLines?: boolean | null;
  hescEstablishedLinesPage?: string;
  hescEuropeanRegistry?: boolean | null;
  hescEuropeanRegistryPage?: string;
  humanEmbryosSection1?: boolean | null;
  humanEmbryosSection1Page?: string;
  humanEmbryosDestruction?: boolean | null;
  humanEmbryosDestructionPage?: string;
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
  humanCellsEmbryonicFoetal?: boolean | null;
  humanCellsEmbryonicFoetalPage?: string;
  humanCellsCommercial?: boolean | null;
  humanCellsCommercialPage?: string;
  humanCellsObtainedWithin?: boolean | null;
  humanCellsObtainedWithinPage?: string;
  humanCellsObtainedOther?: boolean | null;
  humanCellsObtainedOtherPage?: string;
  humanCellsBiobank?: boolean | null;
  humanCellsBiobankPage?: string;
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
  nonEuCountriesDetails?: string;
  nonEuCountriesEthicsIssues?: boolean | null;
  nonEuCountriesEthicsIssuesPage?: string;
  nonEuCountriesEthicsIssuesDetails?: string;
  nonEuCountriesMaterialExport?: boolean | null;
  nonEuCountriesMaterialExportPage?: string;
  nonEuCountriesMaterialExportDetails?: string;
  nonEuCountriesMaterialImport?: boolean | null;
  nonEuCountriesMaterialImportPage?: string;
  nonEuCountriesMaterialImportDetails?: string;
  nonEuCountriesLmic?: boolean | null;
  nonEuCountriesLmicPage?: string;
  nonEuCountriesRisk?: boolean | null;
  nonEuCountriesRiskPage?: string;
  // Section 7: Environment, Health & Safety
  environmentHealth?: boolean | null;
  environmentHealthPage?: string;
  environmentHealthEndangered?: boolean | null;
  environmentHealthEndangeredPage?: string;
  environmentHealthHarmful?: boolean | null;
  environmentHealthHarmfulPage?: string;
  // Section 8: Artificial Intelligence
  artificialIntelligence?: boolean | null;
  artificialIntelligencePage?: string;
  // Section 9: Other Ethics Issues
  otherEthics?: boolean | null;
  otherEthicsPage?: string;
  otherEthicsDetails?: string;
  // Security Issues
  securityEuClassified?: boolean | null;
  securityEuClassifiedPage?: string;
  securityEuClassifiedLevel?: string;
  securityDualUse?: boolean | null;
  securityDualUsePage?: string;
  securityMisuse?: boolean | null;
  securityMisusePage?: string;
  securityExclusivelyDefence?: boolean | null;
  securityExclusivelyDefencePage?: string;
  // Self-assessment text
  selfAssessmentText?: string;
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
  labelWithLink?: { text: string; linkText: string; linkUrl: string; afterLinkText: string };
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

// Security issues section (separate from ethics)
interface SecurityQuestion {
  id: keyof EthicsAssessment;
  pageId: keyof EthicsAssessment;
  label: string;
  indent?: number;
  parentId?: keyof EthicsAssessment;
  detailsId?: keyof EthicsAssessment;
  detailsPlaceholder?: string;
}

const SECURITY_QUESTIONS: SecurityQuestion[] = [
  {
    id: 'securityEuClassified',
    pageId: 'securityEuClassifiedPage',
    label: 'Does this activity involve the use of classified information as background and/or does it have the potential to generate EU-classified results/foreground?',
    detailsId: 'securityEuClassifiedLevel',
    detailsPlaceholder: 'If yes, specify the classification level...',
  },
  {
    id: 'securityDualUse',
    pageId: 'securityDualUsePage',
    label: 'Does this activity have the potential for misuse of research results? (dual use)',
  },
  {
    id: 'securityMisuse',
    pageId: 'securityMisusePage',
    label: 'Is there potential for malevolent/criminal/terrorist abuse of the research results?',
  },
  {
    id: 'securityExclusivelyDefence',
    pageId: 'securityExclusivelyDefencePage',
    label: 'Does this activity involve other activities or results that have an exclusively defence-related focus?',
  },
];

const ETHICS_SECTIONS: EthicsSection[] = [
  {
    id: 'hesc',
    number: 1,
    title: 'HUMAN EMBRYONIC STEM CELLS AND HUMAN EMBRYOS',
    questions: [
      {
        id: 'humanEmbryonicStemCells',
        pageId: 'humanEmbryonicStemCellsPage',
        label: 'Does this activity involve Human Embryonic Stem Cells (hESCs)?',
      },
      {
        id: 'hescDerivedFromEmbryos',
        pageId: 'hescDerivedFromEmbryosPage',
        label: 'Will they be directly derived from embryos within this project?',
        indent: 1,
        parentId: 'humanEmbryonicStemCells',
      },
      {
        id: 'hescEstablishedLines',
        pageId: 'hescEstablishedLinesPage',
        label: 'Are they previously established cell lines?',
        indent: 1,
        parentId: 'humanEmbryonicStemCells',
      },
      {
        id: 'hescEuropeanRegistry',
        pageId: 'hescEuropeanRegistryPage',
        label: 'Are the cell lines registered in the European registry for human embryonic stem cell lines?',
        indent: 1,
        parentId: 'humanEmbryonicStemCells',
      },
      {
        id: 'humanEmbryosSection1',
        pageId: 'humanEmbryosSection1Page',
        label: 'Does this activity involve the use of human embryos?',
      },
      {
        id: 'humanEmbryosDestruction',
        pageId: 'humanEmbryosDestructionPage',
        label: 'Will the activity lead to their destruction?',
        indent: 1,
        parentId: 'humanEmbryosSection1',
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
        label: '',
        labelWithLink: {
          text: 'Does this activity involve conducting a clinical study as defined by the Clinical Trial ',
          linkText: 'Regulation (EU 536/2014)',
          linkUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32014R0536',
          afterLinkText: '? (using pharmaceuticals, biologicals, radiopharmaceuticals, or advanced therapy medicinal products)'
        },
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
    title: 'HUMAN CELLS / TISSUES (not covered by section 1)',
    questions: [
      {
        id: 'humanCells',
        pageId: 'humanCellsPage',
        label: 'Does this activity involve the use of human cells or tissues?',
      },
      {
        id: 'humanCellsEmbryonicFoetal',
        pageId: 'humanCellsEmbryonicFoetalPage',
        label: 'Are they human embryonic or foetal cells or tissues?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanCellsCommercial',
        pageId: 'humanCellsCommercialPage',
        label: 'Are they available commercially?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanCellsObtainedWithin',
        pageId: 'humanCellsObtainedWithinPage',
        label: 'Are they obtained within this project?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanCellsObtainedOther',
        pageId: 'humanCellsObtainedOtherPage',
        label: 'Are they obtained from another project, laboratory or institution?',
        indent: 1,
        parentId: 'humanCells',
      },
      {
        id: 'humanCellsBiobank',
        pageId: 'humanCellsBiobankPage',
        label: 'Are they obtained from a biobank?',
        indent: 1,
        parentId: 'humanCells',
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
        label: 'Will some of the activities be carried out in non-EU countries?',
        detailsId: 'nonEuCountriesDetails',
        detailsPlaceholder: 'Specify the countries...',
      },
      {
        id: 'nonEuCountriesEthicsIssues',
        pageId: 'nonEuCountriesEthicsIssuesPage',
        label: 'In case non-EU countries are involved, do the activities raise potential ethics issues?',
        indent: 1,
        parentId: 'nonEuCountries',
        detailsId: 'nonEuCountriesEthicsIssuesDetails',
        detailsPlaceholder: 'Specify the countries...',
      },
      {
        id: 'nonEuCountriesMaterialExport',
        pageId: 'nonEuCountriesMaterialExportPage',
        label: 'Is it planned to export any material (other than data) from the EU to non-EU countries? For data exports, see section 4.',
        detailsId: 'nonEuCountriesMaterialExportDetails',
        detailsPlaceholder: 'Specify material and countries involved...',
      },
      {
        id: 'nonEuCountriesMaterialImport',
        pageId: 'nonEuCountriesMaterialImportPage',
        label: 'Is it planned to import any material (other than data) from non-EU countries into the EU or from a non-EU country to another non-EU country? For data imports, see section 4.',
        detailsId: 'nonEuCountriesMaterialImportDetails',
        detailsPlaceholder: 'Specify material and countries involved...',
      },
      {
        id: 'nonEuCountriesLmic',
        pageId: 'nonEuCountriesLmicPage',
        label: 'Does this activity involve low and/or lower-middle income countries? (if yes, detail the benefit-sharing actions planned in the self-assessment)',
      },
      {
        id: 'nonEuCountriesRisk',
        pageId: 'nonEuCountriesRiskPage',
        label: 'Could the situation in the country put the individuals taking part in the activity at risk?',
      },
    ],
  },
  {
    id: 'environment',
    number: 7,
    title: 'ENVIRONMENT, HEALTH AND SAFETY',
    questions: [
      {
        id: 'environmentHealth',
        pageId: 'environmentHealthPage',
        label: 'Does this activity involve the use of substances or processes that may cause harm to the environment, to animals or plants (during the implementation of the activity or further to the use of the results, as a possible impact)?',
      },
      {
        id: 'environmentHealthEndangered',
        pageId: 'environmentHealthEndangeredPage',
        label: 'Does this activity deal with endangered fauna and/or flora / protected areas?',
      },
      {
        id: 'environmentHealthHarmful',
        pageId: 'environmentHealthHarmfulPage',
        label: 'Does this activity involve the use of substances or processes that may cause harm to humans, including those performing the activity (during the implementation of the activity or further to the use of the results, as a possible impact)?',
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
        label: 'Does this activity involve the development, deployment and/or use of Artificial Intelligence based systems? (if yes, detail in the self-assessment whether that could raise ethical concerns related to human rights and values and detail how this will be addressed)',
      },
    ],
  },
  {
    id: 'other',
    number: 9,
    title: 'OTHER ETHICS ISSUES',
    questions: [
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
  question: EthicsQuestion | SecurityQuestion;
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

  const indent = (question as EthicsQuestion).indent || 0;
  const labelWithLink = (question as EthicsQuestion).labelWithLink;

  // Render label with optional link
  const renderLabel = () => {
    if (labelWithLink) {
      return (
        <>
          {labelWithLink.text}
          <a 
            href={labelWithLink.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {labelWithLink.linkText}
          </a>
          {labelWithLink.afterLinkText}
        </>
      );
    }
    return question.label;
  };

  return (
    <>
      <div 
        className={cn(
          "grid grid-cols-[1fr,auto,auto] gap-2 items-start py-2 border-b border-border/50",
          indent > 0 && "bg-muted/30"
        )}
      >
        {/* Question text */}
        <div className={cn("text-sm", indent > 0 && `pl-${indent * 6}`)}>
          <span style={{ paddingLeft: `${indent * 24}px` }}>
            {indent > 0 && <span className="text-muted-foreground mr-1">↳</span>}
            {renderLabel()}
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
        {/* Guidelines Button */}
        <PartAGuidelinesDialog
          sectionTitle="Part A4: Ethics self-assessment"
          officialGuidelines={[{
            id: 'ethics-info',
            title: 'Ethics Issues Table',
            content: 'Complete the ethics self-assessment by answering all applicable questions.\n\nFor each "Yes" answer:\n• Provide the page number in Part B where the issue is addressed\n• Sub-questions only appear when the parent question is answered "Yes"\n\nThis assessment covers:\n• Human embryonic stem cells\n• Research involving humans\n• Human cells/tissues\n• Personal data protection\n• Animals in research\n• Third countries research\n• Environment and safety\n• Artificial intelligence\n• Other potential ethics issues'
          }]}
        />

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
                <div className="grid grid-cols-[1fr,auto,auto] gap-2 items-center py-2 border-b-2 border-border text-xs font-medium text-muted-foreground">
                  <div>Question</div>
                  <div className="w-24 text-center">Answer</div>
                  <div className="w-16 text-center">Page</div>
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

        {/* Security Issues Section */}
        <Card className={cn(SECURITY_QUESTIONS.some(q => ethicsData[q.id] === true) && 'border-warning/50')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                SECURITY ISSUES
              </h3>
              {SECURITY_QUESTIONS.some(q => ethicsData[q.id] === true) && (
                <AlertTriangle className="w-4 h-4 text-warning" />
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Table header */}
            <div className="grid grid-cols-[1fr,auto,auto] gap-2 items-center py-2 border-b-2 border-border text-xs font-medium text-muted-foreground">
              <div>Question</div>
              <div className="w-24 text-center">Answer</div>
              <div className="w-16 text-center">Page</div>
            </div>

            {/* Security Questions */}
            {SECURITY_QUESTIONS.map((question) => (
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
                isVisible={true}
              />
            ))}
          </CardContent>
        </Card>

        {/* Self-Assessment Section */}
        <Card>
          <CardHeader className="pb-2">
            <h3 className="font-semibold text-sm">ETHICS SELF-ASSESSMENT</h3>
            <CardDescription className="text-xs">
              If you have answered "Yes" to any of the ethics or security questions above, please provide a brief description 
              of how you will address each identified issue. This will be used in the ethics review process.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Textarea
              value={ethicsData.selfAssessmentText || ''}
              onChange={(e) => onUpdateEthics({ selfAssessmentText: e.target.value })}
              placeholder="Describe how you will address the ethics and security issues identified above..."
              className="min-h-[150px] text-sm"
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

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
