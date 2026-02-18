import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ExportDialog, type ExportFormat } from "@/components/ExportDialog";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { InlineGuideline } from "./GuidelineBox";
import { PartAGuidelinesDialog } from "./PartAGuidelinesDialog";
import { LogoUpload } from "./LogoUpload";

import { Section, Proposal, Participant, ParticipantMember, WORK_PROGRAMMES, DESTINATIONS, getDestinationsForWorkProgramme } from "@/types/proposal";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AcronymColorEditor, type AcronymSegment } from "./AcronymColorEditor";
import { SaveIndicator } from "./SaveIndicator";
import { Loader2, FileText, Target, Euro, Calendar as CalendarIcon, ExternalLink, Download, Trash2, RefreshCw, FileDown, CheckCircle2, Plus, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GeneralInfoFormProps {
  proposalId: string;
  proposal: Proposal | null;
  section: Section;
  canEdit: boolean;
  isCoordinator?: boolean;
  onUpdateProposal: (updates: Record<string, any>) => Promise<void>;
  // Additional props for overview content
  participants?: Participant[];
  budgetItems?: { amount: number; participantId: string }[];
  onExport?: (format: ExportFormat, includeWatermark: boolean) => void;
}

interface DeclarationLink {
  text: string;
  url: string;
}

interface BulletWithLink {
  text: string;
  link: DeclarationLink;
}

type BulletItem = string | BulletWithLink;

interface Declaration {
  id: string;
  number: number;
  text: string;
  bullets?: BulletItem[];
  suffix?: string;
  links?: DeclarationLink[];
}

interface FormData {
  abstract: string;
  fixedKeywords: string[];
  freeKeywords: string;
  previousSubmission: 'yes' | 'no' | '';
  previousSubmissionReference: string;
  declarations: {
    consent: boolean;
    correctComplete: boolean;
    eligibility: boolean;
    communication: boolean;
    termsPrivacy: boolean;
    ethics: boolean;
    civilApplications: boolean;
    prohibitedResearch: boolean;
    outsideEU: boolean;
  };
}

const DECLARATIONS: Declaration[] = [
  {
    id: 'consent',
    number: 1,
    text: 'We declare to have the explicit consent of all applicants on their participation and on the content of this proposal.',
  },
  {
    id: 'correctComplete',
    number: 2,
    text: 'We confirm that the information contained in this proposal is correct and complete and that none of the project activities have started before the proposal was submitted (unless explicitly authorised in the call conditions).',
  },
  {
    id: 'eligibility',
    number: 3,
    text: 'We declare:',
    bullets: [
      'to be fully compliant with the eligibility criteria set out in the call',
      { text: 'not to be subject to any exclusion grounds under the ', link: { text: 'EU Financial Regulation 2018/1046', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32018R1046' } },
      'to have the financial and operational capacity to carry out the proposed project'
    ],
  },
  {
    id: 'communication',
    number: 4,
    text: 'We acknowledge that all communication will be made through the {{Funding & Tenders Portal}} electronic exchange system and that access and use of this system is subject to the Funding & Tenders Portal {{Terms and Conditions}}.',
    links: [
      { text: 'Funding & Tenders Portal', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home' },
      { text: 'Terms and Conditions', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/ftp/tc_en.pdf' }
    ],
  },
  {
    id: 'termsPrivacy',
    number: 5,
    text: 'We have read, understood and accepted the Funding & Tenders Portal {{Terms & Conditions}} and {{Privacy Statement}} that set out the conditions of use of the Portal and the scope, purposes, retention periods, etc. for the processing of personal data of all data subjects whose data we communicate for the purpose of the application, evaluation, award and subsequent management of our grant, prizes and contracts (including financial transactions and audits).',
    links: [
      { text: 'Terms & Conditions', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/ftp/tc_en.pdf' },
      { text: 'Privacy Statement', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/ftp/privacy-statement_en.pdf' }
    ],
  },
  {
    id: 'ethics',
    number: 6,
    text: 'We declare that the proposal complies with ethical principles (including the highest standards of research integrity as set out in the {{ALLEA European Code of Conduct for Research Integrity}}), as well as applicable international and national law, including the {{Charter of Fundamental Rights of the European Union}} and the {{European Convention on Human Rights}} and its Supplementary Protocols. Appropriate procedures, policies and structures are in place to foster responsible research practices, to prevent questionable research practices and research misconduct, and to handle allegations of breaches of the principles and standards in the Code of Conduct.',
    links: [
      { text: 'ALLEA European Code of Conduct for Research Integrity', url: 'https://allea.org/code-of-conduct/' },
      { text: 'Charter of Fundamental Rights of the European Union', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:12012P/TXT' },
      { text: 'European Convention on Human Rights', url: 'https://www.echr.coe.int/documents/convention_eng.pdf' }
    ],
  },
  {
    id: 'civilApplications',
    number: 7,
    text: 'We declare that the proposal has an exclusive focus on civil applications (activities intended to be used in military application or aiming to serve military purposes cannot be funded). If the project involves dual-use items in the sense of {{Regulation 428/2009}}, or other items for which authorisation is required, we confirm that we will comply with the applicable regulatory framework (e.g. obtain export/import licences before these items are used).',
    links: [
      { text: 'Regulation 428/2009', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32009R0428' }
    ],
  },
  {
    id: 'prohibitedResearch',
    number: 8,
    text: 'We confirm that the activities proposed do not:',
    bullets: [
      'aim at human cloning for reproductive purposes',
      'intend to modify the genetic heritage of human beings which could make such changes heritable (with the exception of research relating to cancer treatment of the gonads, which may be financed)',
      'intend to create human embryos solely for the purpose of research or for the purpose of stem cell procurement, including by means of somatic cell nuclear transfer',
      'lead to the destruction of human embryos (for example, for obtaining stem cells)'
    ],
    suffix: 'These activities are excluded from funding.',
  },
  {
    id: 'outsideEU',
    number: 9,
    text: 'We confirm that for activities carried out outside the Union, the same activities would have been allowed in at least one Member State.',
  },
];

// Helper function to render text with inline links using {{linkText}} placeholders
const renderTextWithLinks = (text: string, links?: DeclarationLink[]) => {
  if (!links || links.length === 0) return text;
  
  const linkMap = new Map(links.map(link => [link.text, link.url]));
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    const linkText = match[1];
    const url = linkMap.get(linkText);
    
    if (url) {
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {linkText}
        </a>
      );
    } else {
      parts.push(linkText);
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return <>{parts}</>;
};

// Generate a consistent color from acronym
function getAcronymColor(acronym: string): string {
  const colors = [
    'hsl(221, 83%, 53%)',
    'hsl(142, 76%, 36%)',
    'hsl(262, 83%, 58%)',
    'hsl(24, 95%, 53%)',
    'hsl(346, 77%, 50%)',
    'hsl(199, 89%, 48%)',
  ];
  let hash = 0;
  for (let i = 0; i < acronym.length; i++) {
    hash = acronym.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function AcronymLogo({ logoUrl, acronym }: { logoUrl?: string; acronym: string }) {
  const acronymColor = getAcronymColor(acronym);
  
  const formatAcronymForDisplay = (acr: string) => {
    if (acr.length <= 6) return [acr];
    const midPoint = Math.ceil(acr.length / 2);
    let splitIndex = midPoint;
    for (let i = midPoint - 2; i < Math.min(midPoint + 3, acr.length); i++) {
      if (i > 0 && /[A-Za-z]/.test(acr[i-1]) && /[0-9]/.test(acr[i])) {
        splitIndex = i;
        break;
      }
    }
    return [acr.substring(0, splitIndex), acr.substring(splitIndex)].filter(Boolean);
  };

  const acronymLines = formatAcronymForDisplay(acronym.toUpperCase());
  
  return (
    <div className="w-24 h-24 rounded-xl bg-muted border flex items-center justify-center overflow-hidden">
      {logoUrl ? (
        <img src={logoUrl} alt={acronym} className="w-full h-full object-cover" />
      ) : (
        <div 
          className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-1"
          style={{ backgroundColor: acronymColor }}
        >
          {acronymLines.map((line, idx) => (
            <span 
              key={idx} 
              className="font-bold text-white tracking-tight text-center leading-tight"
              style={{ fontSize: acronymLines.length > 1 ? '0.9rem' : '1.5rem' }}
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
// Helper to compute default reporting periods for a given duration
function computeDefaultReportingPeriods(duration: number): { number: number; startMonth: number; endMonth: number }[] {
  const periods: { number: number; startMonth: number; endMonth: number }[] = [];
  let start = 1;
  let num = 1;
  while (start <= duration) {
    const remaining = duration - start + 1;
    const len = remaining > 18 ? 18 : remaining;
    periods.push({ number: num, startMonth: start, endMonth: start + len - 1 });
    start += len;
    num++;
  }
  return periods;
}

function ReportingPeriodsEditor({ proposal, onUpdate }: { 
  proposal: { duration?: number; reportingPeriods?: { number: number; startMonth: number; endMonth: number }[] };
  onUpdate: (rps: { number: number; startMonth: number; endMonth: number }[]) => void;
}) {
  const duration = proposal.duration || 36;
  const rps = proposal.reportingPeriods && proposal.reportingPeriods.length > 0 
    ? proposal.reportingPeriods 
    : computeDefaultReportingPeriods(duration);

  const handleLengthChange = (index: number, newLength: number) => {
    const updated = [...rps];
    updated[index] = { ...updated[index], endMonth: updated[index].startMonth + newLength - 1 };
    // Recalculate subsequent RPs
    for (let i = index + 1; i < updated.length; i++) {
      const prevEnd = updated[i - 1].endMonth;
      const oldLen = updated[i].endMonth - updated[i].startMonth + 1;
      updated[i] = { ...updated[i], startMonth: prevEnd + 1, endMonth: prevEnd + oldLen };
    }
    // Clamp last RP to duration
    const last = updated[updated.length - 1];
    if (last.endMonth > duration) {
      updated[updated.length - 1] = { ...last, endMonth: duration };
    }
    // Remove RPs that start after duration
    const filtered = updated.filter(rp => rp.startMonth <= duration).map((rp, i) => ({ ...rp, number: i + 1 }));
    onUpdate(filtered);
  };

  const handleAddRP = () => {
    const lastEnd = rps.length > 0 ? rps[rps.length - 1].endMonth : 0;
    if (lastEnd >= duration) return;
    const remaining = duration - lastEnd;
    const len = Math.min(18, remaining);
    const newRps = [...rps, { number: rps.length + 1, startMonth: lastEnd + 1, endMonth: lastEnd + len }];
    onUpdate(newRps);
  };

  const handleRemoveRP = (index: number) => {
    if (rps.length <= 1) return;
    const updated = rps.filter((_, i) => i !== index).map((rp, i) => ({ ...rp, number: i + 1 }));
    // Recalculate start months
    for (let i = 1; i < updated.length; i++) {
      const len = updated[i].endMonth - updated[i].startMonth + 1;
      updated[i] = { ...updated[i], startMonth: updated[i - 1].endMonth + 1, endMonth: updated[i - 1].endMonth + len };
    }
    const last = updated[updated.length - 1];
    if (last.endMonth > duration) {
      updated[updated.length - 1] = { ...last, endMonth: duration };
    }
    onUpdate(updated);
  };

  const totalCovered = rps.length > 0 ? rps[rps.length - 1].endMonth : 0;
  const canAdd = totalCovered < duration;

  return (
    <div className="space-y-3">
      <label className="text-xs text-muted-foreground mb-0.5 block">Reporting periods</label>
      <div className="space-y-2">
        {rps.map((rp, idx) => {
          const len = rp.endMonth - rp.startMonth + 1;
          const maxLen = Math.min(18, duration - rp.startMonth + 1);
          return (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-sm font-medium w-12">RP{rp.number}</span>
              <span className="text-xs text-muted-foreground w-28">
                M{rp.startMonth}–M{rp.endMonth}
              </span>
              <Select
                value={String(len)}
                onValueChange={(v) => handleLengthChange(idx, Number(v))}
              >
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: maxLen }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} month{m !== 1 ? 's' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rps.length > 1 && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRemoveRP(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleAddRP}>
        <Plus className="w-3 h-3" />
        Add reporting period
      </Button>
      {totalCovered < duration && (
        <p className="text-xs text-warning">
          Reporting periods cover {totalCovered} of {duration} months. Add more to cover the full duration.
        </p>
      )}
    </div>
  );
}

export function GeneralInfoForm({
  proposalId,
  proposal,
  section,
  canEdit,
  isCoordinator = false,
  onUpdateProposal,
  participants = [],
  budgetItems = [],
  onExport,
}: GeneralInfoFormProps) {
  // A1 form data state
  const [formData, setFormData] = useState<FormData>({
    abstract: '',
    fixedKeywords: [],
    freeKeywords: '',
    previousSubmission: '',
    previousSubmissionReference: '',
    declarations: {
      consent: false,
      correctComplete: false,
      eligibility: false,
      communication: false,
      termsPrivacy: false,
      ethics: false,
      civilApplications: false,
      prohibitedResearch: false,
      outsideEU: false,
    },
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [pendingBudgetType, setPendingBudgetType] = useState<'traditional' | 'lump_sum' | null>(null);
  
  // Topic import state
  const [importingTopic, setImportingTopic] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  // Overview editing state (for admin/owner)
  const [editedProposal, setEditedProposal] = useState(proposal);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [availableDestinations, setAvailableDestinations] = useState(
    proposal?.workProgramme ? getDestinationsForWorkProgramme(proposal.workProgramme) : []
  );

  // Sync editedProposal when proposal changes
  useEffect(() => {
    if (proposal) {
      setEditedProposal(proposal);
    }
  }, [proposal]);

  useEffect(() => {
    if (editedProposal?.workProgramme) {
      setAvailableDestinations(getDestinationsForWorkProgramme(editedProposal.workProgramme));
    }
  }, [editedProposal?.workProgramme]);

  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal?.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal?.destination);
  const totalBudgetFromItems = budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const daysUntilDeadline = proposal?.deadline
    ? Math.ceil((new Date(proposal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // User can edit overview fields if admin/owner
  const userCanEditOverview = canEdit && isCoordinator;
  const isEditing = userCanEditOverview;

  // Auto-save overview changes with debounce
  const debouncedSaveOverview = useCallback((proposalData: typeof editedProposal) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      if (onUpdateProposal && proposalData) {
        await onUpdateProposal(proposalData);
      }
    }, 1000);
  }, [onUpdateProposal]);

  useEffect(() => {
    if (userCanEditOverview && editedProposal && proposal && JSON.stringify(editedProposal) !== JSON.stringify(proposal)) {
      debouncedSaveOverview(editedProposal);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editedProposal, userCanEditOverview, proposal, debouncedSaveOverview]);

  const handleLogoChange = (url: string | null) => {
    if (editedProposal) {
      setEditedProposal({ ...editedProposal, logoUrl: url || undefined });
    }
  };

  // Load A1 form content
  useEffect(() => {
    const loadContent = async () => {
      if (!proposalId) return;
      
      try {
        const { data, error } = await supabase
          .from('section_content')
          .select('content')
          .eq('proposal_id', proposalId)
          .eq('section_id', 'a1')
          .maybeSingle();

        if (error) throw error;

        if (data?.content) {
          try {
            const parsed = JSON.parse(data.content);
            setFormData({
              abstract: parsed.abstract || '',
              fixedKeywords: parsed.fixedKeywords || parsed.keywords || [],
              freeKeywords: parsed.freeKeywords || '',
              previousSubmission: parsed.previousSubmission || '',
              previousSubmissionReference: parsed.previousSubmissionReference || '',
              declarations: {
                consent: parsed.declarations?.consent || false,
                correctComplete: parsed.declarations?.correctComplete || false,
                eligibility: parsed.declarations?.eligibility || false,
                communication: parsed.declarations?.communication || false,
                termsPrivacy: parsed.declarations?.termsPrivacy || false,
                ethics: parsed.declarations?.ethics || false,
                civilApplications: parsed.declarations?.civilApplications || false,
                prohibitedResearch: parsed.declarations?.prohibitedResearch || false,
                outsideEU: parsed.declarations?.outsideEU || false,
              },
            });
          } catch {
            setFormData(prev => ({ ...prev, abstract: data.content }));
          }
        }
      } catch (error) {
        console.error('Error loading general info:', error);
      }
      setLoading(false);
    };

    loadContent();
  }, [proposalId]);

  // Auto-save A1 form content
  const saveContent = useCallback(async (data: FormData) => {
    if (!canEdit) return;
    
    setSaving(true);
    try {
      const content = JSON.stringify(data);
      
      const { error } = await supabase
        .from('section_content')
        .upsert({
          proposal_id: proposalId,
          section_id: 'a1',
          content,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'proposal_id,section_id',
        });

      if (error) throw error;
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving general info:', error);
      toast.error('Failed to save changes');
    }
    setSaving(false);
  }, [proposalId, canEdit]);

  useEffect(() => {
    if (loading) return;
    
    const timeout = setTimeout(() => {
      saveContent(formData);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [formData, loading, saveContent]);

  const handleAbstractChange = (value: string) => {
    setFormData(prev => ({ ...prev, abstract: value }));
  };

  const handleAddKeyword = () => {
    const keyword = keywordInput.trim();
    if (keyword && formData.fixedKeywords.length < 5 && !formData.fixedKeywords.includes(keyword)) {
      setFormData(prev => ({
        ...prev,
        fixedKeywords: [...prev.fixedKeywords, keyword],
      }));
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      fixedKeywords: prev.fixedKeywords.filter(k => k !== keyword),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleDeclarationChange = (id: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      declarations: {
        ...prev.declarations,
        [id]: checked,
      },
    }));
  };

  const abstractCharCount = formData.abstract.length;
  const abstractWordCount = formData.abstract.trim() ? formData.abstract.trim().split(/\s+/).length : 0;
  const freeKeywordsCharCount = formData.freeKeywords.length;

  // Import topic content from URL
  const handleImportTopicContent = async () => {
    if (!proposal?.topicUrl || !proposalId) {
      toast.error('No topic URL configured');
      return;
    }

    setImportingTopic(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-topic', {
        body: { proposalId, topicUrl: proposal.topicUrl },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Topic content imported successfully');
        // Trigger a refresh of the proposal data
        if (onUpdateProposal) {
          await onUpdateProposal({});
        }
      } else {
        toast.error(data?.error || 'Failed to import topic content');
      }
    } catch (error) {
      console.error('Error importing topic:', error);
      toast.error('Failed to import topic content');
    } finally {
      setImportingTopic(false);
    }
  };

  const officialGuidelines = useMemo(() => {
    return (section.guidelinesArray || [])
      .filter(g => g.type === 'official' || g.type === 'evaluation')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(g => ({ id: g.id, title: g.title, content: g.content, type: g.type }));
  }, [section.guidelinesArray]);

  const sitraTips = useMemo(() => {
    return (section.guidelinesArray || [])
      .filter(g => g.type === 'sitra_tip')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(g => ({ id: g.id, title: g.title, content: g.content }));
  }, [section.guidelinesArray]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 bg-muted/30">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header row with Guidelines button on left, export buttons on right */}
        <div className="flex items-center justify-between">
          <PartAGuidelinesDialog
            sectionTitle="Part A1: General information"
            officialGuidelines={officialGuidelines}
            sitraTips={sitraTips}
          />
          <div className="flex items-center gap-3">
            {onExport && !isCoordinator && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => onExport('pdf', true)}>
                <Download className="w-4 h-4" />
                Export Part B
              </Button>
            )}
            {onExport && isCoordinator && (
              <>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsExportOpen(true)}>
                  <Download className="w-4 h-4" />
                  Export Part B
                </Button>
                <ExportDialog
                  open={isExportOpen}
                  onOpenChange={setIsExportOpen}
                  onExport={onExport}
                />
              </>
            )}
            {canEdit && <SaveIndicator saving={saving} lastSaved={lastSaved} />}
          </div>
        </div>

        {/* Project Identity Card */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" />
              Project identity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 items-start">
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Title</label>
                  {isEditing && editedProposal ? (
                    <Textarea
                      value={editedProposal.title}
                      onChange={(e) => setEditedProposal({ ...editedProposal, title: e.target.value })}
                      className="text-sm font-semibold resize-none max-w-lg"
                      placeholder="Full proposal title"
                      rows={3}
                    />
                  ) : (
                    <h2 className="text-sm font-semibold text-foreground max-w-lg" style={{ fontFamily: 'Arial, sans-serif' }}>{proposal?.title}</h2>
                  )}
                  <InlineGuideline className="mt-1">
                    Max 200 characters (with spaces). Must be understandable for non-specialists.
                  </InlineGuideline>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Acronym</label>
                  {isEditing && editedProposal ? (
                    <>
                      <Input
                        value={editedProposal.acronym}
                        onChange={(e) => setEditedProposal({ ...editedProposal, acronym: e.target.value })}
                        className="text-sm font-semibold w-40 h-8 mb-1.5"
                        placeholder="Acronym"
                      />
                      <AcronymColorEditor
                        acronym={editedProposal.acronym}
                        segments={(editedProposal as any).acronymSegments || []}
                        onChange={(segments) => {
                          setEditedProposal({ ...editedProposal, acronymSegments: segments } as any);
                          onUpdateProposal({ acronymSegments: segments });
                        }}
                      />
                    </>
                  ) : (
                    <p className="text-sm font-black" style={{ fontFamily: '"Arial Black", Arial, sans-serif' }}>{proposal?.acronym}</p>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0">
                <label className="text-xs text-muted-foreground mb-1 block">Project logo</label>
                <div className="flex gap-2 items-start">
                  {isEditing && editedProposal ? (
                    <LogoUpload
                      currentUrl={editedProposal.logoUrl || null}
                      proposalId={proposalId}
                      proposalAcronym={editedProposal.acronym}
                      proposalTitle={editedProposal.title}
                      onUpload={handleLogoChange}
                    />
                  ) : (
                    <AcronymLogo logoUrl={proposal?.logoUrl} acronym={proposal?.acronym || 'P'} />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Duration & Reporting Periods Card */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" />
              Duration &amp; reporting periods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Project duration (months)</label>
              {isEditing && editedProposal ? (
                <Select
                  value={editedProposal.duration?.toString() || ''}
                  onValueChange={(v) => setEditedProposal({ ...editedProposal, duration: parseInt(v) })}
                >
                  <SelectTrigger className="w-24 h-8 text-sm">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 72 }, (_, i) => i + 1).map((months) => (
                      <SelectItem key={months} value={months.toString()}>{months}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">{proposal?.duration ? `${proposal.duration}` : '–'}</p>
              )}
            </div>
            {userCanEditOverview && editedProposal && (
              <ReportingPeriodsEditor
                proposal={editedProposal}
                onUpdate={(rps) => {
                  setEditedProposal({ ...editedProposal, reportingPeriods: rps });
                  onUpdateProposal({ reportingPeriods: rps });
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Topic Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="w-4 h-4" />
                Topic
              </CardTitle>
              {proposal?.topicUrl && !isEditing && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => window.open(proposal.topicUrl, '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                  View on portal
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Topic ID</label>
              {isEditing && editedProposal ? (
                <div className="space-y-2">
                  <Input
                    value={editedProposal.topicId || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicId: e.target.value })}
                    placeholder="e.g. HORIZON-CL5-2026-D1-01"
                    className="max-w-md h-8 text-sm"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground mb-0.5 block">Link to topic description</label>
                    <Input
                      value={editedProposal.topicUrl || ''}
                      onChange={(e) => setEditedProposal({ ...editedProposal, topicUrl: e.target.value })}
                      placeholder="Portal URL (https://ec.europa.eu/...)"
                      type="url"
                      className="max-w-md h-8 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{proposal?.topicId || 'Not specified'}</p>
                  {proposal?.topicUrl && (
                    <a 
                      href={proposal.topicUrl.startsWith('http') ? proposal.topicUrl : `https://${proposal.topicUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Topic
                    </a>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Topic title</label>
              {isEditing && editedProposal ? (
                <Input
                  value={editedProposal.topicTitle || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, topicTitle: e.target.value })}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm font-medium">{proposal?.topicTitle || '–'}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Proposal stage</label>
                <p className="text-sm font-medium">
                  {proposal?.submissionStage === 'stage_1' ? 'Pre-proposal (stage 1)' : 'Full proposal'}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Type of action</label>
                <p className="text-sm font-medium">{proposal?.type || 'Not specified'}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Work programme</label>
                {isEditing && editedProposal ? (
                  <Select
                    value={editedProposal.workProgramme || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, workProgramme: v, destination: undefined })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select work programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_PROGRAMMES.map(wp => (
                        <SelectItem key={wp.id} value={wp.id}>
                          {wp.abbreviation} - {wp.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">
                    {workProgramme ? `${workProgramme.abbreviation} - ${workProgramme.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Destination</label>
                {isEditing && editedProposal ? (
                  <Select
                    value={editedProposal.destination || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, destination: v })}
                    disabled={!editedProposal.workProgramme}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {availableDestinations.map(d => (
                        <SelectItem key={d.id} value={d.id} className="!pl-2">
                          {d.abbreviation} - {d.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">
                    {destination ? `${destination.abbreviation} - ${destination.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Key Dates */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Deadline</label>
                {isEditing && editedProposal ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !editedProposal.deadline && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {editedProposal.deadline ? format(editedProposal.deadline, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={editedProposal.deadline}
                        onSelect={(date) => {
                          setEditedProposal({ 
                            ...editedProposal, 
                            deadline: date,
                            decisionDate: !editedProposal.decisionDate && date 
                              ? new Date(date.getFullYear(), date.getMonth() + 3, date.getDate()) 
                              : editedProposal.decisionDate
                          });
                        }}
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div>
                    <p className="text-sm font-medium">
                      {proposal?.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                    </p>
                    {daysUntilDeadline !== null && daysUntilDeadline > 0 && (
                      <p className="text-xs text-warning font-medium">{daysUntilDeadline} days remaining</p>
                    )}
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">
                  Decision{proposal?.status === 'draft' && ' (estimated)'}
                </label>
                {isEditing && editedProposal ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !editedProposal.decisionDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {editedProposal.decisionDate ? format(editedProposal.decisionDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={editedProposal.decisionDate}
                        onSelect={(date) => setEditedProposal({ ...editedProposal, decisionDate: date })}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-sm font-medium">
                    {proposal?.decisionDate 
                      ? format(proposal.decisionDate, 'dd MMM yyyy') 
                      : proposal?.deadline 
                        ? format(new Date(proposal.deadline.getFullYear(), proposal.deadline.getMonth() + 3, proposal.deadline.getDate()), 'dd MMM yyyy')
                        : 'Not set'}
                  </p>
                )}
              </div>

              {proposal?.status !== 'draft' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Submission date</label>
                  <p className="text-sm font-medium">
                    {proposal?.submittedAt ? format(proposal.submittedAt, 'dd MMM yyyy') : 'Not recorded'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Topic Content Import Section - Admin/Owner only */}
        {proposal?.topicUrl && userCanEditOverview && (
          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileDown className="w-4 h-4" />
                  Import Topic Content
                </CardTitle>
                {proposal?.topicContentImportedAt && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                    Last imported: {format(proposal.topicContentImportedAt, 'dd MMM yyyy, HH:mm')}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import the official topic description and destination text from the EU Funding & Tenders Portal. 
                This helps collaborators understand the call requirements while developing the proposal.
              </p>
              
              <Button
                variant="outline"
                onClick={handleImportTopicContent}
                disabled={importingTopic}
                className="gap-2"
              >
                {importingTopic ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : proposal?.topicDescription ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Check for updates
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    Import topic content
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Imported Topic Description - Visible to all */}
        {(proposal?.topicDescription || proposal?.topicDestinationDescription) && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" />
                Topic Description
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {proposal?.topicDescription && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">
                    Expected Outcome & Scope
                  </label>
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-96 overflow-y-auto">
                    {proposal.topicDescription}
                  </div>
                </div>
              )}
              
              {proposal?.topicDestinationDescription && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">
                    Destination
                  </label>
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-64 overflow-y-auto">
                    {proposal.topicDestinationDescription}
                  </div>
                </div>
              )}
              
              {proposal?.topicContentImportedAt && (
                <p className="text-xs text-muted-foreground italic">
                  Content imported from the EU Funding & Tenders Portal on {format(proposal.topicContentImportedAt, 'dd MMM yyyy')}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Budget Overview Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Euro className="w-4 h-4" />
              Budget overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget available (topic)</label>
                {isEditing && editedProposal ? (
                  <FormattedNumberInput
                    value={editedProposal.totalBudget || ''}
                    onChange={(val) => setEditedProposal({ ...editedProposal, totalBudget: val || undefined })}
                    placeholder="e.g. 5,000,000"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {proposal?.totalBudget ? `€${proposal.totalBudget.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '–'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget applied for</label>
                <p className="text-sm font-medium">€{totalBudgetFromItems.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">№ projects to be funded</label>
                {isEditing && editedProposal ? (
                  <Select
                    value={editedProposal.expectedProjects || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, expectedProjects: v })}
                  >
                    <SelectTrigger className="w-32 h-8 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">{proposal?.expectedProjects || '–'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget type</label>
                {isEditing && editedProposal ? (
                  <>
                    <Select
                      value={editedProposal.budgetType}
                      onValueChange={(v: 'traditional' | 'lump_sum') => {
                        if (v !== editedProposal.budgetType) {
                          setPendingBudgetType(v);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="traditional">Actual costs</SelectItem>
                        <SelectItem value="lump_sum">Lump sum</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Budget Type Change Confirmation Dialog */}
                    <AlertDialog open={!!pendingBudgetType} onOpenChange={(open) => !open && setPendingBudgetType(null)}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Change budget type?</AlertDialogTitle>
                          <AlertDialogDescription>
                            You are about to change the budget type from{' '}
                            <strong>{editedProposal.budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</strong> to{' '}
                            <strong>{pendingBudgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</strong>.
                            <br /><br />
                            This change should only be necessary if the topic requirements have changed. Are you sure you want to proceed?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              if (pendingBudgetType) {
                                setEditedProposal({ ...editedProposal, budgetType: pendingBudgetType });
                              }
                              setPendingBudgetType(null);
                            }}
                          >
                            Change budget type
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <p className="text-sm font-medium">{proposal?.budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</p>
                )}
              </div>
            </div>
            
            {/* FSTP Checkbox */}
            {canEdit ? (
              <div className="flex items-center space-x-2 mt-3 pt-3 border-t">
                <Checkbox 
                  id="uses-fstp" 
                  checked={proposal?.usesFstp || false} 
                  onCheckedChange={(checked) => onUpdateProposal({ usesFstp: checked === true })}
                />
                <Label htmlFor="uses-fstp" className="text-sm cursor-pointer">
                  Financial support to third parties (FSTP) is possible under this topic
                </Label>
              </div>
            ) : proposal?.usesFstp ? (
              <div className="flex items-center space-x-2 mt-3 pt-3 border-t">
                <Checkbox id="uses-fstp-readonly" checked disabled />
                <Label htmlFor="uses-fstp-readonly" className="text-sm text-muted-foreground">
                  Financial support to third parties (FSTP) is possible under this topic
                </Label>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Abstract */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Abstract</CardTitle>
            <InlineGuideline className="mt-2">
              Max 2000 characters (with spaces). It will be used as the short description of your proposal in the evaluation process and in communications if your proposal is funded.
            </InlineGuideline>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={formData.abstract}
              onChange={(e) => handleAbstractChange(e.target.value)}
              placeholder="Enter your proposal abstract..."
              className="min-h-[200px] resize-none"
              maxLength={2000}
              disabled={!canEdit}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{abstractWordCount} words</span>
              <span className={abstractCharCount > 1800 ? 'text-warning' : ''}>
                {abstractCharCount} / 2000 characters
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Fixed Keywords */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Fixed keywords</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit && formData.fixedKeywords.length < 5 && (
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter a keyword..."
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleAddKeyword}
                  disabled={!keywordInput.trim()}
                >
                  Add
                </Button>
              </div>
            )}
            
            <div className="flex flex-wrap gap-2">
              {formData.fixedKeywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="px-3 py-1.5 text-sm">
                  {keyword}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="ml-2 hover:text-destructive"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
              {formData.fixedKeywords.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No fixed keywords added yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Free Keywords */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Free keywords</CardTitle>
            <InlineGuideline className="mt-2">
              Enter any words you think give extra detail of the scope of your proposal (max 200 characters with spaces).
            </InlineGuideline>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={formData.freeKeywords}
              onChange={(e) => setFormData(prev => ({ ...prev, freeKeywords: e.target.value }))}
              placeholder="Enter free keywords..."
              className="min-h-[80px] resize-none"
              maxLength={200}
              disabled={!canEdit}
            />
            <div className="flex justify-end text-sm text-muted-foreground">
              <span className={freeKeywordsCharCount > 180 ? 'text-warning' : ''}>
                {freeKeywordsCharCount} / 200 characters
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Previous Submission */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Previous submission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>
                Has this proposal (or a very similar one) been submitted in the past 2 years in response to a call for proposals under any EU programme, including the current call?
              </Label>
              <RadioGroup
                value={formData.previousSubmission}
                onValueChange={(value: 'yes' | 'no') => setFormData(prev => ({ 
                  ...prev, 
                  previousSubmission: value,
                  previousSubmissionReference: value === 'no' ? '' : prev.previousSubmissionReference,
                }))}
                disabled={!canEdit}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="prev-yes" />
                  <Label htmlFor="prev-yes" className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="prev-no" />
                  <Label htmlFor="prev-no" className="font-normal cursor-pointer">No</Label>
                </div>
              </RadioGroup>
            </div>

            {formData.previousSubmission === 'yes' && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="prev-reference">Please give the proposal reference or contract number:</Label>
                <Input
                  id="prev-reference"
                  value={formData.previousSubmissionReference}
                  onChange={(e) => setFormData(prev => ({ ...prev, previousSubmissionReference: e.target.value }))}
                  placeholder="Enter proposal reference or contract number..."
                  disabled={!canEdit}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Declarations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Declarations</CardTitle>
            <InlineGuideline className="mt-2">
              By ticking the boxes below, applicants confirm the declarations on behalf of their organisation. If the proposal is retained for EU funding, they will all be required to sign a declaration of honour. False statements or incorrect information may lead to administrative sanctions under the EU Financial Regulation.
            </InlineGuideline>
          </CardHeader>
          <CardContent className="space-y-4">
            {DECLARATIONS.map((declaration) => (
              <div key={declaration.id} className="flex items-start space-x-3">
                <Checkbox
                  id={declaration.id}
                  checked={formData.declarations[declaration.id as keyof typeof formData.declarations]}
                  onCheckedChange={(checked) => handleDeclarationChange(declaration.id, checked as boolean)}
                  disabled={!canEdit}
                  className="mt-0.5"
                />
                <div className="font-normal text-sm leading-relaxed">
                  <Label htmlFor={declaration.id} className="font-normal cursor-pointer">
                    <span className="font-medium">{declaration.number}.</span>{' '}
                    {renderTextWithLinks(declaration.text, declaration.links)}
                  </Label>
                  {declaration.bullets && declaration.bullets.length > 0 && (
                    <ul className="list-disc ml-5 mt-1 space-y-0.5">
                      {declaration.bullets.map((bullet, idx) => (
                        <li key={idx}>
                          {typeof bullet === 'string' ? (
                            bullet
                          ) : (
                            <>
                              {bullet.text}
                              <a
                                href={bullet.link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {bullet.link.text}
                              </a>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {declaration.suffix && (
                    <p className="mt-1">{declaration.suffix}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>


        {/* Delete Proposal - Admins/Owners Only */}
        {isCoordinator && (
          <DeleteProposalSection proposalId={proposalId} proposalTitle={proposal?.title || 'this proposal'} />
        )}
      </div>
    </div>
  );
}

function DeleteProposalSection({ proposalId, proposalTitle }: { proposalId: string; proposalTitle: string }) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProposal = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', proposalId);

      if (error) throw error;

      toast.success('Proposal deleted successfully');
      navigate('/');
    } catch (error) {
      console.error('Error deleting proposal:', error);
      toast.error('Failed to delete proposal');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Delete Proposal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete this proposal and all associated data. This action cannot be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Proposal
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>"{proposalTitle}"</strong> and all its data, including:
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>All sections and content</li>
                  <li>All participants and their data</li>
                  <li>All work packages and drafts</li>
                  <li>All budget items and figures</li>
                  <li>All comments and version history</li>
                </ul>
                <p className="mt-3 font-medium text-destructive">This action cannot be undone.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProposal}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, delete proposal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
