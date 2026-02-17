import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

interface EditableCaptionProps {
  proposalId?: string;
  tableKey: string;
  label: string; // e.g. "Table 3.1.a."
  defaultCaption: string; // e.g. "List of work packages"
  /** Extra JSX to render after the editable text (e.g. bubble legends) */
  suffix?: React.ReactNode;
  className?: string;
}

export function EditableCaption({
  proposalId,
  tableKey,
  label,
  defaultCaption,
  suffix,
  className = '',
}: EditableCaptionProps) {
  const { isAdminOrOwner, hasAnyCoordinatorRole } = useUserRole();
  const canEdit = isAdminOrOwner || hasAnyCoordinatorRole;
  const [caption, setCaption] = useState(defaultCaption);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [loaded, setLoaded] = useState(false);

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
      setLoaded(true);
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

  return (
    <p className={`${tableStyles} italic ${className}`}>
      <span className="font-bold italic">{label}</span>{' '}
      {editing ? (
        <input
          type="text"
          className={`${tableStyles} italic bg-transparent outline-none border-b border-dashed border-muted-foreground p-0 m-0`}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          style={{ width: `${Math.max(10, editValue.length + 2)}ch` }}
        />
      ) : (
        <span
          className={canEdit ? 'cursor-text hover:bg-muted/30 rounded px-0.5' : ''}
          onClick={startEdit}
        >
          {caption}
        </span>
      )}
      {suffix && <>{' '}{suffix}</>}
    </p>
  );
}
