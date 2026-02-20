import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Star,
  TrendingUp,
  Lightbulb,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProposalScoringAssessmentProps {
  proposalId: string;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

function hasKeywords(html: string, keywords: string[]): boolean {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  return keywords.some(k => text.includes(k.toLowerCase()));
}

export function ProposalScoringAssessment({ proposalId }: ProposalScoringAssessmentProps) {
  const [sectionContents, setSectionContents] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('section_content')
        .select('section_id, content')
        .eq('proposal_id', proposalId);

      const map = new Map<string, string>();
      (data || []).forEach(sc => { map.set(sc.section_id, sc.content || ''); });
      setSectionContents(map);
      setHasRun(true);
    } catch (error) {
      toast.error('Failed to load section content');
    } finally {
      setLoading(false);
    }
  };

  const assessment = useMemo(() => {
    if (!hasRun) return [];
    const getContent = (id: string) => sectionContents.get(id) || '';

    const criteria = [
      {
        criterion: 'Excellence', maxScore: 5, threshold: 4,
        icon: <Lightbulb className="w-4 h-4" />, color: 'text-amber-600',
        signals: [
          { label: 'State-of-the-art analysis', present: hasKeywords(getContent('b1-1'), ['state-of-the-art', 'state of the art', 'beyond', 'novel']), weight: 1 },
          { label: 'Clear objectives', present: hasKeywords(getContent('b1-1'), ['objective', 'aim', 'goal', 'target']), weight: 1 },
          { label: 'Methodology described', present: hasKeywords(getContent('b1-1'), ['methodology', 'approach', 'method', 'framework']), weight: 1 },
          { label: 'Innovation potential', present: hasKeywords(getContent('b1-1'), ['innovat', 'novel', 'breakthrough', 'unique']), weight: 1 },
          { label: 'Interdisciplinary', present: hasKeywords(getContent('b1-1'), ['interdisciplin', 'multi-disciplin', 'cross-cutting']), weight: 0.5 },
          { label: 'Sufficient depth (>500 words)', present: countWords(getContent('b1-1')) > 500, weight: 0.5 },
        ],
      },
      {
        criterion: 'Impact', maxScore: 5, threshold: 4,
        icon: <TrendingUp className="w-4 h-4" />, color: 'text-blue-600',
        signals: [
          { label: 'Expected impacts defined', present: hasKeywords(getContent('b2-1'), ['impact', 'outcome', 'result', 'benefit']), weight: 1 },
          { label: 'Target groups identified', present: hasKeywords(getContent('b2-1'), ['target', 'stakeholder', 'end-user', 'beneficiar']), weight: 1 },
          { label: 'Dissemination plan', present: hasKeywords(getContent('b2-2') || getContent('b2-1'), ['disseminat', 'publication', 'conference', 'open access']), weight: 1 },
          { label: 'Exploitation strategy', present: hasKeywords(getContent('b2-1'), ['exploit', 'commerciali', 'market', 'IP']), weight: 1 },
          { label: 'Communication activities', present: hasKeywords(getContent('b2-3') || getContent('b2-1'), ['communicat', 'website', 'social media']), weight: 0.5 },
          { label: 'Sustainability beyond funding', present: hasKeywords(getContent('b2-1'), ['sustainab', 'beyond', 'long-term', 'continuation']), weight: 0.5 },
        ],
      },
      {
        criterion: 'Implementation', maxScore: 5, threshold: 3,
        icon: <Wrench className="w-4 h-4" />, color: 'text-green-600',
        signals: [
          { label: 'Work plan structure', present: hasKeywords(getContent('b1-2') || getContent('b3-1'), ['work package', 'task', 'deliverable', 'milestone']), weight: 1 },
          { label: 'Risk management', present: hasKeywords(getContent('b1-2'), ['risk', 'mitigat', 'contingency']), weight: 1 },
          { label: 'Consortium described', present: hasKeywords(getContent('b3-2') || getContent('b1-2'), ['consortium', 'partner', 'complementar']), weight: 1 },
          { label: 'Resource allocation', present: hasKeywords(getContent('b1-2') || getContent('b3-1'), ['person-month', 'effort', 'resource', 'allocation']), weight: 1 },
          { label: 'Management structure', present: hasKeywords(getContent('b1-2') || getContent('b3-1'), ['management', 'governance', 'decision', 'steering']), weight: 0.5 },
          { label: 'Quality assurance', present: hasKeywords(getContent('b1-2'), ['quality', 'monitor', 'evaluation']), weight: 0.5 },
        ],
      },
    ];

    return criteria.map(c => {
      const totalWeight = c.signals.reduce((s, sig) => s + sig.weight, 0);
      const achievedWeight = c.signals.filter(s => s.present).reduce((s, sig) => s + sig.weight, 0);
      const percentage = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
      const estimatedScore = Math.round((percentage / 100) * c.maxScore * 10) / 10;
      return { ...c, percentage, estimatedScore, meetsThreshold: estimatedScore >= c.threshold };
    });
  }, [sectionContents, hasRun]);

  const overallScore = assessment.reduce((s, a) => s + a.estimatedScore, 0);
  const maxOverall = assessment.reduce((s, a) => s + a.maxScore, 0);
  const overallPercentage = maxOverall > 0 ? Math.round((overallScore / maxOverall) * 100) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Scoring Self-Assessment
          </h2>
          <p className="text-sm text-muted-foreground">Estimated score against Horizon Europe evaluation criteria</p>
        </div>
        <Button onClick={loadData} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {hasRun ? 'Refresh' : 'Analyse'}
        </Button>
      </div>

      {!hasRun && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Click "Analyse" to assess your proposal against evaluation criteria</p>
          </CardContent>
        </Card>
      )}

      {hasRun && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Overall */}
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-3xl font-bold">{overallScore.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">/{maxOverall}</p>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span>Overall</span>
                  <Badge variant={overallScore >= 10 ? 'default' : 'destructive'} className="text-[10px]">
                    {overallScore >= 10 ? 'Above threshold' : 'Below threshold (10)'}
                  </Badge>
                </div>
                <Progress value={overallPercentage} className="h-2" />
              </div>
            </div>

            {/* Per-criterion */}
            <div className="space-y-3">
              {assessment.map(c => (
                <div key={c.criterion} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={c.color}>{c.icon}</span>
                      <span className="text-sm font-medium">{c.criterion}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{c.estimatedScore.toFixed(1)}/{c.maxScore}</span>
                      {c.meetsThreshold ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    </div>
                  </div>
                  <Progress value={c.percentage} className="h-1.5" />
                  <div className="flex flex-wrap gap-1">
                    {c.signals.map(signal => (
                      <Badge
                        key={signal.label}
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          signal.present
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {signal.present ? '✓' : '○'} {signal.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground italic">
              * Scores are estimated based on keyword analysis and content depth. Actual evaluation depends on quality and reviewer judgment.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
