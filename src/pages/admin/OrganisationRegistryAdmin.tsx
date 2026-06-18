import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CountrySelect } from "@/components/CountrySelect";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ORGANISATION_CATEGORY_LABELS,
  OrganisationCategory,
} from "@/types/proposal";
import {
  EU_MEMBER_STATES,
  ASSOCIATED_COUNTRIES,
  THIRD_COUNTRIES,
} from "@/lib/countries";
import {
  Building2,
  Loader2,
  Search,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Organisation {
  id: string;
  pic_number: string;
  name: string;
  short_name: string;
  english_name: string | null;
  country: string | null;
  organisation_category: OrganisationCategory | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

const ALL_COUNTRIES = [
  ...EU_MEMBER_STATES,
  ...ASSOCIATED_COUNTRIES,
  ...THIRD_COUNTRIES,
];
const COUNTRY_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  ALL_COUNTRIES.map((c) => [c.code, c.name])
);

const LOGO_BUCKET = "participant-logos";

function getLogoPublicUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

interface FormState {
  pic_number: string;
  name: string;
  short_name: string;
  english_name: string;
  country: string;
  organisation_category: OrganisationCategory | "";
  logo_url: string | null;
}

const emptyForm: FormState = {
  pic_number: "",
  name: "",
  short_name: "",
  english_name: "",
  country: "",
  organisation_category: "",
  logo_url: null,
};

export function OrganisationRegistryAdmin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState("");
  const [highlightedPic, setHighlightedPic] = useState<string | null>(null);

  // Add flow state
  const [picInput, setPicInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [addForm, setAddForm] = useState<FormState | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploadingAddLogo, setUploadingAddLogo] = useState(false);

  // Edit flow state
  const [editing, setEditing] = useState<Organisation | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingEditLogo, setUploadingEditLogo] = useState(false);

  // Delete flow state
  const [deleting, setDeleting] = useState<Organisation | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Access check
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .in("role", ["coordinator", "admin", "owner"])
        .limit(1);
      if (error || !data || data.length === 0) {
        toast.error("Access denied. Coordinator role or higher required.");
        navigate("/dashboard");
        return;
      }
      setHasAccess(true);
      setAccessChecked(true);
    })();
  }, [user, authLoading, navigate]);

  const fetchOrgs = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("organisations")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      toast.error("Failed to load organisations");
    } else {
      setOrgs((data || []) as any);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    if (hasAccess) fetchOrgs();
  }, [hasAccess, fetchOrgs]);

  const filteredOrgs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.short_name || "").toLowerCase().includes(q) ||
        (o.english_name || "").toLowerCase().includes(q) ||
        (o.pic_number || "").includes(q)
    );
  }, [orgs, filter]);

  const handleLookup = async () => {
    const pic = picInput.trim();
    if (!/^\d{9}$/.test(pic)) return;

    // Pre-check existing
    const existing = orgs.find((o) => o.pic_number === pic);
    if (existing) {
      toast.info("This PIC is already in the registry");
      setHighlightedPic(pic);
      setTimeout(() => setHighlightedPic(null), 3000);
      // Scroll to row
      document
        .getElementById(`org-row-${existing.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-pic", {
        body: { picNumber: pic },
      });

      if (error || !data?.success || !data.organisation) {
        toast.info("No public record found. Enter details manually.");
        setAddForm({
          ...emptyForm,
          pic_number: pic,
        });
        return;
      }

      const org = data.organisation;
      const countryName =
        (org.countryCode && COUNTRY_CODE_TO_NAME[org.countryCode]) || "";
      const cat: OrganisationCategory | "" =
        org.organisationCategory &&
        org.organisationCategory in ORGANISATION_CATEGORY_LABELS
          ? org.organisationCategory
          : "";

      setAddForm({
        pic_number: pic,
        name: org.legalName || "",
        short_name: org.shortName || "",
        english_name: org.englishName || "",
        country: countryName,
        organisation_category: cat,
        logo_url: null,
      });
      toast.success(`Found ${org.legalName || pic}. Please review and save.`);
    } catch {
      toast.info("Lookup failed. Enter details manually.");
      setAddForm({ ...emptyForm, pic_number: pic });
    } finally {
      setLookingUp(false);
    }
  };

  const resetAdd = () => {
    setAddForm(null);
    setPicInput("");
  };

  const uploadLogo = async (
    pic: string,
    file: File
  ): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be under 5MB");
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("File must be an image");
      return null;
    }
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `registry/${pic}/logo.${ext}`;
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return null;
    }
    return path;
  };

  const handleAddLogoChange = async (file: File | null) => {
    if (!file || !addForm) return;
    setUploadingAddLogo(true);
    const path = await uploadLogo(addForm.pic_number, file);
    if (path) setAddForm({ ...addForm, logo_url: path });
    setUploadingAddLogo(false);
  };

  const handleAddSubmit = async () => {
    if (!addForm) return;
    if (!addForm.name.trim()) return toast.error("Legal name is required");
    if (!addForm.short_name.trim()) return toast.error("Short name is required");
    if (!addForm.organisation_category)
      return toast.error("Category is required");

    setAdding(true);
    const { error } = await supabase.from("organisations").insert({
      pic_number: addForm.pic_number,
      name: addForm.name.trim(),
      short_name: addForm.short_name.trim(),
      english_name: addForm.english_name.trim() || null,
      country: addForm.country || null,
      organisation_category: addForm.organisation_category,
      logo_url: addForm.logo_url,
      created_by: user?.id,
    } as any);
    setAdding(false);
    if (error) {
      toast.error(`Failed to add: ${error.message}`);
      return;
    }
    toast.success("Organisation added to registry");
    resetAdd();
    fetchOrgs();
  };

  const openEdit = (org: Organisation) => {
    setEditing(org);
    setEditForm({
      pic_number: org.pic_number,
      name: org.name,
      short_name: org.short_name,
      english_name: org.english_name || "",
      country: org.country || "",
      organisation_category: (org.organisation_category as any) || "",
      logo_url: org.logo_url,
    });
  };

  const handleEditLogoChange = async (file: File | null) => {
    if (!file || !editing) return;
    setUploadingEditLogo(true);
    const path = await uploadLogo(editing.pic_number, file);
    if (path) setEditForm((f) => ({ ...f, logo_url: path }));
    setUploadingEditLogo(false);
  };

  const handleEditSave = async () => {
    if (!editing) return;
    if (!editForm.name.trim()) return toast.error("Legal name is required");
    if (!editForm.short_name.trim())
      return toast.error("Short name is required");
    if (!editForm.organisation_category)
      return toast.error("Category is required");

    setSavingEdit(true);
    const { error } = await supabase
      .from("organisations")
      .update({
        name: editForm.name.trim(),
        short_name: editForm.short_name.trim(),
        english_name: editForm.english_name.trim() || null,
        country: editForm.country || null,
        organisation_category: editForm.organisation_category,
        logo_url: editForm.logo_url,
      } as any)
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }
    toast.success("Organisation updated");
    setEditing(null);
    fetchOrgs();
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setConfirmingDelete(true);
    // Delete logo first (best-effort)
    if (deleting.logo_url && !deleting.logo_url.startsWith("http")) {
      await supabase.storage.from(LOGO_BUCKET).remove([deleting.logo_url]);
    }
    const { error } = await supabase
      .from("organisations")
      .delete()
      .eq("id", deleting.id);
    setConfirmingDelete(false);
    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
      return;
    }
    toast.success(`Removed ${deleting.name} from registry`);
    setDeleting(null);
    fetchOrgs();
  };

  if (authLoading || !accessChecked) {
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

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="w-7 h-7" />
            Organisation Registry
          </h1>
          <p className="text-muted-foreground mt-2">
            Platform-wide organisation registry. Organisations added here are
            available for all proposals.
          </p>
        </div>

        {/* Add by PIC */}
        <Card>
          <CardHeader>
            <CardTitle>Add organisation by PIC</CardTitle>
            <CardDescription>
              Look up a 9-digit PIC to pre-fill the registry entry from the EU
              register.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="pic-input">PIC number</Label>
                <Input
                  id="pic-input"
                  value={picInput}
                  onChange={(e) =>
                    setPicInput(
                      e.target.value.replace(/\D/g, "").slice(0, 9)
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLookup();
                    }
                  }}
                  placeholder="e.g. 906912365"
                  maxLength={9}
                  disabled={!!addForm}
                />
              </div>
              <Button
                onClick={handleLookup}
                disabled={!/^\d{9}$/.test(picInput) || lookingUp || !!addForm}
              >
                {lookingUp ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Look up
              </Button>
              {(addForm || picInput) && (
                <Button variant="outline" onClick={resetAdd}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>

            {addForm && (
              <div className="grid gap-4 pt-4 border-t">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>PIC</Label>
                    <Input value={addForm.pic_number} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Short name *</Label>
                    <Input
                      value={addForm.short_name}
                      onChange={(e) =>
                        setAddForm({ ...addForm, short_name: e.target.value })
                      }
                      placeholder="e.g. Sitra"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Legal name *</Label>
                  <Input
                    value={addForm.name}
                    onChange={(e) =>
                      setAddForm({ ...addForm, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>English name</Label>
                  <Input
                    value={addForm.english_name}
                    onChange={(e) =>
                      setAddForm({ ...addForm, english_name: e.target.value })
                    }
                    placeholder="Leave blank if legal name is in English"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <CountrySelect
                      value={addForm.country}
                      onValueChange={(v) =>
                        setAddForm({ ...addForm, country: v })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={addForm.organisation_category}
                      onValueChange={(v) =>
                        setAddForm({
                          ...addForm,
                          organisation_category: v as OrganisationCategory,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ORGANISATION_CATEGORY_LABELS).map(
                          ([code, label]) => (
                            <SelectItem key={code} value={code}>
                              {code} – {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {addForm.logo_url && (
                      <img
                        src={getLogoPublicUrl(addForm.logo_url) || ""}
                        alt="logo"
                        className="w-12 h-12 object-contain border rounded bg-white"
                      />
                    )}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleAddLogoChange(e.target.files?.[0] || null)
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        disabled={uploadingAddLogo}
                      >
                        <span>
                          {uploadingAddLogo ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {addForm.logo_url ? "Replace logo" : "Upload logo"}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={resetAdd}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddSubmit} disabled={adding}>
                    {adding && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Add to registry
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Registry list */}
        <Card>
          <CardHeader>
            <CardTitle>
              Registered organisations ({filteredOrgs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Filter by name, short name, English name or PIC…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-md"
            />

            {loadingList ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No organisations found.
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[64px]">Logo</TableHead>
                      <TableHead>Legal name</TableHead>
                      <TableHead>Short name</TableHead>
                      <TableHead>English name</TableHead>
                      <TableHead>PIC</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-[120px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrgs.map((org) => {
                      const logoUrl = getLogoPublicUrl(org.logo_url);
                      const isHighlighted = highlightedPic === org.pic_number;
                      return (
                        <TableRow
                          key={org.id}
                          id={`org-row-${org.id}`}
                          className={
                            isHighlighted ? "bg-primary/10 transition-colors" : ""
                          }
                        >
                          <TableCell>
                            {logoUrl ? (
                              <img
                                src={logoUrl}
                                alt={org.short_name}
                                className="w-8 h-8 object-contain border rounded bg-white"
                              />
                            ) : (
                              <div className="w-8 h-8 border rounded flex items-center justify-center bg-muted">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {org.name}
                          </TableCell>
                          <TableCell>{org.short_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {org.english_name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {org.pic_number}
                          </TableCell>
                          <TableCell>{org.country || "—"}</TableCell>
                          <TableCell>
                            {org.organisation_category ? (
                              <Badge variant="outline">
                                {org.organisation_category}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(org)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleting(org)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit organisation</DialogTitle>
            <DialogDescription>
              PIC {editForm.pic_number} — changes apply to the platform-wide
              registry.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>PIC</Label>
                  <Input value={editForm.pic_number} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Short name *</Label>
                  <Input
                    value={editForm.short_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, short_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Legal name *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>English name</Label>
                <Input
                  value={editForm.english_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, english_name: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <CountrySelect
                    value={editForm.country}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, country: v })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={editForm.organisation_category}
                    onValueChange={(v) =>
                      setEditForm({
                        ...editForm,
                        organisation_category: v as OrganisationCategory,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORGANISATION_CATEGORY_LABELS).map(
                        ([code, label]) => (
                          <SelectItem key={code} value={code}>
                            {code} – {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  {editForm.logo_url && (
                    <img
                      src={getLogoPublicUrl(editForm.logo_url) || ""}
                      alt="logo"
                      className="w-12 h-12 object-contain border rounded bg-white"
                    />
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleEditLogoChange(e.target.files?.[0] || null)
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      disabled={uploadingEditLogo}
                    >
                      <span>
                        {uploadingEditLogo ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {editForm.logo_url ? "Change logo" : "Upload logo"}
                      </span>
                    </Button>
                  </label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Delete organisation?</DialogTitle>
            <DialogDescription>
              {deleting && (
                <>
                  Delete <strong>{deleting.name}</strong> (
                  {deleting.pic_number}) from the registry? This will not
                  affect proposals that already include this organisation.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={confirmingDelete}
            >
              {confirmingDelete && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrganisationRegistryAdmin;
