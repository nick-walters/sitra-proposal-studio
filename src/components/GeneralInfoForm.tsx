import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InlineGuideline } from "./GuidelineBox";
import { SitraTipsBox } from "./SitraTipsBox";
import { Section } from "@/types/proposal";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SaveIndicator } from "./SaveIndicator";
import { Loader2 } from "lucide-react";

interface GeneralInfoFormProps {
  proposalId: string;
  proposal: {
    acronym: string;
    title: string;
    topicId?: string;
    description?: string;
  } | null;
  section: Section;
  canEdit: boolean;
  onUpdateProposal: (updates: Record<string, any>) => Promise<void>;
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
    // Add text before the match
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
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return <>{parts}</>;
};

export function GeneralInfoForm({
  proposalId,
  proposal,
  section,
  canEdit,
  onUpdateProposal,
}: GeneralInfoFormProps) {
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

  // Load existing content from section_content
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
            // If content is plain text, treat as abstract
            setFormData(prev => ({
              ...prev,
              abstract: data.content,
            }));
          }
        }
      } catch (error) {
        console.error('Error loading general info:', error);
      }
      setLoading(false);
    };

    loadContent();
  }, [proposalId]);

  // Auto-save with debounce
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

  // Debounced save
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

  // Word count for abstract (limit 2000 characters as per HE standard)
  const abstractCharCount = formData.abstract.length;
  const abstractWordCount = formData.abstract.trim() ? formData.abstract.trim().split(/\s+/).length : 0;
  const freeKeywordsCharCount = formData.freeKeywords.length;

  // Extract Sitra tips from section guidelines - must be before early return to maintain hook order
  const sitraTips = useMemo(() => {
    return (section.guidelinesArray || [])
      .filter(g => g.type === 'sitra_tip')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(g => ({
        id: g.id,
        title: g.title,
        content: g.content,
      }));
  }, [section.guidelinesArray]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Part A1: General information</h1>
          {canEdit && <SaveIndicator saving={saving} lastSaved={lastSaved} />}
        </div>

        {/* Sitra's Tips */}
        <SitraTipsBox tips={sitraTips} />

        {/* Proposal Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Proposal summary</CardTitle>
            <CardDescription>
              Basic information about your proposal (editable in Proposal overview)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Acronym</Label>
                <p className="font-medium">{proposal?.acronym || '-'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Topic ID</Label>
                <p className="font-medium">{proposal?.topicId || '-'}</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-sm">Title</Label>
              <p className="font-medium">{proposal?.title || '-'}</p>
              <InlineGuideline className="mt-1">
                Max 200 characters (with spaces). Must be understandable for non-specialists. The following characters are not accepted: {'< > " &'}
              </InlineGuideline>
            </div>
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
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="px-3 py-1.5 text-sm"
                >
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
                  <Label 
                    htmlFor={declaration.id} 
                    className="font-normal cursor-pointer"
                  >
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
      </div>
    </div>
  );
}