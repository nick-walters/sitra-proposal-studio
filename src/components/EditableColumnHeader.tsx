import { useEffect, useRef } from 'react';

/**
 * A table column header the user can retype in place. The typed wording is
 * persisted by the caller (see useColumnHeaders); clearing it restores the
 * template default.
 */
export function EditableColumnHeader({
  value,
  canEdit,
  onCommit,
}: {
  value: string;
  canEdit: boolean;
  onCommit: (next: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Keep the DOM in step with the stored value without fighting the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) {
      el.textContent = value;
    }
  }, [value]);

  if (!canEdit) return <span>{value}</span>;

  return (
    <span
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      title="Click to rename this column"
      className="inline-block min-w-[1ch] outline-none focus:bg-primary/5"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          e.currentTarget.textContent = value;
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (next !== value) onCommit(next);
        if (!next) e.currentTarget.textContent = value;
      }}
    >
      {value}
    </span>
  );
}

export default EditableColumnHeader;
