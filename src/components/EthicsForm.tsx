import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  // Security Issues - Section 1: EU Classified Information (EUCI)
  securityEuClassified?: boolean | null;
  securityEuClassifiedPage?: string;
  securityEuClassifiedLevel?: string;
  securityEuciBackground?: boolean | null;
  securityEuciBackgroundPage?: string;
  securityEuciForeground?: boolean | null;
  securityEuciForegroundPage?: string;
  securityEuciNonEuAccess?: boolean | null;
  securityEuciNonEuAccessPage?: string;
  securityEuciNonEuAgreement?: boolean | null;
  securityEuciNonEuAgreementPage?: string;
  // Security Issues - Section 2: Misuse
  securityDualUse?: boolean | null;
  securityDualUsePage?: string;
  securityMisuseCrimeTerrorism?: boolean | null;
  securityMisuseCrimeTerrorismPage?: string;
  securityMisuseCbrn?: boolean | null;
  securityMisuseCbrnPage?: string;
  // Security Issues - Section 3: Other Security Issues (legacy fields kept)
  securityMisuse?: boolean | null;
  securityMisusePage?: string;
  securityExclusivelyDefence?: boolean | null;
  securityExclusivelyDefencePage?: string;
  securityOtherNational?: boolean | null;
  securityOtherNationalPage?: string;
  securityOtherNationalDetails?: string;
  securityOtherIssues?: boolean | null;
  securityOtherIssuesPage?: string;
  securityOtherIssuesDetails?: string;
  // Ethics Self-assessment text fields
  ethicsSelfAssessmentObjectives?: string;
  ethicsSelfAssessmentCompliance?: string;
  // Security Self-assessment text
  securitySelfAssessment?: string;
  // Ethics confirmation checkbox
  ethicsConfirmation?: boolean;
  // Legacy field (kept for backwards compatibility)
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
  detailsMaxLength?: number; // Character limit for details field
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
  description?: string;
  indent?: number;
  parentId?: keyof EthicsAssessment;
  detailsId?: keyof EthicsAssessment;
  detailsPlaceholder?: string;
  detailsMaxLength?: number;
}

interface SecuritySection {
  id: string;
  number: number;
  title: string;
  description?: string;
  questions: SecurityQuestion[];
}

const SECURITY_SECTIONS: SecuritySection[] = [
  {
    id: 'euci',
    number: 1,
    title: 'EU CLASSIFIED INFORMATION (EUCI)',
    description: 'According to the Commission Decision (EU, Euratom) 2015/444 of 13 March 2015 on the security rules for protecting EU classified information, "European Union classified information (EUCI) means any information or material designated by an EU security classification, the unauthorised disclosure of which could cause varying degrees of prejudice to the interests of the European Union or of one or more of the Member States".',
    questions: [
      {
        id: 'securityEuClassified',
        pageId: 'securityEuClassifiedPage',
        label: 'Does this activity involve information and/or materials requiring protection against unauthorised disclosure (EUCI)?',
      },
      {
        id: 'securityEuciBackground',
        pageId: 'securityEuciBackgroundPage',
        label: 'Is the activity going to use classified information as background information?',
        description: 'Classified background information is information that is already classified by a country and/or international organisation and/or the EU and is going to be used by the project. In this case, the project must have in advance the authorisation from the originator of the classified information, which is the entity (EU institution, EU Member State, third state or international organisation) under whose authority the classified information has been generated.',
        indent: 1,
        parentId: 'securityEuClassified',
      },
      {
        id: 'securityEuciForeground',
        pageId: 'securityEuciForegroundPage',
        label: 'Is the activity going to generate EU classified foreground information as results?',
        description: 'EU classified foreground information is information (documents/deliverables/materials) planned to be generated by the project and that needs to be protected from unauthorised disclosure. The originator of the EUCI generated by the project is the European Commission.',
        indent: 1,
        parentId: 'securityEuClassified',
      },
      {
        id: 'securityEuciNonEuAccess',
        pageId: 'securityEuciNonEuAccessPage',
        label: 'Does this activity involve participants from non-EU countries which need to have access to EUCI?',
      },
      {
        id: 'securityEuciNonEuAgreement',
        pageId: 'securityEuciNonEuAgreementPage',
        label: 'Do the non-EU countries concerned have a security of information agreement with the EU?',
        indent: 1,
        parentId: 'securityEuciNonEuAccess',
      },
    ],
  },
  {
    id: 'misuse',
    number: 2,
    title: 'MISUSE',
    questions: [
      {
        id: 'securityDualUse',
        pageId: 'securityDualUsePage',
        label: 'Does this activity have the potential for misuse of results?',
      },
      {
        id: 'securityMisuseCrimeTerrorism',
        pageId: 'securityMisuseCrimeTerrorismPage',
        label: 'Does the activity provide knowledge, materials and technologies that could be channelled into crime and/or terrorism?',
        indent: 1,
        parentId: 'securityDualUse',
      },
      {
        id: 'securityMisuseCbrn',
        pageId: 'securityMisuseCbrnPage',
        label: 'Could the activity result in the development of chemical, biological, radiological or nuclear (CBRN) weapons and the means for their delivery?',
        indent: 1,
        parentId: 'securityDualUse',
      },
    ],
  },
  {
    id: 'other',
    number: 3,
    title: 'OTHER SECURITY ISSUES',
    questions: [
      {
        id: 'securityOtherNational',
        pageId: 'securityOtherNationalPage',
        label: 'Does this activity involve information and/or materials subject to national security restrictions?',
        detailsId: 'securityOtherNationalDetails',
        detailsPlaceholder: 'If yes, please specify...',
        detailsMaxLength: 1000,
      },
      {
        id: 'securityOtherIssues',
        pageId: 'securityOtherIssuesPage',
        label: 'Are there any other security issues that should be taken into consideration?',
        detailsId: 'securityOtherIssuesDetails',
        detailsPlaceholder: 'If yes, please specify...',
        detailsMaxLength: 1000,
      },
    ],
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
        label: '',
        labelWithLink: {
          text: 'Does this activity involve ',
          linkText: 'low and/or lower-middle income countries',
          linkUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/guidance/programme-guide_horizon_en.pdf',
          afterLinkText: '? (if yes, detail the benefit-sharing actions planned in the self-assessment)',
        },
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
        detailsMaxLength: 1000,
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
            {(question as SecurityQuestion).description && (
              <span className="block text-xs text-muted-foreground mt-1 italic" style={{ paddingLeft: `${indent * 24}px` }}>
                {(question as SecurityQuestion).description}
              </span>
            )}
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
          className="h-7 w-16 text-xs px-2 -mt-0.5"
          disabled={!canEdit || value !== true}
        />
      </div>

      {/* Details input if applicable */}
      {question.detailsId && value === true && (
        <div className="py-2 pl-8 pr-4 bg-muted/20 border-b border-border/50">
          {(question as EthicsQuestion).detailsMaxLength ? (
            <div className="space-y-1">
              <Textarea
                value={detailsValue || ''}
                onChange={(e) => {
                  const newValue = e.target.value;
                  const maxLength = (question as EthicsQuestion).detailsMaxLength!;
                  if (newValue.length <= maxLength) {
                    onDetailsChange?.(newValue);
                  }
                }}
                placeholder={question.detailsPlaceholder || 'Please specify...'}
                className="min-h-[80px] text-xs"
                disabled={!canEdit}
                maxLength={(question as EthicsQuestion).detailsMaxLength}
              />
              <div className="text-xs text-muted-foreground text-right">
                {(detailsValue || '').length.toLocaleString()} / {(question as EthicsQuestion).detailsMaxLength!.toLocaleString()} characters
              </div>
            </div>
          ) : (
            <Input
              value={detailsValue || ''}
              onChange={(e) => onDetailsChange?.(e.target.value)}
              placeholder={question.detailsPlaceholder || 'Please specify...'}
              className="h-8 text-xs"
              disabled={!canEdit}
            />
          )}
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
      <div className="max-w-7xl mx-auto space-y-6">
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

        {/* ETHICS ISSUES TABLE SUBSECTION */}
        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold text-base">Ethics issues table</h2>
            <CardDescription className="text-xs mt-2 space-y-2">
              <p>
                This table should be completed as an essential part of your proposal. Please go through the table and indicate which elements concern your proposal by answering 'Yes' or 'No'. If you answer 'Yes' to any of the questions:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>indicate in the adjacent box at which page in your full proposal further information relating to that ethics issue can be found, and</li>
                <li>provide additional information on that ethics issue in the Ethics Self-Assessment section.</li>
              </ul>
              <p>
                For more information on each of the ethics issues and how to address them, including detailed legal references, see the guidelines{' '}
                <a 
                  href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/how-to-complete-your-ethics-self-assessment_en.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  'How to Complete your Ethics Self-Assessment'
                </a>.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pt-0 pb-2">
            {/* Sections 1-9 */}
            {ETHICS_SECTIONS.map((section, index) => {
              const sectionHasIssues = section.questions.some(q => ethicsData[q.id] === true);
              
              return (
                <div key={section.id}>
                  <div className="flex items-center justify-between py-2">
                    <h3 className="font-semibold text-sm">
                      {section.number}. {section.title}
                    </h3>
                    {sectionHasIssues && (
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  <div className="pb-2">

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
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Ethics Confirmation Checkbox */}
        <div className="flex items-start space-x-3 py-4 px-4 bg-muted/50 rounded-lg border">
          <Checkbox
            id="ethics-confirmation"
            checked={ethicsData.ethicsConfirmation || false}
            onCheckedChange={(checked) => onUpdateEthics({ ethicsConfirmation: checked === true })}
            disabled={!canEdit}
            className="mt-0.5"
          />
          <Label htmlFor="ethics-confirmation" className="text-sm leading-relaxed cursor-pointer">
            I confirm that I have taken into account all ethics issues above and that, if any ethics issues apply, 
            I will complete the ethics self-assessment as described in the guidelines{' '}
            <a 
              href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/how-to-complete-your-ethics-self-assessment_en.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80"
              onClick={(e) => e.stopPropagation()}
            >
              'How to Complete your Ethics Self-Assessment'
            </a>.
          </Label>
        </div>

        {/* ETHICS SELF-ASSESSMENT */}
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold text-sm">ETHICS SELF-ASSESSMENT</h3>
            <CardDescription className="text-xs mt-2">
              If you have entered any issues in the ethics issue table, you must perform an ethics self-assessment 
              in accordance with the guidelines{' '}
              <a 
                href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/how-to-complete-your-ethics-self-assessment_en.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                "How to Complete your Ethics Self-Assessment"
              </a>{' '}
              and complete the table below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pt-0 pb-4">
            {/* Ethical dimension */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                Ethical dimension of the objectives, methodology and likely impact
              </Label>
              <CardDescription className="text-xs">
                Explain in detail the identified issues in relation to:
              </CardDescription>
              <ul className="text-xs text-muted-foreground list-disc list-inside ml-2 space-y-0.5">
                <li>objectives of the activities (e.g. study of vulnerable populations, etc.)</li>
                <li>methodology (e.g. clinical trials, involvement of children, protection of personal data, etc.)</li>
                <li>the potential impact of the activities (e.g. environmental damage, stigmatisation of particular social groups, political or financial adverse consequences, misuse, etc.)</li>
              </ul>
              <Textarea
                value={ethicsData.ethicsSelfAssessmentObjectives || ''}
                onChange={(e) => onUpdateEthics({ ethicsSelfAssessmentObjectives: e.target.value })}
                placeholder="Explain the identified ethics issues in relation to objectives, methodology, and potential impact..."
                className="min-h-[80px] text-sm mt-1"
                disabled={!canEdit}
              />
            </div>

            {/* Compliance */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                Compliance with ethical principles and relevant legislations
              </Label>
              <CardDescription className="text-xs">
                Describe how the issue(s) identified in the ethics issues table above will be addressed in order to adhere 
                to the ethical principles and what will be done to ensure that the activities are compliant with the EU/national 
                legal and ethical requirements of the country or countries where the tasks are to be carried out. It is reminded 
                that for activities performed in a non-EU country, they should also be allowed in at least one EU Member State.
              </CardDescription>
              <Textarea
                value={ethicsData.ethicsSelfAssessmentCompliance || ''}
                onChange={(e) => onUpdateEthics({ ethicsSelfAssessmentCompliance: e.target.value })}
                placeholder="Describe how you will ensure compliance with ethical principles and relevant legislations..."
                className="min-h-[80px] text-sm mt-1"
                disabled={!canEdit}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECURITY ISSUES TABLE */}
        <Card className={cn(SECURITY_SECTIONS.some(s => s.questions.some(q => ethicsData[q.id] === true)) && 'border-warning/50')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Security issues table
              </h3>
              {SECURITY_SECTIONS.some(s => s.questions.some(q => ethicsData[q.id] === true)) && (
                <AlertTriangle className="w-4 h-4 text-warning" />
              )}
            </div>
            <CardDescription className="text-xs mt-2 space-y-2">
              <p>
                Please go through the table and indicate which elements concern your proposal by answering YES or NO.
              </p>
              <p>
                If you answer YES to any of the questions:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>indicate in the adjacent box at which page in your full proposal further information relating to that security issue can be found, and</li>
                <li>provide additional information on this security issue in the Security self-assessment section below.</li>
              </ul>
              <p>
                For more information on potential security issues and how to address them, see the guidance{' '}
                <a 
                  href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/how-to-handle-security-sensitive-projects_en.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  How to handle security-sensitive projects
                </a>
                {' '}and the programme-specific guidelines{' '}
                <a 
                  href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/guidance/classification-of-information-in-he-projects_he_en.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Classification of information in Horizon Europe projects
                </a>.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pt-0 pb-2">
            {/* Security Sections */}
            {SECURITY_SECTIONS.map((section, index) => {
              const sectionHasIssues = section.questions.some(q => ethicsData[q.id] === true);
              
              // Helper to check if a security sub-question should be visible
              const isSecurityQuestionVisible = (question: SecurityQuestion): boolean => {
                if (!question.parentId) return true;
                return ethicsData[question.parentId] === true;
              };
              
              return (
                <div key={section.id}>
                  <div className="flex items-center justify-between py-2">
                    <h3 className="font-semibold text-sm">
                      {section.number}. {section.title}
                    </h3>
                    {sectionHasIssues && (
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  {section.description && (
                    <p className="text-xs text-muted-foreground -mt-1 mb-1">
                      {section.description}
                    </p>
                  )}
                  <div className="pb-2">

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
                        isVisible={isSecurityQuestionVisible(question)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* SECURITY SELF-ASSESSMENT */}
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold text-sm">SECURITY SELF-ASSESSMENT</h3>
            <CardDescription className="text-xs mt-2">
              If you have answered YES for one or more of the questions indicated above, describe the measures you intend 
              to take to solve/avoid them. For more information, see the guidelines{' '}
              <a 
                href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/guidance/classification-of-information-in-he-projects_he_en.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                Classification of information in Horizon Europe projects
              </a>,{' '}
              <a 
                href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/digital/guidance/classification-of-information-in-dep-projects_dep_en.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                Classification of information in Digital Europe projects
              </a>,{' '}
              <a 
                href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/edf/guidance/classification-of-information-in-edf-projects_edf_en.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                Classification of information in EDF projects
              </a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pt-0 pb-4">
            <Textarea
              value={ethicsData.securitySelfAssessment || ''}
              onChange={(e) => onUpdateEthics({ securitySelfAssessment: e.target.value })}
              placeholder="Describe the measures you intend to take to address the security issues..."
              className="min-h-[80px] text-sm"
              maxLength={5000}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {(ethicsData.securitySelfAssessment || '').length.toLocaleString()}/{(5000).toLocaleString()} characters
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
