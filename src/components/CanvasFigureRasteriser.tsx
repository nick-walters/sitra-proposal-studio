import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  canvasSignature,
  rasteriseAndUploadCanvasFigure,
} from '@/lib/rasteriseCanvasFigure';

interface Props {
  proposalId: string;
  figureId: string;
  figureNumber: string;
  widthCm: number;
  heightCm: number;
  /** Current figure.content — read for imageUrl / renderSignature. */
  content: Record<string, unknown> | null | undefined;
  /** Persist the new content (merges imageUrl + renderSignature). */
  onUpdate: (updates: { content: Record<string, unknown> }) => void;
  canEdit: boolean;
}

const DEBOUNCE_MS = 2000;

/**
 * Stage D — keeps a Figure Canvas figure's derived PNG in sync with its
 * elements. Renders nothing.
 *
 * Watches the shared ['canvas-elements', figureId] cache (the editor writes
 * optimistically into it), debounces, then rasterises off-screen, uploads to
 * proposal-files and writes content.imageUrl + content.renderSignature so the
 * figure flows through the normal image-figure insertion/export path.
 */
export function CanvasFigureRasteriser({
  proposalId,
  figureId,
  figureNumber,
  widthCm,
  heightCm,
  content,
  onUpdate,
  canEdit,
}: Props) {
  const qc = useQueryClient();

  const { data: elements } = useQuery({
    queryKey: ['canvas-elements', figureId],
    enabled: !!figureId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('impact_canvas_elements')
        .select('id, kind, bound_row_id, bound_col_key, x, y, w, h, z, content, style')
        .eq('figure_id', figureId)
        .order('z');
      if (error) throw error;
      return data ?? [];
    },
  });

  const busyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef({ content, onUpdate, figureNumber, widthCm, heightCm });
  latestRef.current = { content, onUpdate, figureNumber, widthCm, heightCm };

  const signature =
    elements === undefined
      ? null
      : canvasSignature(elements as Array<Record<string, unknown>>, widthCm, heightCm);

  useEffect(() => {
    if (!canEdit || !signature) return;
    const c = (latestRef.current.content ?? {}) as Record<string, unknown>;
    const upToDate = !!c.imageUrl && c.renderSignature === signature;
    if (upToDate) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      timerRef.current = null;
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const { figureNumber: fn, widthCm: w, heightCm: h, content: cur, onUpdate: up } =
          latestRef.current;
        const storagePath = await rasteriseAndUploadCanvasFigure(qc, {
          proposalId,
          figureId,
          figureNumber: fn,
          widthCm: w,
          heightCm: h,
        });
        if (!storagePath) return;
        up({
          content: {
            ...((cur ?? {}) as Record<string, unknown>),
            imageUrl: storagePath,
            renderSignature: signature,
          },
        });
      } catch (e) {
        console.warn('Canvas figure rasterisation failed', e);
      } finally {
        busyRef.current = false;
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [signature, canEdit, proposalId, figureId, qc]);

  return null;
}
