import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Star,
  Target,
  TrendingUp,
  Lightbulb,
  Wrench,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Section } from '@/types/proposal';
import { cn } from '@/lib/utils';

interface ProposalScoringAssessmentProps {
  sections: { id: string; label: string; number?: string }[];
  sectionContents: Map<string, string>;
  proposalType?: string;
}

interface CriterionAssessment {
  criterion: string;
  maxScore: number;
  threshold: number;
  icon: React.ReactNode;
  color: string;
  sections: string[];
  signals: { label: string; present: boolean; weight: number }[];
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

function hasKeywords(html: string, keywords: string[]): boolean {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  return keywords.some(k => text.includes(k.toLowerCase()));
}

export function ProposalScoringAssessment({
  sections,
  sectionContents,
  proposalType,
}: ProposalScoringAssessmentProps) {
  const assessment = useMemo(() => {
    const getContent = (sectionId: string) => sectionContents.get(sectionId) || '';

    const criteria: CriterionAssessment[] = [
      {
        criterion: 'Excellence',
        maxScore: 5,
        threshold: 4,
        icon: <Lightbulb className="w-4 h-4" />,
        color: 'text-amber-600',
        sections: ['b1-1'],
        signals: [
          { label: 'State-of-the-art analysis', present: hasKeywords(getContent('b1-1'), ['state-of-the-art', 'state of the art', 'sota', 'beyond', 'novel']), weight: 1 },
          { label: 'Clear objectives', present: hasKeywords(getContent('b1-1'), ['objective', 'aim', 'goal', 'target']), weight: 1 },
          { label: 'Methodology described', present: hasKeywords(getContent('b1-1'), ['methodology', 'approach', 'method', 'framework']), weight: 1 },
          { label: 'Innovation potential', present: hasKeywords(getContent('b1-1'), ['innovat', 'novel', 'breakthrough', 'unique', 'first']), weight: 1 },
          { label: 'Interdisciplinary', present: hasKeywords(getContent('b1-1'), ['interdisciplin', 'multi-disciplin', 'cross-cutting']), weight: 0.5 },
          { label: 'Sufficient depth (>500 words)', present: countWords(getContent('b1-1')) > 500, weight: 0.5 },
        ],
      },
      {
        criterion: 'Impact',
        maxScore: 5,
        threshold: 4,
        icon: <TrendingUp className="w-4 h-4" />,
        color: 'text-blue-600',
        sections: ['b2-1', 'b2-2', 'b2-3'],
        signals: [
          { label: 'Expected impacts defined', present: hasKeywords(getContent('b2-1'), ['impact', 'outcome', 'result', 'benefit']), weight: 1 },
          { label: 'Target groups identified', present: hasKeywords(getContent('b2-1'), ['target', 'stakeholder', 'end-user', 'beneficiar']), weight: 1 },
          { label: 'Dissemination plan', present: hasKeywords(getContent('b2-2') || getContent('b2-1'), ['disseminat', 'publication', 'conference', 'journal', 'open access']), weight: 1 },
          { label: 'Exploitation strategy', present: hasKeywords(getContent('b2-1'), ['exploit', 'commerciali', 'market', 'business model', 'IP']), weight: 1 },
          { label: 'Communication activities', present: hasKeywords(getContent('b2-3') || getContent('b2-1'), ['communicat', 'website', 'social media', 'awareness']), weight: 0.5 },
          { label: 'Sustainability beyond funding', present: hasKeywords(getContent('b2-1'), ['sustainab', 'beyond', 'long-term', 'continuation']), weight: 0.5 },
        ],
      },
      {
        criterion: 'Implementation',
        maxScore: 5,
        threshold: 3,
        icon: <Wrench className="w-4 h-4" />,
        color: 'text-green-600',
        sections: ['b1-2', 'b3-1', 'b3-2'],
        signals: [
          { label: 'Work plan structure', present: hasKeywords(getContent('b1-2') || getContent('b3-1'), ['work package', 'task', 'deliverable', 'milestone']), weight: 1 },
          { label: 'Risk management', present: hasKeywords(getContent('b1-2'), ['risk', 'mitigat', 'contingency']), weight: 1 },
          { label: 'Consortium described', present: hasKeywords(getContent('b3-2') || getContent('b1-2'), ['consortium', 'partner', 'complementar', 'expertise']), weight: 1 },
          { label: 'Resource allocation', present: hasKeywords(getContent('b1-2') || getContent('b3-1'), ['person-month', 'PM', 'effort', 'resource', 'allocation']), weight: 1 },
          { label: 'Management structure', present: hasKeywords(getContent('b1-2') || getContent('b3-1'), ['management', 'governance', 'decision', 'steering']), weight: 0.5 },
          { label: 'Quality assurance', present: hasKeywords(getContent('b1-2'), ['quality', 'monitor', 'evaluation', 'review']), weight: 0.5 },
        ],
      },
    ];

    return criteria.map(c => {
      const totalWeight = c.signals.reduce((s, sig) => s + sig.weight, 0);
      const achievedWeight = c.signals.filter(s => s.present).reduce((s, sig) => s + sig.weight, 0);
      const percentage = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
      const estimatedScore = Math.round((percentage / 100) * c.maxScore * 10) / 10;
      const meetsThreshold = estimatedScore >= c.threshold;
      return { ...c, percentage, estimatedScore, meetsThreshold };
    });
  }, [sectionContents]);

  const overallScore = assessment.reduce((s, a) => s + a.estimatedScore, 0);
  const maxOverall = assessment.reduce((s, a) => s + a.maxScore, 0);
  const overallPercentage = maxOverall > 0 ? Math.round((overallScore / maxOverall) * 100) : 0;
  const overallThreshold = 10; // typical HE threshold

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          Scoring Self-Assessment
        </CardTitle>
        <CardDescription>
          Estimated score based on content analysis against Horizon Europe evaluation criteria
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall score */}
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-3xl font-bold">{overallScore.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">/{maxOverall}</p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span>Overall</span>
              <Badge
                variant={overallScore >= overallThreshold ? 'default' : 'destructive'}
                className="text-[10px]"
              >
                {overallScore >= overallThreshold ? 'Above threshold' : `Below threshold (${overallThreshold})`}
              </Badge>
            </div>
            <Progress value={overallPercentage} className="h-2" />
          </div>
        </div>

        {/* Per-criterion */}
        <div className="space-y-3">
          {assessment.map(criterion => (
            <div key={criterion.criterion} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={criterion.color}>{criterion.icon}</span>
                  <span className="text-sm font-medium">{criterion.criterion}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{criterion.estimatedScore.toFixed(1)}/{criterion.maxScore}</span>
                  {criterion.meetsThreshold ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>
              <Progress value={criterion.percentage} className="h-1.5" />
              <div className="flex flex-wrap gap-1">
                {criterion.signals.map(signal => (
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
          * Scores are estimated based on keyword analysis and content depth. Actual evaluation depends on quality, coherence, and reviewer judgment.
        </p>
      </CardContent>
    </Card>
  );
}
