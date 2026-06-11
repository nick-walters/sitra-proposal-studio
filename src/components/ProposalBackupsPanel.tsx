import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, CheckCircle2, XCircle, MinusCircle, Clock, FileText, RefreshCw, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BackupRow {
  id: string;
  backup_timestamp: string;
  sharepoint_status: "pending" | "uploaded" | "failed" | "skipped";
  sharepoint_path: string | null;
  bucket_paths: string[];
  size_bytes: number;
  error: string | null;
}

interface Props {
  proposalId: string;
}

const STATUS_META: Record<BackupRow["sharepoint_status"], { label: string; icon: any; cls: string }> = {
  uploaded: { label: "SharePoint: uploaded", icon: CheckCircle2, cls: "text-emerald-600" },
  failed: { label: "SharePoint: failed", icon: XCircle, cls: "text-rose-600" },
  skipped: { label: "SharePoint: not configured", icon: MinusCircle, cls: "text-muted-foreground" },
  pending: { label: "SharePoint: pending", icon: Clock, cls: "text-amber-600" },
};

export function ProposalBackupsPanel({ proposalId }: Props) {
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackupRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposal_backups")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("backup_timestamp", { ascending: false })
      .limit(120);
    if (error) toast.error("Could not load backups");
    setRows((data as BackupRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [proposalId]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-backups", {
        body: { trigger: "manual", force: true, proposal_id: proposalId },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) {
        toast.error(`Backup failed: ${(data as any)?.result?.error ?? "unknown error"}`);
      } else {
        toast.success("Backup complete.");
        await load();
      }
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setRunning(false);
    }
  };

  const download = async (path: string) => {
    const fileName = path.split("/").pop() ?? "backup";
    const { data, error } = await supabase.storage
      .from("proposal-backups")
      .createSignedUrl(path, 60, { download: fileName });
    if (error || !data?.signedUrl) {
      toast.error("Could not generate download link");
      return;
    }
    // Use a hidden anchor with the `download` attribute so the browser saves
    // the file directly instead of opening it (or a blank tab) in the viewer.
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const fmtSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  const fileNameOf = (path: string) => path.split("/").pop() ?? path;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const paths = pendingDelete.bucket_paths ?? [];
      if (paths.length > 0) {
        const { error: sErr } = await supabase.storage.from("proposal-backups").remove(paths);
        if (sErr) throw sErr;
      }
      const { error: dErr } = await supabase.from("proposal_backups").delete().eq("id", pendingDelete.id);
      if (dErr) throw dErr;
      toast.success("Backup deleted");
      setPendingDelete(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete backup");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Backups</h1>
          <p className="text-sm text-muted-foreground">
            Daily snapshots of this proposal’s sections &amp; budget. Generated automatically at 06:00 Europe/Helsinki and kept for 90 days. SharePoint copies (when configured) live in your Teams &amp; are retained by your organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runNow} disabled={running} className="gap-2">
            <Play className="w-4 h-4" /> {running ? "Running…" : "Run backup now"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No backups yet. The first daily backup will run at the next 06:00 Europe/Helsinki window.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const meta = STATUS_META[r.sharepoint_status];
            const Icon = meta.icon;
            const isOpen = expanded === r.id;
            return (
              <Card key={r.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">
                        {format(new Date(r.backup_timestamp), "do MMMM yyyy HH:mm")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.bucket_paths?.length ?? 0} files · {fmtSize(r.size_bytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                      <Icon className="w-3 h-3" /> {meta.label}
                    </Badge>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t bg-muted/30 px-4 py-3 space-y-1">
                    {r.error && (
                      <div className="text-xs text-rose-600 mb-2">Error: {r.error}</div>
                    )}
                    {r.sharepoint_path && (
                      <div className="text-xs text-muted-foreground mb-2">
                        SharePoint folder: {r.sharepoint_path}
                      </div>
                    )}
                    {(r.bucket_paths ?? []).map((p) => (
                      <div key={p} className="flex items-center justify-between text-sm py-1">
                        <span className="truncate font-mono text-xs">{fileNameOf(p)}</span>
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => download(p)}>
                          <Download className="w-3 h-3" /> Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
