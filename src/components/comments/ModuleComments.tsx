/**
 * MODULE-ANCHORED COMMENTS
 *
 * A comment anchors to a module — a `card_fields` row on Part B, or the
 * equivalent generic target on work package and case drafts (`wp:<id>:objectives`,
 * `wp_task:<id>:description`, `case:<id>:<key>`, `card:<id>:title`, …).
 *
 * Module anchoring is indestructible: editing, reordering, binning, restoring
 * and version history all leave the target id untouched, so nothing ever has
 * to be re-anchored by guesswork.
 *
 * Storage: the existing `section_comments` table, with `anchor_type = 'module'`
 * and `anchor_payload = { targetKey, label }`. Threading, replies, resolve and
 * realtime all come from `useSectionComments` unchanged.
 */
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
import { createPortal } from 'react-dom';
import { MessageSquarePlus, X, Check, Trash2, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useSectionComments, type Comment } from '@/hooks/useSectionComments';
import {
  MODULE_ANCHOR_TYPE,
  type ModuleAnchorPayload,
} from '@/lib/moduleCommentTargets';

/* ---------------------------------------------------------------- context */

interface ModuleCommentsCtx {
  enabled: true;
  open: boolean;
  setOpen: (v: boolean) => void;
  openCount: number;
  canEdit: boolean;
  /** Register a module's DOM element so its comments can track it. */
  register: (targetKey: string, el: HTMLElement | null) => void;
  /** Threads anchored to one module. */
  threadsFor: (targetKey: string) => Comment[];
  startComposing: (targetKey: string, label: string) => void;
}

const Ctx = createContext<ModuleCommentsCtx | null>(null);

export function useModuleComments() {
  return useContext(Ctx);
}

const payloadOf = (c: Comment): ModuleAnchorPayload | null =>
  c.anchor_type === MODULE_ANCHOR_TYPE
    ? ((c.anchor_payload ?? null) as ModuleAnchorPayload | null)
    : null;

/* --------------------------------------------------------------- provider */

interface ProviderProps {
  proposalId: string;
  /** The surface the comments belong to (template section id, or a draft id). */
  sectionId: string;
  canEdit: boolean;
  /** Coordinator and above may resolve anyone's comment. */
  isCoordinator?: boolean;
  children: ReactNode;
}

export function ModuleCommentsProvider({
  proposalId,
  sectionId,
  canEdit,
  isCoordinator = false,
  children,
}: ProviderProps) {
  const {
    comments,
    addComment,
    updateCommentStatus,
    deleteComment,
    refetch,
  } = useSectionComments({ proposalId, sectionId });

  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState<ModuleAnchorPayload | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  /** Bumped whenever anchors move, so the rail re-measures. */
  const [tick, setTick] = useState(0);

  const register = useCallback((targetKey: string, el: HTMLElement | null) => {
    if (el) elements.current.set(targetKey, el);
    else elements.current.delete(targetKey);
    setTick((t) => t + 1);
  }, []);

  const moduleThreads = useMemo(
    () => comments.filter((c) => payloadOf(c)?.targetKey),
    [comments],
  );

  const byTarget = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of moduleThreads) {
      const key = payloadOf(c)!.targetKey;
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return map;
  }, [moduleThreads]);

  const threadsFor = useCallback(
    (targetKey: string) => byTarget.get(targetKey) ?? [],
    [byTarget],
  );

  const openCount = moduleThreads.filter((c) => c.status === 'open').length;

  const startComposing = useCallback((targetKey: string, label: string) => {
    setOpen(true);
    setComposing({ targetKey, label });
  }, []);

  const ctx: ModuleCommentsCtx = {
    enabled: true,
    open,
    setOpen,
    openCount,
    canEdit,
    register,
    threadsFor,
    startComposing,
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {open && (
        <ModuleCommentsRail
          threads={moduleThreads}
          elements={elements}
          tick={tick}
          canEdit={canEdit}
          isCoordinator={isCoordinator}
          composing={composing}
          setComposing={setComposing}
          openCount={openCount}
          onClose={() => setOpen(false)}
          onAdd={async (content, payload, parentId) => {
            await addComment(content, {
              anchorType: MODULE_ANCHOR_TYPE,
              anchorPayload: payload,
              parentCommentId: parentId,
            });
            refetch();
          }}
          onResolve={updateCommentStatus}
          onDelete={deleteComment}
        />
      )}
    </Ctx.Provider>
  );
}

/* ----------------------------------------------------------------- anchor */

interface AnchorProps {
  targetKey: string;
  /** Human-readable name of the module, shown on the comment card. */
  label: string;
  children: ReactNode;
  className?: string;
  /** Where the hover control sits — defaults to the top right of the module. */
  controlClassName?: string;
}

/**
 * Wraps any commentable thing — a rich text module, a block title, a WP title
 * pill, a case header. Non-field elements are commentable through exactly this
 * wrapper: the anchor never touches the content it wraps, it only measures it.
 */
export function ModuleCommentAnchor({
  targetKey,
  label,
  children,
  className,
  controlClassName,
}: AnchorProps) {
  const ctx = useModuleComments();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ctx) return;
    ctx.register(targetKey, ref.current);
    return () => ctx.register(targetKey, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, ctx?.register]);

  if (!ctx) return <>{children}</>;

  const threads = ctx.threadsFor(targetKey);
  const openThreads = threads.filter((t) => t.status === 'open').length;

  return (
    <div
      ref={ref}
      data-comment-target={targetKey}
      className={`group/comment relative ${
        // Subtle mark so you can see at a glance which modules carry comments.
        openThreads > 0 ? 'rounded-[3px] ring-1 ring-amber-300/70' : ''
      } ${className ?? ''}`}
    >
      {children}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Comment on this module"
            onClick={() =>
              openThreads > 0 ? ctx.setOpen(true) : ctx.startComposing(targetKey, label)
            }
            className={`absolute -right-7 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover/comment:opacity-100 ${
              openThreads > 0 ? 'text-amber-600 opacity-100' : ''
            } ${controlClassName ?? ''}`}
          >
            <MessageSquarePlus className="h-4 w-4" />
            {openThreads > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-[14px] text-white">
                {openThreads}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {openThreads > 0 ? 'Open the comments panel' : `Comment on ${label}`}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/* ------------------------------------------------------------------- rail */

const RAIL_WIDTH = 320;
const CARD_GAP = 8;

interface RailProps {
  threads: Comment[];
  elements: React.MutableRefObject<Map<string, HTMLElement>>;
  tick: number;
  canEdit: boolean;
  isCoordinator: boolean;
  composing: ModuleAnchorPayload | null;
  setComposing: (v: ModuleAnchorPayload | null) => void;
  openCount: number;
  onClose: () => void;
  onAdd: (
    content: string,
    payload: ModuleAnchorPayload,
    parentId?: string,
  ) => Promise<void>;
  onResolve: (id: string, status: 'open' | 'resolved' | 'rejected') => void;
  onDelete: (id: string) => void;
}

function ModuleCommentsRail({
  threads,
  elements,
  tick,
  canEdit,
  isCoordinator,
  composing,
  setComposing,
  openCount,
  onClose,
  onAdd,
  onResolve,
  onDelete,
}: RailProps) {
  const [showResolved, setShowResolved] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  /** Anchor top per target, in rail coordinates; null when it is not on screen. */
  const [anchorTops, setAnchorTops] = useState<Record<string, number | null>>({});

  const visible = useMemo(
    () => threads.filter((t) => showResolved || t.status !== 'resolved'),
    [threads, showResolved],
  );

  // Measure the anchors on every scroll and resize, so the panel scrolls in
  // step with the document it annotates.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const rail = railRef.current;
      if (!rail) return;
      const railTop = rail.getBoundingClientRect().top;
      const next: Record<string, number | null> = {};
      for (const t of threads) {
        const key = payloadOf(t)?.targetKey;
        if (!key || key in next) continue;
        const el = elements.current.get(key);
        next[key] = el ? el.getBoundingClientRect().top - railTop : null;
      }
      setAnchorTops((prev) => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.entries(next).every(([k, v]) => prev[k] === v);
        return same ? prev : next;
      });
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const interval = window.setInterval(measure, 500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [threads, elements, tick]);

  // Lay the cards out: each sits beside its module, pushed down only as far as
  // the card above it requires.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const height = rail.clientHeight;
    const ordered = [...visible].sort((a, b) => {
      const ka = payloadOf(a)?.targetKey ?? '';
      const kb = payloadOf(b)?.targetKey ?? '';
      const ta = anchorTops[ka];
      const tb = anchorTops[kb];
      return (ta ?? Number.MAX_SAFE_INTEGER) - (tb ?? Number.MAX_SAFE_INTEGER);
    });
    const next: Record<string, number> = {};
    let cursor = 0;
    for (const t of ordered) {
      const key = payloadOf(t)?.targetKey ?? '';
      const el = cardRefs.current.get(t.id);
      const h = el?.offsetHeight ?? 96;
      // A module that is not in view clamps to the nearest rail edge rather
      // than disappearing; the card also dims (see below).
      const raw = anchorTops[key];
      const desired =
        raw === null || raw === undefined
          ? height - h
          : Math.min(Math.max(raw, 0), Math.max(height - h, 0));
      const y = Math.max(desired, cursor);
      next[t.id] = y;
      cursor = y + h + CARD_GAP;
    }
    setTops((prev) => {
      const same =
        Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([k, v]) => prev[k] === v);
      return same ? prev : next;
    });
  }, [visible, anchorTops]);

  const body = (
    <div
      className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-background/95 shadow-lg backdrop-blur"
      style={{ width: RAIL_WIDTH }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-[13px] font-semibold">
          Comments
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            {openCount} open
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {composing && (
        <ComposeBox
          label={composing.label}
          onCancel={() => setComposing(null)}
          onSubmit={async (text) => {
            await onAdd(text, composing);
            setComposing(null);
          }}
        />
      )}

      <div ref={railRef} className="relative flex-1 overflow-hidden">
        {visible.length === 0 && !composing && (
          <p className="p-3 text-[12px] text-muted-foreground">
            No comments yet. Hover a module and use its comment control to leave one.
          </p>
        )}
        {visible.map((thread) => {
          const key = payloadOf(thread)?.targetKey ?? '';
          const offScreen = anchorTops[key] === null || anchorTops[key] === undefined;
          return (
            <div
              key={thread.id}
              ref={(el) => {
                if (el) cardRefs.current.set(thread.id, el);
                else cardRefs.current.delete(thread.id);
              }}
              className={`absolute left-2 right-2 transition-[top,opacity] duration-150 ${
                offScreen ? 'opacity-40' : ''
              }`}
              style={{ top: tops[thread.id] ?? 0 }}
            >
              <ThreadCard
                thread={thread}
                canEdit={canEdit}
                isCoordinator={isCoordinator}
                onAdd={onAdd}
                onResolve={onResolve}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

/* ------------------------------------------------------------------ cards */

function ComposeBox({
  label,
  onCancel,
  onSubmit,
}: {
  label: string;
  onCancel: () => void;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  return (
    <div className="border-b border-border bg-muted/40 p-2">
      <p className="mb-1 truncate text-[11px] text-muted-foreground">On: {label}</p>
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Leave a comment on this module…"
        className="min-h-[64px] text-[12px]"
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 text-[11px]"
          disabled={!text.trim()}
          onClick={() => void onSubmit(text.trim())}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  canEdit,
  isCoordinator,
  onAdd,
  onResolve,
  onDelete,
}: {
  thread: Comment;
  canEdit: boolean;
  isCoordinator: boolean;
  onAdd: (
    content: string,
    payload: ModuleAnchorPayload,
    parentId?: string,
  ) => Promise<void>;
  onResolve: (id: string, status: 'open' | 'resolved' | 'rejected') => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const payload = payloadOf(thread);
  const isAuthor = user?.id === thread.user_id;
  const mayResolve = isAuthor || isCoordinator;
  const resolved = thread.status === 'resolved';

  return (
    <div
      className={`rounded-md border border-border bg-card p-2 text-[12px] shadow-sm ${
        resolved ? 'opacity-60' : ''
      }`}
    >
      <p className="mb-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {payload?.label ?? 'Module'}
      </p>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-semibold">{thread.user_name}</span>
        <div className="flex items-center gap-0.5">
          {mayResolve && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={resolved ? 'Reopen' : 'Resolve'}
                  className="rounded p-0.5 text-emerald-600 hover:bg-muted"
                  onClick={() => onResolve(thread.id, resolved ? 'open' : 'resolved')}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {resolved ? 'Reopen this comment' : 'Resolve this comment'}
              </TooltipContent>
            </Tooltip>
          )}
          {isAuthor && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Delete comment"
                  className="rounded p-0.5 text-destructive hover:bg-muted"
                  onClick={() => onDelete(thread.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Delete your comment</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap">{thread.content}</p>

      {(thread.replies ?? []).map((r) => (
        <div key={r.id} className="mt-1.5 border-l-2 border-border pl-2">
          <span className="text-[11px] font-semibold">{r.user_name}</span>
          <p className="whitespace-pre-wrap">{r.content}</p>
        </div>
      ))}

      {canEdit && !resolved && (
        replying ? (
          <div className="mt-1.5">
            <ComposeBox
              label="Reply"
              onCancel={() => setReplying(false)}
              onSubmit={async (text) => {
                if (payload) await onAdd(text, payload, thread.id);
                setReplying(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setReplying(true)}
          >
            <CornerDownRight className="h-3 w-3" /> Reply
          </button>
        )
      )}
    </div>
  );
}
