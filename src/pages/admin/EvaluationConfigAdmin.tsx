import { useState, useEffect, useMemo, Fragment as FragmentRow } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, ChevronRight, ChevronDown, AlertTriangle, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";

type InstrumentType = {
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

type EvaluationCriterion = {
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

type EvaluatorPersona = {
  id: string;
  name: string;
  brief: string;
  thematic_area: string | null;
  active: boolean;
};

type AiConfig = {
  id: string;
  key: string;
  value: string;
  display_name: string | null;
  notes: string | null;
  updated_at: string | null;
};

const THEMATIC_AREAS = [
  "Circular Economy",
  "Data & AI",
  "Democracy & Trust",
  "Health & Wellbeing",
];

const DEFAULT_SCORING_DESCRIPTORS = `0 = Fails to address criterion or cannot be assessed due to missing/incomplete information
1 = Poor — criterion inadequately addressed or serious inherent weaknesses
2 = Fair — broadly addresses criterion but significant weaknesses
3 = Good — addresses criterion well but a number of shortcomings present
4 = Very Good — addresses criterion very well but a small number of shortcomings present
5 = Excellent — successfully addresses all relevant aspects; any shortcomings minor`;

const RIA_DEFAULT_CRITERIA = [
  {
    name: "Excellence",
    order: 1,
    sub_criteria: `- Clarity and pertinence of the project objectives, and the extent to which the proposed work is ambitious and goes beyond the state of the art
- Soundness of the proposed overall methodology, including: integration of the gender dimension in research and innovation content; open science practices; positioning in terms of R&I maturity/TRL; quality of interdisciplinary approach where relevant`,
    threshold_full: 3,
    threshold_stage1: 4,
    applicable_stages: ["full", "stage1"],
    weighting: 1.0,
  },
  {
    name: "Impact",
    order: 2,
    sub_criteria: `- Credibility of the pathways to achieve the expected outcomes and impacts specified in the work programme, and the likely scale and significance of contributions from the project
- Quality and appropriateness of the dissemination, exploitation, and communication measures
- Quality of the measures to maximise impact, including scale-up and transferability potential
- KPIs and milestones for tracking progress towards impacts`,
    threshold_full: 3,
    threshold_stage1: 4,
    applicable_stages: ["full", "stage1"],
    weighting: 1.0,
  },
  {
    name: "Implementation",
    order: 3,
    sub_criteria: `- Coherence and effectiveness of the work plan, including appropriateness of work packages, tasks, deliverables, and milestones
- Appropriateness of the management structures and procedures, including risk management
- Quality and complementarity of the consortium, and extent to which it is well-suited to deliver the project
- Appropriateness of the allocation of resources (budget, personnel) to tasks and partners`,
    threshold_full: 3,
    threshold_stage1: null,
    applicable_stages: ["full"],
    weighting: 1.0,
  },
];

export function EvaluationConfigAdmin() {
  const navigate = useNavigate();
  const { isOwner, loading: roleLoading } = useUserRole();

  useEffect(() => {
    if (!roleLoading && !isOwner) {
      toast.error("Access denied. Owner role required.");
      navigate("/dashboard");
    }
  }, [isOwner, roleLoading, navigate]);

  if (roleLoading) {
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
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Evaluation Configuration</h1>
          <p className="text-muted-foreground mt-2">
            Manage instrument types, evaluation criteria, evaluator personas, and AI model settings
          </p>
        </div>

        <Tabs defaultValue="instruments">
          <TabsList>
            <TabsTrigger value="instruments">Instrument Types</TabsTrigger>
            <TabsTrigger value="criteria">Evaluation Criteria</TabsTrigger>
            <TabsTrigger value="personas">Evaluator Personas</TabsTrigger>
            <TabsTrigger value="ai-config">AI Model Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="instruments" className="mt-4">
            <InstrumentTypesTab />
          </TabsContent>
          <TabsContent value="criteria" className="mt-4">
            <CriteriaTab />
          </TabsContent>
          <TabsContent value="personas" className="mt-4">
            <PersonasTab />
          </TabsContent>
          <TabsContent value="ai-config" className="mt-4">
            <AiConfigTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ===== Instruments Tab =====
function InstrumentTypesTab() {
  const [rows, setRows] = useState<InstrumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("instrument_types")
      .select("*")
      .order("name");
    if (error) toast.error("Failed to load instruments");
    else setRows((data || []) as InstrumentType[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (id: string, field: keyof InstrumentType, value: any) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row: InstrumentType) => {
    const { error } = await supabase
      .from("instrument_types")
      .update({
        special_exceptions: row.special_exceptions,
        notes: row.notes,
        active: row.active,
      })
      .eq("id", row.id);
    if (error) toast.error("Save failed");
    else toast.success("Saved");
  };

  const toggleActive = async (row: InstrumentType, value: boolean) => {
    updateField(row.id, "active", value);
    const { error } = await supabase
      .from("instrument_types")
      .update({ active: value })
      .eq("id", row.id);
    if (error) toast.error("Save failed");
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Changes take effect immediately for all subsequent evaluations.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add instrument type
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Pages (traditional)</TableHead>
                  <TableHead>Pages (lump sum)</TableHead>
                  <TableHead>Stage 1 pages</TableHead>
                  <TableHead>Impact weighting</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <FragmentRow key={row.id}>
                    <TableRow key={row.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                        >
                          {expandedId === row.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.code}</Badge>
                      </TableCell>
                      <TableCell>{row.page_limit_traditional ?? "—"}</TableCell>
                      <TableCell>{row.page_limit_lump_sum ?? "—"}</TableCell>
                      <TableCell>{row.stage1_page_limit ?? "—"}</TableCell>
                      <TableCell>{row.impact_weighting}</TableCell>
                      <TableCell>
                        <Switch
                          checked={row.active}
                          onCheckedChange={(v) => toggleActive(row, v)}
                        />
                      </TableCell>
                    </TableRow>
                    {expandedId === row.id && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30">
                          <div className="space-y-4 py-2">
                            <div>
                              <Label>Special exceptions</Label>
                              <p className="text-xs text-muted-foreground mb-2">
                                Evaluation exceptions or topic-specific rules. Injected directly into evaluator prompts. Leave blank if none.
                              </p>
                              <Textarea
                                rows={3}
                                value={row.special_exceptions || ""}
                                onChange={(e) =>
                                  updateField(row.id, "special_exceptions", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <Label>Notes</Label>
                              <p className="text-xs text-muted-foreground mb-2">
                                Internal notes only — not shown to evaluators.
                              </p>
                              <Textarea
                                rows={2}
                                value={row.notes || ""}
                                onChange={(e) => updateField(row.id, "notes", e.target.value)}
                              />
                            </div>
                            <Button onClick={() => saveRow(row)}>Save</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddInstrumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
      />
    </div>
  );
}

function AddInstrumentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    page_limit_traditional: 40,
    page_limit_lump_sum: 45,
    stage1_page_limit: 10,
    has_stage1: true,
    has_lump_sum: true,
    impact_weighting: 1.0,
  });
  const [saving, setSaving] = useState(false);

  const reset = () =>
    setForm({
      name: "",
      code: "",
      page_limit_traditional: 40,
      page_limit_lump_sum: 45,
      stage1_page_limit: 10,
      has_stage1: true,
      has_lump_sum: true,
      impact_weighting: 1.0,
    });

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("instrument_types")
      .insert({
        name: form.name.trim(),
        code: form.code.trim().toLowerCase(),
        page_limit_traditional: form.page_limit_traditional,
        page_limit_lump_sum: form.page_limit_lump_sum,
        stage1_page_limit: form.has_stage1 ? form.stage1_page_limit : null,
        has_stage1: form.has_stage1,
        has_lump_sum: form.has_lump_sum,
        impact_weighting: form.impact_weighting,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error(error?.message || "Failed to create");
      setSaving(false);
      return;
    }

    // Pre-populate criteria
    const criteriaRows = RIA_DEFAULT_CRITERIA.map((c) => ({
      instrument_id: data.id,
      criterion_name: c.name,
      criterion_order: c.order,
      sub_criteria: c.sub_criteria,
      scoring_descriptors: DEFAULT_SCORING_DESCRIPTORS,
      threshold_full: c.threshold_full,
      threshold_stage1: form.has_stage1 ? c.threshold_stage1 : null,
      applicable_stages: form.has_stage1 ? c.applicable_stages : ["full"],
      weighting: c.name === "Impact" ? form.impact_weighting : c.weighting,
    }));
    const { error: critError } = await supabase
      .from("evaluation_criteria")
      .insert(criteriaRows);
    if (critError) toast.error("Created instrument but failed to seed criteria");
    else toast.success("Instrument created");

    setSaving(false);
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add instrument type</DialogTitle>
          <DialogDescription>
            Default Excellence, Impact, and Implementation criteria will be created.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div>
              <Label>Pages (traditional)</Label>
              <Input
                type="number"
                value={form.page_limit_traditional}
                onChange={(e) =>
                  setForm({ ...form, page_limit_traditional: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Pages (lump sum)</Label>
              <Input
                type="number"
                value={form.page_limit_lump_sum}
                onChange={(e) =>
                  setForm({ ...form, page_limit_lump_sum: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Stage 1 pages</Label>
              <Input
                type="number"
                value={form.stage1_page_limit}
                onChange={(e) =>
                  setForm({ ...form, stage1_page_limit: Number(e.target.value) })
                }
                disabled={!form.has_stage1}
              />
            </div>
            <div>
              <Label>Impact weighting</Label>
              <Input
                type="number"
                step="0.1"
                value={form.impact_weighting}
                onChange={(e) =>
                  setForm({ ...form, impact_weighting: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={form.has_stage1}
                onCheckedChange={(v) => setForm({ ...form, has_stage1: !!v })}
              />
              <span className="text-sm">Has stage 1</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={form.has_lump_sum}
                onCheckedChange={(v) => setForm({ ...form, has_lump_sum: !!v })}
              />
              <span className="text-sm">Has lump sum</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Criteria Tab =====
function CriteriaTab() {
  const [instruments, setInstruments] = useState<InstrumentType[]>([]);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>("");
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("instrument_types").select("*").order("name");
      setInstruments((data || []) as InstrumentType[]);
      if (data && data.length > 0) setSelectedInstrumentId(data[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedInstrumentId) return;
    (async () => {
      const { data } = await supabase
        .from("evaluation_criteria")
        .select("*")
        .eq("instrument_id", selectedInstrumentId)
        .order("criterion_order");
      setCriteria((data || []) as EvaluationCriterion[]);
    })();
  }, [selectedInstrumentId]);

  const updateField = (id: string, field: keyof EvaluationCriterion, value: any) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const toggleStage = (c: EvaluationCriterion, stage: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...(c.applicable_stages || []), stage]))
      : (c.applicable_stages || []).filter((s) => s !== stage);
    updateField(c.id, "applicable_stages", next);
  };

  const save = async (c: EvaluationCriterion) => {
    const { error } = await supabase
      .from("evaluation_criteria")
      .update({
        sub_criteria: c.sub_criteria,
        scoring_descriptors: c.scoring_descriptors,
        threshold_full: c.threshold_full,
        threshold_stage1: c.threshold_stage1,
        applicable_stages: c.applicable_stages,
        notes: c.notes,
      })
      .eq("id", c.id);
    if (error) toast.error("Save failed");
    else toast.success("Saved");
  };

  const showPreview = (c: EvaluationCriterion) => {
    const instrument = instruments.find((i) => i.id === selectedInstrumentId);
    setPreviewText(
      `You are evaluating a Horizon Europe ${instrument?.name || ""} proposal against the "${c.criterion_name}" criterion.

Sub-criteria:
${c.sub_criteria}

Scoring scale:
${c.scoring_descriptors}

Threshold for full proposals: ${c.threshold_full ?? "n/a"}
Threshold for stage 1: ${c.threshold_stage1 ?? "n/a"}`
    );
    setPreviewOpen(true);
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Label>Instrument</Label>
        <Select value={selectedInstrumentId} onValueChange={setSelectedInstrumentId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {instruments.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {criteria.length > 0 && (
        <Tabs defaultValue={criteria[0].id}>
          <TabsList>
            {criteria.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.criterion_name}
              </TabsTrigger>
            ))}
          </TabsList>
          {criteria.map((c) => {
            const stage1Allowed = (c.applicable_stages || []).includes("stage1");
            return (
              <TabsContent key={c.id} value={c.id} className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{c.criterion_name}</CardTitle>
                    <CardDescription>Order {c.criterion_order} · Weighting {c.weighting}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Sub-criteria</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Injected verbatim into evaluator prompts.
                      </p>
                      <Textarea
                        rows={6}
                        value={c.sub_criteria}
                        onChange={(e) => updateField(c.id, "sub_criteria", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Scoring descriptors</Label>
                      <Textarea
                        rows={6}
                        value={c.scoring_descriptors}
                        onChange={(e) =>
                          updateField(c.id, "scoring_descriptors", e.target.value)
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Threshold — full proposals</Label>
                        <Input
                          type="number"
                          min={0}
                          max={5}
                          step={0.5}
                          value={c.threshold_full ?? ""}
                          onChange={(e) =>
                            updateField(
                              c.id,
                              "threshold_full",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label>Threshold — stage 1</Label>
                        <Input
                          type="number"
                          min={0}
                          max={5}
                          step={0.5}
                          disabled={!stage1Allowed}
                          value={c.threshold_stage1 ?? ""}
                          onChange={(e) =>
                            updateField(
                              c.id,
                              "threshold_stage1",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Applicable stages</Label>
                      <div className="flex gap-6 mt-2">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={(c.applicable_stages || []).includes("full")}
                            onCheckedChange={(v) => toggleStage(c, "full", !!v)}
                          />
                          <span className="text-sm">Full proposal</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={stage1Allowed}
                            onCheckedChange={(v) => toggleStage(c, "stage1", !!v)}
                          />
                          <span className="text-sm">Stage 1</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Admin facing only — not injected into prompts.
                      </p>
                      <Textarea
                        rows={2}
                        value={c.notes || ""}
                        onChange={(e) => updateField(c.id, "notes", e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => save(c)}>Save</Button>
                      <Button variant="outline" onClick={() => showPreview(c)}>
                        <Eye className="h-4 w-4 mr-2" /> Preview in prompt
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prompt preview</DialogTitle>
            <DialogDescription>
              How this criterion text will appear inside an evaluator system prompt.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded text-xs whitespace-pre-wrap font-mono max-h-[60vh] overflow-auto">
            {previewText}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Personas Tab =====
function PersonasTab() {
  const [personas, setPersonas] = useState<EvaluatorPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EvaluatorPersona | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("evaluator_personas")
      .select("*")
      .order("thematic_area")
      .order("name");
    setPersonas((data || []) as EvaluatorPersona[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, EvaluatorPersona[]> = {};
    personas.forEach((p) => {
      const key = p.thematic_area || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [personas]);

  const toggleActive = async (p: EvaluatorPersona, value: boolean) => {
    setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: value } : x)));
    const { error } = await supabase
      .from("evaluator_personas")
      .update({ active: value })
      .eq("id", p.id);
    if (error) toast.error("Update failed");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Add persona
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        Object.entries(grouped).map(([area, list]) => (
          <Card key={area}>
            <CardHeader>
              <CardTitle className="text-lg">{area}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {list.map((p) => (
                <div key={p.id} className="flex items-start gap-3 border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex-1">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-sm text-muted-foreground">{p.brief}</div>
                    <Badge variant="outline" className="mt-1">
                      {p.thematic_area}
                    </Badge>
                  </div>
                  <Switch
                    checked={p.active}
                    onCheckedChange={(v) => toggleActive(p, v)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(p);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <PersonaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        persona={editing}
        onSaved={load}
      />
    </div>
  );
}

function PersonaDialog({
  open,
  onOpenChange,
  persona,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  persona: EvaluatorPersona | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [area, setArea] = useState<string>(THEMATIC_AREAS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(persona?.name || "");
      setBrief(persona?.brief || "");
      setArea(persona?.thematic_area || THEMATIC_AREAS[0]);
    }
  }, [open, persona]);

  const save = async () => {
    if (!name.trim() || !brief.trim()) {
      toast.error("Name and brief are required");
      return;
    }
    setSaving(true);
    if (persona) {
      const { error } = await supabase
        .from("evaluator_personas")
        .update({ name, brief, thematic_area: area })
        .eq("id", persona.id);
      if (error) toast.error("Save failed");
      else toast.success("Saved");
    } else {
      const { error } = await supabase
        .from("evaluator_personas")
        .insert({ name, brief, thematic_area: area, active: true });
      if (error) toast.error("Create failed");
      else toast.success("Created");
    }
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{persona ? "Edit persona" : "Add persona"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Brief</Label>
            <Textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </div>
          <div>
            <Label>Thematic area</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEMATIC_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== AI Config Tab =====
function AiConfigTab() {
  const [rows, setRows] = useState<AiConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_platform_config")
      .select("*")
      .order("key");
    setRows((data || []) as AiConfig[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateValue = (id: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  };

  const save = async (row: AiConfig) => {
    const { error } = await supabase
      .from("ai_platform_config")
      .update({ value: row.value, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) toast.error("Save failed");
    else {
      toast.success("Saved");
      load();
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Model string values must exactly match Anthropic API model IDs. An incorrect string will silently break all evaluations.
        </AlertDescription>
      </Alert>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.display_name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.key}</TableCell>
                    <TableCell>
                      <Input
                        value={r.value}
                        onChange={(e) => updateValue(r.id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      {r.notes || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => save(r)}>
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
