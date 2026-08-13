import { useEffect, useMemo, useState } from 'react';
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
import { GripVertical, Eye, EyeOff, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GuidelinesDialog } from '@/components/GuidelinesDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { FormattingToolbar } from '@/components/RichTextEditor';
import { PartBCrossRefControls } from '@/components/PartBCrossRefControls';
import { StickyToolbarWrapper } from '@/components/StickyToolbarWrapper';
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
  onOpenGuidelines: (id: string) => void;
}

function SortableMethodologyCard({
  subsection,
  proposalId,
  canEdit,
  isCoordinator,
  onContentChange,
  onRename,
  onToggleVisible,
  onOpenGuidelines,
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

  const isMandatory = subsection.key === 'methodologies';

  return (
    <div ref={setNodeRef} style={style}>
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

            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGuidelines(subsection.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Info className="w-3 h-3" />
              Guidelines
            </Button>

            {isCoordinator && !isMandatory ? (
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
        <CardContent>
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
}: MethodologiesPageProps) {
  const { activeEditor } = useMethodologyEditorFocus();
  // Fallback: if no acronym colours saved but a plain acronym exists, use a single all-black segment.
  const acronymSegments = (acronymSegmentsProp && acronymSegmentsProp.length > 0)
    ? acronymSegmentsProp
    : (proposalAcronym ? [{ text: proposalAcronym, color: '#000000' }] : []);

  return (
    <StickyToolbarWrapper>
      <div
        className="rounded-md border border-border bg-card shadow-sm"
        // Keep the active editor's DOM focus (and therefore its selection)
        // when any toolbar chrome is clicked, including Radix Select /
        // DropdownMenu triggers, which otherwise move focus on open.
        onMouseDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest('input, textarea, [contenteditable="true"]')) return;
          e.preventDefault();
        }}
      >
        {activeEditor ? (
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
                showKeyboardButton={false}
                acronymSegments={acronymSegments}
              />
            }
          />
        ) : (
          <div className="px-3 py-2 text-sm italic text-muted-foreground">
            Click into a field to start formatting
          </div>
        )}
      </div>
    </StickyToolbarWrapper>
  );
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
  const guidelinesSubsection = subsections.find((s) => s.id === guidelinesId) ?? null;


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
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">Methodologies</h1>
            <p className="text-sm text-muted-foreground">
              Content written here is mirrored into Part B section B1.2.
            </p>
          </div>
          <SaveIndicator saving={saving} lastSaved={lastSaved} />
        </div>

        <MethodologiesToolbar
          proposalId={proposalId}
          canEdit={canEdit}
          isCoordinator={isCoordinator}
          proposalAcronym={proposalAcronym}
          acronymSegments={acronymSegments}
        />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {visible.map((s) => (
                <SortableMethodologyCard
                  key={s.id}
                  subsection={s}
                  proposalId={proposalId}
                  canEdit={canEdit}
                  isCoordinator={isCoordinator}
                  onContentChange={updateContent}
                  onRename={handleRename}
                  onToggleVisible={handleToggleVisible}
                  onOpenGuidelines={setGuidelinesId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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

