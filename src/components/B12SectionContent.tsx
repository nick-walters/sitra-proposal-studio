import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { B12CaseStudyTables } from './B12CaseStudyTables';
import { B12OngoingProjectsTable } from './B12OngoingProjectsTable';
import { useCallback, useEffect, useState, useMemo, ReactNode } from 'react';
import { GripVertical, Trash2, Scissors } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import type { Editor } from '@tiptap/react';

type BlockId = 'editor' | 'case-studies' | 'ongoing-projects';

const DEFAULT_ORDER: BlockId[] = ['editor', 'case-studies', 'ongoing-projects'];

interface Props {
  proposalId: string;
  /** The editor content node to render as the "editor" block */
  editorNode: ReactNode;
  /** Tiptap editor instance for counting table captions */
  editor?: Editor | null;
  /** Section number e.g. "1.2" */
  sectionNumber?: string;
}

/** Count table captions inside the Tiptap editor document */
function countEditorTableCaptions(editor: Editor | null | undefined): number {
  if (!editor) return 0;
  const { doc } = editor.state;
  const captionPattern = /^Table\s+\d+\.\d+\.[a-z]\./i;
  let count = 0;
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      const cls = (node.attrs?.class || '') as string;
      const text = node.textContent;
      if (cls.includes('table-caption') && captionPattern.test(text)) {
        count++;
      }
    }
  });
  return count;
}

export function B12SectionContent({ proposalId, editorNode, editor, sectionNumber }: Props) {
  const queryClient = useQueryClient();
  const { isAdminOrOwner, hasAnyCoordinatorRole } = useUserRole();
  const canEdit = isAdminOrOwner || hasAnyCoordinatorRole;

  const { data: hasCases } = useQuery({
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

  // Load block order from table_captions
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
  // Cut/paste state
  const [cutBlock, setCutBlock] = useState<BlockId | null>(null);

  const handleDragStart = useCallback((blockId: BlockId) => {
    setDraggedBlock(blockId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, blockId: BlockId) => {
    e.preventDefault();
    if (draggedBlock && draggedBlock !== blockId) {
      setDragOverBlock(blockId);
    }
  }, [draggedBlock]);

  const handleDrop = useCallback((e: React.DragEvent, targetBlockId: BlockId) => {
    e.preventDefault();
    if (!draggedBlock || draggedBlock === targetBlockId) {
      setDraggedBlock(null);
      setDragOverBlock(null);
      return;
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
    setDraggedBlock(null);
    setDragOverBlock(null);
  }, [draggedBlock, blockOrder, saveBlockOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedBlock(null);
    setDragOverBlock(null);
  }, []);

  const handleCutBlock = useCallback((blockId: BlockId) => {
    setCutBlock(prev => prev === blockId ? null : blockId);
  }, []);

  const handlePasteBlock = useCallback((targetIdx: number) => {
    if (!cutBlock) return;
    const newOrder = [...blockOrder];
    const fromIdx = newOrder.indexOf(cutBlock);
    if (fromIdx === -1) return;
    newOrder.splice(fromIdx, 1);
    // targetIdx is the position in the new (after-removal) array
    const adjustedIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    newOrder.splice(adjustedIdx, 0, cutBlock);
    setBlockOrder(newOrder);
    saveBlockOrder(newOrder);
    setCutBlock(null);
  }, [cutBlock, blockOrder, saveBlockOrder]);

  // Visible blocks
  const visibleBlocks = useMemo(() => blockOrder.filter(id => {
    if (id === 'case-studies' && !hasCases) return false;
    return true;
  }), [blockOrder, hasCases]);

  // Unified table numbering:
  // Count editor table captions, then assign indices to B12 tables based on their position
  // relative to the editor block in the block order.
  const editorTableCount = countEditorTableCaptions(editor);

  const getTableIndex = useCallback((blockId: BlockId): number => {
    // Find where the editor block is in the visible order
    const editorIdx = visibleBlocks.indexOf('editor');
    const blockIdx = visibleBlocks.indexOf(blockId);

    if (blockIdx < editorIdx) {
      // This B12 table is BEFORE the editor content
      // Count B12 tables before this one
      let count = 0;
      for (let i = 0; i < blockIdx; i++) {
        if (visibleBlocks[i] !== 'editor') count++;
      }
      return count;
    } else {
      // This B12 table is AFTER the editor content
      // Count B12 tables before this one + editor table count
      let b12Before = 0;
      for (let i = 0; i < blockIdx; i++) {
        if (visibleBlocks[i] !== 'editor') b12Before++;
      }
      return b12Before + editorTableCount;
    }
  }, [visibleBlocks, editorTableCount]);

  // Count B12 tables that appear BEFORE the editor in the block order
  // This offset is used by the editor's renumberCaptionsInEditor
  const b12TablesBeforeEditor = useMemo(() => {
    const editorIdx = visibleBlocks.indexOf('editor');
    let count = 0;
    for (let i = 0; i < editorIdx; i++) {
      if (visibleBlocks[i] !== 'editor') count++;
    }
    return count;
  }, [visibleBlocks]);

  // Expose the offset via a custom event so DocumentEditor can use it for renumbering
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('b12-table-offset', { detail: { offset: b12TablesBeforeEditor } }));
  }, [b12TablesBeforeEditor]);

  const handleDeleteBlock = useCallback(async (blockId: BlockId) => {
    if (blockId === 'ongoing-projects') {
      const { error } = await supabase
        .from('b12_ongoing_projects')
        .delete()
        .eq('proposal_id', proposalId);

      if (error) {
        toast.error('Could not delete the relevant projects table.');
      } else {
        queryClient.invalidateQueries({ queryKey: ['b12-ongoing-projects'] });
      }
      return;
    }

    if (blockId === 'case-studies') {
      const { error } = await supabase
        .from('case_drafts')
        .update({ is_hidden: true } as never)
        .eq('proposal_id', proposalId)
        .eq('is_hidden', false);

      if (error) {
        toast.error('Could not delete the case tables.');
      } else {
        queryClient.invalidateQueries({ queryKey: ['b12-has-cases', proposalId] });
        queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
      }
    }
  }, [proposalId, queryClient]);

  const renderBlock = (blockId: BlockId) => {
    switch (blockId) {
      case 'editor':
        return editorNode;
      case 'case-studies':
        if (!hasCases) return null;
        return <B12CaseStudyTables proposalId={proposalId} tableIndex={getTableIndex('case-studies')} sectionNumber={sectionNumber} />;
      case 'ongoing-projects':
        return <B12OngoingProjectsTable proposalId={proposalId} tableIndex={getTableIndex('ongoing-projects')} sectionNumber={sectionNumber} />;
      default:
        return null;
    }
  };

  return (
    <div className="b12-section-blocks">
      {visibleBlocks.map((blockId) => {
        const isTable = blockId !== 'editor';
        const isDragging = draggedBlock === blockId;
        const isDragOver = dragOverBlock === blockId;
        const showDeleteButton = isTable && (blockId === 'ongoing-projects' || blockId === 'case-studies');

        return (
          <div
            key={blockId}
            className="relative group/b12block"
            style={{
              opacity: isDragging ? 0.4 : 1,
              borderTop: isDragOver ? '2px solid #2563EB' : '2px solid transparent',
              transition: 'opacity 150ms',
            }}
            onDragOver={(e) => handleDragOver(e, blockId)}
            onDrop={(e) => handleDrop(e, blockId)}
          >
            {canEdit && visibleBlocks.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute opacity-0 group-hover/b12block:opacity-100 transition-opacity z-10 cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none"
                  title="Drag to reorder"
                  style={{
                    left: '-28px',
                    top: isTable ? '16px' : '4px',
                  }}
                  draggable
                  onDragStart={() => handleDragStart(blockId)}
                  onDragEnd={handleDragEnd}
                  tabIndex={-1}
                >
                  <GripVertical className="w-3.5 h-3.5 text-[#2563EB]" />
                </button>

                {showDeleteButton && (
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(blockId)}
                    className="absolute opacity-0 group-hover/b12block:opacity-100 transition-opacity z-10 p-0.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                    title="Delete table"
                    style={{
                      left: '-28px',
                      top: isTable ? '42px' : '30px',
                    }}
                    tabIndex={-1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
            {renderBlock(blockId)}
          </div>
        );
      })}
    </div>
  );
}
