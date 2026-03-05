import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbulb, Bug, CheckCircle, Clock, AlertCircle, XCircle, ChevronRight } from "lucide-react";
import { FeedbackDetail } from "@/components/FeedbackDetail";

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
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(highlightId || null);

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

  // Open highlighted feedback
  useEffect(() => {
    if (highlightId && !loading) {
      setSelectedId(highlightId);
    }
  }, [highlightId, loading]);

  if (selectedId) {
    return (
      <FeedbackDetail
        feedbackId={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => {
          setSelectedId(null);
          fetchFeedback();
        }}
      />
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "new": return <Badge variant="default" className="gap-1 text-[10px]"><AlertCircle className="w-3 h-3" /> New</Badge>;
      case "reviewed": return <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="w-3 h-3" /> Reviewed</Badge>;
      case "resolved": return <Badge className="gap-1 text-[10px] bg-green-600 hover:bg-green-700"><CheckCircle className="w-3 h-3" /> Resolved</Badge>;
      case "declined": return <Badge variant="destructive" className="gap-1 text-[10px]"><XCircle className="w-3 h-3" /> Declined</Badge>;
      default: return null;
    }
  };

  const featureRequests = feedback.filter(f => f.category === "feature_request");
  const bugReports = feedback.filter(f => f.category === "bug_report");

  const renderList = (items: FeedbackItem[]) => {
    if (items.length === 0) return <p className="text-muted-foreground text-sm py-4">No submissions yet.</p>;
    return (
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
            onClick={() => setSelectedId(item.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {emails[item.user_id] || "Unknown"} · {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
            {statusBadge(item.status)}
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
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
