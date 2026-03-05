import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Star,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Send,
  Loader2,
  ClipboardCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Section } from '@/types/proposal';

interface SectionEvaluatePanelProps {
  proposalId: string;
  sections: Section[];
}

interface Review {
  id: string;
  proposal_id: string;
  section_id: string;
  reviewer_id: string;
  score: number | null;
  status: string;
  comments: string | null;
  created_at: string;
  updated_at: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground', icon: MessageSquare },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400', icon: CheckCircle2 },
  needs_revision: { label: 'Needs Revision', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400', icon: AlertTriangle },
  rejected: { label: 'Rejected', color: 'bg-destructive/10 text-destructive', icon: XCircle },
};

function StarRating({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => !disabled && onChange(star)}
          disabled={disabled}
          className={cn(
            "transition-colors",
            disabled ? "cursor-default" : "cursor-pointer hover:scale-110",
            star <= value ? "text-amber-500" : "text-muted-foreground/30"
          )}
        >
          <Star className={cn("w-5 h-5", star <= value && "fill-current")} />
        </button>
      ))}
    </div>
  );
}

/** Collect leaf Part B sections (b1-1, b1-2, b2-1, etc.) */
function getPartBLeafSections(sections: Section[]): { id: string; number: string; title: string }[] {
  const result: { id: string; number: string; title: string }[] = [];
  for (const s of sections) {
    if (s.id.startsWith('b') && !['part-b'].includes(s.id)) {
      if (s.subsections && s.subsections.length > 0) {
        result.push(...getPartBLeafSections(s.subsections));
      } else {
        result.push({ id: s.id, number: s.number || s.id, title: s.title });
      }
    }
  }
  return result;
}

export function SectionEvaluatePanel({ proposalId, sections }: SectionEvaluatePanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const leafSections = getPartBLeafSections(sections);
  const [selectedSectionId, setSelectedSectionId] = useState(leafSections[0]?.id || '');

  const selectedSection = leafSections.find(s => s.id === selectedSectionId);

  const [myScore, setMyScore] = useState(0);
  const [myStatus, setMyStatus] = useState('pending');
  const [myComments, setMyComments] = useState('');

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['section-reviews', proposalId, selectedSectionId],
    queryFn: async () => {
      if (!selectedSectionId) return [];
      const { data, error } = await supabase
        .from('section_reviews')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('section_id', selectedSectionId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const reviewerIds = [...new Set((data || []).map(r => r.reviewer_id))];
      if (reviewerIds.length === 0) return (data || []) as Review[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', reviewerIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      return (data || []).map(r => ({
        ...r,
        reviewer_name: profileMap.get(r.reviewer_id)?.full_name || 'Unknown',
        reviewer_avatar: profileMap.get(r.reviewer_id)?.avatar_url,
      })) as Review[];
    },
    enabled: !!selectedSectionId,
  });

  useEffect(() => {
    const myReview = reviews.find(r => r.reviewer_id === user?.id);
    if (myReview) {
      setMyScore(myReview.score || 0);
      setMyStatus(myReview.status);
      setMyComments(myReview.comments || '');
    } else {
      setMyScore(0);
      setMyStatus('pending');
      setMyComments('');
    }
  }, [reviews, user?.id]);

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedSectionId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('section_reviews')
        .upsert({
          proposal_id: proposalId,
          section_id: selectedSectionId,
          reviewer_id: user.id,
          score: myScore || null,
          status: myStatus,
          comments: myComments || null,
        }, { onConflict: 'proposal_id,section_id,reviewer_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['section-reviews', proposalId, selectedSectionId] });
      toast.success('Evaluation submitted');
    },
    onError: () => {
      toast.error('Failed to submit evaluation');
    },
  });

  const avgScore = reviews.length > 0
    ? reviews.filter(r => r.score).reduce((s, r) => s + (r.score || 0), 0) / reviews.filter(r => r.score).length
    : 0;

  if (leafSections.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No Part B sections available for evaluation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium whitespace-nowrap">Section</label>
        <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {leafSections.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.number} – {s.title}
              </SelectItem>
            ))
            }
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      {reviews.length > 0 && (
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{avgScore.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">avg score</p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <p className="text-2xl font-bold">{reviews.length}</p>
              <p className="text-xs text-muted-foreground">evaluation{reviews.length !== 1 ? 's' : ''}</p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="flex gap-1 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const count = reviews.filter(r => r.status === key).length;
                if (count === 0) return null;
                return (
                  <Badge key={key} variant="outline" className={cn("text-[10px] gap-0.5", config.color)}>
                    {count} {config.label}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My evaluation */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h4 className="text-sm font-medium">Your Evaluation</h4>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Score</p>
              <StarRating value={myScore} onChange={setMyScore} />
            </div>
            <div className="flex-1 max-w-[200px]">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select value={myStatus} onValueChange={setMyStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-1.5">
                        <config.icon className="w-3.5 h-3.5" />
                        {config.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={myComments}
            onChange={e => setMyComments(e.target.value)}
            placeholder="Add evaluation comments..."
            className="min-h-[80px] text-sm"
          />
          <Button
            size="sm"
            className="gap-2"
            onClick={() => submitReview.mutate()}
            disabled={submitReview.isPending || !selectedSectionId}
          >
            {submitReview.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> Submit evaluation</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Other evaluations */}
      {reviews.filter(r => r.reviewer_id !== user?.id).length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h4 className="text-sm font-medium">Other Evaluations</h4>
            <div className="space-y-2">
              {reviews.filter(r => r.reviewer_id !== user?.id).map(review => {
                const statusConfig = STATUS_CONFIG[review.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                return (
                  <div key={review.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={review.reviewer_avatar || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {review.reviewer_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{review.reviewer_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {review.score && <StarRating value={review.score} onChange={() => { }} disabled />}
                        <Badge variant="outline" className={cn("text-[10px]", statusConfig.color)}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                    </div>
                    {review.comments && (
                      <p className="text-sm text-muted-foreground">{review.comments}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
