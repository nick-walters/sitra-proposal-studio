import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, RotateCcw, Trash2, RefreshCw, ShieldCheck, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface SnapshotRow {
  id: string;
  created_at: string;
  label: string | null;
  source: string | null;
  table_counts: Record<string, number> | null;
}

interface Props {
  proposalId: string;
}

type TableDiff = { would_add: number; would_change: number; would_delete: number; unchanged: number };
type PreviewResult = {
  totals: TableDiff;
  by_table: Record<string, TableDiff>;
  excluded_tables: string[];
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  manual: { label: "Manual", cls: "text-emerald-700 border-emerald-300" },
  auto: { label: "Auto", cls: "text-slate-600 border-slate-300" },
  "pre-restore": { label: "Pre-restore (undo point)", cls: "text-amber-700 border-amber-300" },
};

export function ProposalSnapshotsPanel({ proposalId }: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [label, setLabel] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SnapshotRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Restore flow state
  const [restoreTarget, setRestoreTarget] = useState<SnapshotRow | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposal_snapshots")
      .select("id, created_at, label, source, table_counts")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error("Could not load snapshots");
    setRows(((data as unknown) as SnapshotRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [proposalId]);

  const totalRowsOf = (tc: SnapshotRow["table_counts"]) =>
    tc ? Object.values(tc).reduce((s, n) => s + (Number(n) || 0), 0) : 0;

  const tableCountOf = (tc: SnapshotRow["table_counts"]) =>
    tc ? Object.keys(tc).length : 0;

  const takeSnapshot = async () => {
    setTaking(true);
    try {
      const { data, error } = await supabase.rpc("create_proposal_snapshot", {
        p_proposal_id: proposalId,
        p_label: label.trim() || null,
        p_source: "manual",
      });
      if (error) throw error;
      const counts = (Array.isArray(data) && data[0]?.counts) as Record<string, number> | undefined;
      const total = counts ? Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0) : 0;
      toast.success(`Snapshot captured (${total} rows across ${counts ? Object.keys(counts).length : 0} tables).`);
      setLabel("");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Snapshot failed");
    } finally {
      setTaking(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("proposal_snapshots").delete().eq("id", pendingDelete.id);
      if (error) throw error;
      toast.success("Snapshot deleted");
      setPendingDelete(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete snapshot");
    } finally {
      setDeleting(false);
    }
  };

  const openRestore = async (snap: SnapshotRow) => {
    setRestoreTarget(snap);
    setPreview(null);
    setPreviewing(true);
    try {
      const { data, error } = await supabase.rpc("preview_proposal_restore", {
        p_proposal_id: proposalId,
        p_snapshot_id: snap.id,
      });
      if (error) throw error;
      setPreview(data as unknown as PreviewResult);
    } catch (e: any) {
      toast.error(e.message ?? "Preview failed");
      setRestoreTarget(null);
    } finally {
      setPreviewing(false);
    }
  };

  const runRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const { data, error } = await supabase.rpc("restore_proposal_snapshot", {
        p_proposal_id: proposalId,
        p_snapshot_id: restoreTarget.id,
      });
      if (error) throw error;
      const preId = (data as any)?.pre_restore_snapshot_id;
      toast.success(
        preId
          ? "Restore complete. A pre-restore snapshot was saved so you can undo."
          : "Restore complete.",
      );
      setConfirmOpen(false);
      setRestoreTarget(null);
      setPreview(null);
      await load();
      // Refresh everything so the restored data shows
      await qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  const changedTables = useMemo(() => {
    if (!preview) return [];
    return Object.entries(preview.by_table)
      .map(([name, d]) => ({ name, ...d }))
      .filter((d) => d.would_add + d.would_change + d.would_delete > 0)
      .sort(
        (a, b) =>
          b.would_add + b.would_change + b.would_delete -
          (a.would_add + a.would_change + a.would_delete),
      );
  }, [preview]);

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-6">
      <div>
        <h1 className="text-xl font-bold">Snapshots &amp; Restore</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Capture a point-in-time copy of this proposal&apos;s <strong>structured data</strong> — work packages, tasks, deliverables, budget, expertise matrix, cases, milestones &amp; risks, participants, abstract, references, and section content. You can restore any snapshot later; the restore is transactional and automatically saves a pre-restore snapshot so it can be undone.
        </p>
        <p className="text-xs text-muted-foreground mt-2 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>
            Snapshots do <strong>not</strong> touch access &amp; roles, notifications, message board, evaluation history, or file backups. Version history is a separate append-only ledger and is never rewritten by a restore.
          </span>
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">Label (optional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. before big consortium reshuffle"
              className="mt-1"
              disabled={taking}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={takeSnapshot} disabled={taking} className="gap-2">
              {taking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {taking ? "Capturing…" : "Take snapshot now"}
            </Button>
            <Button variant="outline" onClick={load} className="gap-2" disabled={loading}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No snapshots yet. Take one now to create a restore point.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const src = SOURCE_BADGE[r.source ?? "manual"] ?? SOURCE_BADGE.manual;
            return (
              <Card key={r.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {format(new Date(r.created_at), "do MMMM yyyy 'at' HH:mm")}
                    </span>
                    <Badge variant="outline" className={src.cls}>{src.label}</Badge>
                    {r.label && (
                      <span className="text-sm text-muted-foreground truncate">— {r.label}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {totalRowsOf(r.table_counts).toLocaleString()} rows across {tableCountOf(r.table_counts)} tables
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => openRestore(r)}
                  >
                    <RotateCcw className="w-4 h-4" /> Restore…
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setPendingDelete(r)}
                    aria-label="Delete snapshot"
                    title="Delete snapshot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Restore PREVIEW dialog */}
      <Dialog
        open={!!restoreTarget && !confirmOpen}
        onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setPreview(null); } }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview restore</DialogTitle>
            <DialogDescription>
              {restoreTarget && (
                <>
                  This shows what would change if you restore the snapshot from{" "}
                  <strong>{format(new Date(restoreTarget.created_at), "do MMMM yyyy 'at' HH:mm")}</strong>.
                  Nothing has been changed yet.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {previewing || !preview ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculating differences…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <div className="text-2xl font-bold text-emerald-600">{preview.totals.would_add}</div>
                  <div className="text-xs text-muted-foreground">Rows restored</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-2xl font-bold text-amber-600">{preview.totals.would_change}</div>
                  <div className="text-xs text-muted-foreground">Rows reverted</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-2xl font-bold text-red-600">{preview.totals.would_delete}</div>
                  <div className="text-xs text-muted-foreground">Rows removed</div>
                </div>
              </div>

              {changedTables.length === 0 ? (
                <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                  No differences detected — the current state already matches this snapshot.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Table</th>
                        <th className="text-right px-3 py-2">Restore</th>
                        <th className="text-right px-3 py-2">Revert</th>
                        <th className="text-right px-3 py-2">Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedTables.map((t) => (
                        <tr key={t.name} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-xs">{t.name}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">{t.would_add || ""}</td>
                          <td className="px-3 py-1.5 text-right text-amber-700">{t.would_change || ""}</td>
                          <td className="px-3 py-1.5 text-right text-red-700">{t.would_delete || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Roles, notifications, message board, and evaluation history are excluded from restore and will not change.
                </span>
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRestoreTarget(null); setPreview(null); }}
              disabled={previewing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={previewing || !preview}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Continue to restore…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final CONFIRM */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o && !restoring) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget && (
                <>
                  This will overwrite the current structured data with the snapshot from{" "}
                  <strong>{format(new Date(restoreTarget.created_at), "do MMMM yyyy 'at' HH:mm")}</strong>.
                  A backup of the current state will be saved automatically first as a{" "}
                  <em>pre-restore</em> snapshot, so this can be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runRestore(); }}
              disabled={restoring}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {restoring ? "Restoring…" : "Yes, restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  This will permanently remove the snapshot taken on{" "}
                  <strong>{format(new Date(pendingDelete.created_at), "do MMMM yyyy 'at' HH:mm")}</strong>.
                  It cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting…" : "Delete snapshot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
