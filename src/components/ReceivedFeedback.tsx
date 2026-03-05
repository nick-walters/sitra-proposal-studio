import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Lightbulb, Bug, Copy, Sparkles, CheckCircle, Clock, AlertCircle } from "lucide-react";

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

export function ReceivedFeedback({ highlightId }: { highlightId?: string }) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const fetchFeedback = async () => {
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setFeedback(data as FeedbackItem[]);

    // Fetch submitter emails
    const userIds = [...new Set((data || []).map((f: any) => f.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        map[p.id] = p.full_name || p.email || "Unknown";
      });
      setEmails(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  // Scroll to highlighted feedback
  useEffect(() => {
    if (highlightId && !loading) {
      setTimeout(() => {
        document.getElementById(`feedback-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightId, loading]);

  const handleAnalyze = async (item: FeedbackItem) => {
    setAnalyzingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("analyse-feedback", {
        body: { feedbackId: item.id, category: item.category, title: item.title, description: item.description },
      });

      if (error) throw error;

      const analysis = data?.analysis || "No analysis generated.";
      await supabase.from("feedback").update({ ai_analysis: analysis, status: "reviewed" }).eq("id", item.id);
      
      setFeedback(prev => prev.map(f => f.id === item.id ? { ...f, ai_analysis: analysis, status: "reviewed" } : f));
      toast.success("AI analysis generated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate AI analysis");
    }
    setAnalyzingId(null);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleResolve = async (id: string) => {
    await supabase.from("feedback").update({ status: "resolved" }).eq("id", id);
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: "resolved" } : f));
    toast.success("Marked as resolved");
  };

  const featureRequests = feedback.filter(f => f.category === "feature_request");
  const bugReports = feedback.filter(f => f.category === "bug_report");

  const statusBadge = (status: string) => {
    switch (status) {
      case "new": return <Badge variant="default" className="gap-1"><AlertCircle className="w-3 h-3" /> New</Badge>;
      case "reviewed": return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Reviewed</Badge>;
      case "resolved": return <Badge variant="outline" className="gap-1"><CheckCircle className="w-3 h-3" /> Resolved</Badge>;
      default: return null;
    }
  };

  const renderList = (items: FeedbackItem[]) => {
    if (items.length === 0) return <p className="text-muted-foreground text-sm py-4">No submissions yet.</p>;
    return (
      <div className="space-y-4">
        {items.map(item => (
          <Card
            key={item.id}
            id={`feedback-${item.id}`}
            className={`transition-all ${highlightId === item.id ? "ring-2 ring-primary" : ""}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    by {emails[item.user_id] || "Loading…"} · {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                {statusBadge(item.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">{item.description}</p>

              {item.ai_analysis ? (
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI-proposed solution
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(item.ai_analysis!)} className="gap-1 h-7">
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{item.ai_analysis}</p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAnalyze(item)}
                  disabled={analyzingId === item.id}
                  className="gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {analyzingId === item.id ? "Analysing…" : "Generate AI analysis"}
                </Button>
              )}

              {item.status !== "resolved" && (
                <Button variant="outline" size="sm" onClick={() => handleResolve(item.id)} className="gap-2">
                  <CheckCircle className="w-4 h-4" /> Mark as resolved
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Received feedback</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {feedback.length} submission{feedback.length !== 1 ? "s" : ""} total
        </p>
      </div>

      <Tabs defaultValue="feature_request">
        <TabsList>
          <TabsTrigger value="feature_request" className="gap-2">
            <Lightbulb className="w-4 h-4" />
            Feature requests ({featureRequests.length})
          </TabsTrigger>
          <TabsTrigger value="bug_report" className="gap-2">
            <Bug className="w-4 h-4" />
            Bug reports ({bugReports.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feature_request" className="mt-4">
          {renderList(featureRequests)}
        </TabsContent>
        <TabsContent value="bug_report" className="mt-4">
          {renderList(bugReports)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
