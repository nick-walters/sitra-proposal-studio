import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wand2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/formatDate";

type AiConfigRow = {
  id: string;
  key: string;
  value: string;
  display_name: string | null;
  notes: string | null;
  updated_at: string | null;
};

const MODEL_KEYS = new Set([
  "evaluation_model",
  "eligibility_model",
  "panel_selection_model",
  "persona_generation_model",
  "synthesis_model",
]);

const MODEL_ID_RE = /^[a-z0-9-]+$/;

function validateModelId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Model ID cannot be empty.";
  if (trimmed.length > 100) return "Model ID must be 100 characters or fewer.";
  if (!trimmed.startsWith("claude-")) return "Model ID must start with “claude-”.";
  if (!MODEL_ID_RE.test(trimmed))
    return "Model ID must contain only lowercase letters, numbers, and hyphens.";
  return null;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const formatted = formatDateTime(value);
  return formatted || "Unknown";
}

export function AIConfigAdmin() {
  const navigate = useNavigate();
  const { isOwner, loading: roleLoading } = useUserRole();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AiConfigRow[]>([]);
  const [otherRows, setOtherRows] = useState<AiConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && !isOwner) {
      toast.error("Access denied. Owner role required.");
      navigate("/admin");
    }
  }, [isOwner, roleLoading, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_platform_config")
      .select("id, key, value, display_name, notes, updated_at")
      .order("key");
    if (error) {
      toast.error(`Failed to load configuration: ${error.message}`);
      setLoading(false);
      return;
    }
    const all = data || [];
    const filtered = all.filter(
      (r) => MODEL_KEYS.has(r.key) || r.key.endsWith("_model"),
    );
    const others = all.filter((r) => r.key === "usd_eur_rate");
    setRows(filtered);
    setOtherRows(others);
    setDrafts(Object.fromEntries(filtered.map((r) => [r.key, r.value])));
    setErrors({});
    setLoading(false);
  };


  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner]);

  const handleSave = async (row: AiConfigRow) => {
    const newValue = (drafts[row.key] ?? "").trim();
    const validationError = validateModelId(newValue);
    if (validationError) {
      setErrors((prev) => ({ ...prev, [row.key]: validationError }));
      return;
    }
    setErrors((prev) => ({ ...prev, [row.key]: null }));
    setSavingKey(row.key);
    const { error } = await supabase
      .from("ai_platform_config")
      .update({ value: newValue })
      .eq("key", row.key);
    setSavingKey(null);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success(`${row.display_name || row.key} updated`);
    await load();
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!isOwner) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Wand2 className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">AI Model Configuration</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            Configure which AI models are used for evaluation features. Update these when
            Anthropic releases new models. Model IDs must be exact Anthropic API identifiers
            (e.g. claude-opus-4-8, claude-haiku-4-5-20251001).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Model settings</CardTitle>
            <CardDescription>
              These values are stored in the platform configuration table and read by the
              evaluation edge functions at runtime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : rows.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No model configuration rows found in the platform configuration table.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="divide-y">
                {rows.map((row) => {
                  const draft = drafts[row.key] ?? "";
                  const isDirty = draft.trim() !== row.value;
                  const isSaving = savingKey === row.key;
                  const error = errors[row.key];
                  return (
                    <div key={row.key} className="py-5 first:pt-0 last:pb-0">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="sm:w-56 shrink-0 pt-2">
                          <div className="font-medium text-sm">
                            {row.display_name || row.key}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {row.key}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-2">
                            <Input
                              value={draft}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDrafts((prev) => ({ ...prev, [row.key]: v }));
                                if (errors[row.key]) {
                                  setErrors((prev) => ({ ...prev, [row.key]: null }));
                                }
                              }}
                              placeholder="claude-..."
                              className={error ? "border-destructive" : ""}
                              disabled={isSaving}
                            />
                            <Button
                              onClick={() => handleSave(row)}
                              disabled={!isDirty || isSaving}
                              className={isDirty ? "" : "invisible"}
                              size="sm"
                            >
                              {isSaving ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  Validating…
                                </>
                              ) : (
                                "Save"
                              )}
                            </Button>
                          </div>
                          {error ? (
                            <p className="text-xs text-destructive mt-1.5">{error}</p>
                          ) : row.notes ? (
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {row.notes}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Last updated: {formatDate(row.updated_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {otherRows.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Other settings</CardTitle>
              <CardDescription>
                Auto-managed platform values. These are updated by background processes
                and are not directly editable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {otherRows.map((row) => (
                  <div key={row.key} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="sm:w-56 shrink-0 pt-2">
                        <div className="font-medium text-sm">
                          {row.display_name || row.key}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {row.key}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Input value={row.value} readOnly disabled />
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {row.key === "usd_eur_rate"
                            ? "Updated automatically from ECB daily rates when an evaluation runs."
                            : row.notes || ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Last updated: {formatDate(row.updated_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default AIConfigAdmin;

