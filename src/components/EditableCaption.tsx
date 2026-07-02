import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { RefreshCw } from 'lucide-react';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

interface EditableCaptionProps {
  proposalId?: string;
  tableKey: string;
  label: string; // e.g. "Table 3.1.a."
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

  useEffect(() => {
    if (!proposalId) return;
    const load = async () => {
      const { data } = await supabase
        .from('table_captions')
        .select('caption')
        .eq('proposal_id', proposalId)
        .eq('table_key', tableKey)
        .maybeSingle();
      if (data?.caption) {
        setCaption(data.caption);
      }
      // loaded
    };
    load();
  }, [proposalId, tableKey]);

  const startEdit = () => {
    if (!canEdit) return;
    setEditValue(caption);
    setEditing(true);
  };

  const save = useCallback(async () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === caption || !proposalId) return;
    setCaption(trimmed);

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
  }, [editValue, caption, proposalId, tableKey]);

  // Infer caption kind from the label prefix: "Figure ..." → centred figure
  // caption, anything else (typically "Table ...") → left-aligned table caption.
  // This matches the app-wide rule enforced by .figure-caption / .table-caption
  // in index.css; explicit justifyContent is needed here because this <p> is a
  // flex container and text-align is ignored on flex containers.
  const isFigure = /^\s*figure\b/i.test(label);
  const kindClass = isFigure ? 'figure-caption' : 'table-caption';

  return (
    <p
      className={`${tableStyles} italic ${kindClass} ${className} relative group/caption`}
      data-commentable={`caption-${tableKey}`}
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'baseline',
        justifyContent: isFigure ? 'center' : 'flex-start',
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        // Only unfocus if focus leaves the entire <p> container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
      onClick={() => setFocused(true)}
    >
      {/* Hover-revealed action buttons in the left margin */}
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
      {/* Label is uneditable, bold+italic */}
      <span className="font-bold italic select-none" contentEditable={false} suppressContentEditableWarning style={{ flexShrink: 0 }}>
        {label}
      </span>
      {/* Uneditable non-bold space separator */}
      <span className="font-normal select-none" contentEditable={false} suppressContentEditableWarning style={{ flexShrink: 0 }}>
        {' '}
      </span>
      {/* Editable caption title (italic, not bold) */}
      {editing ? (
        <input
          type="text"
          data-commentable={`caption-${tableKey}`}
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
          data-commentable={`caption-${tableKey}`}
          className={`font-normal ${canEdit ? 'cursor-text hover:bg-muted/30 rounded px-0.5' : ''}`}
          onClick={startEdit}
        >
          {caption}
        </span>
      )}
      {suffix && <>{' '}{suffix}</>}
      {/* Refresh icon in the right margin */}
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
