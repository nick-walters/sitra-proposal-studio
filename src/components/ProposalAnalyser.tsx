import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Star,
  Lightbulb,
  TrendingUp,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Link2,
  ClipboardCheck,
  Sparkles,
  Target,
  MinusCircle,
  History,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface ProposalAnalyserProps {
  proposalId: string;
}

interface AnalysisSection {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  threshold: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  missingElements: string[];
  topicAlignment: string;
}

interface CrossRefIssue {
  type: 'error' | 'warning';
  category: string;
  message: string;
}

interface CompletenessItem {
  item: string;
  status: 'done' | 'partial' | 'missing';
  details: string;
}

interface AnalysisResult {
  overallAssessment: string;
  sections: AnalysisSection[];
  crossRefIssues: CrossRefIssue[];
  completenessChecklist: CompletenessItem[];
  strategicRecommendations: string[];
}

interface SavedAnalysis {
  id: string;
  analysis_data: AnalysisResult;
  overall_score: number;
  created_by: string;
  created_at: string;
}

// ========== Background analysis tracking (survives unmount) ==========
interface InFlightAnalysis {
  promise: Promise<{ result: AnalysisResult; savedId: string | null } | null>;
  startedAt: number;
}
const inflightAnalyses = new Map<string, InFlightAnalysis>();

const CRITERION_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  excellence: { icon: <Lightbulb className="w-4 h-4" />, color: 'text-amber-600' },
  impact: { icon: <TrendingUp className="w-4 h-4" />, color: 'text-blue-600' },
  implementation: { icon: <Wrench className="w-4 h-4" />, color: 'text-green-600' },
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />,
  partial: <MinusCircle className="w-4 h-4 text-amber-500 shrink-0" />,
  missing: <XCircle className="w-4 h-4 text-destructive shrink-0" />,
};

export function ProposalAnalyser({ proposalId }: ProposalAnalyserProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => inflightAnalyses.has(proposalId));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Helper to expand all sections for a result
  const expandAllSections = (result: AnalysisResult) => {
    const ids = new Set<string>();
    (result.sections || []).forEach((s: AnalysisSection) => ids.add(s.id));
    ids.add('crossrefs');
    ids.add('completeness');
    ids.add('recommendations');
    setExpandedSections(ids);
  };

  // Reconnect to in-flight analysis on mount
  useEffect(() => {
    const inflight = inflightAnalyses.get(proposalId);
    if (inflight) {
      setLoading(true);
      inflight.promise.then((outcome) => {
        if (!mountedRef.current) return;
        if (outcome) {
          setAnalysis(outcome.result);
          setSelectedAnalysisId(outcome.savedId);
          expandAllSections(outcome.result);
          toast.success('Analysis complete');
        }
        setLoading(false);
      }).catch(() => {
        if (mountedRef.current) setLoading(false);
      });
    }
  }, [proposalId]);

  // Fetch saved analyses
  const { data: savedAnalyses = [] } = useQuery({
    queryKey: ['proposal-analyses', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_analyses')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SavedAnalysis[];
    },
    enabled: !!proposalId,
  });

  // Load the latest analysis on mount (only if not already loading)
  useEffect(() => {
    if (savedAnalyses.length > 0 && !analysis && !loading) {
      const latest = savedAnalyses[0];
      setAnalysis(latest.analysis_data);
      setSelectedAnalysisId(latest.id);
      expandAllSections(latest.analysis_data);
    }
  }, [savedAnalyses]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAnalysis = async () => {
    setLoading(true);
    setAnalysis(null);
    setSelectedAnalysisId(null);

    // Create a background promise that persists across unmounts
    const userId = user?.id || '';
    const analysisPromise = (async (): Promise<{ result: AnalysisResult; savedId: string | null } | null> => {
      try {
        const { data, error } = await supabase.functions.invoke('analyse-proposal', {
          body: { proposalId },
        });
        if (error) throw error;
        if (data?.error) {
          if (mountedRef.current) toast.error(data.error);
          return null;
        }
        const result = data.analysis as AnalysisResult;
        const overallScore = result.sections.reduce((s, a) => s + a.score, 0);

        // Save to database
        const { data: saved, error: saveError } = await supabase
          .from('proposal_analyses')
          .insert({
            proposal_id: proposalId,
            analysis_data: result as any,
            overall_score: overallScore,
            created_by: userId,
          })
          .select('id')
          .single();

        if (saveError) console.error('Failed to save analysis:', saveError);

        // Invalidate query cache (works even if component is unmounted)
        queryClient.invalidateQueries({ queryKey: ['proposal-analyses', proposalId] });

        return { result, savedId: saved?.id || null };
      } catch (err: any) {
        console.error('Analysis error:', err);
        if (mountedRef.current) toast.error(err?.message || 'Failed to run analysis');
        return null;
      } finally {
        inflightAnalyses.delete(proposalId);
      }
    })();

    // Store in global map so it survives navigation
    inflightAnalyses.set(proposalId, { promise: analysisPromise, startedAt: Date.now() });

    // If still mounted when done, update UI
    const outcome = await analysisPromise;
    if (mountedRef.current) {
      if (outcome) {
        setAnalysis(outcome.result);
        setSelectedAnalysisId(outcome.savedId);
        expandAllSections(outcome.result);
        toast.success('Analysis complete');
      }
      setLoading(false);
    }
  };

  const loadAnalysis = (saved: SavedAnalysis) => {
    setAnalysis(saved.analysis_data);
    setSelectedAnalysisId(saved.id);
    setShowHistory(false);
    const ids = new Set<string>();
    (saved.analysis_data.sections || []).forEach((s: AnalysisSection) => ids.add(s.id));
    ids.add('crossrefs');
    ids.add('completeness');
    ids.add('recommendations');
    setExpandedSections(ids);
  };

  const deleteAnalysis = async (id: string) => {
    const { error } = await supabase
      .from('proposal_analyses')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Failed to delete analysis');
      return;
    }
    if (selectedAnalysisId === id) {
      setAnalysis(null);
      setSelectedAnalysisId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['proposal-analyses', proposalId] });
    toast.success('Analysis deleted');
  };

  const overallScore = analysis
    ? analysis.sections.reduce((s, a) => s + a.score, 0)
    : 0;
  const maxOverall = analysis
    ? analysis.sections.reduce((s, a) => s + a.maxScore, 0)
    : 0;
  const errorCount = analysis?.crossRefIssues?.filter(i => i.type === 'error').length || 0;
  const warningCount = analysis?.crossRefIssues?.filter(i => i.type === 'warning').length || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Proposal Analyser
          </h2>
          <p className="text-sm text-muted-foreground">
            Deep AI analysis of content quality, topic alignment, cross-references, and evaluation readiness
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAnalyses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="gap-1.5"
            >
              <History className="w-4 h-4" />
              History ({savedAnalyses.length})
            </Button>
          )}
          <Button onClick={runAnalysis} disabled={loading} className="gap-2">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analysing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {analysis ? 'Re-analyse' : 'Run analysis'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Version History Panel */}
      {showHistory && savedAnalyses.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Previous analyses</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {savedAnalyses.map((saved) => {
                const isActive = selectedAnalysisId === saved.id;
                return (
                  <div
                    key={saved.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md text-sm cursor-pointer transition-colors group",
                      isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted'
                    )}
                    onClick={() => loadAnalysis(saved)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">
                        {format(new Date(saved.created_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {saved.overall_score?.toFixed(1) ?? '—'}/{maxOverall || 15}
                      </Badge>
                      {isActive && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          Viewing
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAnalysis(saved.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mb-1">Running deep analysis...</p>
            <p className="text-xs text-muted-foreground">This may take 30-60 seconds</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !analysis && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Click "Run analysis" to perform a comprehensive evaluation of your proposal</p>
            <p className="text-xs mt-1">Analyses content quality, topic alignment, cross-references, and scoring readiness</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {analysis && !loading && (
        <ScrollArea className="max-h-[calc(100vh-220px)]">
          <div className="space-y-4 pr-4">
            {/* Overall Assessment */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="text-center shrink-0">
                    <p className="text-3xl font-bold">{overallScore.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">/{maxOverall}</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">Overall score</span>
                      <Badge variant={overallScore >= 10 ? 'default' : 'destructive'} className="text-[10px]">
                        {overallScore >= 10 ? 'Above threshold' : 'Below threshold (10)'}
                      </Badge>
                    </div>
                    <Progress value={maxOverall > 0 ? (overallScore / maxOverall) * 100 : 0} className="h-2" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{analysis.overallAssessment}</p>
              </CardContent>
            </Card>

            {/* Per-Criterion Sections */}
            {analysis.sections.map(section => {
              const config = CRITERION_CONFIG[section.id] || CRITERION_CONFIG.excellence;
              const isExpanded = expandedSections.has(section.id);
              const percentage = section.maxScore > 0 ? (section.score / section.maxScore) * 100 : 0;
              
              return (
                <Collapsible key={section.id} open={isExpanded} onOpenChange={() => toggleSection(section.id)}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
                        <div className="flex items-center gap-3">
                          <span className={config.color}>{config.icon}</span>
                          <span className="font-medium text-sm">{section.title}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{section.score.toFixed(1)}/{section.maxScore}</span>
                          {section.score >= section.threshold ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 px-4 space-y-3">
                        <Progress value={percentage} className="h-1.5" />
                        
                        {/* Topic alignment */}
                        {section.topicAlignment && (
                          <div className="p-2.5 bg-primary/5 rounded-md">
                            <p className="text-xs font-medium text-primary mb-0.5 flex items-center gap-1">
                              <Target className="w-3 h-3" /> Topic alignment
                            </p>
                            <p className="text-xs text-muted-foreground">{section.topicAlignment}</p>
                          </div>
                        )}

                        {/* Strengths */}
                        {section.strengths.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Strengths</p>
                            <ul className="space-y-0.5">
                              {section.strengths.map((s, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <CheckCircle2 className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Weaknesses */}
                        {section.weaknesses.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Weaknesses</p>
                            <ul className="space-y-0.5">
                              {section.weaknesses.map((w, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Missing elements */}
                        {section.missingElements.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-destructive mb-1">Missing elements</p>
                            <ul className="space-y-0.5">
                              {section.missingElements.map((m, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <XCircle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
                                  {m}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Improvements */}
                        {section.improvements.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-primary mb-1">How to improve</p>
                            <ul className="space-y-0.5">
                              {section.improvements.map((imp, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <Sparkles className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                                  {imp}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}

            {/* Cross-Reference Issues */}
            <Collapsible open={expandedSections.has('crossrefs')} onOpenChange={() => toggleSection('crossrefs')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-3">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Cross-reference consistency</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {errorCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] gap-0.5">
                          <XCircle className="w-3 h-3" /> {errorCount}
                        </Badge>
                      )}
                      {warningCount > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-500 text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> {warningCount}
                        </Badge>
                      )}
                      {errorCount === 0 && warningCount === 0 && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-green-500 text-green-600">
                          <CheckCircle2 className="w-3 h-3" /> All consistent
                        </Badge>
                      )}
                      {expandedSections.has('crossrefs') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    {(analysis.crossRefIssues || []).length === 0 ? (
                      <p className="text-xs text-green-600 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        No cross-reference inconsistencies found
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {analysis.crossRefIssues.map((issue, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex items-start gap-2 p-2 rounded-md text-xs",
                              issue.type === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                            )}
                          >
                            {issue.type === 'error' ? (
                              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            )}
                            <div>
                              <span className="font-medium">{issue.category}:</span> {issue.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Completeness Checklist */}
            <Collapsible open={expandedSections.has('completeness')} onOpenChange={() => toggleSection('completeness')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Completeness checklist</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {analysis.completenessChecklist && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {analysis.completenessChecklist.filter(c => c.status === 'done').length}/{analysis.completenessChecklist.length} complete
                          </span>
                        </>
                      )}
                      {expandedSections.has('completeness') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="space-y-1.5">
                      {(analysis.completenessChecklist || []).map((item, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                          {STATUS_ICONS[item.status] || STATUS_ICONS.missing}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{item.item}</p>
                            <p className="text-xs text-muted-foreground">{item.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Strategic Recommendations */}
            <Collapsible open={expandedSections.has('recommendations')} onOpenChange={() => toggleSection('recommendations')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-3">
                      <Star className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-sm">Strategic recommendations</span>
                    </div>
                    {expandedSections.has('recommendations') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    <ul className="space-y-2">
                      {(analysis.strategicRecommendations || []).map((rec, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2 p-2 bg-primary/5 rounded-md">
                          <span className="font-bold text-primary shrink-0">{i + 1}.</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <p className="text-[10px] text-muted-foreground italic text-center pb-4">
              Analysis powered by AI. Scores are estimated — actual evaluation depends on reviewer judgment.
            </p>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
