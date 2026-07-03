import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { RefreshCw } from 'lucide-react';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

interface EditableCaptionProps {
  proposalId?: string;
  /** Either tableKey (legacy: table_captions store) OR figureId (figures.caption store) must be provided. */
  tableKey?: string;
  figureId?: string;
  label: string; // e.g. "Table 3.1.a." or "Figure 3.1.a."
  defaultCaption: string; // e.g. "List of work packages"
  /** Extra JSX to render after the editable text (e.g. bubble legends) */
  suffix?: React.ReactNode;
  className?: string;
  /** If provided, a refresh icon appears when the caption row is hovered */
  onRefresh?: () => void;
  /** Buttons rendered to the left of the caption, revealed on hover. */
  leftButtons?: React.ReactNode;
}

export function EditableCaption({
  proposalId,
  tableKey,
  figureId,
  label,
  defaultCaption,
  suffix,
  className = '',
  onRefresh,
  leftButtons,
}: EditableCaptionProps) {
  const { isAdminOrOwner, hasAnyCoordinatorRole } = useUserRole();
  const canEdit = isAdminOrOwner || hasAnyCoordinatorRole;
  const [caption, setCaption] = useState(defaultCaption || 'Caption');
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [focused, setFocused] = useState(false);
  const qc = useQueryClient();

  // Figure-caption store (single source): keep in sync with figures.caption via react-query.
  const figCapQ = useQuery({
    queryKey: ['figure-caption', figureId],
    enabled: !!figureId,
    queryFn: async () => {
      const { data } = await supabase
        .from('figures')
        .select('caption, title')
        .eq('id', figureId!)
        .maybeSingle();
      return (data?.caption ?? data?.title ?? '') as string;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!figureId) return;
    const v = (figCapQ.data ?? '').trim();
    if (v) setCaption(v);
  }, [figureId, figCapQ.data]);

  // Legacy table_captions store — only when tableKey is used (no figureId).
  useEffect(() => {
    if (!proposalId || !tableKey || figureId) return;
    const load = async () => {
      const { data } = await supabase
        .from('table_captions')
        .select('caption')
        .eq('proposal_id', proposalId)
        .eq('table_key', tableKey)
        .maybeSingle();
      if (data?.caption) setCaption(data.caption);
    };
    load();
  }, [proposalId, tableKey, figureId]);

  const startEdit = () => {
    if (!canEdit) return;
    setEditValue(caption);
    setEditing(true);
  };

  const save = useCallback(async () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === caption) return;
    setCaption(trimmed);

    if (figureId) {
      await supabase.from('figures').update({ caption: trimmed }).eq('id', figureId);
      qc.invalidateQueries({ queryKey: ['figure-caption', figureId] });
      if (proposalId) qc.invalidateQueries({ queryKey: ['figures', proposalId] });
      return;
    }

    if (!proposalId || !tableKey) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('table_captions')
      .upsert({
        proposal_id: proposalId,
        table_key: tableKey,
        caption: trimmed,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }, { onConflict: 'proposal_id,table_key' });
  }, [editValue, caption, proposalId, tableKey, figureId, qc]);

  // Infer caption kind from the label prefix.
  const isFigure = /^\s*figure\b/i.test(label);
  const kindClass = isFigure ? 'figure-caption' : 'table-caption';
  const commentKey = figureId ? `figure-${figureId}` : `caption-${tableKey}`;

  return (
    <p
      className={`${tableStyles} italic ${kindClass} ${className} relative group/caption`}
      data-commentable={commentKey}
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'baseline',
        justifyContent: 'flex-start',
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
      onClick={() => setFocused(true)}
    >
      {leftButtons && (
        <span
          contentEditable={false}
          suppressContentEditableWarning
          className="print:hidden absolute z-10 flex items-center gap-0.5 opacity-0 group-hover/caption:opacity-100 focus-within:opacity-100 transition-opacity"
          style={{ right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {leftButtons}
        </span>
      )}
      <span className="font-bold italic select-none" contentEditable={false} suppressContentEditableWarning style={{ flexShrink: 0 }}>
        {label}
      </span>
      <span className="font-normal select-none" contentEditable={false} suppressContentEditableWarning style={{ flexShrink: 0 }}>
        {' '}
      </span>
      {editing ? (
        <input
          type="text"
          data-commentable={commentKey}
          className={`${tableStyles} italic font-normal bg-transparent outline-none border-0 p-0 m-0 shadow-none ring-0 focus:outline-none focus:ring-0 focus:border-0`}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          style={{ flex: '1 1 auto', minWidth: '5ch', border: 'none', borderBottom: 'none', textDecoration: 'none' }}
        />
      ) : (
        <span
          data-commentable={commentKey}
          className={`font-normal ${canEdit ? 'cursor-text hover:bg-muted/30 rounded px-0.5' : ''}`}
          onClick={startEdit}
        >
          {caption}
        </span>
      )}
      {suffix && <>{' '}{suffix}</>}
      {onRefresh && (focused || editing) && (
        <button
          type="button"
          title="Refresh caption number"
          className="absolute z-10 p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          style={{ right: '-28px', top: '50%', transform: 'translateY(-50%)' }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRefresh();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </p>
  );
}
