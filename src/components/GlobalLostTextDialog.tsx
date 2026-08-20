import { useEffect, useState } from 'react';
import { LostTextDialog, type LostTextPayload } from '@/components/cards/LostTextDialog';
import { subscribeLostText } from '@/lib/lostTextBus';

/**
 * Mounted once at the app root so a rejected write always surfaces, even when
 * the component that issued the save has already unmounted (navigation away
 * mid-sentence).
 */
export function GlobalLostTextDialog() {
  const [payload, setPayload] = useState<LostTextPayload | null>(null);

  useEffect(() => subscribeLostText(setPayload), []);

  return <LostTextDialog payload={payload} onClose={() => setPayload(null)} />;
}

export default GlobalLostTextDialog;
