/**
 * THROWAWAY SPIKE PAGE — /typst-spike
 * Not linked from anywhere. Proves in-browser Typst → PDF generation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download, Play } from 'lucide-react';
import { compileSpikePdf, type CompileTimings } from '@/lib/typstSpike';

export default function TypstSpike() {
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timings, setTimings] = useState<CompileTimings | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const compile = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { pdf, timings: t } = await compileSpikePdf({ watermark }, setStage);
      bytesRef.current = pdf;
      const blob = new Blob([pdf.slice() as unknown as BlobPart], { type: 'application/pdf' });
      setUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      setTimings(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }, [watermark]);

  const download = useCallback(() => {
    if (!bytesRef.current) return;
    const blob = new Blob([bytesRef.current.slice() as unknown as BlobPart], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'typst-spike.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Typst PDF spike</h1>
        <p className="text-sm text-muted-foreground">
          Client-side Typst (WebAssembly) → PDF. Throwaway proof of concept; not wired to any
          proposal data or to the existing export.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Button onClick={compile} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
            Compile
          </Button>
          <Button variant="secondary" onClick={download} disabled={!url}>
            <Download className="mr-2 size-4" /> Download PDF
          </Button>
          <div className="flex items-center gap-2">
            <Switch id="wm" checked={watermark} onCheckedChange={setWatermark} />
            <Label htmlFor="wm">Watermark</Label>
          </div>
          {stage && <span className="text-sm text-muted-foreground">{stage}</span>}
        </CardContent>
      </Card>

      {timings && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Timing</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div>Compile: <strong>{timings.compileMs} ms</strong></div>
            <div>Init (first run only): <strong>{timings.initMs} ms</strong></div>
            <div>Total: <strong>{timings.totalMs} ms</strong></div>
            <div>Pages: <strong>{timings.pageCount}</strong></div>
            <div>PDF size: <strong>{(timings.pdfBytes / 1024).toFixed(0)} KB</strong></div>
            <div>WASM downloaded: <strong>{(timings.wasmBytes / 1048576).toFixed(1)} MB</strong></div>
          </CardContent>
        </Card>
      )}

      {error && (
        <pre className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </pre>
      )}

      {url && (
        <object data={url} type="application/pdf" className="h-[80vh] w-full rounded-md border">
          <a href={url}>Open PDF</a>
        </object>
      )}
    </main>
  );
}
