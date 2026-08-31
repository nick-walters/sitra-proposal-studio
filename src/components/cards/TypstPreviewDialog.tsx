/**
 * TEMPORARY (Phase 5, step 1): compiles the current section's block tree with
 * the in-browser Typst compiler and shows the resulting PDF.
 *
 * Platform-owner only, and entirely separate from the existing browser-print
 * PDF path — `printRenderer` and `usePdfExport` are untouched. Read-only: no
 * database writes happen anywhere in this flow.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useReferenceData } from '@/lib/referenceData';
import { publishCompiledSectionPageCount } from '@/hooks/usePageCount';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  sectionId: string;
  /** Section NUMBER ("B1.1") — the key the page-count cache uses. */
  sectionNumber?: string;
  sectionLabel?: string;
}

interface Stats {
  compileMs: number;
  totalMs: number;
  sourceChars: number;
  blockCount: number;
  unsupported: string[];
}

export function TypstPreviewDialog({
  open,
  onOpenChange,
  proposalId,
  sectionId,
  sectionNumber,
  sectionLabel,
}: Props) {
  const { data: refData } = useReferenceData(proposalId);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const run = async () => {
    setStatus('running');
    setError(null);
    const started = performance.now();
    try {
      // ONE render path: a section is assembled here exactly as the full Part
      // B document assembles it (`sectionRender.ts`). The only difference is
      // that this preview wraps the single body in its own preamble.
      const [{ fetchSharedRenderData, renderSectionBody }, { buildTypstPreamble }, { compileTypstToPdf }] =
        await Promise.all([
          import('@/lib/typst/sectionRender'),
          import('@/lib/typst/typstPreamble'),
          import('@/lib/typst/typstCompiler'),
        ]);

      const shared = await fetchSharedRenderData(proposalId);
      const built = await renderSectionBody({
        proposalId,
        sectionId,
        sectionLabel,
        refData,
        shared,
      });

      const source = `${buildTypstPreamble(built.meta)}\n${built.source}\n`;
      const { pdf, compileMs } = await compileTypstToPdf(source, [
        ...shared.figureAssets,
        ...built.assets,
      ]);

      const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPdfUrl(urlRef.current);
      const previewContainer = previewRef.current;
      if (!previewContainer) throw new Error('Preview canvas container unavailable');
      // Render with PDF.js rather than an iframe: the built-in PDF viewer is a
      // plugin whose blob-URL-in-iframe support varies by browser (absent
      // entirely in headless Chromium and Safari), which showed a blank frame
      // for a perfectly valid document.
      const { renderPdfToContainer } = await import('@/lib/typst/pdfCanvasPreview');
      const pages = await renderPdfToContainer(pdf, previewContainer);
      setPageCount(pages);
      // The section's REAL page cost, shown in the editor chrome next to the
      // whole-document count.
      if (sectionNumber) publishCompiledSectionPageCount(queryClient, proposalId, sectionNumber, pages);
      setStats({
        compileMs,
        totalMs: Math.round(performance.now() - started),
        sourceChars: built.source.length,
        blockCount: built.blockCount,
        unsupported: built.unsupported,
      });
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  useEffect(() => {
    if (open && status === 'idle') void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Typst preview (beta)</DialogTitle>
          <DialogDescription>
            Compiles this section&rsquo;s blocks with the in-browser Typst engine. Read-only; the
            existing PDF export is unaffected.
          </DialogDescription>
        </DialogHeader>

        {status === 'running' && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the compiler and rendering&hellip;
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3 py-4">
            <p className="text-sm font-medium text-destructive">Compilation failed</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
              {error}
            </pre>
            <Button size="sm" variant="outline" onClick={() => void run()}>
              Try again
            </Button>
          </div>
        )}

        <div
          className={status === 'done' && pdfUrl ? 'space-y-3' : 'invisible absolute inset-x-6'}
          aria-hidden={status !== 'done'}
        >
            <div ref={previewRef} className="min-h-1 max-h-[65vh] overflow-y-auto" />
          {status === 'done' && pdfUrl && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {stats?.blockCount} blocks &middot; {stats?.sourceChars.toLocaleString()} characters of
                Typst &middot; compile {stats?.compileMs} ms &middot; total {stats?.totalMs} ms
                {pageCount != null ? ` · ${pageCount} page${pageCount === 1 ? '' : 's'}` : ''}
                {stats?.unsupported.length
                  ? ` · not converted: ${stats.unsupported.join(', ')}`
                  : ' · everything in this section converted'}
              </p>
              <Button size="sm" variant="outline" asChild>
                <a href={pdfUrl} download="typst-preview.pdf">Download PDF</a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TypstPreviewDialog;
