import { useCallback } from 'react';
import { reportLostText } from '@/lib/lostTextBus';

/**
 * Shared conflict surface for the version-guarded tables.
 *
 * Reporting is delegated to the app-level bus (`GlobalLostTextDialog`), so a
 * rejection still surfaces when the component that issued the save has
 * already unmounted. `dialog` is kept for call-site compatibility and renders
 * nothing — the single global dialog owns the UI.
 */
export function useVersionConflict() {
  const reportConflict = useCallback((lostValue: unknown) => {
    reportLostText(lostValue);
  }, []);

  const clear = useCallback(() => {}, []);

  return { reportConflict, dialog: null, conflictPayload: null, clearConflict: clear };
}
