import { useCallback, useState } from 'react';
import { LostTextDialog, type LostTextPayload } from '@/components/cards/LostTextDialog';
import { isBlankValue } from '@/lib/versionedSave';

/**
 * Shared conflict surface for the version-guarded tables. On rejection the
 * caller reloads authoritative data and hands the text the user typed to this
 * hook, which offers it for copying exactly as the cards board does. Blank
 * values skip the dialog.
 */
export function useVersionConflict() {
  const [payload, setPayload] = useState<LostTextPayload | null>(null);

  const reportConflict = useCallback((lostValue: unknown) => {
    // Nothing worth recovering — the caller still reloads and warns by toast.
    if (isBlankValue(lostValue)) return;
    setPayload({ text: String(lostValue), reason: 'conflict' });
  }, []);


  const clear = useCallback(() => setPayload(null), []);

  const dialog = <LostTextDialog payload={payload} onClose={clear} />;

  return { reportConflict, dialog, conflictPayload: payload, clearConflict: clear };
}
