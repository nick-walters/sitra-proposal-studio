import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { B12CaseStudyTables } from './B12CaseStudyTables';
import { B12OngoingProjectsTable } from './B12OngoingProjectsTable';
import { useCallback, useEffect, useState, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

type BlockId = 'editor' | 'case-studies' | 'ongoing-projects';

const DEFAULT_ORDER: BlockId[] = ['editor', 'case-studies', 'ongoing-projects'];

interface Props {
  proposalId: string;
  /** The editor content node to render as the "editor" block */
  editorNode: ReactNode;
}

export function B12SectionContent({ proposalId, editorNode }: Props) {
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
            // Ensure all block IDs are present
            const validIds = new Set<BlockId>(['editor', 'case-studies', 'ongoing-projects']);
            const ordered = parsed.filter((id: string) => validIds.has(id as BlockId)) as BlockId[];
            // Add any missing IDs
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

  // Compute table indices based on order
  const getTableIndex = (blockId: BlockId): number => {
    const tableBlocks = blockOrder.filter(id => {
      if (id === 'editor') return false;
      if (id === 'case-studies' && !hasCases) return false;
      return true;
    });
    return tableBlocks.indexOf(blockId);
  };

  const renderBlock = (blockId: BlockId) => {
    switch (blockId) {
      case 'editor':
        return editorNode;
      case 'case-studies':
        if (!hasCases) return null;
        return <B12CaseStudyTables proposalId={proposalId} tableIndex={getTableIndex('case-studies')} />;
      case 'ongoing-projects':
        return <B12OngoingProjectsTable proposalId={proposalId} tableIndex={getTableIndex('ongoing-projects')} />;
      default:
        return null;
    }
  };

  // Visible blocks (filter out hidden case studies)
  const visibleBlocks = blockOrder.filter(id => {
    if (id === 'case-studies' && !hasCases) return false;
    return true;
  });

  return (
    <div className="b12-section-blocks">
      {visibleBlocks.map((blockId) => {
        const isTable = blockId !== 'editor';
        const isDragging = draggedBlock === blockId;
        const isDragOver = dragOverBlock === blockId;

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
            {/* Drag grip — shown for table blocks only, positioned at caption level */}
            {isTable && canEdit && (
              <div
                className="absolute opacity-0 group-hover/b12block:opacity-100 transition-opacity cursor-grab z-10"
                style={{
                  left: '-28px',
                  top: blockId === 'ongoing-projects' ? '32px' : '16px', // align with caption (ongoing has auto-resize bar above)
                }}
                draggable
                onDragStart={() => handleDragStart(blockId)}
                onDragEnd={handleDragEnd}
              >
                <GripVertical className="h-4 w-4" style={{ color: '#2563EB' }} />
              </div>
            )}
            {/* Editor block also needs a grip */}
            {!isTable && canEdit && visibleBlocks.length > 1 && (
              <div
                className="absolute opacity-0 group-hover/b12block:opacity-100 transition-opacity cursor-grab z-10"
                style={{ left: '-28px', top: '4px' }}
                draggable
                onDragStart={() => handleDragStart(blockId)}
                onDragEnd={handleDragEnd}
              >
                <GripVertical className="h-4 w-4" style={{ color: '#2563EB' }} />
              </div>
            )}
            {renderBlock(blockId)}
          </div>
        );
      })}
    </div>
  );
}
