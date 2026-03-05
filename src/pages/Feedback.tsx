import { useState } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Lightbulb, Bug, Send } from "lucide-react";

export function Feedback() {
  const { user } = useAuth();
  const [category, setCategory] = useState<"feature_request" | "bug_report">("feature_request");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    }
    setSubmitting(false);
  };

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
                  <TabsTrigger value="feature_request" className="gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Feature request
                  </TabsTrigger>
                  <TabsTrigger value="bug_report" className="gap-2">
                    <Bug className="w-4 h-4" />
                    Bug report
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
                  placeholder={category === "feature_request" ? "e.g. Add bulk export for proposals" : "e.g. Save button not responding on WP editor"}
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
      </div>
    </div>
  );
}
