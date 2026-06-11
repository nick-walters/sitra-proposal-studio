import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ArrowLeft, Save, Play, ChevronsUpDown, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Cfg {
  id: string;
  site_id: string | null;
  site_url: string | null;
  root_folder_path: string;
  per_proposal_subfolder: boolean;
  enabled: boolean;
}

export default function BackupsAdmin() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [proposals, setProposals] = useState<{ id: string; acronym: string | null; title: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: cfgData, error: cfgErr }, { data: pData, error: pErr }] = await Promise.all([
        supabase.from("sharepoint_backup_config").select("*").maybeSingle(),
        supabase.from("proposals").select("id, acronym, title").order("acronym", { ascending: true }),
      ]);
      if (cfgErr) toast.error("Could not load backup settings");
      if (pErr) toast.error("Could not load proposal list");
      setCfg(cfgData as Cfg);
      setProposals((pData ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    const { error } = await supabase
      .from("sharepoint_backup_config")
      .update({
        site_id: cfg.site_id,
        site_url: cfg.site_url,
        root_folder_path: cfg.root_folder_path,
        per_proposal_subfolder: cfg.per_proposal_subfolder,
        enabled: cfg.enabled,
      })
      .eq("id", cfg.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Backup settings saved");
  };

  const runNow = async (mode: "all" | "selected") => {
    const list = mode === "all"
      ? proposals
      : proposals.filter((p) => selected.has(p.id));
    if (!list.length) {
      toast.info(mode === "all" ? "No proposals to back up." : "Select at least one proposal.");
      return;
    }
    setRunning(true);
    try {
      toast.info(`Backing up ${list.length} proposal${list.length === 1 ? "" : "s"} one at a time…`);
      let ok = 0; let failed = 0;
      for (const p of list) {
        try {
          const { data, error } = await supabase.functions.invoke("generate-proposal-backups", {
            body: { trigger: "manual", force: true, proposal_id: p.id },
          });
          if (error || (data as any)?.ok === false) { failed++; }
          else { ok++; }
        } catch (_) { failed++; }
      }
      toast.success(`Backup run complete: ${ok} succeeded${failed ? `, ${failed} failed` : ""}.`);
    } catch (e: any) {
      toast.error(e.message ?? "Backup run failed");
    } finally {
      setRunning(false);
    }
  };

  const toggleProposal = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredProposals = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return proposals;
    return proposals.filter((p) =>
      (p.acronym ?? "").toLowerCase().includes(q) || (p.title ?? "").toLowerCase().includes(q)
    );
  }, [proposals, filter]);

  const selectedLabel = selected.size === 0
    ? "Select proposals…"
    : selected.size === 1
      ? proposals.find((p) => selected.has(p.id))?.acronym ?? "1 selected"
      : `${selected.size} proposals selected`;

  if (loading || !cfg) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to admin
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Backups &amp; SharePoint</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Daily plain-text backups of every active proposal’s Part A &amp; Part B content are written to a private storage bucket at 06:00 Europe/Helsinki, kept for 90 days. They can additionally be pushed to a SharePoint folder in your Microsoft 365 tenant for off-platform redundancy.
        </p>
      </div>

      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">SharePoint destination</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Requires the Microsoft SharePoint connector to be linked at workspace level. Files land in the chosen folder; if “one subfolder per proposal” is on, each proposal gets a folder named “{`{ACRONYM}`} Proposal Backup”.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="site_url">SharePoint site URL</Label>
          <Input
            id="site_url"
            placeholder="https://yourtenant.sharepoint.com/sites/YourSite"
            value={cfg.site_url ?? ""}
            onChange={(e) => setCfg({ ...cfg, site_url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            The full URL of the SharePoint site that will hold the backups.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="site_id">SharePoint site ID</Label>
          <Input
            id="site_id"
            placeholder="hostname,site-collection-id,site-id"
            value={cfg.site_id ?? ""}
            onChange={(e) => setCfg({ ...cfg, site_id: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            The Microsoft Graph site ID. If you don’t have it to hand, paste only the URL above and we’ll resolve it during the next maintenance pass.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="folder">Root folder path</Label>
          <Input
            id="folder"
            placeholder="Documents/Proposal backups"
            value={cfg.root_folder_path}
            onChange={(e) => setCfg({ ...cfg, root_folder_path: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Path within the SharePoint site’s default document library. Use forward slashes.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="subfolder">One subfolder per proposal</Label>
            <p className="text-xs text-muted-foreground">
              Recommended. Falls back to the root folder if creation fails.
            </p>
          </div>
          <Switch
            id="subfolder"
            checked={cfg.per_proposal_subfolder}
            onCheckedChange={(v) => setCfg({ ...cfg, per_proposal_subfolder: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="enabled">Enable SharePoint push</Label>
            <p className="text-xs text-muted-foreground">
              When off, daily backups still run to the in-platform bucket but aren’t uploaded externally.
            </p>
          </div>
          <Switch
            id="enabled"
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <Label>Run a manual backup</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Pick specific proposals from the list, or back up every proposal you have access to in one go. Each proposal is processed sequentially.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[260px] justify-between" disabled={running}>
                  <span className="truncate">{selectedLabel}</span>
                  <ChevronsUpDown className="w-4 h-4 opacity-60 ml-2 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Filter proposals…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {filteredProposals.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No matching proposals.
                    </div>
                  ) : (
                    filteredProposals.map((p) => {
                      const checked = selected.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProposal(p.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted text-left"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleProposal(p.id)} />
                          <span className="text-sm font-medium">{p.acronym ?? "(no acronym)"}</span>
                          <span className="text-xs text-muted-foreground truncate flex-1">{p.title}</span>
                          {checked && <Check className="w-3 h-3 text-primary shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-between border-t p-2 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(new Set(filteredProposals.map((p) => p.id)))}
                    disabled={filteredProposals.length === 0}
                  >
                    Select all{filter ? " (filtered)" : ""}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                    Clear
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              onClick={() => runNow("selected")}
              disabled={running || selected.size === 0}
              className="gap-2"
            >
              <Play className="w-4 h-4" /> {running ? "Running…" : `Back up selected${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
            <Button variant="outline" onClick={() => runNow("all")} disabled={running || proposals.length === 0} className="gap-2">
              <Play className="w-4 h-4" /> {running ? "Running…" : `Back up all (${proposals.length})`}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-2">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <p className="text-sm text-muted-foreground">
          A scheduled job fires every hour and the backup function self-gates to 06:00 Europe/Helsinki, so daylight-saving (EET ↔ EEST) is handled automatically without manual switches.
        </p>
        <p className="text-sm text-muted-foreground">
          Retention: 90 days in-platform. SharePoint files are owned by your tenant and never deleted by the platform.
        </p>
      </Card>
    </div>
  );
}
