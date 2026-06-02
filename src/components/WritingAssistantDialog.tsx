import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Wand2,
  Sparkles,
  Expand,
  Loader2,
  ChevronRight,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  MapPin,
  Building2,
  Target,
  Megaphone,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  X,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WritingAssistantDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  onApply: (newText: string) => void;
  plainText?: string;
  onApplyGrammarSuggestion?: (original: string, replacement: string) => void;
  sectionId?: string;
  proposalId?: string;
  canUseConsortiumBuilder?: boolean;
}

type Category = 'grammar' | 'conciseness' | 'clarity' | 'tone' | 'terminology';
type Decision = 'accept' | 'reject' | null;

interface GrammarSuggestion {
  original: string;
  replacement: string;
  type: Category | string;
  explanation: string;
  decision: Decision;
}

interface ExpandSuggestion {
  original: string;
  expanded: string;
  rationale: string;
  edited: string;
  decision: Decision;
}

interface EvaluationResult {
  overallScore: number;
  criteria: {
    name: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  }[];
  summary: string;
}

interface ConsortiumGap {
  type: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  suggestedProfile: {
    organisationType: string;
    region: string;
    expertise: string;
    role: string;
  };
  rationale: string;
}

interface ConsortiumAnalysis {
  summary: string;
  strengths: string[];
  gaps: ConsortiumGap[];
}

const CATEGORIES: { id: Category; label: string; description: string }[] = [
  { id: 'grammar', label: 'Grammar', description: 'Correct grammar (Grammarly-style)' },
  { id: 'conciseness', label: 'Conciseness', description: 'Remove redundant words; restructure where needed' },
  { id: 'clarity', label: 'Clarity', description: 'Improve clarity of content' },
  { id: 'tone', label: 'Tone', description: 'Sitra tone; formal future tense (e.g. “X will be done”)' },
  { id: 'terminology', label: 'Terminology', description: 'EU policy & Horizon Europe terminology' },
];

const categoryColors: Record<string, string> = {
  grammar: 'bg-destructive/10 text-destructive border-destructive/20',
  conciseness: 'bg-muted text-muted-foreground border-border',
  clarity: 'bg-warning/10 text-warning border-warning/20',
  tone: 'bg-primary/10 text-primary border-primary/20',
  terminology: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
};

const gapTypeIcons: Record<string, React.ReactNode> = {
  geographic: <MapPin className="w-4 h-4" />,
  expertise: <Lightbulb className="w-4 h-4" />,
  organisation_type: <Building2 className="w-4 h-4" />,
  role_coverage: <Target className="w-4 h-4" />,
  dissemination: <Megaphone className="w-4 h-4" />,
  exploitation: <TrendingUp className="w-4 h-4" />,
};

const priorityColors: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800',
  low: 'bg-muted text-muted-foreground border-border',
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const percentage = (score / 5) * 100;
  const color = score >= 4 ? 'text-green-600 dark:text-green-400' : score >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={cn('font-bold', color)}>{score}/5</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

/**
 * Direct fetch to an edge function with AbortSignal support, since the
 * supabase-js client's `functions.invoke` does not reliably expose signal.
 */
async function callFunction<T>(name: string, body: unknown, signal: AbortSignal): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as any)?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

export function WritingAssistantDialog({
  isOpen,
  onClose,
  selectedText,
  onApply,
  plainText,
  onApplyGrammarSuggestion,
  sectionId,
  proposalId,
  canUseConsortiumBuilder = false,
}: WritingAssistantDialogProps) {
  // Grammar tab state
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(new Set());
  const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([]);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const grammarAbortRef = useRef<AbortController | null>(null);

  // Content enhancement tab state
  const [expandSuggestions, setExpandSuggestions] = useState<ExpandSuggestion[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);
  const expandAbortRef = useRef<AbortController | null>(null);

  // Evaluation tab state
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [consortiumResult, setConsortiumResult] = useState<ConsortiumAnalysis | null>(null);
  const [includeConsortium, setIncludeConsortium] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const evalAbortRef = useRef<AbortController | null>(null);

  const sectionType = sectionId?.startsWith('b1-1') ? 'b1-1'
    : sectionId?.startsWith('b1-2') ? 'b1-2'
    : sectionId?.startsWith('b2-1') ? 'b2-1'
    : undefined;

  const toggleCategory = (id: Category) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // --- Grammar & writing style ---
  const handleGrammarCheck = useCallback(async () => {
    const text = plainText || '';
    if (!text || text.trim().length < 10) {
      toast.info('Please add more text before running the analysis');
      return;
    }
    if (selectedCategories.size === 0) {
      toast.info('Select at least one category');
      return;
    }

    const controller = new AbortController();
    grammarAbortRef.current = controller;
    setGrammarLoading(true);
    setGrammarSuggestions([]);

    try {
      const data = await callFunction<{ suggestions?: Omit<GrammarSuggestion, 'decision'>[]; error?: string }>(
        'grammar-check',
        { text, categories: Array.from(selectedCategories) },
        controller.signal,
      );
      if (data.error) {
        toast.error(data.error);
        return;
      }
      const list = (data.suggestions || []).map(s => ({ ...s, decision: null as Decision }));
      setGrammarSuggestions(list);
      if (list.length === 0) {
        toast.success('No issues found in the selected categories.');
      } else {
        toast.info(`Found ${list.length} suggestion(s)`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Grammar check error:', err);
      toast.error(err?.message || 'Failed to run analysis. Please try again.');
    } finally {
      setGrammarLoading(false);
      grammarAbortRef.current = null;
    }
  }, [plainText, selectedCategories]);

  const stopGrammar = () => grammarAbortRef.current?.abort();

  const setGrammarDecision = (idx: number, decision: Decision) => {
    setGrammarSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, decision } : s));
  };

  const processGrammarSelections = () => {
    const accepted = grammarSuggestions.filter(s => s.decision === 'accept');
    if (accepted.length === 0 && grammarSuggestions.every(s => s.decision !== 'reject')) {
      toast.info('Mark suggestions as Accept or Reject first');
      return;
    }
    if (onApplyGrammarSuggestion) {
      for (const s of accepted) {
        onApplyGrammarSuggestion(s.original, s.replacement);
      }
    }
    // Remove processed (accept + reject), keep undecided
    setGrammarSuggestions(prev => prev.filter(s => s.decision === null));
    toast.success(`Applied ${accepted.length} suggestion(s)`);
  };

  // --- Content enhancement: Expand ---
  const handleExpand = useCallback(async () => {
    if (!selectedText.trim()) {
      toast.error('Select text in the editor first');
      return;
    }
    const controller = new AbortController();
    expandAbortRef.current = controller;
    setExpandLoading(true);
    setExpandSuggestions([]);

    try {
      const data = await callFunction<{ suggestions?: { original: string; expanded: string; rationale: string }[]; error?: string }>(
        'writing-assistant',
        { text: selectedText, action: 'expand', sectionType },
        controller.signal,
      );
      if (data.error) {
        toast.error(data.error);
        return;
      }
      const list: ExpandSuggestion[] = (data.suggestions || []).map(s => ({
        ...s,
        edited: s.expanded,
        decision: null,
      }));
      setExpandSuggestions(list);
      if (list.length === 0) toast.info('No expansion suggestions returned.');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Expand error:', err);
      toast.error(err?.message || 'Failed to generate expansions.');
    } finally {
      setExpandLoading(false);
      expandAbortRef.current = null;
    }
  }, [selectedText, sectionType]);

  const stopExpand = () => expandAbortRef.current?.abort();

  const setExpandDecision = (idx: number, decision: Decision) => {
    setExpandSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, decision } : s));
  };

  const setExpandEdited = (idx: number, value: string) => {
    setExpandSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, edited: value } : s));
  };

  const processExpandSelections = () => {
    const accepted = expandSuggestions.filter(s => s.decision === 'accept');
    if (accepted.length === 0 && expandSuggestions.every(s => s.decision !== 'reject')) {
      toast.info('Mark suggestions as Accept or Reject first');
      return;
    }
    // For expand, apply each accept in turn. onApply replaces the current selection;
    // typically only one expansion is accepted at a time. Multiple accepts will each
    // replace the current selection (latest wins).
    for (const s of accepted) {
      onApply(s.edited);
    }
    setExpandSuggestions(prev => prev.filter(s => s.decision === null));
    if (accepted.length > 0) {
      toast.success('Expansion applied');
      onClose();
    } else {
      toast.success('Suggestions discarded');
    }
  };

  // --- Evaluation ---
  const handleEvaluate = useCallback(async () => {
    const text = plainText || selectedText;
    if (!text.trim()) {
      toast.error('No section text to evaluate');
      return;
    }
    const controller = new AbortController();
    evalAbortRef.current = controller;
    setEvalLoading(true);
    setEvaluation(null);
    setConsortiumResult(null);

    const sectionPromise = (async () => {
      try {
        const data = await callFunction<{ result?: string; error?: string }>(
          'writing-assistant',
          { text, action: 'evaluate_section', sectionType },
          controller.signal,
        );
        if (data.error) {
          toast.error(data.error);
          return;
        }
        const resultText = data.result || '';
        try {
          let jsonStr = resultText;
          const match = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (match) jsonStr = match[1].trim();
          const parsed = JSON.parse(jsonStr);
          setEvaluation(parsed);
        } catch {
          toast.error('Could not parse evaluation output.');
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Evaluate error:', err);
          toast.error(err?.message || 'Failed to evaluate section.');
        }
      }
    })();

    const consortiumPromise = includeConsortium && canUseConsortiumBuilder && proposalId
      ? (async () => {
          try {
            const data = await callFunction<{ result?: ConsortiumAnalysis; error?: string }>(
              'analyse-consortium',
              { proposalId },
              controller.signal,
            );
            if (data.error) {
              toast.error(data.error);
              return;
            }
            setConsortiumResult(data.result || null);
          } catch (err: any) {
            if (err?.name !== 'AbortError') {
              console.error('Consortium analysis error:', err);
              toast.error(err?.message || 'Failed to analyse consortium.');
            }
          }
        })()
      : Promise.resolve();

    try {
      await Promise.all([sectionPromise, consortiumPromise]);
    } finally {
      setEvalLoading(false);
      evalAbortRef.current = null;
    }
  }, [plainText, selectedText, sectionType, includeConsortium, canUseConsortiumBuilder, proposalId]);

  const stopEvaluate = () => evalAbortRef.current?.abort();

  // --- Lifecycle ---
  const handleClose = () => {
    grammarAbortRef.current?.abort();
    expandAbortRef.current?.abort();
    evalAbortRef.current?.abort();
    setGrammarSuggestions([]);
    setExpandSuggestions([]);
    setEvaluation(null);
    setConsortiumResult(null);
    onClose();
  };

  // Reset checkbox selections whenever the dialog closes so it reopens clean.
  useEffect(() => {
    if (!isOpen) {
      setSelectedCategories(new Set());
      setIncludeConsortium(false);
    }
  }, [isOpen]);

  const grammarAcceptedCount = useMemo(
    () => grammarSuggestions.filter(s => s.decision === 'accept').length,
    [grammarSuggestions],
  );
  const expandAcceptedCount = useMemo(
    () => expandSuggestions.filter(s => s.decision === 'accept').length,
    [expandSuggestions],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            AI tools
          </DialogTitle>
          <DialogDescription>
            Writing-style suggestions, content expansion, and evaluator-style feedback.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="grammar" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 shrink-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="grammar">Grammar &amp; writing style</TabsTrigger>
              <TabsTrigger value="content">Content enhancement</TabsTrigger>
              <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
            </TabsList>
          </div>

          {/* ===== Grammar & writing style ===== */}
          <TabsContent value="grammar" className="flex-1 flex flex-col min-h-0 mt-3 data-[state=inactive]:hidden">
            <div className="px-6 pb-3 shrink-0 space-y-3 border-b">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <label
                    key={cat.id}
                    className="flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedCategories.has(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{cat.label}</div>
                      <div className="text-xs text-muted-foreground">{cat.description}</div>
                    </div>
                  </label>
                ))}
              </div>
              {grammarLoading ? (
                <Button onClick={stopGrammar} variant="destructive" className="w-full gap-2" size="sm">
                  <X className="w-4 h-4" />
                  Stop analysis
                </Button>
              ) : (
                <Button
                  onClick={handleGrammarCheck}
                  disabled={selectedCategories.size === 0}
                  className="w-full gap-2"
                  size="sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Suggest grammatical and writing style improvements
                </Button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              {grammarLoading && grammarSuggestions.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Analysing…
                </div>
              )}
              {!grammarLoading && grammarSuggestions.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Select categories above, then click the button to analyse the section text.
                </div>
              )}
              <div className="space-y-2">
                {grammarSuggestions.map((s, idx) => (
                  <div key={idx} className="p-3 rounded-md border bg-card space-y-2">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0.5 capitalize', categoryColors[s.type] || 'bg-muted')}>
                      {s.type}
                    </Badge>
                    <div className="text-xs space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="text-destructive line-through">{s.original}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="text-success font-medium">{s.replacement}</span>
                      </div>
                      <p className="text-muted-foreground">{s.explanation}</p>
                    </div>
                    <RadioGroup
                      value={s.decision ?? ''}
                      onValueChange={(v) => setGrammarDecision(idx, v as Decision)}
                      className="flex gap-4 pt-1"
                    >
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <RadioGroupItem value="accept" id={`g-accept-${idx}`} />
                        <span>Accept</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <RadioGroupItem value="reject" id={`g-reject-${idx}`} />
                        <span>Reject</span>
                      </label>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t shrink-0 bg-background">
              <Button
                onClick={processGrammarSelections}
                disabled={grammarSuggestions.length === 0 || grammarSuggestions.every(s => s.decision === null)}
                className="w-full"
                size="sm"
              >
                Process selections{grammarAcceptedCount > 0 ? ` (${grammarAcceptedCount} accepted)` : ''}
              </Button>
            </div>
          </TabsContent>

          {/* ===== Content enhancement ===== */}
          <TabsContent value="content" className="flex-1 flex flex-col min-h-0 mt-3 data-[state=inactive]:hidden">
            <div className="px-6 pb-3 shrink-0 space-y-3 border-b">
              <div>
                <label className="text-sm font-medium">Selected text</label>
                <div className="mt-1 p-3 bg-muted rounded-md max-h-24 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedText || <span className="text-muted-foreground italic">Select text in the editor first</span>}
                  </p>
                </div>
                {selectedText && (
                  <Badge variant="secondary" className="text-xs mt-1">{selectedText.split(/\s+/).length} words</Badge>
                )}
              </div>
              {expandLoading ? (
                <Button onClick={stopExpand} variant="destructive" className="w-full gap-2" size="sm">
                  <X className="w-4 h-4" /> Stop analysis
                </Button>
              ) : (
                <Button
                  onClick={handleExpand}
                  disabled={!selectedText.trim()}
                  className="w-full gap-2"
                  size="sm"
                >
                  <Sparkles className="w-4 h-4" /> Enhance content
                </Button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              {expandLoading && expandSuggestions.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Enhancing content…
                </div>
              )}
              {!expandLoading && expandSuggestions.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Select text in the editor and click Enhance content to generate stronger versions you can edit before applying.
                </div>
              )}
              <div className="space-y-3">
                {expandSuggestions.map((s, idx) => (
                  <div key={idx} className="p-3 rounded-md border bg-card space-y-2">
                    <div className="text-xs text-muted-foreground italic">{s.rationale}</div>
                    <label className="text-xs font-medium text-primary">Enhanced text (editable)</label>
                    <Textarea
                      value={s.edited}
                      onChange={(e) => setExpandEdited(idx, e.target.value)}
                      className="min-h-[120px] text-sm"
                    />
                    <RadioGroup
                      value={s.decision ?? ''}
                      onValueChange={(v) => setExpandDecision(idx, v as Decision)}
                      className="flex gap-4 pt-1"
                    >
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <RadioGroupItem value="accept" id={`e-accept-${idx}`} />
                        <span>Accept</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <RadioGroupItem value="reject" id={`e-reject-${idx}`} />
                        <span>Reject</span>
                      </label>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t shrink-0 bg-background">
              <Button
                onClick={processExpandSelections}
                disabled={expandSuggestions.length === 0 || expandSuggestions.every(s => s.decision === null)}
                className="w-full"
                size="sm"
              >
                Process selections{expandAcceptedCount > 0 ? ` (${expandAcceptedCount} accepted)` : ''}
              </Button>
            </div>
          </TabsContent>

          {/* ===== Evaluation ===== */}
          <TabsContent value="evaluation" className="flex-1 flex flex-col min-h-0 mt-3 data-[state=inactive]:hidden">
            <div className="px-6 pb-3 shrink-0 space-y-2 border-b">
              <p className="text-xs text-muted-foreground">
                Runs a Horizon Europe reviewer-style scoring (1–5) of the whole section against the relevant EC criterion, with strengths, weaknesses, and improvement suggestions.
              </p>
              {canUseConsortiumBuilder && proposalId && (
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={includeConsortium}
                    onCheckedChange={(v) => setIncludeConsortium(Boolean(v))}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Also evaluate the consortium for this proposal</span>
                    <span className="block text-xs text-muted-foreground">
                      Analyse the whole consortium against HE best practices and flag gaps.
                    </span>
                  </span>
                </label>
              )}
              {evalLoading ? (
                <Button onClick={stopEvaluate} variant="destructive" className="w-full gap-2" size="sm">
                  <X className="w-4 h-4" /> Stop analysis
                </Button>
              ) : (
                <Button onClick={handleEvaluate} className="w-full gap-2" size="sm">
                  <BarChart3 className="w-4 h-4" /> Evaluate
                </Button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3 space-y-4">
              {evalLoading && !evaluation && !consortiumResult && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Evaluating…
                </div>
              )}
              {!evalLoading && !evaluation && !consortiumResult && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Click Evaluate to score this section.
                </div>
              )}

              {evaluation && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        Overall score
                      </h4>
                      <span className={cn(
                        'text-2xl font-bold',
                        evaluation.overallScore >= 4 ? 'text-green-600 dark:text-green-400'
                          : evaluation.overallScore >= 3 ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive',
                      )}>
                        {evaluation.overallScore}/5
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{evaluation.summary}</p>
                  </div>

                  {evaluation.criteria.map((c, idx) => (
                    <div key={idx} className="p-4 rounded-lg border space-y-3">
                      <ScoreBar score={c.score} label={c.name} />
                      {c.strengths.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1 text-green-600 dark:text-green-400">
                            <ThumbsUp className="w-3 h-3" /> Strengths
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                            {c.strengths.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {c.weaknesses.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1 text-destructive">
                            <ThumbsDown className="w-3 h-3" /> Weaknesses
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                            {c.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}
                      {c.suggestions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1 text-primary">
                            <Lightbulb className="w-3 h-3" /> Suggestions
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                            {c.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {consortiumResult && (
                <div className="space-y-3 pt-2 border-t">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-primary" /> Consortium analysis
                  </h4>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm">{consortiumResult.summary}</p>
                  </div>
                  {consortiumResult.strengths.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-sm font-medium flex items-center gap-1.5 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-4 h-4" /> Strengths
                      </h4>
                      <ul className="text-sm space-y-1 ml-6 list-disc text-muted-foreground">
                        {consortiumResult.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {consortiumResult.gaps.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" /> Recommended partners
                      </h4>
                      {consortiumResult.gaps.map((gap, idx) => (
                        <div key={idx} className={cn('p-3 rounded-lg border space-y-2', priorityColors[gap.priority] || priorityColors.medium)}>
                          <div className="flex items-center gap-2">
                            {gapTypeIcons[gap.type] || <Target className="w-4 h-4" />}
                            <span className="text-sm font-medium flex-1">{gap.description}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">{gap.priority}</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="font-medium">Type:</span> <span className="text-muted-foreground">{gap.suggestedProfile.organisationType}</span></div>
                            <div><span className="font-medium">Region:</span> <span className="text-muted-foreground">{gap.suggestedProfile.region}</span></div>
                            <div><span className="font-medium">Expertise:</span> <span className="text-muted-foreground">{gap.suggestedProfile.expertise}</span></div>
                            <div><span className="font-medium">Role:</span> <span className="text-muted-foreground">{gap.suggestedProfile.role}</span></div>
                          </div>
                          <p className="text-xs text-muted-foreground italic">{gap.rationale}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
