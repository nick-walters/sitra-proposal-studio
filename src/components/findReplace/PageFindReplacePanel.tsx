/**
 * Page-wide find and replace.
 *
 * Searches the STORED content of every field the page registered, so
 * collapsed blocks and unmounted editors are included. Navigation reveals a
 * match (expand, mount, scroll); replacement goes through each field's own
 * conflict-checked save path, and a rejected write is reported rather than
 * forced.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  EyeOff,
  GripHorizontal,
  Regex,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePageSearch } from '@/lib/findReplace/PageSearchProvider';
import { replaceInField, searchFields, type FieldResult } from '@/lib/findReplace/search';
import type { SearchOptions } from '@/lib/findReplace/types';

interface ReplaceOutcome {
  fieldsWritten: number;
  matchesWritten: number;
  conflicts: string[];
  errors: string[];
}

export function PageFindReplacePanel() {
  const ctx = usePageSearch();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  /** Bumped after every write so the field list is re-read and re-searched. */
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = ctx?.open ?? false;

  const result = useMemo(() => {
    if (!ctx || !open || !query) return null;
    // refreshNonce is a deliberate dependency: re-read stored values after writes.
    void refreshNonce;
    return searchFields(ctx.getFields(), query, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, open, query, options, refreshNonce]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [query, options.caseSensitive, options.wholeWord, options.useRegex]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const flat = result?.flat ?? [];
  const total = flat.length;
  const current = total > 0 ? flat[Math.min(currentIndex, total - 1)] : null;

  const reveal = useCallback(async (index: number) => {
    const entry = flat[index];
    if (!entry) return;
    try {
      await entry.field.reveal?.();
    } catch {
      /* revealing is best effort — the match is still listed */
    }
  }, [flat]);

  const goTo = useCallback(
    (index: number) => {
      if (total === 0) return;
      const next = ((index % total) + total) % total;
      setCurrentIndex(next);
      void reveal(next);
    },
    [total, reveal],
  );

  const writeField = useCallback(
    async (fieldResult: FieldResult, nextValue: string, matchCount: number, outcome: ReplaceOutcome) => {
      const field = fieldResult.field;
      if (!field.save || field.readOnly) {
        outcome.errors.push(`${field.label} is read-only`);
        return;
      }
      const res = (await field.save(nextValue)) as {
        ok: boolean;
        conflict?: boolean;
        error?: string;
      };
      if (res.ok) {
        outcome.fieldsWritten += 1;
        outcome.matchesWritten += matchCount;
      } else if (res.conflict) {
        outcome.conflicts.push(field.label);
      } else {
        outcome.errors.push(`${field.label}: ${res.error ?? 'could not save'}`);
      }

    },
    [],
  );

  const reportOutcome = useCallback((outcome: ReplaceOutcome) => {
    setRefreshNonce((n) => n + 1);
    const { fieldsWritten, matchesWritten, conflicts, errors } = outcome;
    if (conflicts.length === 0 && errors.length === 0) {
      toast.success(
        `Replaced ${matchesWritten} ${matchesWritten === 1 ? 'match' : 'matches'} in ` +
          `${fieldsWritten} ${fieldsWritten === 1 ? 'field' : 'fields'}.`,
      );
      return;
    }
    // A partial failure is reported in full: what was written stays written,
    // what was rejected is named so the user can reopen it and redo the edit.
    const parts: string[] = [];
    if (fieldsWritten > 0) parts.push(`${matchesWritten} replaced in ${fieldsWritten} field(s)`);
    if (conflicts.length > 0) parts.push(`${conflicts.length} rejected as out of date: ${conflicts.join(', ')}`);
    if (errors.length > 0) parts.push(`${errors.length} failed: ${errors.join('; ')}`);
    toast.warning(parts.join(' · '), { duration: 12000 });
  }, []);

  const replaceCurrent = useCallback(async () => {
    if (!result || !current) return;
    const fieldResult = result.results.find((r) => r.field.id === current.field.id);
    if (!fieldResult) return;
    setBusy(true);
    const outcome: ReplaceOutcome = { fieldsWritten: 0, matchesWritten: 0, conflicts: [], errors: [] };
    try {
      const next = replaceInField(fieldResult, [current.match], query, replacement, options);
      await writeField(fieldResult, next, 1, outcome);
    } finally {
      setBusy(false);
    }
    reportOutcome(outcome);
  }, [result, current, query, replacement, options, writeField, reportOutcome]);

  const replaceAll = useCallback(async () => {
    if (!result) return;
    setBusy(true);
    const outcome: ReplaceOutcome = { fieldsWritten: 0, matchesWritten: 0, conflicts: [], errors: [] };
    try {
      for (const fieldResult of result.results) {
        const next = replaceInField(fieldResult, fieldResult.matches, query, replacement, options);
        await writeField(fieldResult, next, fieldResult.matches.length, outcome);
      }
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
    reportOutcome(outcome);
  }, [result, query, replacement, options, writeField, reportOutcome]);

  // Drag handling — the panel floats so it never covers the match it reveals.
  const [position, setPosition] = useState({ x: 0, y: 96 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  useEffect(() => {
    if (open && !placed.current) {
      setPosition({ x: Math.max(16, window.innerWidth - 480), y: 96 });
      placed.current = true;
    }
  }, [open]);

  useEffect(() => {
    if (!dragging.current) return;
    const move = (e: MouseEvent) =>
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ctx?.setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ctx]);

  if (!ctx || !open) return null;

  const toggle = (key: keyof SearchOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const optionButton = (key: keyof SearchOptions, icon: JSX.Element, tip: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={options[key] ? 'default' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggle(key)}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );

  return createPortal(
    <>
      <div
        ref={panelRef}
        className="fixed z-50 w-[460px] rounded-lg border border-border bg-background shadow-xl"
        style={{ left: position.x, top: position.y }}
      >
        <div
          className="flex cursor-move items-center gap-2 border-b border-border px-3 py-2"
          onMouseDown={(e) => {
            const rect = panelRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            dragging.current = true;
          }}
        >
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">Find &amp; replace on this page</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={() => ctx.setOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-2 p-3">
          <div className="flex items-center gap-1.5">
            <Input
              ref={inputRef}
              value={query}
              placeholder="Find in every field on this page"
              className="h-8"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  goTo(e.shiftKey ? currentIndex - 1 : currentIndex + 1);
                }
              }}
            />
            {optionButton('caseSensitive', <CaseSensitive className="h-3.5 w-3.5" />, 'Match case')}
            {optionButton('wholeWord', <WholeWord className="h-3.5 w-3.5" />, 'Whole word')}
            {optionButton('useRegex', <Regex className="h-3.5 w-3.5" />, 'Regular expression')}
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              value={replacement}
              placeholder="Replace with"
              className="h-8"
              onChange={(e) => setReplacement(e.target.value)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={!current || busy}
                  onClick={() => void replaceCurrent()}
                >
                  <Replace className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Replace this match</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={total === 0 || busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  <ReplaceAll className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Replace all</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {result?.regexError ? (
              <span className="text-destructive">{result.regexError}</span>
            ) : (
              <span>
                {total === 0
                  ? query
                    ? 'No matches'
                    : 'Type to search'
                  : `Match ${Math.min(currentIndex + 1, total)} of ${total} in ${result?.fieldsWithMatches} field(s)`}
              </span>
            )}
            {(result?.hiddenMatches ?? 0) > 0 && (
              <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                <EyeOff className="h-3 w-3" />
                {result?.hiddenMatches} in hidden blocks
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={total === 0}
                onClick={() => goTo(currentIndex - 1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={total === 0}
                onClick={() => goTo(currentIndex + 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {total > 0 && (
            <ScrollArea className="max-h-56 rounded-md border border-border">
              <div className="divide-y divide-border">
                {flat.map((entry, index) => (
                  <button
                    key={`${entry.field.id}:${entry.match.indexInField}`}
                    type="button"
                    className={`block w-full px-2.5 py-1.5 text-left text-xs hover:bg-muted ${
                      index === currentIndex ? 'bg-muted' : ''
                    }`}
                    onClick={() => goTo(index)}
                  >
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {entry.field.label}
                      {entry.field.hidden && (
                        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                          <EyeOff className="h-2.5 w-2.5" />
                          hidden
                        </Badge>
                      )}
                      {entry.field.readOnly && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          read-only
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground">{entry.match.snippet}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all matches on this page?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This replaces <strong>{total}</strong> {total === 1 ? 'match' : 'matches'} across{' '}
                  <strong>{result?.fieldsWithMatches ?? 0}</strong>{' '}
                  {result?.fieldsWithMatches === 1 ? 'field' : 'fields'}, including fields you have
                  not opened.
                </p>
                {(result?.hiddenMatches ?? 0) > 0 && (
                  <p>
                    <strong>{result?.hiddenMatches}</strong>{' '}
                    {result?.hiddenMatches === 1 ? 'match sits' : 'matches sit'} in{' '}
                    <strong>{result?.hiddenFields}</strong> hidden{' '}
                    {result?.hiddenFields === 1 ? 'field' : 'fields'}, whose text does not appear in
                    the exported document.
                  </p>
                )}
                <p className="text-muted-foreground">
                  Each write is version-checked. Any field changed by somebody else in the meantime
                  is rejected and reported, never overwritten.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void replaceAll();
              }}
            >
              Replace all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    document.body,
  );
}
