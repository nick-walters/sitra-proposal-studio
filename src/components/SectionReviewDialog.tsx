import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SectionReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  sectionId: string;
  sectionTitle: string;
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

export function SectionReviewDialog({
  isOpen,
  onClose,
  proposalId,
  sectionId,
  sectionTitle,
}: SectionReviewDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [myScore, setMyScore] = useState(0);
  const [myStatus, setMyStatus] = useState('pending');
  const [myComments, setMyComments] = useState('');

  // Fetch all reviews for this section
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['section-reviews', proposalId, sectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('section_reviews')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch reviewer profiles
      const reviewerIds = [...new Set((data || []).map(r => r.reviewer_id))];
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
    enabled: isOpen,
  });

  // Load my existing review
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
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('section_reviews')
        .upsert({
          proposal_id: proposalId,
          section_id: sectionId,
          reviewer_id: user.id,
          score: myScore || null,
          status: myStatus,
          comments: myComments || null,
        }, { onConflict: 'proposal_id,section_id,reviewer_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['section-reviews', proposalId, sectionId] });
      toast.success('Review submitted');
    },
    onError: () => {
      toast.error('Failed to submit review');
    },
  });

  const avgScore = reviews.length > 0
    ? reviews.filter(r => r.score).reduce((s, r) => s + (r.score || 0), 0) / reviews.filter(r => r.score).length
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            Section Review
          </DialogTitle>
          <DialogDescription>{sectionTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Summary */}
          {reviews.length > 0 && (
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold">{avgScore.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">avg score</p>
              </div>
              <Separator orientation="vertical" className="h-10" />
              <div className="text-center">
                <p className="text-2xl font-bold">{reviews.length}</p>
                <p className="text-xs text-muted-foreground">review{reviews.length !== 1 ? 's' : ''}</p>
              </div>
              <Separator orientation="vertical" className="h-10" />
              <div className="flex gap-1">
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
            </div>
          )}

          {/* My review */}
          <div className="space-y-3 p-3 border rounded-lg">
            <h4 className="text-sm font-medium">Your Review</h4>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Score</p>
                <StarRating value={myScore} onChange={setMyScore} />
              </div>
              <div className="flex-1">
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
              placeholder="Add review comments..."
              className="min-h-[80px] text-sm"
            />
            <Button
              size="sm"
              className="w-full gap-2"
              onClick={() => submitReview.mutate()}
              disabled={submitReview.isPending}
            >
              {submitReview.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Submit Review</>
              )}
            </Button>
          </div>

          {/* Other reviews */}
          {reviews.filter(r => r.reviewer_id !== user?.id).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Other Reviews</h4>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2 pr-4">
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
                            {review.score && <StarRating value={review.score} onChange={() => {}} disabled />}
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
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
