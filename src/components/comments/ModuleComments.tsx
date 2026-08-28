import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MessageSquare, MessageSquarePlus, Check, Trash2, X, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useSectionComments, type Comment } from '@/hooks/useSectionComments';
import {
  MODULE_ANCHOR_TYPE,
  type ModuleAnchorPayload,
} from '@/lib/moduleCommentTargets';

/* ==================================================================== */
/* Context                                                              */
/* ==================================================================== */

interface RegistryEntry {
  label: string;
  el: HTMLElement;
}

interface ModuleCommentsValue {
  enabled: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
  canEdit: boolean;
  canResolveAny: boolean;
  userId: string | null;
  openCount: number;
  /** Threads grouped by target key, parents only. */
  threadsFor: (targetKey: string) => Comment[];
  register: (targetKey: string, label: string, el: HTMLElement | null) => void;
  startComposer: (targetKey: string, label: string) => void;
}

const Ctx = createContext<ModuleCommentsValue | null>(null);

/** Safe in surfaces that have not been wired yet — everything turns into a no-op. */
export function useModuleComments(): ModuleCommentsValue {
  return (
    useContext(Ctx) ?? {
      enabled: false,
      open: false,
      setOpen: () => {},
      canEdit: false,
      canResolveAny: false,
      userId: null,
      openCount: 0,
      threadsFor: () => [],
      register: () => {},
      startComposer: () => {},
    }
  );
}

/* ==================================================================== */
/* Provider                                                             */
/* ==================================================================== */

interface ProviderProps {
  proposalId: string;
  /** Part B: the template section id. WP/case drafts: the synthetic page id. */
  sectionId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  children: ReactNode;
}

interface InternalRegistry {
  map: Map<string, RegistryEntry>;
  version: number;
}

const RegistryCtx = createContext<{
  registry: React.MutableRefObject<Map<string, RegistryEntry>>;
  version: number;
} | null>(null);

export function ModuleCommentsProvider({
  proposalId,
  sectionId,
  canEdit,
  isCoordinator,
  children,
}: ProviderProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState<{ targetKey: string; label: string } | null>(null);
  const registry = useRef<Map<string, RegistryEntry>>(new Map());
  const [version, setVersion] = useState(0);
  const bump = useRef<number>();

  const comments = useSectionComments({ proposalId, sectionId });

  const byTarget = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of comments.comments) {
      if (c.anchor_type !== (MODULE_ANCHOR_TYPE as unknown as Comment['anchor_type'])) continue;
      const key = (c.anchor_payload as unknown as ModuleAnchorPayload | null)?.targetKey;
      if (!key) continue;
      const arr = m.get(key);
      if (arr) arr.push(c);
      else m.set(key, [c]);
    }
    return m;
  }, [comments.comments]);

  const openCount = useMemo(() => {
    let n = 0;
    for (const arr of byTarget.values()) n += arr.filter((c) => c.status === 'open').length;
    return n;
  }, [byTarget]);

  const register = useCallback((targetKey: string, label: string, el: HTMLElement | null) => {
    if (el) registry.current.set(targetKey, { label, el });
    else registry.current.delete(targetKey);
    // Batch the layout notification: a board mounts dozens of modules at once.
    window.clearTimeout(bump.current);
    bump.current = window.setTimeout(() => setVersion((v) => v + 1), 0);
  }, []);

  const startComposer = useCallback((targetKey: string, label: string) => {
    setOpen(true);
    setComposer({ targetKey, label });
  }, []);

  const threadsFor = useCallback((targetKey: string) => byTarget.get(targetKey) ?? [], [byTarget]);

  const value = useMemo<ModuleCommentsValue>(
    () => ({
      enabled: true,
      open,
      setOpen,
      canEdit,
      canResolveAny: isCoordinator,
      userId: user?.id ?? null,
      openCount,
      threadsFor,
      register,
      startComposer,
    }),
    [open, canEdit, isCoordinator, user?.id, openCount, threadsFor, register, startComposer],
  );

  return (
    <Ctx.Provider value={value}>
      <RegistryCtx.Provider value={{ registry, version }}>
        {children}
        {open && (
          <ModuleCommentsPanel
            byTarget={byTarget}
            api={comments}
            composer={composer}
            onCloseComposer={() => setComposer(null)}
          />
        )}
      </RegistryCtx.Provider>
    </Ctx.Provider>
  );
}

/* ==================================================================== */
/* The per-module anchor: registration, hover control, comment mark      */
/* ==================================================================== */

export function ModuleCommentAnchor({
  targetKey,
  label,
  children,
  className = '',
  /** Where the hover control sits relative to the module box. */
  offset = '-right-9 top-1',
}: {
  targetKey: string;
  label: string;
  children: ReactNode;
  className?: string;
  offset?: string;
}) {
  const { enabled, register, startComposer, threadsFor, canEdit, setOpen } = useModuleComments();
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    register(targetKey, label, ref.current);
    return () => register(targetKey, label, null);
  }, [enabled, register, targetKey, label]);

  const threads = threadsFor(targetKey);
  const openThreads = threads.filter((t) => t.status === 'open').length;

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={ref}
      data-comment-target={targetKey}
      className={`group/comment relative ${
        openThreads > 0 ? 'rounded-[3px] shadow-[inset_3px_0_0_0_hsl(38_92%_50%)]' : ''
      } ${className}`}
    >
      {children}
      <div className={`absolute ${offset} z-10 flex flex-col items-center gap-1`}>
        {openThreads > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-bold text-amber-700"
              >
                {openThreads}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {openThreads} open comment{openThreads === 1 ? '' : 's'}
            </TooltipContent>
          </Tooltip>
        )}
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => startComposer(targetKey, label)}
                className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover/comment:flex"
                aria-label="Comment on this module"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Comment on this module</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* The panel                                                            */
/* ==================================================================== */

const PANEL_WIDTH = 320;

type CommentsApi = ReturnType<typeof useSectionComments>;

function ModuleCommentsPanel({
  byTarget,
  api,
  composer,
  onCloseComposer,
}: {
  byTarget: Map<string, Comment[]>;
  api: CommentsApi;
  composer: { targetKey: string; label: string } | null;
  onCloseComposer: () => void;
}) {
  const { setOpen, canEdit, canResolveAny, userId, openCount } = useModuleComments();
  const reg = useContext(RegistryCtx);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [layout, setLayout] = useState<{ key: string; y: number; inView: boolean }[]>([]);

  /**
   * Comments track their module: every frame that could have moved the page,
   * each card is re-placed at its module's viewport position. A module that
   * has scrolled out of view keeps its card clamped to the nearest edge and
   * dimmed, rather than dropping out of the list.
   */
  useEffect(() => {
    if (!reg) return;
    let raf = 0;
    const measure = () => {
      const rail = railRef.current;
      if (!rail) return;
      const railRect = rail.getBoundingClientRect();
      const keys = new Set<string>([...byTarget.keys()]);
      if (composer) keys.add(composer.targetKey);
      const next: { key: string; y: number; inView: boolean }[] = [];
      for (const key of keys) {
        const entry = reg.registry.current.get(key);
        if (!entry) {
          next.push({ key, y: Number.POSITIVE_INFINITY, inView: false });
          continue;
        }
        const r = entry.el.getBoundingClientRect();
        const raw = r.top - railRect.top;
        const inView = r.bottom > railRect.top && r.top < railRect.bottom;
        next.push({ key, y: Math.max(0, Math.min(raw, railRect.height - 48)), inView });
      }
      next.sort((a, b) => a.y - b.y);
      // Stack: never let two cards overlap.
      let cursor = 0;
      const packed = next.map((n) => {
        const y = Math.max(n.y, cursor);
        cursor = y + 8;
        return { ...n, y: Number.isFinite(n.y) ? y : cursor };
      });
      setLayout((prev) =>
        prev.length === packed.length && prev.every((p, i) => p.key === packed[i].key && p.y === packed[i].y && p.inView === packed[i].inView)
          ? prev
          : packed,
      );
      raf = window.requestAnimationFrame(measure);
    };
    raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
  }, [reg, byTarget, composer]);

  const orphanLabel = (key: string) =>
    (byTarget.get(key)?.[0]?.anchor_payload as unknown as ModuleAnchorPayload | null)?.label ??
    'Deleted module';

  return (
    <aside
      className="fixed bottom-4 right-3 top-28 z-30 flex flex-col rounded-md border border-border bg-background/95 shadow-lg backdrop-blur print:hidden"
      style={{ width: PANEL_WIDTH }}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {openCount} open comment{openCount === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div ref={railRef} className="relative flex-1 overflow-y-auto overflow-x-hidden">
        {layout.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            No comments yet. Hover a module and use the comment control to leave one.
          </p>
        )}
        {layout.map(({ key, y, inView }) => {
          const threads = (byTarget.get(key) ?? []).filter(
            (t) => showResolved || t.status === 'open',
          );
          const isComposer = composer?.targetKey === key;
          if (threads.length === 0 && !isComposer) return null;
          const missing = !reg?.registry.current.get(key);
          return (
            <div
              key={key}
              className={`absolute inset-x-2 transition-[top,opacity] duration-150 ${
                inView ? '' : 'opacity-40'
              }`}
              style={{ top: y }}
            >
              {missing && (
                <p className="mb-1 text-[10px] italic text-muted-foreground">
                  {orphanLabel(key)} — in the bin, returns with the module
                </p>
              )}
              <div className="space-y-2">
                {threads.map((t) => (
                  <ThreadCard
                    key={t.id}
                    thread={t}
                    api={api}
                    canEdit={canEdit}
                    canResolveAny={canResolveAny}
                    userId={userId}
                    showResolved={showResolved}
                  />
                ))}
                {isComposer && (
                  <Composer
                    label={composer.label}
                    onCancel={onCloseComposer}
                    onSubmit={async (text) => {
                      await api.addComment(text, {
                        anchorType: MODULE_ANCHOR_TYPE as never,
                        anchorPayload: {
                          targetKey: composer.targetKey,
                          label: composer.label,
                        } as never,
                      });
                      onCloseComposer();
                      api.refetch();
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ==================================================================== */
/* Thread and composer                                                  */
/* ==================================================================== */

function ThreadCard({
  thread,
  api,
  canEdit,
  canResolveAny,
  userId,
  showResolved,
}: {
  thread: Comment;
  api: CommentsApi;
  canEdit: boolean;
  canResolveAny: boolean;
  userId: string | null;
  showResolved: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const isAuthor = !!userId && thread.user_id === userId;
  const mayResolve = isAuthor || canResolveAny;
  const resolved = thread.status !== 'open';

  return (
    <div
      className={`rounded-md border bg-card p-2 text-xs shadow-sm ${
        resolved ? 'border-dashed border-border opacity-70' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="truncate font-medium">{thread.user_name}</span>
        {resolved && <span className="text-[10px] uppercase text-emerald-600">resolved</span>}
        <span className="ml-auto flex items-center gap-0.5">
          {mayResolve && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              title={resolved ? 'Reopen' : 'Resolve'}
              onClick={() => api.updateCommentStatus(thread.id, resolved ? 'open' : 'resolved')}
            >
              <Check className={`h-3 w-3 ${resolved ? 'text-muted-foreground' : 'text-emerald-600'}`} />
            </Button>
          )}
          {isAuthor && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive"
              title="Delete this comment"
              onClick={() => api.deleteComment(thread.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words">{thread.content}</p>

      {(thread.replies ?? [])
        .filter((r) => showResolved || r.status === 'open')
        .map((r) => (
          <div key={r.id} className="mt-1.5 flex gap-1 border-l border-border pl-2">
            <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <span className="font-medium">{r.user_name}</span>
              <p className="whitespace-pre-wrap break-words">{r.content}</p>
            </div>
            {!!userId && r.user_id === userId && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-5 w-5 text-destructive"
                title="Delete this reply"
                onClick={() => api.deleteComment(r.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}

      {canEdit && !resolved && (
        replying ? (
          <Composer
            compact
            onCancel={() => setReplying(false)}
            onSubmit={async (text) => {
              await api.addComment(text, {
                parentCommentId: thread.id,
                anchorType: thread.anchor_type as never,
                anchorPayload: thread.anchor_payload as never,
              });
              setReplying(false);
              api.refetch();
            }}
          />
        ) : (
          <button
            type="button"
            className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setReplying(true)}
          >
            Reply
          </button>
        )
      )}
    </div>
  );
}

function Composer({
  label,
  compact = false,
  onSubmit,
  onCancel,
}: {
  label?: string;
  compact?: boolean;
  onSubmit: (text: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className={compact ? 'mt-1.5' : 'rounded-md border border-border bg-card p-2 shadow-sm'}>
      {label && !compact && (
        <p className="mb-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <Textarea
        autoFocus
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        placeholder={compact ? 'Reply…' : 'Leave a comment on this module…'}
        className="min-h-0 text-xs"
      />
      <div className="mt-1 flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 text-xs"
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true);
            await onSubmit(text.trim());
            setBusy(false);
            setText('');
          }}
        >
          {compact ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </div>
  );
}
