import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GuidelinesDialog } from '@/components/GuidelinesDialog';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { FormattingToolbar } from '@/components/RichTextEditor';
import { PartBCrossRefControls } from '@/components/PartBCrossRefControls';
import { EditorChrome, EditorFeatureBar } from '@/components/EditorChrome';
import { supabase } from '@/integrations/supabase/client';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import MethodologyItemsList from '@/components/MethodologyItemsList';
import LinkedActivitiesTable from '@/components/LinkedActivitiesTable';
import { getMethodologyGuidelines } from '@/lib/methodologyGuidelines';
import {
  useMethodologySubsections,
  type MethodologySubsection,
} from '@/hooks/useMethodologySubsections';

interface MethodologiesPageProps {
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  proposalAcronym?: string;
  acronymSegments?: { text: string; color: string }[];
}

const NARRATIVE_KEYS = new Set([
  'concepts',
  'interdisciplinarity',
  'ssh',
  'gender',
  'open_science',
]);

interface SortableMethodologyCardProps {
  subsection: MethodologySubsection;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  onContentChange: (id: string, html: string) => void;
  onRename: (id: string, title: string) => void;
  onToggleVisible: (id: string, isVisible: boolean) => void;
  onFocusField: (id: string) => void;
  collapsed: boolean;
}

function SortableMethodologyCard({
  subsection,
  proposalId,
  canEdit,
  isCoordinator,
  onContentChange,
  onRename,
  onToggleVisible,
  onFocusField,
  collapsed,
}: SortableMethodologyCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subsection.id,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(subsection.title);

  useEffect(() => {
    if (!editing) setDraft(subsection.title);
  }, [subsection.title, editing]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : subsection.isVisible ? 1 : 0.6,
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== subsection.title) onRename(subsection.id, next);
    else setDraft(subsection.title);
  };

  

  return (
    <div
      ref={setNodeRef}
      style={style}
      onFocusCapture={() => onFocusField(subsection.id)}
      onMouseDownCapture={() => onFocusField(subsection.id)}
    >
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 py-3">
          {canEdit && (
            <button
              type="button"
              className="cursor-grab touch-none text-[#2563EB]"
              aria-label="Reorder subsection"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            {isCoordinator && editing ? (
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft(subsection.title);
                    setEditing(false);
                  }
                }}
                className="h-8"
              />
            ) : (
              <h3
                className={`truncate font-bold underline ${isCoordinator ? 'cursor-text' : ''}`}
                onClick={() => isCoordinator && setEditing(true)}
              >
                {subsection.title}
              </h3>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!subsection.isVisible && (
              <Badge variant="secondary" className="text-muted-foreground">
                Hidden
              </Badge>
            )}


            {isCoordinator ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={subsection.isVisible ? 'Hide subsection' : 'Show subsection'}
                onClick={() => onToggleVisible(subsection.id, !subsection.isVisible)}
              >
                {subsection.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="invisible pointer-events-none"
                aria-hidden="true"
                tabIndex={-1}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        {/* Hidden (not unmounted) while dragging so unsaved text survives. */}
        <CardContent className={collapsed ? 'hidden' : undefined}>
          {subsection.key === 'methodologies' ? (
            <MethodologyItemsList
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
            />
          ) : subsection.key === 'linked_activities' ? (
            <LinkedActivitiesTable
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
            />
          ) : NARRATIVE_KEYS.has(subsection.key) ? (
            <MethodologyRichEditor
              proposalId={proposalId}
              value={subsection.contentHtml ?? ''}
              onChange={(html) => onContentChange(subsection.id, html)}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
            />
          ) : (
            <p className="text-sm italic text-muted-foreground">Editor added in the next step.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Single page-wide formatting bar, bound to the last-focused editor. */
function MethodologiesToolbar({
  proposalId,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments: acronymSegmentsProp,
  onOpenShortcuts,
}: MethodologiesPageProps & { onOpenShortcuts: () => void }) {
  const { activeEditor } = useMethodologyEditorFocus();
  const rowRef = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState(40);

  useEffect(() => {
    if (activeEditor && rowRef.current) {
      const h = rowRef.current.offsetHeight;
      if (h > 0) setReservedHeight(h);
    }
  }, [activeEditor]);

  // Fallback: if no acronym colours saved but a plain acronym exists, use a single all-black segment.
  const acronymSegments = (acronymSegmentsProp && acronymSegmentsProp.length > 0)
    ? acronymSegmentsProp
    : (proposalAcronym ? [{ text: proposalAcronym, color: '#000000' }] : []);

  if (!activeEditor) {
    // Keep the chrome height stable so page content never jumps.
    return <div aria-hidden style={{ height: reservedHeight }} />;
  }

  return (
    <div>
      <div
        ref={rowRef}
        // Keep the active editor's DOM focus (and therefore its selection)
        // when any toolbar chrome is clicked, including Radix Select /
        // DropdownMenu triggers, which otherwise move focus on open.
        onMouseDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest('input, textarea, [contenteditable="true"]')) return;
          e.preventDefault();
        }}
      >
        <FormattingToolbar
          editor={activeEditor}
          proposalId={proposalId}
          canManageCustomColors={isCoordinator}
          isPartB
          isReadOnly={!canEdit}
          crossRefDropdown={
            <PartBCrossRefControls
              editor={activeEditor}
              proposalId={proposalId}
              disabled={!canEdit}
              showKeyboardButton
              onOpenShortcuts={onOpenShortcuts}
              acronymSegments={acronymSegments}
            />
          }
        />
      </div>
    </div>
  );
}


/**
 * Clears the active field when the user clicks empty space. Clicks inside an
 * editor surface, the chrome bars or any dialog keep the current target so
 * toolbar actions never lose their editor.
 */
function OutsideClickClear({ onClear }: { onClear: () => void }) {
  const { activeEditor, unregister } = useMethodologyEditorFocus();

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          '[data-editor-chrome], .ProseMirror, [contenteditable="true"], [role="dialog"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      onClear();
      if (activeEditor) unregister(activeEditor);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [activeEditor, unregister, onClear]);

  return null;
}

export default function MethodologiesPage({
  proposalId,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments,
}: MethodologiesPageProps) {
  const { subsections, reorder, updateTitle, setVisible, updateContent, saving, lastSaved } =
    useMethodologySubsections(proposalId);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [guidelinesId, setGuidelinesId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const guidelinesSubsection = subsections.find((s) => s.id === guidelinesId) ?? null;
  const focusedSubsection = subsections.find((s) => s.id === focusedId) ?? null;

  // Track edited content so the manual save button can flush immediately.
  const dirtyRef = useRef<Record<string, string>>({});
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSavedAt, setManualSavedAt] = useState<Date | null>(null);
  const [savedMode, setSavedMode] = useState<'auto' | 'manual'>('auto');

  const handleContentChange = (id: string, html: string) => {
    dirtyRef.current[id] = html;
    setIsDirty(true);
    setSavedMode('auto');
    updateContent(id, html);
  };

  useEffect(() => {
    if (lastSaved) {
      setSavedMode((m) => (m === 'manual' ? m : 'auto'));
      setIsDirty(false);
    }
  }, [lastSaved]);

  const handleSaveNow = async () => {
    const entries = Object.entries(dirtyRef.current);
    setManualSaving(true);
    try {
      for (const [id, html] of entries) {
        const { error } = await supabase
          .from('methodology_subsections')
          .update({ content_html: html })
          .eq('id', id);
        if (error) throw error;
      }
      dirtyRef.current = {};
      setManualSavedAt(new Date());
      setSavedMode('manual');
      setIsDirty(false);
    } catch {
      toast.error('Could not save');
    } finally {
      setManualSaving(false);
    }
  };


  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    setLocalOrder(null);
  }, [subsections]);

  const ordered = useMemo(() => {
    if (!localOrder) return subsections;
    const byId = new Map(subsections.map((s) => [s.id, s]));
    const list = localOrder.map((id) => byId.get(id)).filter(Boolean) as MethodologySubsection[];
    return list.length === subsections.length ? list : subsections;
  }, [subsections, localOrder]);

  const visible = ordered.filter((s) => s.isVisible || isCoordinator);

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visible.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(nextIds);
    reorder(nextIds).catch(() => {
      setLocalOrder(null);
      toast.error('Could not save the new order');
    });
  };

  const handleRename = (id: string, title: string) => {
    updateTitle(id, title).catch(() => toast.error('Could not save the title'));
  };

  const handleToggleVisible = (id: string, isVisible: boolean) => {
    setVisible(id, isVisible).catch(() => toast.error('Could not update visibility'));
  };

  return (
    <MethodologyEditorFocusProvider>
      <OutsideClickClear onClear={() => setFocusedId(null)} />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">Methodologies</h1>
            <p className="text-sm text-muted-foreground">
              Content written here is mirrored into Part B section B1.2.
            </p>
          </div>
        </div>

        <EditorChrome
          proposalId={proposalId}
          featureBar={
            <EditorFeatureBar
              hasFocusedField={!!focusedSubsection}
              onOpenGuidelines={() => focusedSubsection && setGuidelinesId(focusedSubsection.id)}
              saving={saving || manualSaving}
              lastSaved={savedMode === 'manual' ? manualSavedAt ?? lastSaved : lastSaved}
              savedMode={savedMode}
              isDirty={isDirty}
              onSaveNow={handleSaveNow}
            />
          }
          formattingBar={
            <MethodologiesToolbar
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
              proposalAcronym={proposalAcronym}
              acronymSegments={acronymSegments}
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />
          }
        >
            <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => setIsDragging(true)}
            onDragCancel={() => setIsDragging(false)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visible.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3 pt-4">
                {visible.map((s) => (
                  <SortableMethodologyCard
                    key={s.id}
                    subsection={s}
                    proposalId={proposalId}
                    canEdit={canEdit}
                    isCoordinator={isCoordinator}
                    onContentChange={handleContentChange}
                    onRename={handleRename}
                    onToggleVisible={handleToggleVisible}
                    onFocusField={setFocusedId}
                    collapsed={isDragging}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </EditorChrome>

        <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        {guidelinesSubsection && (
          <GuidelinesDialog
            isOpen
            onClose={() => setGuidelinesId(null)}
            sectionTitle={guidelinesSubsection.title}
            guidelines={getMethodologyGuidelines(guidelinesSubsection.key)}
          />
        )}
      </div>
    </MethodologyEditorFocusProvider>
  );
}

