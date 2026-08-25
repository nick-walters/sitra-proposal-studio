import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * Tracks which guideline/criteria fields inside a dialog hold unsaved edits.
 *
 * Each field saves independently, so the dialog cannot own a single "dirty"
 * flag: it has to know how many of its children are dirty and be able to save
 * them all in one go when the user asks to.
 */
export interface DirtyRegistry {
  register: (id: string, dirty: boolean, save: () => Promise<boolean | void>) => void;
  unregister: (id: string) => void;
  dirtyCount: number;
  saveAll: () => Promise<boolean>;
}

export function useDirtyRegistry(): DirtyRegistry {
  const entries = useRef(new Map<string, { dirty: boolean; save: () => Promise<boolean | void> }>());
  const [dirtyCount, setDirtyCount] = useState(0);

  const sync = useCallback(() => {
    let n = 0;
    entries.current.forEach((e) => {
      if (e.dirty) n++;
    });
    setDirtyCount((c) => (c === n ? c : n));
  }, []);

  const register = useCallback<DirtyRegistry['register']>(
    (id, dirty, save) => {
      entries.current.set(id, { dirty, save });
      sync();
    },
    [sync],
  );

  const unregister = useCallback<DirtyRegistry['unregister']>(
    (id) => {
      entries.current.delete(id);
      sync();
    },
    [sync],
  );

  const saveAll = useCallback(async () => {
    let ok = true;
    for (const [, entry] of entries.current) {
      if (!entry.dirty) continue;
      const result = await entry.save();
      if (result === false) ok = false;
    }
    sync();
    return ok;
  }, [sync]);

  return { register, unregister, dirtyCount, saveAll };
}

/** Lets a field publish its dirty state and a save callback to the registry. */
export function useRegisterDirty(
  registry: DirtyRegistry | undefined,
  id: string,
  dirty: boolean,
  save: () => Promise<boolean | void>,
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!registry) return;
    registry.register(id, dirty, () => saveRef.current());
    return () => registry.unregister(id);
  }, [registry, id, dirty]);
}

/**
 * Warns on browser-level exits (reload, tab close, external navigation) and
 * on in-app back navigation while edits are unsaved.
 */
export function useExitGuard(active: boolean, onBlockedBack: () => void) {
  const onBlockedBackRef = useRef(onBlockedBack);
  onBlockedBackRef.current = onBlockedBack;

  useEffect(() => {
    if (!active) return;

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);

    /* A sentinel entry means the first Back press pops the sentinel rather
       than the page, so the prompt can be shown instead of losing the edits. */
    window.history.pushState({ unsavedGuard: true }, '');
    const onPop = () => {
      window.history.pushState({ unsavedGuard: true }, '');
      onBlockedBackRef.current();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', onPop);
    };
  }, [active]);
}

export function UnsavedChangesDialog({
  open,
  count,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  count: number;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Do you want to save your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            {count > 1
              ? `${count} fields have unsaved changes. Discarding loses all of them.`
              : 'This field has unsaved changes. Discarding loses them.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onSave(); }} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
