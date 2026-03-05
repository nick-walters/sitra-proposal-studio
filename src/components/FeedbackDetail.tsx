import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Sparkles,
  Copy,
  CheckCircle,
  XCircle,
  Trash2,
  Send,
  Loader2,
  RotateCcw,
  AlertCircle,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeedbackItem {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string;
  ai_analysis: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  feedback_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface FeedbackDetailProps {
  feedbackId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function FeedbackDetail({ feedbackId, onBack, onDeleted }: FeedbackDetailProps) {
  const { user } = useAuth();
  const { isOwner } = useUserRole();
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; initials: string }>>({});
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(false);
  const [loading, setLoading] = useState(true);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const isSubmitter = item?.user_id === user?.id;
  const canInteract = isOwner || isSubmitter;

  const fetchData = async () => {
    const [{ data: fb }, { data: cmts }] = await Promise.all([
      supabase.from("feedback").select("*").eq("id", feedbackId).single(),
      supabase.from("feedback_comments").select("*").eq("feedback_id", feedbackId).order("created_at", { ascending: true }),
    ]);

    if (fb) setItem(fb as FeedbackItem);
    if (cmts) setComments(cmts as Comment[]);

    // Resolve profiles
    const userIds = new Set<string>();
    if (fb) userIds.add(fb.user_id);
    (cmts || []).forEach((c: any) => userIds.add(c.user_id));

    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(userIds));
      const map: Record<string, { name: string; initials: string }> = {};
      (profs || []).forEach((p: any) => {
        const name = p.full_name || p.email || "Unknown";
        const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
        map[p.id] = { name, initials };
      });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [feedbackId]);

  // Realtime comments
  useEffect(() => {
    const channel = supabase
      .channel(`feedback-comments-${feedbackId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "feedback_comments",
        filter: `feedback_id=eq.${feedbackId}`,
      }, (payload) => {
        const newC = payload.new as Comment;
        setComments(prev => [...prev, newC]);
        // Resolve profile if needed
        if (!profiles[newC.user_id]) {
          supabase.from("profiles").select("id, full_name, email").eq("id", newC.user_id).single().then(({ data }) => {
            if (data) {
              const name = data.full_name || data.email || "Unknown";
              const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              setProfiles(prev => ({ ...prev, [data.id]: { name, initials } }));
            }
          });
        }
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "feedback_comments",
        filter: `feedback_id=eq.${feedbackId}`,
      }, (payload) => {
        const deleted = payload.old as { id: string };
        setComments(prev => prev.filter(c => c.id !== deleted.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [feedbackId]);

  // Auto-scroll on new comments
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const handleSendComment = async () => {
    if (!user?.id || !newComment.trim()) return;
    setSending(true);
    const { error } = await supabase.from("feedback_comments").insert({
      feedback_id: feedbackId,
      user_id: user.id,
      content: newComment.trim(),
    });
    if (error) {
      toast.error("Failed to send comment");
    } else {
      setNewComment("");
    }
    setSending(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase.from("feedback_comments").delete().eq("id", commentId);
    if (error) toast.error("Failed to delete comment");
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!item) return;
    const { error } = await supabase.from("feedback").update({ status: newStatus }).eq("id", item.id);
    if (error) {
      toast.error("Failed to update status");
    } else {
      setItem(prev => prev ? { ...prev, status: newStatus } : null);
      toast.success(`Marked as ${newStatus}`);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    const { error } = await supabase.from("feedback").delete().eq("id", item.id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Feedback deleted");
      onDeleted();
    }
  };

  const handleAnalyze = async () => {
    if (!item) return;
    setAnalyzingId(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyse-feedback", {
        body: { feedbackId: item.id, category: item.category, title: item.title, description: item.description },
      });
      if (error) throw error;
      const analysis = data?.analysis || "No analysis generated.";
      await supabase.from("feedback").update({ ai_analysis: analysis, status: item.status === "new" ? "reviewed" : item.status }).eq("id", item.id);
      setItem(prev => prev ? { ...prev, ai_analysis: analysis, status: prev.status === "new" ? "reviewed" : prev.status } : null);
      toast.success("AI analysis generated");
    } catch {
      toast.error("Failed to generate AI analysis");
    }
    setAnalyzingId(false);
  };

  const handleDeleteAnalysis = async () => {
    if (!item) return;
    await supabase.from("feedback").update({ ai_analysis: null }).eq("id", item.id);
    setItem(prev => prev ? { ...prev, ai_analysis: null } : null);
    toast.success("Analysis removed");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "new": return <Badge variant="default" className="gap-1"><AlertCircle className="w-3 h-3" /> New</Badge>;
      case "reviewed": return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Reviewed</Badge>;
      case "resolved": return <Badge className="gap-1 bg-green-600 hover:bg-green-700"><CheckCircle className="w-3 h-3" /> Resolved</Badge>;
      case "declined": return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Declined</Badge>;
      default: return null;
    }
  };

  if (loading || !item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="h-64 flex items-center justify-center text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      {/* Feedback header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-lg">{item.title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                by {profiles[item.user_id]?.name || "Unknown"} · {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
            {statusBadge(item.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{item.description}</p>

          {/* Status + delete controls */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {isOwner && (
              <>
                {item.status !== "resolved" ? (
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange("resolved")} className="gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Resolve
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange("reviewed")} className="gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen
                  </Button>
                )}
                {item.status !== "declined" ? (
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange("declined")} className="gap-1.5 text-destructive hover:text-destructive">
                    <XCircle className="w-3.5 h-3.5" /> Decline
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange("reviewed")} className="gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen
                  </Button>
                )}
              </>
            )}

            {canInteract && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive ml-auto">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete feedback?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the feedback and all its comments.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis - owners only */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> AI Analysis
              </span>
              <div className="flex items-center gap-1">
                {item.ai_analysis && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(item.ai_analysis!)} className="gap-1 h-7">
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDeleteAnalysis} className="gap-1 h-7 text-destructive hover:text-destructive">
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAnalyze}
                  disabled={analyzingId}
                  className="gap-1.5 h-7"
                >
                  {analyzingId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {item.ai_analysis ? "Regenerate" : "Generate"}
                </Button>
              </div>
            </div>
          </CardHeader>
          {item.ai_analysis && (
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{item.ai_analysis}</p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Comments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Start the conversation.</p>
          )}

          {comments.map((c) => {
            const prof = profiles[c.user_id];
            const isMyComment = c.user_id === user?.id;
            return (
              <div key={c.id} className="group flex gap-3">
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarFallback className="text-[10px] bg-muted">{prof?.initials || "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{prof?.name || "Unknown"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                    {(isMyComment || isOwner) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        onClick={() => handleDeleteComment(c.id)}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap mt-0.5">{c.content}</p>
                </div>
              </div>
            );
          })}
          <div ref={commentsEndRef} />

          <Separator />

          {/* New comment input */}
          {canInteract && (
            <div className="flex gap-2">
              <Textarea
                placeholder="Write a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSendComment();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleSendComment}
                disabled={sending || !newComment.trim()}
                className="shrink-0 self-end"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
