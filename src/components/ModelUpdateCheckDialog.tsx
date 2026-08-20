import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, AlertCircle, Sparkles, Play } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatDate";
import type { EvaluationModelOption } from "@/hooks/useEvaluationModelOptions";

interface AnthropicModel {
  id: string;
  display_name: string | null;
  created_at: string | null;
  configured: boolean;
  is_newer: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: EvaluationModelOption[];
  /** Platform owner (is_global_admin) — only they may change stored configuration. */
  canApply: boolean;
  /** Coordinator-or-above — whoever may run an evaluation may pick a model for one run. */
  canUseForRun?: boolean;
  onApplied: () => void;
  /**
   * Select a model for the next run only. Never touches stored configuration —
   * the prices come with it because an unconfigured model has none on record.
   */
  onUseForRun?: (choice: {
    modelId: string;
    label: string;
    priceInputPerMTok: number;
    priceOutputPerMTok: number;
  }) => void;
}

/**
 * Lists the models Anthropic currently offers. A coordinator may take one for a
 * single run; only a platform owner may replace a stored default with it. The
 * Anthropic call runs inside the `list-anthropic-models` edge function so the
 * API key never reaches the browser.
 */
export function ModelUpdateCheckDialog({
  open,
  onOpenChange,
  options,
  canApply,
  canUseForRun = false,
  onApplied,
  onUseForRun,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<AnthropicModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Apply flow state ("replace a default" — owner only)
  const [applyTarget, setApplyTarget] = useState<AnthropicModel | null>(null);
  const [replaceOptionId, setReplaceOptionId] = useState<string>("");
  const [priceIn, setPriceIn] = useState("");
  const [priceOut, setPriceOut] = useState("");
  const [applying, setApplying] = useState(false);

  // One-off run flow state — writes nothing to evaluation_model_options.
  const [runTarget, setRunTarget] = useState<AnthropicModel | null>(null);
  const [runPriceIn, setRunPriceIn] = useState("");
  const [runPriceOut, setRunPriceOut] = useState("");


  const check = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("list-anthropic-models", {
        body: {},
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setModels(Array.isArray(data?.models) ? data.models : []);
    } catch (err) {
      setModels(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach Anthropic's models endpoint. Please try again later.",
      );
    } finally {
      setLoading(false);
    }
  };

  const openApply = (model: AnthropicModel) => {
    setApplyTarget(model);
    setReplaceOptionId(options[0]?.id ?? "");
    setPriceIn("");
    setPriceOut("");
  };

  const openUseForRun = (model: AnthropicModel) => {
    const configured = options.find((o) => o.model_id === model.id);
    setRunTarget(model);
    // A configured model already has prices on record; an unconfigured one has
    // none, so the operator is asked for them rather than a guess being made.
    setRunPriceIn(configured ? String(configured.price_input_per_mtok) : "");
    setRunPriceOut(configured ? String(configured.price_output_per_mtok) : "");
  };

  const confirmUseForRun = () => {
    if (!runTarget || !onUseForRun) return;
    const inNum = Number(runPriceIn);
    const outNum = Number(runPriceOut);
    if (!Number.isFinite(inNum) || inNum <= 0 || !Number.isFinite(outNum) || outNum <= 0) {
      toast.error("Enter both input and output prices in USD per million tokens.");
      return;
    }
    onUseForRun({
      modelId: runTarget.id,
      label: runTarget.display_name || runTarget.id,
      priceInputPerMTok: inNum,
      priceOutputPerMTok: outNum,
    });
    setRunTarget(null);
    onOpenChange(false);
  };


  const replaced = options.find((o) => o.id === replaceOptionId) || null;

  const confirmApply = async () => {
    if (!applyTarget || !replaced) return;
    const inNum = Number(priceIn);
    const outNum = Number(priceOut);
    if (!Number.isFinite(inNum) || inNum <= 0 || !Number.isFinite(outNum) || outNum <= 0) {
      toast.error("Enter both input and output prices in USD per million tokens.");
      return;
    }
    setApplying(true);
    const { error: updateError } = await supabase
      .from("evaluation_model_options")
      .update({
        model_id: applyTarget.id,
        label: applyTarget.display_name || applyTarget.id,
        price_input_per_mtok: inNum,
        price_output_per_mtok: outNum,
      })
      .eq("id", replaced.id);
    setApplying(false);
    if (updateError) {
      toast.error(`Could not apply model: ${updateError.message}`);
      return;
    }
    toast.success(`${replaced.label} replaced with ${applyTarget.display_name || applyTarget.id}`);
    setApplyTarget(null);
    onApplied();
    void check();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Check for newer models</DialogTitle>
            <DialogDescription>
              Queries Anthropic for the models currently available and highlights anything
              released after the models configured here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button onClick={check} disabled={loading} size="sm" className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {models ? "Check again" : "Check now"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Configured: {options.map((o) => o.label).join(", ") || "none"}
              </span>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {models && models.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">
                Anthropic returned no models.
              </p>
            )}

            {models && models.length > 0 && (
              <div className="border rounded-md divide-y">
                {models.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{m.display_name || m.id}</span>
                        {m.configured && <Badge variant="outline">In use</Badge>}
                        {m.is_newer && (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-500">Newer</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{m.id}</div>
                      <div className="text-xs text-muted-foreground">
                        Released: {m.created_at ? formatDate(m.created_at) : "Not provided"}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {canUseForRun && onUseForRun && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-2"
                          onClick={() => openUseForRun(m)}
                        >
                          <Play className="h-4 w-4" /> Use for this run
                        </Button>
                      )}
                      {canApply && !m.configured && (
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openApply(m)}>
                          <Sparkles className="h-4 w-4" /> Replace one of the default models with this one
                        </Button>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            )}

            {!canApply && models && (
              <p className="text-xs text-muted-foreground">
                Only the platform owner can change the configured models.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation + pricing capture. Anthropic's models endpoint does not
          return prices, so they are asked for explicitly rather than guessed. */}
      <Dialog open={!!applyTarget} onOpenChange={(o) => !o && setApplyTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Use {applyTarget?.display_name || applyTarget?.id}?</DialogTitle>
            <DialogDescription>
              This changes the model offered for every proposal's mock evaluation, immediately
              and without a deploy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Replace which configured option?</Label>
              <Select value={replaceOptionId} onValueChange={setReplaceOptionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label} ({o.model_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {replaced && (
                <p className="text-xs text-muted-foreground">
                  <strong>{replaced.label}</strong> ({replaced.model_id}) will be replaced by{" "}
                  <strong>{applyTarget?.display_name || applyTarget?.id}</strong>.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="price-in">Input price (USD / M tokens)</Label>
                <Input
                  id="price-in"
                  inputMode="decimal"
                  value={priceIn}
                  onChange={(e) => setPriceIn(e.target.value)}
                  placeholder="e.g. 3.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-out">Output price (USD / M tokens)</Label>
                <Input
                  id="price-out"
                  inputMode="decimal"
                  value={priceOut}
                  onChange={(e) => setPriceOut(e.target.value)}
                  placeholder="e.g. 15.00"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Anthropic's models endpoint does not publish prices. Enter them from Anthropic's
              pricing page — cost estimates and logged run costs use these values.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTarget(null)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={confirmApply} disabled={applying || !replaced}>
              {applying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Replace {replaced?.label || "model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
