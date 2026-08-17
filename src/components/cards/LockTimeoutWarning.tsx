/**
 * Small, corner-anchored timeout warning. Deliberately not a modal dialog so
 * the green-bordered field it refers to stays visible and editable — any
 * keystroke dismisses it (the lock manager clears the warning).
 */
export function LockTimeoutWarning({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-72 rounded-md border border-amber-500/60 bg-background p-3 text-[12px] shadow-lg"
    >
      <p className="mb-1 font-bold">Timeout warning</p>
      <p className="text-muted-foreground">
        This field is locked to other users while you edit. If you do not type within the next{' '}
        <span className="font-bold text-foreground tabular-nums">{secondsLeft}</span>, your cursor
        will be removed from the field, and the field will become editable to other users. Your
        changes will be saved before another user is able to edit.
      </p>
    </div>
  );
}

export default LockTimeoutWarning;
