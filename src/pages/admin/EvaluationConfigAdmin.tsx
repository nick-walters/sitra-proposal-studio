import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Plus, Save, Eye, Brain, Settings2, Users, FileCheck } from "lucide-react";
import { toast } from "sonner";

type Instrument = {
  id: string;
  name: string;
  code: string;
  page_limit_traditional: number | null;
  page_limit_lump_sum: number | null;
  stage1_page_limit: number | null;
  has_stage1: boolean;
  has_lump_sum: boolean;
  impact_weighting: number;
  notes: string | null;
  special_exceptions: string | null;
  active: boolean;
};

type Criterion = {
  id: string;
  instrument_id: string;
  criterion_name: string;
  criterion_order: number;
  sub_criteria: string;
  scoring_descriptors: string;
  threshold_full: number | null;
  threshold_stage1: number | null;
  applicable_stages: string[];
  weighting: number;
  notes: string | null;
};

type Persona = {
  id: string;
  persona_number: number;
  name: string;
  brief: string;
  thematic_area: string | null;
  active: boolean;
};

type AIConfig = {
  id: string;
  key: string;
  value: string;
  display_name: string | null;
  notes: string | null;
  updated_at: string;
};

const STANDARD_SCORING_DESCRIPTORS = `- **0 — Fail**: Proposal fails to address the criterion or cannot be assessed due to missing or incomplete information.
- **1 — Poor**: The criterion is inadequately addressed, or there are serious inherent weaknesses.
- **2 — Fair**: The proposal broadly addresses the criterion, but there are significant weaknesses.
- **3 — Good**: The proposal addresses the criterion well, but a number of shortcomings are present.
- **4 — Very Good**: The proposal addresses the criterion very well, but a small number of shortcomings are present.
- **5 — Excellent**: The proposal successfully addresses all relevant aspects of the criterion. Any shortcomings are minor.`;

const RIA_DEFAULTS: Record<string, { sub: string; thresholdFull: number; thresholdStage1: number | null; stages: string[] }> = {
  Excellence: {
    sub: `- **Clarity and pertinence of the project's objectives**, and the extent to which the proposed work is ambitious, and goes beyond the state of the art.
- **Soundness of the proposed methodology**, including the underlying concepts, models, assumptions, inter-disciplinary approaches, appropriate consideration of the gender dimension in research and innovation content, and the quality of open science practices.`,
    thresholdFull: 3.0,
    thresholdStage1: 4.0,
    stages: ["stage1", "full"],
  },
  Impact: {
    sub: `- **Credibility of the pathways to achieve the expected outcomes and impacts** specified in the work programme, and the likely scale and significance of the contributions due to the project.
- **Suitability and quality of the measures to maximise expected outcomes and impacts**, as set out in the dissemination and exploitation plan, including communication activities.`,
    thresholdFull: 3.0,
    thresholdStage1: 4.0,
    stages: ["stage1", "full"],
  },
  Implementation: {
    sub: `- **Quality and effectiveness of the work plan**, assessment of risks, and appropriateness of the effort assigned to work packages, and the resources overall.
- **Capacity and role of each participant**, and extent to which the consortium as a whole brings together the necessary expertise.`,
    thresholdFull: 3.0,
    thresholdStage1: null,
    stages: ["full"],
  },
};

export function EvaluationConfigAdmin() {
  const navigate = useNavigate();
  const { isOwner, loading: roleLoading } = useUserRole();

  const [loading, setLoading] = useState(true);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [aiConfig, setAIConfig] = useState<AIConfig[]>([]);

  const [selectedInstrumentForCriteria, setSelectedInstrumentForCriteria] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCriterion, setPreviewCriterion] = useState<Criterion | null>(null);
  const [addInstrumentOpen, setAddInstrumentOpen] = useState(false);
  const [addPersonaOpen, setAddPersonaOpen] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isOwner) {
      toast.error("Access denied. Owner role required.");
      navigate("/dashboard");
    }
  }, [isOwner, roleLoading, navigate]);

  useEffect(() => {
    if (isOwner) loadAll();
  }, [isOwner]);

  const loadAll = async () => {
    setLoading(true);
    const [instRes, critRes, persRes, aiRes] = await Promise.all([
      supabase.from("instrument_types").select("*").order("name"),
      supabase.from("evaluation_criteria").select("*").order("criterion_order"),
      supabase.from("evaluator_personas").select("*").order("persona_number"),
      supabase.from("ai_platform_config").select("*").order("key"),
    ]);
    if (instRes.error) toast.error(instRes.error.message);
    if (critRes.error) toast.error(critRes.error.message);
    if (persRes.error) toast.error(persRes.error.message);
    if (aiRes.error) toast.error(aiRes.error.message);

    setInstruments((instRes.data as Instrument[]) || []);
    setCriteria((critRes.data as Criterion[]) || []);
    setPersonas((persRes.data as Persona[]) || []);
    setAIConfig((aiRes.data as AIConfig[]) || []);
    if (!selectedInstrumentForCriteria && instRes.data?.[0]) {
      setSelectedInstrumentForCriteria((instRes.data[0] as Instrument).id);
    }
    setLoading(false);
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!isOwner) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="w-8 h-8 text-purple-500" />
            Evaluation Configuration
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage instrument types, evaluation criteria, evaluator personas, and AI model settings
          </p>
        </div>

        <Alert className="mb-6 border-amber-500/50 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            Changes take effect immediately for all subsequent evaluations.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="instruments" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-3xl">
            <TabsTrigger value="instruments"><FileCheck className="w-4 h-4 mr-2" />Instruments</TabsTrigger>
            <TabsTrigger value="criteria"><Settings2 className="w-4 h-4 mr-2" />Criteria</TabsTrigger>
            <TabsTrigger value="personas"><Users className="w-4 h-4 mr-2" />Personas</TabsTrigger>
            <TabsTrigger value="ai"><Brain className="w-4 h-4 mr-2" />AI Config</TabsTrigger>
          </TabsList>

          <TabsContent value="instruments" className="mt-6">
            <InstrumentsTab
              instruments={instruments}
              onChange={loadAll}
              addOpen={addInstrumentOpen}
              setAddOpen={setAddInstrumentOpen}
            />
          </TabsContent>

          <TabsContent value="criteria" className="mt-6">
            <CriteriaTab
              instruments={instruments}
              criteria={criteria}
              selectedInstrumentId={selectedInstrumentForCriteria}
              setSelectedInstrumentId={setSelectedInstrumentForCriteria}
              onChange={loadAll}
              onPreview={(c) => { setPreviewCriterion(c); setPreviewOpen(true); }}
            />
          </TabsContent>

          <TabsContent value="personas" className="mt-6">
            <PersonasTab
              personas={personas}
              onChange={loadAll}
              addOpen={addPersonaOpen}
              setAddOpen={setAddPersonaOpen}
            />
          </TabsContent>

          <TabsContent value="ai" className="mt-6">
            <AIConfigTab aiConfig={aiConfig} onChange={loadAll} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prompt preview — {previewCriterion?.criterion_name}</DialogTitle>
            <DialogDescription>
              How this criterion appears inside the evaluator system prompt
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded p-4 max-h-[60vh] overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono">
{`### Criterion: ${previewCriterion?.criterion_name}

${previewCriterion?.sub_criteria || ""}

#### Scoring scale (0–5)

${previewCriterion?.scoring_descriptors || ""}

Threshold (full): ${previewCriterion?.threshold_full ?? "—"}
Threshold (stage 1): ${previewCriterion?.threshold_stage1 ?? "—"}
Applicable stages: ${(previewCriterion?.applicable_stages || []).join(", ")}`}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================== Instruments Tab =====================
function InstrumentsTab({
  instruments,
  onChange,
  addOpen,
  setAddOpen,
}: {
  instruments: Instrument[];
  onChange: () => void;
  addOpen: boolean;
  setAddOpen: (b: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Instrument types</CardTitle>
          <CardDescription>Page limits, weighting and exceptions per instrument</CardDescription>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add instrument type</Button>
          </DialogTrigger>
          <AddInstrumentDialog onClose={() => setAddOpen(false)} onCreated={onChange} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {instruments.map((inst) => (
            <InstrumentRow key={inst.id} instrument={inst} onChange={onChange} />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function InstrumentRow({ instrument, onChange }: { instrument: Instrument; onChange: () => void }) {
  const [draft, setDraft] = useState(instrument);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(instrument), [instrument]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("instrument_types")
      .update({
        name: draft.name,
        code: draft.code,
        page_limit_traditional: draft.page_limit_traditional,
        page_limit_lump_sum: draft.page_limit_lump_sum,
        stage1_page_limit: draft.stage1_page_limit,
        has_stage1: draft.has_stage1,
        has_lump_sum: draft.has_lump_sum,
        impact_weighting: draft.impact_weighting,
        notes: draft.notes,
        special_exceptions: draft.special_exceptions,
        active: draft.active,
      })
      .eq("id", draft.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${draft.name} saved`);
      onChange();
    }
  };

  return (
    <AccordionItem value={instrument.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-4 flex-1">
          <span className="font-semibold text-base">{instrument.name}</span>
          <Badge variant="outline">{instrument.code}</Badge>
          <span className="text-sm text-muted-foreground">
            Trad: {instrument.page_limit_traditional ?? "—"} · LS: {instrument.page_limit_lump_sum ?? "—"} · Stage 1: {instrument.stage1_page_limit ?? "—"}
          </span>
          <span className="text-sm text-muted-foreground">Impact ×{instrument.impact_weighting}</span>
          {!instrument.active && <Badge variant="secondary">Inactive</Badge>}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label>Code</Label>
            <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </div>
          <div>
            <Label>Page limit (traditional)</Label>
            <Input
              type="number"
              value={draft.page_limit_traditional ?? ""}
              onChange={(e) => setDraft({ ...draft, page_limit_traditional: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <Label>Page limit (lump sum)</Label>
            <Input
              type="number"
              value={draft.page_limit_lump_sum ?? ""}
              onChange={(e) => setDraft({ ...draft, page_limit_lump_sum: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <Label>Stage 1 page limit</Label>
            <Input
              type="number"
              value={draft.stage1_page_limit ?? ""}
              onChange={(e) => setDraft({ ...draft, stage1_page_limit: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <Label>Impact weighting</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.impact_weighting}
              onChange={(e) => setDraft({ ...draft, impact_weighting: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={draft.has_stage1} onCheckedChange={(v) => setDraft({ ...draft, has_stage1: v })} />
            <Label>Has stage 1</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={draft.has_lump_sum} onCheckedChange={(v) => setDraft({ ...draft, has_lump_sum: v })} />
            <Label>Has lump sum option</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
            <Label>Active</Label>
          </div>
        </div>
        <div className="mt-4">
          <Label>Special exceptions</Label>
          <p className="text-xs text-muted-foreground mb-1">
            Evaluation exceptions or topic-specific rules. This text is injected directly into evaluator prompts.
          </p>
          <Textarea
            rows={4}
            value={draft.special_exceptions ?? ""}
            onChange={(e) => setDraft({ ...draft, special_exceptions: e.target.value })}
          />
        </div>
        <div className="mt-4">
          <Label>Notes</Label>
          <p className="text-xs text-muted-foreground mb-1">Internal notes only, not shown to evaluators.</p>
          <Textarea rows={3} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function AddInstrumentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pageLimitTrad, setPageLimitTrad] = useState<number | "">(40);
  const [pageLimitLS, setPageLimitLS] = useState<number | "">(45);
  const [stage1Limit, setStage1Limit] = useState<number | "">(10);
  const [hasStage1, setHasStage1] = useState(true);
  const [hasLumpSum, setHasLumpSum] = useState(true);
  const [impactWeighting, setImpactWeighting] = useState<number>(1.0);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setCreating(true);
    const { data: inst, error } = await supabase
      .from("instrument_types")
      .insert({
        name: name.trim(),
        code: code.trim().toLowerCase(),
        page_limit_traditional: pageLimitTrad === "" ? null : Number(pageLimitTrad),
        page_limit_lump_sum: pageLimitLS === "" ? null : Number(pageLimitLS),
        stage1_page_limit: stage1Limit === "" ? null : Number(stage1Limit),
        has_stage1: hasStage1,
        has_lump_sum: hasLumpSum,
        impact_weighting: impactWeighting,
        active: true,
      })
      .select()
      .single();

    if (error || !inst) {
      setCreating(false);
      toast.error(error?.message || "Failed to create");
      return;
    }

    // Auto-create blank evaluation criteria seeded with RIA defaults
    const rows = (["Excellence", "Impact", "Implementation"] as const).map((critName, idx) => {
      const def = RIA_DEFAULTS[critName];
      return {
        instrument_id: inst.id,
        criterion_name: critName,
        criterion_order: idx + 1,
        sub_criteria: def.sub,
        scoring_descriptors: STANDARD_SCORING_DESCRIPTORS,
        threshold_full: def.thresholdFull,
        threshold_stage1: hasStage1 ? def.thresholdStage1 : null,
        applicable_stages: hasStage1 ? def.stages : ["full"],
        weighting: 1.0,
      };
    });
    const { error: critErr } = await supabase.from("evaluation_criteria").insert(rows);
    setCreating(false);
    if (critErr) {
      toast.error(`Instrument created but criteria failed: ${critErr.message}`);
    } else {
      toast.success(`${name} created with default criteria`);
    }
    onCreated();
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add instrument type</DialogTitle>
        <DialogDescription>
          Default Excellence / Impact / Implementation criteria will be seeded automatically.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CBE JU IA" />
        </div>
        <div>
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. cbe_ju_ia" />
        </div>
        <div>
          <Label>Page limit (traditional)</Label>
          <Input type="number" value={pageLimitTrad} onChange={(e) => setPageLimitTrad(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <div>
          <Label>Page limit (lump sum)</Label>
          <Input type="number" value={pageLimitLS} onChange={(e) => setPageLimitLS(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <div>
          <Label>Stage 1 limit</Label>
          <Input type="number" value={stage1Limit} onChange={(e) => setStage1Limit(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <div>
          <Label>Impact weighting</Label>
          <Input type="number" step="0.1" value={impactWeighting} onChange={(e) => setImpactWeighting(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={hasStage1} onCheckedChange={setHasStage1} />
          <Label>Has stage 1</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={hasLumpSum} onCheckedChange={setHasLumpSum} />
          <Label>Has lump sum</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={create} disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ===================== Criteria Tab =====================
function CriteriaTab({
  instruments,
  criteria,
  selectedInstrumentId,
  setSelectedInstrumentId,
  onChange,
  onPreview,
}: {
  instruments: Instrument[];
  criteria: Criterion[];
  selectedInstrumentId: string;
  setSelectedInstrumentId: (id: string) => void;
  onChange: () => void;
  onPreview: (c: Criterion) => void;
}) {
  const filtered = useMemo(
    () => criteria.filter((c) => c.instrument_id === selectedInstrumentId).sort((a, b) => a.criterion_order - b.criterion_order),
    [criteria, selectedInstrumentId]
  );
  const selectedInstrument = instruments.find((i) => i.id === selectedInstrumentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evaluation criteria</CardTitle>
        <CardDescription>Per-instrument criteria injected verbatim into evaluator prompts</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 max-w-sm">
          <Label>Instrument</Label>
          <Select value={selectedInstrumentId} onValueChange={setSelectedInstrumentId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {instruments.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No criteria yet for this instrument.</p>
        ) : (
          <Tabs defaultValue={filtered[0].id} className="w-full">
            <TabsList>
              {filtered.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>{c.criterion_name}</TabsTrigger>
              ))}
            </TabsList>
            {filtered.map((c) => (
              <TabsContent key={c.id} value={c.id}>
                <CriterionEditor
                  criterion={c}
                  instrumentHasStage1={selectedInstrument?.has_stage1 ?? false}
                  onChange={onChange}
                  onPreview={() => onPreview(c)}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function CriterionEditor({
  criterion,
  instrumentHasStage1,
  onChange,
  onPreview,
}: {
  criterion: Criterion;
  instrumentHasStage1: boolean;
  onChange: () => void;
  onPreview: () => void;
}) {
  const [draft, setDraft] = useState(criterion);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(criterion), [criterion]);

  const stage1Disabled = !draft.applicable_stages.includes("stage1") || !instrumentHasStage1;

  const toggleStage = (stage: "full" | "stage1", checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...draft.applicable_stages, stage]))
      : draft.applicable_stages.filter((s) => s !== stage);
    setDraft({ ...draft, applicable_stages: next });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("evaluation_criteria")
      .update({
        sub_criteria: draft.sub_criteria,
        scoring_descriptors: draft.scoring_descriptors,
        threshold_full: draft.threshold_full,
        threshold_stage1: draft.threshold_stage1,
        applicable_stages: draft.applicable_stages,
        notes: draft.notes,
        weighting: draft.weighting,
      })
      .eq("id", draft.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Criterion saved"); onChange(); }
  };

  return (
    <div className="space-y-4 pt-4">
      <div>
        <Label>Sub-criteria</Label>
        <p className="text-xs text-muted-foreground mb-1">Markdown. Injected verbatim into evaluator prompts.</p>
        <Textarea rows={8} value={draft.sub_criteria} onChange={(e) => setDraft({ ...draft, sub_criteria: e.target.value })} />
      </div>
      <div>
        <Label>Scoring descriptors</Label>
        <Textarea rows={8} value={draft.scoring_descriptors} onChange={(e) => setDraft({ ...draft, scoring_descriptors: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Threshold — full proposals</Label>
          <Input
            type="number"
            step="0.5"
            min={0}
            max={5}
            value={draft.threshold_full ?? ""}
            onChange={(e) => setDraft({ ...draft, threshold_full: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Threshold — stage 1</Label>
          <Input
            type="number"
            step="0.5"
            min={0}
            max={5}
            disabled={stage1Disabled}
            value={draft.threshold_stage1 ?? ""}
            onChange={(e) => setDraft({ ...draft, threshold_stage1: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <Label>Applicable stages</Label>
        <div className="flex items-center gap-6 mt-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={draft.applicable_stages.includes("full")} onCheckedChange={(c) => toggleStage("full", !!c)} />
            Full
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              disabled={!instrumentHasStage1}
              checked={draft.applicable_stages.includes("stage1")}
              onCheckedChange={(c) => toggleStage("stage1", !!c)}
            />
            Stage 1
          </label>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <p className="text-xs text-muted-foreground mb-1">Admin only.</p>
        <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onPreview}>
          <Eye className="w-4 h-4 mr-2" />Preview in prompt
        </Button>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />{saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ===================== Personas Tab =====================
function PersonasTab({
  personas,
  onChange,
  addOpen,
  setAddOpen,
}: {
  personas: Persona[];
  onChange: () => void;
  addOpen: boolean;
  setAddOpen: (b: boolean) => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<string, Persona[]> = {};
    for (const p of personas) {
      const key = p.thematic_area ?? "Uncategorised";
      (g[key] ||= []).push(p);
    }
    return g;
  }, [personas]);

  const themes = useMemo(() => Array.from(new Set(personas.map((p) => p.thematic_area).filter(Boolean) as string[])), [personas]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Evaluator personas</CardTitle>
          <CardDescription>{personas.length} personas across {Object.keys(grouped).length} thematic areas</CardDescription>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add persona</Button>
          </DialogTrigger>
          <AddPersonaDialog
            existingThemes={themes}
            onClose={() => setAddOpen(false)}
            onCreated={onChange}
          />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {Object.entries(grouped).map(([area, list]) => (
            <AccordionItem key={area} value={area}>
              <AccordionTrigger>
                <span className="font-medium">{area}</span>
                <Badge variant="outline" className="ml-2">{list.length}</Badge>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {list.map((p) => (
                    <PersonaRow key={p.id} persona={p} themes={themes} onChange={onChange} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function PersonaRow({ persona, themes, onChange }: { persona: Persona; themes: string[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(persona);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(persona), [persona]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("evaluator_personas")
      .update({ name: draft.name, brief: draft.brief, thematic_area: draft.thematic_area, active: draft.active })
      .eq("id", draft.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setEditing(false); onChange(); }
  };

  const toggleActive = async (v: boolean) => {
    const { error } = await supabase.from("evaluator_personas").update({ active: v }).eq("id", persona.id);
    if (error) toast.error(error.message);
    else { setDraft({ ...draft, active: v }); onChange(); }
  };

  if (!editing) {
    return (
      <div className="border rounded p-3 flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{persona.name}</span>
            {!persona.active && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{persona.brief}</p>
        </div>
        <Switch checked={persona.active} onCheckedChange={toggleActive} />
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
      </div>
    );
  }

  return (
    <div className="border rounded p-3 space-y-3">
      <div>
        <Label>Name</Label>
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <Label>Brief</Label>
        <Textarea rows={3} value={draft.brief} onChange={(e) => setDraft({ ...draft, brief: e.target.value })} />
      </div>
      <div>
        <Label>Thematic area</Label>
        <Select
          value={draft.thematic_area ?? ""}
          onValueChange={(v) => setDraft({ ...draft, thematic_area: v })}
        >
          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {themes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setDraft(persona); setEditing(false); }}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  );
}

function AddPersonaDialog({
  existingThemes,
  onClose,
  onCreated,
}: {
  existingThemes: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [theme, setTheme] = useState<string>(existingThemes[0] ?? "");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim() || !brief.trim()) {
      toast.error("Name and brief are required");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("evaluator_personas").insert({
      name: name.trim(),
      brief: brief.trim(),
      thematic_area: theme || null,
      active: true,
    });
    setCreating(false);
    if (error) toast.error(error.message);
    else { toast.success("Persona added"); onCreated(); onClose(); }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add evaluator persona</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Brief</Label>
          <Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
        </div>
        <div>
          <Label>Thematic area</Label>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {existingThemes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={create} disabled={creating}>{creating ? "Adding..." : "Add"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ===================== AI Config Tab =====================
function AIConfigTab({ aiConfig, onChange }: { aiConfig: AIConfig[]; onChange: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI model configuration</CardTitle>
        <CardDescription>Model identifiers and pricing used by the evaluator</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 border-amber-500/50 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            Model string values must exactly match Anthropic API model IDs.
          </AlertDescription>
        </Alert>
        <div className="space-y-2">
          {aiConfig.map((row) => (
            <AIConfigRow key={row.id} row={row} onChange={onChange} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AIConfigRow({ row, onChange }: { row: AIConfig; onChange: () => void }) {
  const [draft, setDraft] = useState(row);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(row), [row]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("ai_platform_config")
      .update({ value: draft.value, display_name: draft.display_name, notes: draft.notes })
      .eq("id", draft.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); onChange(); }
  };

  return (
    <div className="grid grid-cols-12 gap-3 items-start border rounded p-3">
      <div className="col-span-3">
        <Label className="text-xs">Key</Label>
        <code className="block text-xs bg-muted px-2 py-1 rounded mt-1 truncate">{draft.key}</code>
      </div>
      <div className="col-span-3">
        <Label className="text-xs">Display name</Label>
        <Input
          value={draft.display_name ?? ""}
          onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
        />
      </div>
      <div className="col-span-3">
        <Label className="text-xs">Value</Label>
        <Input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Last updated</Label>
        <p className="text-xs text-muted-foreground mt-2">
          {new Date(draft.updated_at).toLocaleDateString()}
        </p>
      </div>
      <div className="col-span-1 flex items-end h-full">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
