/**
 * The full Part B document: all six sections compiled into one PDF and shown
 * in the editor frame, with a hovering Export button.
 *
 * The Gantt is the only figure still rasterised from live DOM, and it lives on
 * the B3.1 board — which is not mounted here. It is therefore rendered into an
 * off-screen host below (positioned off-canvas rather than `display: none`, so
 * it has a real measured size) and captured with the same utility the board
 * export uses.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileType, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { publishCompiledPageCount } from '@/hooks/usePageCount';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useReferenceData } from '@/lib/referenceData';
import { useB31SectionData } from '@/hooks/useB31SectionData';
import { GanttChartFigure } from '@/components/GanttChartFigure';
import { PartBExportDialog } from '@/components/cards/PartBExportDialog';
import {
  buildPartBTypstDocument,
  exportFileStem,
  fetchPartBSections,
  EMPTY_SELECTION,
  type PartBExportSelection,
} from '@/lib/typst/partBDocument';

interface Props {
  proposalId: string;
  proposalAcronym?: string;
  /** Coordinators and above may export without a watermark. */
  isCoordinator: boolean;
  /** Opens the legacy Word/print export dialog (draft circulation). */
  onWordExport?: () => void;
}

interface Stats {
  compileMs: number;
  totalMs: number;
  pages: number;
  sourceChars: number;
  blockCount: number;
  unsupported: string[];
}

export function PartBDocumentView({ proposalId, proposalAcronym, isCoordinator, onWordExport }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: refData } = useReferenceData(proposalId);
  const { ganttFigure, loading: b31Loading } = useB31SectionData(proposalId);
  // The off-screen Gantt host has to be PAINTED before the raster is taken.
  // Without this gate the first compile ran in the same tick the host mounted,
  // `captureOne` found an element of zero height, and the document showed
  // "the chart was not on screen …" until you navigated away and back.
  const [ganttPainted, setGanttPainted] = useState(false);
  const ganttHostRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: sections = [] } = useQuery({
    queryKey: ['partb-sections', proposalId],
    enabled: !!proposalId,
    queryFn: () => fetchPartBSections(proposalId),
  });

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!ganttFigure) return;
    let cancelled = false;
    let frame = 0;
    let tries = 0;
    // Two frames after layout is the usual case; poll a little longer because
    // the chart measures itself and reflows once its fonts resolve.
    const check = () => {
      if (cancelled) return;
      const el = ganttHostRef.current?.querySelector<HTMLElement>('[data-figure-chart="gantt"]');
      if (el && el.offsetHeight > 0 && el.offsetWidth > 0) {
        setGanttPainted(true);
        return;
      }
      if (tries++ > 120) return; // ~2s at 60fps: give up and compile without it
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [ganttFigure]);

  const compile = useCallback(
    async (selection: PartBExportSelection, watermark: boolean) => {
      const started = performance.now();
      const [{ compileTypstToPdf }, { captureFigureAssets }] = await Promise.all([
        import('@/lib/typst/typstCompiler'),
        import('@/lib/typst/typstFigures'),
      ]);
      const captured = await captureFigureAssets(['gantt']);
      const built = await buildPartBTypstDocument({
        proposalId,
        sections,
        refData,
        selection,
        watermark,
        figureAssets: captured.assets,
      });
      const { pdf, compileMs } = await compileTypstToPdf(built.source, built.assets);
      return { pdf, compileMs, built, started };
    },
    [proposalId, sections, refData],
  );

  const runPreview = useCallback(async () => {
    if (!sections.length) return;
    setStatus('running');
    setError(null);
    try {
      const { pdf, compileMs, built, started } = await compile(EMPTY_SELECTION, false);
      const container = previewRef.current;
      if (!container) throw new Error('Preview container unavailable');
      const { renderPdfToContainer } = await import('@/lib/typst/pdfCanvasPreview');
      const pages = await renderPdfToContainer(pdf, container);
      setStats({
        compileMs,
        totalMs: Math.round(performance.now() - started),
        pages,
        sourceChars: built.source.length,
        blockCount: built.blockCount,
        unsupported: built.unsupported,
      });
      // The authoritative count for the whole editor chrome.
      publishCompiledPageCount(queryClient, proposalId, pages);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [compile, sections.length, queryClient, proposalId]);

  // Compile only once the figure data has settled AND, when there is a Gantt,
  // its off-screen host has actually painted.
  const figuresReady = !b31Loading && (!ganttFigure || ganttPainted);

  useEffect(() => {
    if (status === 'idle' && sections.length && figuresReady) void runPreview();
  }, [status, sections.length, figuresReady, runPreview]);

  const handleExport = async (selection: PartBExportSelection, watermark: boolean) => {
    setExporting(true);
    try {
      const { pdf } = await compile(selection, watermark);
      const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlRef.current;
      link.download = `${exportFileStem(proposalAcronym || '')}.pdf`;
      link.click();
      setExportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const ganttHost = useMemo(
    () =>
      ganttFigure ? (
        <div
          aria-hidden
          ref={ganttHostRef}
          style={{ position: 'fixed', left: -20000, top: 0, width: 1400, pointerEvents: 'none' }}
        >
          {/*
            The chart is 18cm wide with `maxWidth: 100%`, so the wrapper must
            SHRINK TO IT. A block wrapper took the host's full width and the
            capture carried a broad white margin, which Typst then scaled to
            the column — the Gantt looked narrow in the full document while
            filling the column in B3.1's own preview. `fit-content` makes both
            paths capture the same pixels.
          */}
          <div data-figure-chart="gantt" style={{ width: 'fit-content' }}>
            <GanttChartFigure
              figureId={ganttFigure.id}
              proposalId={proposalId}
              figureNumber={ganttFigure.figure_number}
              content={ganttFigure.content as never}
              onContentChange={() => {}}
              canEdit={false}
            />
          </div>
        </div>
      ) : null,
    [ganttFigure, proposalId],
  );

  return (
    <div className="relative flex-1 overflow-hidden bg-muted/30">
      {ganttHost}

      <div className="absolute right-6 top-4 z-20 flex items-center gap-2">
        {onWordExport && (
          <Button variant="outline" className="gap-2 shadow" onClick={onWordExport}>
            <FileType className="h-4 w-4" />
            Word draft
          </Button>
        )}
        <Button
          className="gap-2 shadow"
          disabled={status === 'running' || !sections.length}
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {status === 'running' && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Compiling the full Part B document&hellip;
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3 p-6">
          <p className="text-sm font-medium text-destructive">Compilation failed</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
            {error}
          </pre>
          <Button size="sm" variant="outline" onClick={() => void runPreview()}>
            Try again
          </Button>
        </div>
      )}

      <div className="h-full overflow-y-auto px-6 pb-6 pt-4">
        <div ref={previewRef} className="mx-auto max-w-[900px]" />
        {status === 'done' && stats && (
          <p className="mx-auto max-w-[900px] py-3 text-xs text-muted-foreground">
            {stats.pages} pages &middot; {stats.blockCount} blocks &middot;{' '}
            {stats.sourceChars.toLocaleString()} characters of Typst &middot; compile{' '}
            {stats.compileMs} ms &middot; total {stats.totalMs} ms
            {stats.unsupported.length ? ` · not converted: ${stats.unsupported.join(', ')}` : ''}
          </p>
        )}
      </div>

      <PartBExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        proposalId={proposalId}
        userId={user?.id}
        sections={sections}
        canChooseWatermark={isCoordinator}
        busy={exporting}
        onExport={(selection, watermark) => void handleExport(selection, watermark)}
      />
    </div>
  );
}

export default PartBDocumentView;
