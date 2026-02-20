import { useState, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Wand2, 
  Sparkles, 
  Scissors, 
  Expand, 
  Globe, 
  Loader2,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  Type,
  MessageSquare,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Users,
  MapPin,
  Building2,
  Target,
  Megaphone,
  TrendingUp,
  AlertTriangle,
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

type Action = 'improve_clarity' | 'improve_tone' | 'make_concise' | 'expand' | 'eu_language' | 'evaluate_section';

const actions: { id: Action; label: string; icon: React.ReactNode; description: string }[] = [
  { 
    id: 'improve_clarity', 
    label: 'Improve Clarity', 
    icon: <Wand2 className="w-4 h-4" />,
    description: 'Make complex ideas more accessible'
  },
  { 
    id: 'improve_tone', 
    label: 'Improve Tone', 
    icon: <Sparkles className="w-4 h-4" />,
    description: "Apply Sitra's professional tone"
  },
  { 
    id: 'make_concise', 
    label: 'Make Concise', 
    icon: <Scissors className="w-4 h-4" />,
    description: 'Remove redundancy, be direct'
  },
  { 
    id: 'expand', 
    label: 'Expand', 
    icon: <Expand className="w-4 h-4" />,
    description: 'Add detail and strengthen'
  },
  { 
    id: 'eu_language', 
    label: 'EU Language', 
    icon: <Globe className="w-4 h-4" />,
    description: 'Adapt to Horizon Europe style'
  },
  { 
    id: 'evaluate_section', 
    label: 'Evaluate Section', 
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Get evaluator-style feedback'
  },
];

// Grammar types
interface Suggestion {
  original: string;
  replacement: string;
  type: 'grammar' | 'spelling' | 'style' | 'clarity' | 'wordiness' | 'punctuation';
  explanation: string;
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

const typeIcons: Record<string, React.ReactNode> = {
  grammar: <Type className="w-3.5 h-3.5" />,
  spelling: <AlertCircle className="w-3.5 h-3.5" />,
  style: <Wand2 className="w-3.5 h-3.5" />,
  clarity: <MessageSquare className="w-3.5 h-3.5" />,
  wordiness: <Type className="w-3.5 h-3.5" />,
  punctuation: <Type className="w-3.5 h-3.5" />,
};

const typeColors: Record<string, string> = {
  grammar: 'bg-destructive/10 text-destructive border-destructive/20',
  spelling: 'bg-destructive/10 text-destructive border-destructive/20',
  style: 'bg-primary/10 text-primary border-primary/20',
  clarity: 'bg-warning/10 text-warning border-warning/20',
  wordiness: 'bg-muted text-muted-foreground border-border',
  punctuation: 'bg-destructive/10 text-destructive border-destructive/20',
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const percentage = (score / 5) * 100;
  const color = score >= 4 ? 'text-green-600 dark:text-green-400' : score >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={cn("font-bold", color)}>{score}/5</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
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
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [copied, setCopied] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  // Grammar state
  const [grammarSuggestions, setGrammarSuggestions] = useState<Suggestion[]>([]);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());

  // Consortium builder state
  const [consortiumResult, setConsortiumResult] = useState<ConsortiumAnalysis | null>(null);
  const [consortiumLoading, setConsortiumLoading] = useState(false);

  // Derive sectionType from sectionId for criteria context
  const sectionType = sectionId?.startsWith('b1-1') ? 'b1-1' 
    : sectionId?.startsWith('b1-2') ? 'b1-2' 
    : sectionId?.startsWith('b2-1') ? 'b2-1' 
    : undefined;

  const handleAction = useCallback(async (action: Action) => {
    const textToUse = action === 'evaluate_section' ? (plainText || selectedText) : selectedText;
    if (!textToUse.trim()) {
      toast.error(action === 'evaluate_section' ? 'No section text to evaluate' : 'No text selected');
      return;
    }

    setLoading(true);
    setActiveAction(action);
    setResult('');
    setEvaluation(null);

    try {
      const { data, error } = await supabase.functions.invoke('writing-assistant', {
        body: { text: textToUse, action, sectionType },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const resultText = data?.result || '';

      if (action === 'evaluate_section') {
        try {
          // Try to parse JSON from the result, handling markdown code blocks
          let jsonStr = resultText;
          const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();
          const parsed = JSON.parse(jsonStr);
          setEvaluation(parsed);
        } catch {
          // If JSON parsing fails, show as text
          setResult(resultText);
        }
      } else {
        setResult(resultText);
      }
    } catch (err) {
      console.error('Writing assistant error:', err);
      toast.error('Failed to process text. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedText, plainText, sectionType]);

  const handleGrammarCheck = useCallback(async () => {
    const text = plainText || '';
    if (!text || text.trim().length < 10) {
      toast.info("Please add more text before checking grammar");
      return;
    }

    setGrammarLoading(true);
    setAppliedSuggestions(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('grammar-check', {
        body: { text }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setGrammarSuggestions(data.suggestions || []);
      
      if (data.suggestions?.length === 0) {
        toast.success("No issues found! Your text looks great.");
      } else {
        toast.info(`Found ${data.suggestions.length} suggestion(s)`);
      }
    } catch (error) {
      console.error('Grammar check error:', error);
      toast.error("Failed to check grammar. Please try again.");
    } finally {
      setGrammarLoading(false);
    }
  }, [plainText]);

  const handleApplyGrammar = (suggestion: Suggestion, index: number) => {
    if (onApplyGrammarSuggestion) {
      onApplyGrammarSuggestion(suggestion.original, suggestion.replacement);
      setAppliedSuggestions(prev => new Set([...prev, index]));
    }
  };

  const handleCopy = useCallback(() => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const handleApply = useCallback(() => {
    if (result) {
      onApply(result);
      onClose();
      toast.success('Text replaced');
    }
  }, [result, onApply, onClose]);

  const handleAnalyseConsortium = useCallback(async () => {
    if (!proposalId) {
      toast.error('No proposal context available');
      return;
    }
    setConsortiumLoading(true);
    setConsortiumResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyse-consortium', {
        body: { proposalId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setConsortiumResult(data?.result || null);
    } catch (err) {
      console.error('Consortium analysis error:', err);
      toast.error('Failed to analyse consortium');
    } finally {
      setConsortiumLoading(false);
    }
  }, [proposalId]);

  const handleClose = () => {
    setResult('');
    setActiveAction(null);
    setEvaluation(null);
    setConsortiumResult(null);
    onClose();
  };

  const hasEvaluationOrResult = evaluation || result;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            AI Tools
          </DialogTitle>
          <DialogDescription>
            Grammar checking, AI-powered writing improvements, and evaluator-style feedback
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="grammar" className="flex-1 flex flex-col min-h-0">
          <TabsList className={cn("grid w-full", canUseConsortiumBuilder ? "grid-cols-5" : "grid-cols-4")}>
            <TabsTrigger value="grammar">Grammar</TabsTrigger>
            <TabsTrigger value="actions">Writing</TabsTrigger>
            {canUseConsortiumBuilder && (
              <TabsTrigger value="consortium">
                <Users className="w-3.5 h-3.5 mr-1" />
                Consortium
              </TabsTrigger>
            )}
            <TabsTrigger value="result" disabled={!result}>Result</TabsTrigger>
            <TabsTrigger value="evaluation" disabled={!evaluation}>Evaluation</TabsTrigger>
          </TabsList>

          {/* Grammar Check Tab */}
          <TabsContent value="grammar" className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="space-y-3">
              <Button 
                onClick={handleGrammarCheck} 
                disabled={grammarLoading}
                className="w-full gap-2"
                size="sm"
              >
                {grammarLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Check Grammar & Style
                  </>
                )}
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[400px]">
              {grammarSuggestions.length > 0 ? (
                <div className="space-y-2">
                  {grammarSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-md border ${
                        appliedSuggestions.has(index) 
                          ? 'bg-success/10 border-success/20 opacity-60' 
                          : 'bg-card'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] px-1.5 py-0.5 ${typeColors[suggestion.type]}`}
                        >
                          {typeIcons[suggestion.type]}
                          <span className="ml-1 capitalize">{suggestion.type}</span>
                        </Badge>
                        {appliedSuggestions.has(index) && (
                          <CheckCircle2 className="w-4 h-4 text-success ml-auto" />
                        )}
                      </div>

                      <div className="text-xs space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-destructive line-through">{suggestion.original}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-success font-medium">{suggestion.replacement}</span>
                        </div>
                        <p className="text-muted-foreground">{suggestion.explanation}</p>
                      </div>

                      {!appliedSuggestions.has(index) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs w-full"
                          onClick={() => handleApplyGrammar(suggestion, index)}
                        >
                          Apply Suggestion
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : !grammarLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Click "Check Grammar & Style" to analyze the section text
                </div>
              ) : null}
            </ScrollArea>
          </TabsContent>

          {/* Writing Assistant Tab */}
          <TabsContent value="actions" className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Selected Text</label>
              <div className="p-3 bg-muted rounded-md max-h-32 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap">
                  {selectedText || <span className="text-muted-foreground italic">Select text in the editor first</span>}
                </p>
              </div>
              {selectedText && (
                <Badge variant="secondary" className="text-xs">
                  {selectedText.split(/\s+/).length} words
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Choose an action</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {actions.map((action) => (
                  <Button
                    key={action.id}
                    variant={activeAction === action.id ? "default" : "outline"}
                    className="h-auto py-3 px-4 justify-start"
                    onClick={() => handleAction(action.id)}
                    disabled={loading || (action.id !== 'evaluate_section' && !selectedText.trim())}
                  >
                    <div className="flex items-center gap-3 w-full">
                      {loading && activeAction === action.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        action.icon
                      )}
                      <div className="text-left">
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs text-muted-foreground font-normal">
                          {action.description}
                        </div>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Result Tab */}
          <TabsContent value="result" className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="gap-1">
                {actions.find(a => a.id === activeAction)?.icon}
                {actions.find(a => a.id === activeAction)?.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Original</label>
                <div className="p-3 bg-muted rounded-md h-[200px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{selectedText}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-primary">Improved</label>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-md h-[200px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{result}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-xs text-muted-foreground">
                {result.split(/\s+/).length} words ({result.split(/\s+/).length - selectedText.split(/\s+/).length > 0 ? '+' : ''}{result.split(/\s+/).length - selectedText.split(/\s+/).length})
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  Copy
                </Button>
                <Button size="sm" onClick={handleApply}>
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Apply Change
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Evaluation Tab */}
          <TabsContent value="evaluation" className="flex-1 flex flex-col min-h-0 space-y-4">
            {evaluation && (
              <ScrollArea className="flex-1 max-h-[450px]">
                <div className="space-y-4 pr-4">
                  {/* Overall score */}
                  <div className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        Overall Score
                      </h4>
                      <span className={cn(
                        "text-2xl font-bold",
                        evaluation.overallScore >= 4 ? "text-green-600 dark:text-green-400" 
                          : evaluation.overallScore >= 3 ? "text-amber-600 dark:text-amber-400" 
                          : "text-destructive"
                      )}>
                        {evaluation.overallScore}/5
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{evaluation.summary}</p>
                  </div>

                  {/* Per-criterion breakdown */}
                  {evaluation.criteria.map((criterion, idx) => (
                    <div key={idx} className="p-4 rounded-lg border space-y-3">
                      <ScoreBar score={criterion.score} label={criterion.name} />

                      {criterion.strengths.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1 text-green-600 dark:text-green-400">
                            <ThumbsUp className="w-3 h-3" /> Strengths
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                            {criterion.strengths.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}

                      {criterion.weaknesses.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1 text-destructive">
                            <ThumbsDown className="w-3 h-3" /> Weaknesses
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                            {criterion.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}

                      {criterion.suggestions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1 text-primary">
                            <Lightbulb className="w-3 h-3" /> Suggestions
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                            {criterion.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Consortium Builder Tab */}
          {canUseConsortiumBuilder && (
            <TabsContent value="consortium" className="flex-1 flex flex-col min-h-0 space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  AI analyses your current consortium against Horizon Europe best practices and suggests missing partner profiles.
                </p>
                <Button
                  onClick={handleAnalyseConsortium}
                  disabled={consortiumLoading}
                  className="w-full gap-2"
                  size="sm"
                >
                  {consortiumLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analysing consortium...
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4" />
                      Analyse Consortium
                    </>
                  )}
                </Button>
              </div>

              {consortiumResult && (
                <ScrollArea className="flex-1 max-h-[400px]">
                  <div className="space-y-4 pr-4">
                    {/* Summary */}
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-sm">{consortiumResult.summary}</p>
                    </div>

                    {/* Strengths */}
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

                    {/* Gaps */}
                    {consortiumResult.gaps.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" /> Recommended Partners
                        </h4>
                        {consortiumResult.gaps.map((gap, idx) => (
                          <div key={idx} className={cn("p-3 rounded-lg border space-y-2", priorityColors[gap.priority] || priorityColors.medium)}>
                            <div className="flex items-center gap-2">
                              {gapTypeIcons[gap.type] || <Target className="w-4 h-4" />}
                              <span className="text-sm font-medium flex-1">{gap.description}</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{gap.priority}</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="font-medium">Type:</span>{' '}
                                <span className="text-muted-foreground">{gap.suggestedProfile.organisationType}</span>
                              </div>
                              <div>
                                <span className="font-medium">Region:</span>{' '}
                                <span className="text-muted-foreground">{gap.suggestedProfile.region}</span>
                              </div>
                              <div>
                                <span className="font-medium">Expertise:</span>{' '}
                                <span className="text-muted-foreground">{gap.suggestedProfile.expertise}</span>
                              </div>
                              <div>
                                <span className="font-medium">Role:</span>{' '}
                                <span className="text-muted-foreground">{gap.suggestedProfile.role}</span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground italic">{gap.rationale}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {consortiumResult.gaps.length === 0 && consortiumResult.strengths.length > 0 && (
                      <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-700 dark:text-green-400">No major gaps identified in the consortium.</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
