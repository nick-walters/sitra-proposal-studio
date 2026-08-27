import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminRichTextField } from '@/components/admin/AdminRichTextField';

import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BookOpen, ChevronDown, ChevronRight, ClipboardCheck, GripVertical, History,
  Lightbulb, Lock, Plus, Settings2, Trash2, Upload, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TemplateType } from '@/types/templates';
import {
  useAllTemplateVersions, useVersionBlocks, useBlockGuidelines, useSectionCriteriaAdmin,
  useClaimDraft, useLockHolderName, usePublishVersion,
  type CardTemplateRow, type CardGuidelineRow,
} from '@/hooks/useTemplateVersioning';
import { useAuth } from '@/hooks/useAuth';
import {
  useDirtyRegistry, useRegisterDirty, useExitGuard, UnsavedChangesDialog,
  type DirtyRegistry,
} from '@/components/admin/useUnsavedGuard';
import { ArrowLeft } from 'lucide-react';
import { useAllModifiers } from '@/hooks/useTemplateModifiers';

const CATEGORY_LABEL: Record<string, string> = {
  commission: 'Official guidelines from the European Commission',
  criteria: 'Criteria',
};


function versionLabel(v: { major: number | null; minor: number | null; name?: string | null; status: string }) {
  /* A draft has no number until it is published, so show its name if it has
     one rather than an empty "null.null". */
  if (v.status === 'draft') return v.name ? `Draft — ${v.name}` : 'Draft (unpublished)';
  const num = `${v.major}.${v.minor}`;
  return v.name ? `${num} — ${v.name}` : num;
}


/* ------------------------------------------------------------------ */

/**
 * Everything that belongs to ONE template type: its versions and lock, its
 * Part A guideline editing (passed in as a slot so it keeps its existing
 * implementation), and its Part B subsections with the block editor.
 *
 * The type is chosen by the parent, so the whole page has a single selector.
 */
export function TemplateTypeWorkspace({
  typeId,
  partASlot,
  typeCode,
  typeName,
  typeDescription,
  onBack,
}: {
  typeId: string;
  partASlot?: React.ReactNode;
  typeCode?: string;
  typeName?: string;
  typeDescription?: string | null;
  onBack?: () => void;
}) {
  const qc = useQueryClient();
  const [versionId, setVersionId] = useState<string>('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data: versions = [] } = useAllTemplateVersions(typeId || null);
  const claimDraft = useClaimDraft();
  const { user } = useAuth();
  const [takeoverOpen, setTakeoverOpen] = useState(false);

  const activeVersionId = useMemo(() => {
    if (versionId && versions.find((v) => v.id === versionId)) return versionId;
    return versions[0]?.id ?? '';
  }, [versionId, versions]);
  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? null;
  const isDraft = activeVersion?.status === 'draft';
  const hasDraft = versions.some((v) => v.status === 'draft');
  /* The draft is one coherent set of changes, so the lock covers the whole
     draft rather than any single field, and is cleared by publishing. */
  const lockedBy = isDraft ? activeVersion?.locked_by ?? null : null;
  const iHoldLock = !!lockedBy && lockedBy === user?.id;
  const lockedByOther = !!lockedBy && !iHoldLock;
  const { data: holderName } = useLockHolderName(lockedByOther ? lockedBy : null);
  const editable = isDraft && iHoldLock;

  const { data: blocks = [] } = useVersionBlocks(activeVersionId || null);

  /* Subsections come from the TYPE's own section list, not from the blocks
     that happen to exist — otherwise a type with no blocks yet (Stage 1) has
     nowhere to add its first block. */
  const { data: sections = [] } = useQuery({
    queryKey: ['admin-partb-sections', typeId],
    enabled: !!typeId,
    queryFn: async () => {
      const { data } = await supabase
        .from('template_sections')
        .select('id, section_number, title, order_index')
        .eq('template_type_id', typeId)
        .eq('is_active', true)
        .order('order_index');
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, CardTemplateRow[]>();
    for (const b of blocks) {
      const key = b.section_number ?? '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [blocks]);

  /* Leaf Part B subsections (B1.1, B3.2 …) — parents like B1 hold no blocks. */
  const subsections = useMemo(
    () =>
      (sections as any[])
        /* Leaf Part B subsections, then the Drafts sections (D1, D2) where a
           coordinator authors guidance for WP and case draft fields. */
        .filter((s) => /^(B\d+\.\d+|D\d+)$/.test(s.section_number ?? ''))
        .sort((a, b) => {
          const rank = (n: string) => (n.startsWith('D') ? 1 : 0);
          const an = String(a.section_number), bn = String(b.section_number);
          return rank(an) - rank(bn) || an.localeCompare(bn, undefined, { numeric: true });
        }),
    [sections],
  );
  const subsectionOrder = useMemo(
    () => subsections.map((s) => s.section_number as string),
    [subsections],
  );


  const openDraft = async (takeover = false) => {
    if (!typeId) return;
    try {
      const res = await claimDraft.mutateAsync({ templateTypeId: typeId, takeover });
      setVersionId(res.version_id);
      if (!res.ok) {
        setTakeoverOpen(true);
        return;
      }
      toast.success(
        takeover
          ? 'You now hold this draft — the existing edits are unchanged.'
          : 'Draft locked to you — edits are saved into it until you publish.',
      );
    } catch (e: any) {
      toast.error(e.message ?? 'Could not open a draft');
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-version-blocks'] });
    qc.invalidateQueries({ queryKey: ['admin-block-guidelines'] });
    qc.invalidateQueries({ queryKey: ['admin-section-criteria'] });
  };

  const allCollapsed = subsectionOrder.length > 0 && subsectionOrder.every((s) => collapsed[s]);

  return (
    <div className="space-y-4">
      {/* Which template type you are in — never ambiguous. */}
      {(typeCode || typeName) && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-3">
          {onBack && (
            <Button variant="outline" size="sm" className="gap-2" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> All template types
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              {typeCode && <Badge variant="secondary" className="font-bold">{typeCode}</Badge>}
              <h2 className="text-lg font-semibold">{typeName}</h2>
            </div>
            {typeDescription && (
              <p className="text-xs text-muted-foreground">{typeDescription}</p>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="grid gap-1.5">

            <Label className="text-xs">Version</Label>
            <Select value={activeVersionId} onValueChange={setVersionId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select version" /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{versionLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {editable
              ? <Badge variant="secondary">Editing draft</Badge>
              : <Badge variant="outline">Read only</Badge>}
            {!editable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (lockedByOther ? setTakeoverOpen(true) : openDraft(false))}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-2">
              <History className="h-4 w-4" /> History
            </Button>
            <Button
              size="sm"
              disabled={!editable}
              onClick={() => setPublishOpen(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" /> Publish
            </Button>
          </div>
        </CardContent>
      </Card>

      {lockedByOther && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This draft is being edited by <b>{holderName ?? 'another owner'}</b>
            {activeVersion?.locked_at && (
              <> since {new Date(activeVersion.locked_at).toLocaleString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}</>
            )}. It is read-only for you until they publish, or until you take it over.
          </p>
        </div>
      )}

      {/* Where the edits land. Saving into a draft looks like "nothing
          happened" on the writers' side, because proposals keep reading the
          version they were created from until this draft is published. */}
      {editable && (
        <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <Pencil className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            You are editing an <b>unpublished draft</b>. Guidelines and criteria you change here
            are saved immediately into the draft, but proposals keep showing the published
            version until you choose <b>Publish</b>.
          </p>
        </div>
      )}

      {!isDraft && hasDraft && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <History className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            You are looking at a published version, and an unpublished draft exists. Recent edits
            live in that draft — switch to <b>Draft (unpublished)</b> in the version selector to
            see them.
          </p>
        </div>
      )}



      {partASlot}

      <div className="flex items-center gap-2 pt-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Badge variant="outline">Part B</Badge>
          Technical description
        </h3>
        {subsectionOrder.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const s of subsectionOrder) next[s] = !allCollapsed;
              setCollapsed(next);
            }}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        )}
      </div>

      {subsections.map((section: any) => {
        const sectionNumber = section.section_number as string;
        const rows = grouped.get(sectionNumber) ?? [];
        const isOpen = !collapsed[sectionNumber];
        return (
          <SubsectionPanel
            key={section.id}
            sectionNumber={sectionNumber}
            title={section.title ?? ''}
            sectionSourceId={section.id}
            templateTypeId={typeId}
            versionId={activeVersionId}
            editable={editable}
            blocks={rows}
            open={isOpen}
            onToggle={() => setCollapsed((c) => ({ ...c, [sectionNumber]: isOpen }))}
            onChanged={refresh}
          />
        );
      })}

      {subsections.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          This template type has no Part B subsections yet.
        </p>
      )}


      <AlertDialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take over this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft is currently held by {holderName ?? 'another owner'}
              {activeVersion?.locked_at && (
                <> since {new Date(activeVersion.locked_at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}</>
              )}. Taking over does not discard anything — their edits stay in the draft and you
              continue from them. They will lose editing rights until they take it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setTakeoverOpen(false); void openDraft(true); }}>
              Take over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        versionId={activeVersionId}
        onPublished={() => { setVersionId(''); refresh(); }}
      />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Proposals stay pinned to the version they were created from.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-3">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => { setVersionId(v.id); setHistoryOpen(false); }}
                  className={cn(
                    'w-full rounded-md border p-3 text-left hover:bg-muted/50',
                    v.id === activeVersionId && 'border-primary',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{versionLabel(v)}</span>
                    {v.status === 'draft' && <Badge variant="secondary">Draft</Badge>}
                  </div>
                  {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
                  {v.published_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Published {new Date(v.published_at).toLocaleDateString('en-GB')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SubsectionPanel({
  sectionNumber, title, sectionSourceId, templateTypeId, versionId, editable, blocks, open, onToggle, onChanged,
}: {
  sectionNumber: string;
  title: string;
  sectionSourceId: string | null;
  templateTypeId: string;
  versionId: string;

  editable: boolean;
  blocks: CardTemplateRow[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [guidelinesFor, setGuidelinesFor] = useState<CardTemplateRow | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const ordered = useMemo(() => {
    if (!order) return blocks;
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const out = order.map((id) => byId.get(id)).filter(Boolean) as CardTemplateRow[];
    for (const b of blocks) if (!order.includes(b.id)) out.push(b);
    return out;
  }, [order, blocks]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((b) => b.id);
    const next = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    setOrder(next);
    for (let i = 0; i < next.length; i++) {
      await supabase.from('card_templates').update({ order_index: i }).eq('id', next[i]);
    }
    toast.success('Order saved');
    onChanged();
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onToggle}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <CardTitle className="text-base">
            {sectionNumber}{title ? ` ${title}` : ''}
          </CardTitle>
          <Badge variant="outline" className="ml-1">{blocks.length} blocks</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setCriteriaOpen(true)}>
              <ClipboardCheck className="h-4 w-4 text-red-600" /> Edit criteria
            </Button>
            {editable && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add block
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-1.5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ordered.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {ordered.map((b) => (
                <BlockRow
                  key={b.id}
                  block={b}
                  editable={editable}
                  onEditGuidelines={() => setGuidelinesFor(b)}
                  onChanged={onChanged}
                />
              ))}
            </SortableContext>
          </DndContext>
          {ordered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No blocks.</p>
          )}
        </CardContent>
      )}

      {guidelinesFor && (
        <GuidelinesDialogAdmin
          block={guidelinesFor}
          versionId={versionId}
          editable={editable}
          onOpenChange={(o) => !o && setGuidelinesFor(null)}
          onChanged={onChanged}
        />
      )}

      <CriteriaDialogAdmin
        open={criteriaOpen}
        onOpenChange={setCriteriaOpen}
        versionId={versionId}
        sectionSourceId={sectionSourceId}
        sectionNumber={sectionNumber}
        editable={editable}
        onChanged={onChanged}
      />

      <AddBlockDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        versionId={versionId}
        sectionNumber={sectionNumber}
        sectionSourceId={sectionSourceId}
        templateTypeId={templateTypeId}
        nextOrder={blocks.length}
        onChanged={onChanged}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function BlockRow({
  block, editable, onEditGuidelines, onChanged,
}: {
  block: CardTemplateRow;
  editable: boolean;
  onEditGuidelines: () => void;
  onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id, disabled: !editable,
  });
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(block.default_title ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: guidelines = [] } = useBlockGuidelines(block.id);
  /* Modifier-owned blocks live in the versioned template and are seeded only
     when one of these modifiers applies to the proposal. */
  const { data: allModifiers = [] } = useAllModifiers();
  const modifierCodes: string[] = ((block as any).condition_modifier_codes ?? []) as string[];

  const toggleModifier = async (code: string, on: boolean) => {
    const next = on
      ? Array.from(new Set([...modifierCodes, code]))
      : modifierCodes.filter((c) => c !== code);
    await supabase
      .from('card_templates')
      .update({ condition_modifier_codes: next.length ? next : null } as any)
      .eq('id', block.id);
    onChanged();
  };

  const setFlag = async (field: string, value: boolean) => {
    await supabase.from('card_templates').update({ [field]: value } as any).eq('id', block.id);
    onChanged();
  };

  const saveTitle = async () => {
    await supabase.from('card_templates').update({ default_title: title }).eq('id', block.id);
    setRenaming(false);
    toast.success('Block renamed');
    onChanged();
  };

  const remove = async () => {
    await supabase.from('card_templates').delete().eq('id', block.id);
    toast.success('Block removed from this draft');
    onChanged();
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-md border bg-card px-2 py-1.5',
        isDragging && 'opacity-60',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        disabled={!editable}
        className={cn('cursor-grab text-blue-600 disabled:cursor-default disabled:opacity-30')}
        aria-label="Reorder block"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {renaming ? (
        <>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-7 max-w-sm" />
          <Button size="sm" className="h-7" onClick={saveTitle}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setRenaming(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span className="text-sm font-medium">{block.default_title || block.key}</span>
          <code className="text-xs text-muted-foreground">{block.key}</code>
          {block.kind && <Badge variant="outline" className="text-[11px] font-bold">{block.kind}</Badge>}
          {modifierCodes.map((c) => (
            <Badge key={c} variant="outline" className="text-[11px] font-bold text-amber-700 border-amber-500">
              {c}
            </Badge>
          ))}
          {guidelines.length > 0 && (
            <Badge variant="secondary" className="text-[11px] font-bold">
              {guidelines.length} guideline{guidelines.length === 1 ? '' : 's'}
            </Badge>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onEditGuidelines}>
          <BookOpen className="h-3.5 w-3.5 text-blue-600" /> Edit guidelines
        </Button>
        {editable && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Flags">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3">
                {([
                  ['is_deletable', 'Deletable'],
                  ['is_hideable', 'Hideable'],
                  ['default_visible', 'Visible by default'],
                  ['is_fixed_position', 'Fixed position'],
                  ['is_source_fed', 'Fed from source data'],
                ] as const).map(([field, label]) => (
                  <div key={field} className="flex items-center justify-between">
                    <Label className="text-sm font-normal">{label}</Label>
                    <Switch
                      checked={!!(block as any)[field]}
                      onCheckedChange={(v) => setFlag(field, v)}
                    />
                  </div>
                ))}
                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Belongs to modifier — seeded only when it applies. None ticked = always seeded.
                  </Label>
                  {allModifiers.map((m) => (
                    <div key={m.code} className="flex items-center justify-between">
                      <Label className="text-sm font-normal">{m.name}</Label>
                      <Switch
                        checked={modifierCodes.includes(m.code)}
                        onCheckedChange={(v) => toggleModifier(m.code, v)}
                      />
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setTitle(block.default_title ?? ''); setRenaming(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this block?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from this draft version only. Existing proposals keep the version they
              were created from and are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Shared close handling for the guideline and criteria dialogs: every exit
 * route (close button, outside click, Escape) funnels through `requestClose`,
 * and browser reloads / Back presses are caught by the exit guard.
 */
function useCloseGuard(registry: DirtyRegistry, close: () => void) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = registry.dirtyCount > 0;

  useExitGuard(dirty, () => setPromptOpen(true));

  const requestClose = () => {
    if (dirty) { setPromptOpen(true); return; }
    close();
  };

  return {
    requestClose,
    dialogProps: {
      open: promptOpen,
      count: registry.dirtyCount,
      saving,
      onCancel: () => setPromptOpen(false),
      onDiscard: () => { setPromptOpen(false); close(); },
      onSave: async () => {
        setSaving(true);
        const ok = await registry.saveAll();
        setSaving(false);
        if (!ok) return;
        setPromptOpen(false);
        close();
      },
    },
  };
}

/**
 * One write to `card_guidelines`, with the outcome surfaced.
 *
 * PostgREST answers an update that no row-level policy lets through with a
 * plain 204 and no error, so a silent "success" is indistinguishable from a
 * refusal unless the changed rows are asked for. `.select()` makes the
 * refusal visible: zero rows back means nothing was written.
 */
async function persistGuideline(id: string, patch: Partial<CardGuidelineRow>): Promise<boolean> {
  const { data, error } = await supabase
    .from('card_guidelines')
    .update(patch as any)
    .eq('id', id)
    .select('id');
  if (error) {
    toast.error(`Not saved — ${error.message}`);
    return false;
  }
  if (!data || data.length === 0) {
    toast.error(
      'Not saved. This entry was not writable — you may not hold the draft, or it has been removed.',
    );
    return false;
  }
  return true;
}

function GuidelineEditor({
  guideline, editable, onSave, onDelete, registry,
}: {
  guideline: CardGuidelineRow;
  editable: boolean;
  onSave: (patch: Partial<CardGuidelineRow>) => Promise<boolean> | void;
  onDelete: () => void;
  registry?: DirtyRegistry;
}) {
  const [title, setTitle] = useState(guideline.title ?? '');
  const [content, setContent] = useState(guideline.content ?? '');
  /* The editor normalises the HTML it is given, so a plain comparison against
     the row reports a change before anything is typed. Track real edits. */
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const baseline = useRef({ title: guideline.title ?? '', content: guideline.content ?? '' });

  /* Keep the fields in step with the row: without this the editor shows what
     it was mounted with for ever, so a refetch — or another owner's change —
     leaves stale text on screen that looks like a lost edit. */
  useEffect(() => {
    const incoming = { title: guideline.title ?? '', content: guideline.content ?? '' };
    if (incoming.title === baseline.current.title && incoming.content === baseline.current.content) return;
    baseline.current = incoming;
    setTitle(incoming.title);
    setContent(incoming.content);
    setTouched(false);
  }, [guideline.id, guideline.title, guideline.content]);

  const dirty =
    touched && (title !== baseline.current.title || content !== baseline.current.content);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    const ok = await onSave({ title, content });
    setSaving(false);
    if (ok === false) return false;
    baseline.current = { title, content };
    setTouched(false);
    setSavedAt(Date.now());
    return true;
  };

  useRegisterDirty(registry, guideline.id, dirty && editable, save);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input
        value={title}
        disabled={!editable}
        placeholder="Entry title (optional)"
        onChange={(e) => { setTouched(true); setTitle(e.target.value); }}
        className="h-8"
      />
      <AdminRichTextField
        value={content}
        onChange={(v) => { setTouched(true); setContent(v); }}
        disabled={!editable}
      />

      {editable && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {dirty && <Badge variant="outline" className="text-amber-700">Unsaved changes</Badge>}
          {!dirty && savedAt && (
            <span className="text-xs text-muted-foreground">
              Saved into the draft — publish to make it live
            </span>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}


function GuidelinesDialogAdmin({
  block, versionId, editable, onOpenChange, onChanged,
}: {
  block: CardTemplateRow;
  versionId: string;
  editable: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: entries = [] } = useBlockGuidelines(block.id);
  const registry = useDirtyRegistry();
  const guard = useCloseGuard(registry, () => onOpenChange(false));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-block-guidelines', block.id] });
    onChanged();
  };

  /* Guidance entries carry guideline_type 'commission'; 'criteria' entries
     live on the subsection, not on a block. */
  const add = async (type: 'commission') => {

    const { data: g, error } = await supabase
      .from('card_guidelines')
      .insert({
        guideline_type: type,
        title: '',
        content: '',
        order_index: entries.length,
        is_active: true,
        template_version_id: versionId,
      })
      .select('id')
      .single();
    if (error || !g) { toast.error('Could not add entry'); return; }
    await supabase.from('card_guideline_templates').insert({
      guideline_id: g.id,
      card_template_id: block.id,
      order_index: entries.length,
      template_version_id: versionId,
    });
    invalidate();
  };

  const save = async (id: string, patch: Partial<CardGuidelineRow>) => {
    const ok = await persistGuideline(id, patch);
    if (!ok) return false;
    toast.success('Guideline saved into the draft');
    invalidate();
    return true;
  };

  const remove = async (linkId: string, id: string) => {
    const { error: linkErr } = await supabase.from('card_guideline_templates').delete().eq('id', linkId);
    const { error: rowErr } = await supabase.from('card_guidelines').delete().eq('id', id);
    if (linkErr || rowErr) { toast.error(`Not deleted — ${(linkErr ?? rowErr)!.message}`); return; }
    invalidate();
  };

  const byCategory = (type: string) => entries.filter((e) => e.guideline.guideline_type === type);

  return (
    <Dialog open onOpenChange={(o) => (o ? onOpenChange(true) : guard.requestClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Guidelines — {block.default_title || block.key}</DialogTitle>
          <DialogDescription>
            {editable
              ? 'Edits are saved into the open draft version.'
              : 'This version is published and read only. Choose Edit to open a draft.'}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-6">
            {(['commission'] as const).map((type) => (
              <div key={type} className="space-y-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <h4 className="text-sm font-bold text-blue-600">
                    {CATEGORY_LABEL[type]}
                  </h4>
                  {editable && (
                    <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => add(type)}>
                      <Plus className="h-4 w-4" /> Add entry
                    </Button>
                  )}
                </div>
                {byCategory(type).map((e) => (
                  <GuidelineEditor
                    key={e.guideline.id}
                    guideline={e.guideline}
                    editable={editable}
                    registry={registry}
                    onSave={(patch) => save(e.guideline.id, patch)}
                    onDelete={() => remove(e.linkId, e.guideline.id)}
                  />
                ))}
                {byCategory(type).length === 0 && (
                  <p className="text-xs text-muted-foreground">No entries.</p>
                )}
              </div>
            ))}

          </div>
        </ScrollArea>
        <UnsavedChangesDialog {...guard.dialogProps} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function CriteriaDialogAdmin({
  open, onOpenChange, versionId, sectionSourceId, sectionNumber, editable, onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  versionId: string;
  sectionSourceId: string | null;
  sectionNumber: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: entries = [] } = useSectionCriteriaAdmin(open ? versionId : null, sectionSourceId);
  const registry = useDirtyRegistry();
  const guard = useCloseGuard(registry, () => onOpenChange(false));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-section-criteria', versionId, sectionSourceId] });
    onChanged();
  };

  const add = async () => {
    if (!sectionSourceId) return;
    const { data: g, error } = await supabase
      .from('card_guidelines')
      .insert({
        guideline_type: 'criteria',
        title: '',
        content: '',
        order_index: entries.length,
        is_active: true,
        template_version_id: versionId,
      })
      .select('id')
      .single();
    if (error || !g) { toast.error('Could not add criterion'); return; }
    await supabase.from('card_guideline_sections').insert({
      guideline_id: g.id,
      section_source_id: sectionSourceId,
      template_version_id: versionId,
    });
    invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : guard.requestClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Criteria — {sectionNumber}</DialogTitle>
          <DialogDescription>
            Evaluation criteria for this subsection, shown behind the Criteria button.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-2">
            {editable && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={add} disabled={!sectionSourceId}>
                <Plus className="h-4 w-4" /> Add criterion
              </Button>
            )}
            {entries.map((e) => (
              <GuidelineEditor
                key={e.guideline.id}
                guideline={e.guideline}
                editable={editable}
                registry={registry}
                onSave={async (patch) => {
                  const ok = await persistGuideline(e.guideline.id, patch);
                  if (!ok) return false;
                  toast.success('Criterion saved into the draft');
                  invalidate();
                  return true;
                }}
                onDelete={async () => {
                  const { error: linkErr } = await supabase
                    .from('card_guideline_sections').delete().eq('id', e.linkId);
                  const { error: rowErr } = await supabase
                    .from('card_guidelines').delete().eq('id', e.guideline.id);
                  if (linkErr || rowErr) {
                    toast.error(`Not deleted — ${(linkErr ?? rowErr)!.message}`);
                    return;
                  }
                  invalidate();
                }}
              />
            ))}
            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground">No criteria for this subsection.</p>
            )}
          </div>
        </ScrollArea>
        <UnsavedChangesDialog {...guard.dialogProps} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function AddBlockDialog({
  open, onOpenChange, versionId, sectionNumber, sectionSourceId, templateTypeId, nextOrder, onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  versionId: string;
  sectionNumber: string;
  sectionSourceId: string | null;
  templateTypeId: string | null;
  nextOrder: number;
  onChanged: () => void;
}) {
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('text');

  const create = async () => {
    if (!key.trim()) { toast.error('A block key is required'); return; }
    const { error } = await supabase.from('card_templates').insert({
      template_version_id: versionId,
      template_type_id: templateTypeId,
      section_source_id: sectionSourceId,
      section_number: sectionNumber,
      document: 'part_b',
      key: key.trim(),
      kind,
      default_title: title.trim() || null,
      order_index: nextOrder,
      is_active: true,
      is_deletable: true,
      is_hideable: true,
      default_visible: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Block added');
    setKey(''); setTitle('');
    onOpenChange(false);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add block to {sectionNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Block key</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="b11.objectives" />
          </div>
          <div className="grid gap-1.5">
            <Label>Default title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="figure">Figure</SelectItem>
                <SelectItem value="table">Table</SelectItem>
                <SelectItem value="references">References</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create}>Add block</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function PublishDialog({
  open, onOpenChange, versionId, onPublished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  versionId: string;
  onPublished: () => void;
}) {
  const [major, setMajor] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const publish = usePublishVersion();

  const submit = async () => {
    if (major && !name.trim()) { toast.error('Name the major version'); return; }
    try {
      await publish.mutateAsync({ versionId, major, name: name.trim() || undefined, notes: notes.trim() || undefined });
      toast.success(major ? 'Major version published' : 'Minor version published');
      setMajor(false); setName(''); setNotes('');
      onOpenChange(false);
      onPublished();
    } catch (e: any) {
      toast.error(e.message ?? 'Publish failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish version</DialogTitle>
          <DialogDescription>
            Existing proposals stay on their own version & are unaffected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Major version</Label>
              <p className="text-xs text-muted-foreground">
                For a Commission revision or a restructure. Otherwise a minor version is cut.
              </p>
            </div>
            <Switch checked={major} onCheckedChange={setMajor} />
          </div>
          {major && (
            <div className="grid gap-1.5">
              <Label>Version name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template v5.1" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={publish.isPending}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
