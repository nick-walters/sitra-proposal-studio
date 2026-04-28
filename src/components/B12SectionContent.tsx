import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { B12CaseStudyTables } from './B12CaseStudyTables';
import { B12OngoingProjectsTable } from './B12OngoingProjectsTable';
import { useCallback, useEffect, useState, useMemo, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import type { Editor } from '@tiptap/react';

type BlockId = 'editor' | 'case-studies' | 'ongoing-projects';

const DEFAULT_ORDER: BlockId[] = ['editor', 'case-studies', 'ongoing-projects'];

interface Props {
  proposalId: string;
  editorNode: ReactNode;
  editor?: Editor | null;
  sectionNumber?: string;
}

function countEditorTableCaptions(editor: Editor | null | undefined): number {
  if (!editor) return 0;
  const { doc } = editor.state;
  const captionPattern = /^Table\s+\d+\.\d+\.[a-z]\./i;
  let count = 0;
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      const cls = (node.attrs?.class || '') as string;
      const text = node.textContent;
      if (cls.includes('table-caption') && captionPattern.test(text)) count++;
    }
  });
  return count;
}

export function B12SectionContent({ proposalId, editorNode, editor, sectionNumber }: Props) {
  const queryClient = useQueryClient();
  const { isAdminOrOwner, hasAnyCoordinatorRole } = useUserRole();
  const canEdit = isAdminOrOwner || hasAnyCoordinatorRole;

  const { data: hasCases, isLoading: hasCasesLoading } = useQuery({
    queryKey: ['b12-has-cases', proposalId],
    queryFn: async () => {
      const { count } = await supabase
        .from('case_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('proposal_id', proposalId)
        .eq('is_hidden', false);
      return (count ?? 0) > 0;
    },
  });

  const [blockOrder, setBlockOrder] = useState<BlockId[]>(DEFAULT_ORDER);
  const [orderLoaded, setOrderLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('table_captions')
        .select('caption')
        .eq('proposal_id', proposalId)
        .eq('table_key', 'b12-block-order')
        .maybeSingle();
      if (data?.caption) {
        try {
          const parsed = JSON.parse(data.caption);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validIds = new Set<BlockId>(['editor', 'case-studies', 'ongoing-projects']);
            const ordered = parsed.filter((id: string) => validIds.has(id as BlockId)) as BlockId[];
            for (const id of DEFAULT_ORDER) {
              if (!ordered.includes(id)) ordered.push(id);
            }
            setBlockOrder(ordered);
          }
        } catch { /* ignore */ }
      }
      setOrderLoaded(true);
    })();
  }, [proposalId]);

  const saveBlockOrder = useCallback(async (order: BlockId[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('table_captions').upsert({
      proposal_id: proposalId,
      table_key: 'b12-block-order',
      caption: JSON.stringify(order),
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    }, { onConflict: 'proposal_id,table_key' });
  }, [proposalId]);

  // Drag state
  const [draggedBlock, setDraggedBlock] = useState<BlockId | null>(null);
  const [dragOverBlock, setDragOverBlock] = useState<BlockId | null>(null);

  const handleDragStart = useCallback((blockId: BlockId) => setDraggedBlock(blockId), []);

  const handleDragOver = useCallback((e: React.DragEvent, blockId: BlockId) => {
    e.preventDefault();
    if (draggedBlock && draggedBlock !== blockId) setDragOverBlock(blockId);
  }, [draggedBlock]);

  const handleDrop = useCallback((e: React.DragEvent, targetBlockId: BlockId) => {
    e.preventDefault();
    if (!draggedBlock || draggedBlock === targetBlockId) {
      setDraggedBlock(null); setDragOverBlock(null); return;
    }
    const newOrder = [...blockOrder];
    const fromIdx = newOrder.indexOf(draggedBlock);
    const toIdx = newOrder.indexOf(targetBlockId);
    if (fromIdx !== -1 && toIdx !== -1) {
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedBlock);
      setBlockOrder(newOrder);
      saveBlockOrder(newOrder);
    }
    setDraggedBlock(null); setDragOverBlock(null);
  }, [draggedBlock, blockOrder, saveBlockOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedBlock(null); setDragOverBlock(null);
  }, []);

  const isReadyToMountBlocks = orderLoaded && !hasCasesLoading;

  const visibleBlocks = useMemo(() => blockOrder.filter(id => {
    if (id === 'case-studies' && !hasCases) return false;
    return true;
  }), [blockOrder, hasCases]);

  const editorTableCount = countEditorTableCaptions(editor);

  const getTableIndex = useCallback((blockId: BlockId): number => {
    const editorIdx = visibleBlocks.indexOf('editor');
    const blockIdx = visibleBlocks.indexOf(blockId);
    let b12Before = 0;
    for (let i = 0; i < blockIdx; i++) {
      if (visibleBlocks[i] !== 'editor') b12Before++;
    }
    return blockIdx < editorIdx ? b12Before : b12Before + editorTableCount;
  }, [visibleBlocks, editorTableCount]);

  const b12TablesBeforeEditor = useMemo(() => {
    const editorIdx = visibleBlocks.indexOf('editor');
    let count = 0;
    for (let i = 0; i < editorIdx; i++) {
      if (visibleBlocks[i] !== 'editor') count++;
    }
    return count;
  }, [visibleBlocks]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('b12-table-offset', { detail: { offset: b12TablesBeforeEditor } }));
  }, [b12TablesBeforeEditor]);

  const renderBlock = (blockId: BlockId) => {
    switch (blockId) {
      case 'editor': return editorNode;
      case 'case-studies':
        if (!hasCases) return null;
        return <B12CaseStudyTables proposalId={proposalId} tableIndex={getTableIndex('case-studies')} sectionNumber={sectionNumber} />;
      case 'ongoing-projects':
        return <B12OngoingProjectsTable proposalId={proposalId} tableIndex={getTableIndex('ongoing-projects')} sectionNumber={sectionNumber} />;
      default: return null;
    }
  };

  if (!isReadyToMountBlocks) {
    return <div className="b12-section-blocks min-h-[400px]" aria-busy="true" />;
  }

  return (
    <div className="b12-section-blocks">
      {visibleBlocks.map((blockId) => {
        const isTable = blockId !== 'editor';
        const isDragging = draggedBlock === blockId;
        const isDragOver = dragOverBlock === blockId;

        return (
          <div
            key={blockId}
            data-b12-block={blockId}
            className="relative group/b12block"
            style={{
              opacity: isDragging ? 0.4 : 1,
              borderTop: isDragOver ? '2px solid hsl(var(--primary))' : '2px solid transparent',
              transition: 'opacity 150ms',
            }}
            onDragOver={(e) => handleDragOver(e, blockId)}
            onDrop={(e) => handleDrop(e, blockId)}
          >
            {/* Controls grid */}
            {canEdit && visibleBlocks.length > 1 && (
              <div
                className="absolute opacity-0 group-hover/b12block:opacity-100 transition-opacity z-10 block-controls-grid"
                style={{
                  left: '-52px',
                  top: isTable ? '12px' : '0px',
                }}
              >
                {/* Row 1: grip only — delete & auto-resize live in the formatting toolbar's Table dropdown */}
                <div
                  className="block-ctrl-btn block-drag-handle"
                  draggable
                  onDragStart={() => handleDragStart(blockId)}
                  onDragEnd={handleDragEnd}
                  title="Drag to reorder"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
              </div>
            )}
            {renderBlock(blockId)}
          </div>
        );
      })}
    </div>
  );
}
