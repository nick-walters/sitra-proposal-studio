import { useCallback, useEffect, useState } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";

interface BinnedProposal {
  id: string;
  acronym: string | null;
  title: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  purge_after: string | null;
  restored_at: string | null;
  restored_by: string | null;
}

/** 20th February 2026 — the house date format, no commas. */
function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${d.toLocaleString("en-GB", { month: "long" })} ${d.getFullYear()}`;
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

export default function ProposalBinAdmin() {
  const navigate = useNavigate();
  const { isAdminOrOwner, loading: roleLoading } = useUserRole();
  const isGlobalAdmin = isAdminOrOwner;

  const [rows, setRows] = useState<BinnedProposal[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposals")
      .select("id, acronym, title, deleted_at, deleted_by, purge_after, restored_at, restored_by")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      toast.error(`Failed to load the recycle bin: ${error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as BinnedProposal[];
    setRows(list);

    const ids = [...new Set(list.map((r) => r.deleted_by).filter(Boolean) as string[])];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of profiles ?? []) map[p.id] = p.full_name || p.email || p.id;
      setNames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!roleLoading && isGlobalAdmin) void load();
    else if (!roleLoading) setLoading(false);
  }, [roleLoading, isGlobalAdmin, load]);

  const handleRestore = async (row: BinnedProposal) => {
    setRestoring(row.id);
    try {
      const { error } = await supabase.rpc("restore_suppressed_proposal", { _proposal_id: row.id });
      if (error) throw error;
      toast.success(`Restored ${row.acronym || row.title || "the proposal"}`);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to restore: ${message}`);
    } finally {
      setRestoring(null);
    }
  };

  if (!roleLoading && !isGlobalAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto p-6">
          <Card className="p-6">
            <h1 className="text-lg font-semibold">Proposal recycle bin</h1>
            <p className="text-sm text-muted-foreground mt-2">
              This page is restricted to platform owners and administrators.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/admin")}>
          <ArrowLeft className="w-4 h-4" />
          Back to admin
        </Button>

        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Proposal recycle bin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deleted proposals are hidden from everyone for 90 days before they are removed for good. Restoring one brings
            it back in full.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">The recycle bin is empty.</Card>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const remaining = daysUntil(row.purge_after);
              return (
                <Card key={row.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.acronym || "(no acronym)"}</span>
                      {remaining !== null && (
                        <Badge variant={remaining <= 7 ? "destructive" : "secondary"} className="text-[11px] font-bold">
                          {remaining <= 0 ? "Due for removal" : `${remaining} days left`}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{row.title || "Untitled proposal"}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Deleted {formatDate(row.deleted_at)} by {row.deleted_by ? names[row.deleted_by] ?? "unknown user" : "unknown user"}
                      {" · "}
                      Removed for good after {formatDate(row.purge_after)}
                    </div>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 shrink-0" disabled={restoring === row.id}>
                        {restoring === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Restore
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restore this proposal?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <strong>{row.acronym || row.title}</strong> will reappear for everyone who had access to it, with
                          all of its content intact.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRestore(row)}>Restore proposal</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
