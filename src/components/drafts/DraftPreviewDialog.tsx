/**
 * Per-draft Typst preview: one work package, or one case.
 *
 * Same dialog shape, same canvas renderer (`pdfCanvasPreview`) and same
 * download control as Part B's preview — only the SOURCE differs, and that
 * comes from `draftDocument.ts`, which reuses the very emitters B3.1 and B1.2
 * use so a draft preview and the Part B mirror cannot drift apart.
 */

import { useEffect, useRef, useState } from 'react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  /** Exactly one of these identifies the draft. */
  wpId?: string;
  caseId?: string;
}

export function DraftPreviewDialog({ open, onOpenChange, proposalId, wpId, caseId }: Props) {
  const { data: refData } = useReferenceData(proposalId);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('draft.pdf');
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [unsupported, setUnsupported] = useState<string[]>([]);
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
    try {
      const [
        { buildWpDraftTypstDocument, buildCaseDraftTypstDocument, draftFileStem },
        { compileTypstToPdf },
      ] = await Promise.all([
        import('@/lib/typst/draftDocument'),
        import('@/lib/typst/typstCompiler'),
      ]);

      const built = wpId
        ? await buildWpDraftTypstDocument({ proposalId, wpId, refData })
        : await buildCaseDraftTypstDocument({ proposalId, caseId: caseId as string, refData });

      const { pdf } = await compileTypstToPdf(built.source, built.assets);
      const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPdfUrl(urlRef.current);
      setFileName(`${draftFileStem(built.acronym, built.label)}.pdf`);
      setUnsupported(built.unsupported);

      const container = previewRef.current;
      if (!container) throw new Error('Preview canvas container unavailable');
      const { renderPdfToContainer } = await import('@/lib/typst/pdfCanvasPreview');
      setPageCount(await renderPdfToContainer(pdf, container));
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
          <DialogTitle>Draft preview</DialogTitle>
          <DialogDescription>
            This draft as Part B will print it. Hidden modules and pending tracked changes are left
            out, exactly as they are from the Part B preview.
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
                {pageCount != null ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : ''}
                {unsupported.length ? ` · not converted: ${unsupported.join(', ')}` : ''}
              </p>
              <Button size="sm" variant="outline" asChild>
                <a href={pdfUrl} download={fileName}>
                  Download PDF
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DraftPreviewDialog;
