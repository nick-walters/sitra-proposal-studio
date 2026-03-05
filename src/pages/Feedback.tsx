import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Lightbulb, Bug, Send, CheckCircle, Clock, AlertCircle, XCircle, ChevronRight } from "lucide-react";
import { FeedbackDetail } from "@/components/FeedbackDetail";

interface FeedbackItem {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
}

export function Feedback() {
  const { user } = useAuth();
  const [category, setCategory] = useState<"feature_request" | "bug_report">("bug_report");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myFeedback, setMyFeedback] = useState<FeedbackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingMy, setLoadingMy] = useState(true);

  const fetchMyFeedback = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("feedback")
      .select("id, user_id, category, title, description, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setMyFeedback((data || []) as FeedbackItem[]);
    setLoadingMy(false);
  };

  useEffect(() => {
    fetchMyFeedback();
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !title.trim() || !description.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      category,
      title: title.trim(),
      description: description.trim(),
    });

    if (error) {
      toast.error("Failed to submit feedback");
      console.error(error);
    } else {
      toast.success("Thank you! Your feedback has been submitted.");
      setTitle("");
      setDescription("");
      fetchMyFeedback();
    }
    setSubmitting(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "new": return <Badge variant="default" className="gap-1 text-[10px]"><AlertCircle className="w-3 h-3" /> New</Badge>;
      case "reviewed": return <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="w-3 h-3" /> Reviewed</Badge>;
      case "resolved": return <Badge className="gap-1 text-[10px] bg-green-600 hover:bg-green-700"><CheckCircle className="w-3 h-3" /> Resolved</Badge>;
      case "declined": return <Badge variant="destructive" className="gap-1 text-[10px]"><XCircle className="w-3 h-3" /> Declined</Badge>;
      default: return null;
    }
  };

  if (selectedId) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4 max-w-2xl">
          <FeedbackDetail
            feedbackId={selectedId}
            onBack={() => setSelectedId(null)}
            onDeleted={() => {
              setSelectedId(null);
              fetchMyFeedback();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Feedback</h1>
          <p className="text-muted-foreground mt-2">
            Help us improve by reporting issues or requesting new features.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Submit feedback</CardTitle>
            <CardDescription>
              Choose a category and describe your feedback in detail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Tabs value={category} onValueChange={(v) => setCategory(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="bug_report" className="gap-2">
                    <Bug className="w-4 h-4" />
                    Bug report
                  </TabsTrigger>
                  <TabsTrigger value="feature_request" className="gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Feature request
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="feature_request">
                  <p className="text-sm text-muted-foreground">
                    Describe a feature you'd like to see added or improved.
                  </p>
                </TabsContent>
                <TabsContent value="bug_report">
                  <p className="text-sm text-muted-foreground">
                    Describe the issue, including steps to reproduce it if possible.
                  </p>
                </TabsContent>
              </Tabs>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder={category === "feature_request" ? "e.g. Add bulk export for proposals" : "e.g. Table formatting lost when switching sections"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder={category === "feature_request" ? "Describe the feature and why it would be useful…" : "Describe what happened, what you expected, and steps to reproduce…"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={6}
                  maxLength={5000}
                />
              </div>

              <Button type="submit" disabled={submitting || !title.trim() || !description.trim()} className="gap-2">
                <Send className="w-4 h-4" />
                {submitting ? "Submitting…" : "Submit feedback"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* My submissions */}
        {!loadingMy && myFeedback.length > 0 && (
          <>
            <Separator className="my-8" />
            <div className="space-y-4">
              <h2 className="text-xl font-bold">My submissions</h2>
              <div className="space-y-2">
                {myFeedback.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="p-1.5 rounded bg-muted">
                      {item.category === "feature_request" ? <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" /> : <Bug className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                    {statusBadge(item.status)}
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
