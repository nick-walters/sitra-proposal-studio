/**
 * Draggable right-edge grip for resizable table column headers.
 * Place inside a <th> with position: relative.
 */
export function ColumnResizer({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 hover:bg-primary/40 active:bg-primary/60"
      style={{ touchAction: 'none' }}
    />
  );
}
