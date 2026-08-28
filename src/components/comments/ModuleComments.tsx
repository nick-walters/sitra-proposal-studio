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
 *
 * Tagging and assignment:
 *  - a @tag lives INSIDE the comment text, as `@[Full Name](user-uuid)` — the
 *    same encoding the message board uses. It survives editing (the editor
 *    round-trips the raw form) and it never breaks if the person later loses
 *    their role on the proposal: the stored name still renders, the id simply
 *    stops matching anyone in the picker.
 *  - an assignment is a column, `section_comments.assigned_to`, so exactly one
 *    person owns a comment. It is untouched by resolving or reopening.
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
import {
  MessageSquarePlus,
  X,
  Check,
  Trash2,
  CornerDownRight,
  RotateCcw,
  Pencil,
  UserPlus,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MentionTextarea,
  extractMentionedUserIds,
  renderMentionContent,
} from '@/components/MentionTextarea';
import { useProposalMembers, type ProposalMember } from '@/hooks/useProposalMembers';
import {
  notifyCommentAssignment,
  notifyCommentTags,
} from '@/lib/commentNotifications';
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

/** A comment counts as edited once its row was written well after it was made. */
const wasEdited = (c: Comment) =>
  !!c.updated_at &&
  new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 2000;

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
    updateCommentContent,
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
          onEdit={updateCommentContent}
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
  /**
   * `'floating'` keeps the legacy control beside the field; `'none'` measures
   * the module only, for surfaces whose comment control lives in the block's
   * own control row (see `ModuleCommentButton`).
   */
  control?: 'floating' | 'none';
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
  control = 'floating',
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
      {control === 'floating' && (
        <div className={`absolute -right-8 top-0 z-10 ${controlClassName ?? ''}`}>
          <ModuleCommentButton targetKey={targetKey} label={label} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- control-row button */

/**
 * The comment control as it appears in a block's control row — the same size,
 * spacing and ghost treatment as the visibility, add and restore controls
 * beside it, so it is exactly as discoverable as they are. Blue, and half
 * again the size of the other control glyphs so it reads as an invitation.
 */
export function ModuleCommentButton({
  targetKey,
  label,
  className = '',
}: {
  targetKey: string;
  label: string;
  className?: string;
}) {
  const ctx = useModuleComments();
  if (!ctx) return null;

  const threads = ctx.threadsFor(targetKey);
  const openThreads = threads.filter((t) => t.status === 'open').length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={openThreads > 0 ? 'Open the comments panel' : `Comment on ${label}`}
          className={`relative h-7 w-7 shrink-0 text-blue-600 hover:text-blue-700 ${className}`}
          onClick={() =>
            openThreads > 0 ? ctx.setOpen(true) : ctx.startComposing(targetKey, label)
          }
        >
          {/* 50 % larger than the 3.5-unit glyphs of the neighbouring controls. */}
          <MessageSquarePlus className="h-[1.3125rem] w-[1.3125rem]" strokeWidth={2} />
          {openThreads > 0 && (
            <span className="absolute right-0 top-0 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-[14px] text-white">
              {openThreads}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {openThreads > 0 ? 'Open the comments panel' : `Comment on ${label}`}
      </TooltipContent>
    </Tooltip>
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
  onEdit: (id: string, content: string) => void | Promise<void>;
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
  onEdit,
  onResolve,
  onDelete,
}: RailProps) {
  const [showResolved, setShowResolved] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  /** Total height the cards need, so the rail can scroll past both edges. */
  const [contentHeight, setContentHeight] = useState(0);
  /** Anchor top per target, in rail coordinates; null when its module is gone. */
  const [anchorTops, setAnchorTops] = useState<Record<string, number | null>>({});
  const [measured, setMeasured] = useState(false);

  /** A module that is no longer on the page has been binned (or is on another
   *  surface): its anchor never registers, so it never measures. */
  const isDeleted = useCallback(
    (t: Comment) => {
      if (!measured) return false;
      const key = payloadOf(t)?.targetKey ?? '';
      return anchorTops[key] === null || anchorTops[key] === undefined;
    },
    [anchorTops, measured],
  );

  const visible = useMemo(
    () =>
      threads.filter((t) => {
        if (!showResolved && t.status === 'resolved') return false;
        // A comment on a deleted module is history: it belongs with the
        // resolved ones, not in the working list.
        if (!showResolved && isDeleted(t)) return false;
        return true;
      }),
    [threads, showResolved, isDeleted],
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
      setMeasured(true);
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
  // the card above it requires. The stack is free to run past the rail's own
  // height in both directions — the rail scrolls.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
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
      // Cards for modules that are gone simply queue after the rest.
      const raw = anchorTops[key];
      const desired = raw === null || raw === undefined ? cursor : Math.max(raw, 0);
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
    setContentHeight(cursor + 24);
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

      {/* The stack scrolls past both edges, with a soft fade top and bottom so
          it is obvious there is more above and below. */}
      <div
        ref={railRef}
        className="relative flex-1 overflow-y-auto overflow-x-hidden [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)]"
      >
        {visible.length === 0 && !composing && (
          <p className="p-3 text-[12px] text-muted-foreground">
            No comments yet. Use a block's blue comment control to leave one.
          </p>
        )}
        <div className="relative" style={{ height: contentHeight }}>
          {visible.map((thread) => {
            const key = payloadOf(thread)?.targetKey ?? '';
            const deleted = isDeleted(thread);
            const offScreen = deleted || anchorTops[key] === undefined;
            return (
              <div
                key={thread.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(thread.id, el);
                  else cardRefs.current.delete(thread.id);
                }}
                className={`absolute left-2 right-2 transition-[top,opacity] duration-150 ${
                  offScreen ? 'opacity-50' : ''
                }`}
                style={{ top: tops[thread.id] ?? 0 }}
              >
                <ThreadCard
                  thread={thread}
                  canEdit={canEdit}
                  isCoordinator={isCoordinator}
                  deletedModule={deleted}
                  onAdd={onAdd}
                  onEdit={onEdit}
                  onResolve={onResolve}
                  onDelete={onDelete}
                />
              </div>
            );
          })}
        </div>
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
  initialText = '',
  submitLabel = 'Comment',
  placeholder = 'Leave a comment on this module…',
}: {
  label: string;
  onCancel: () => void;
  onSubmit: (text: string) => void | Promise<void>;
  initialText?: string;
  submitLabel?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(initialText);
  const submit = () => {
    if (text.trim()) void onSubmit(text.trim());
  };
  return (
    <div className="border-b border-border bg-muted/40 p-2">
      <p className="mb-1 truncate text-[11px] text-muted-foreground">On: {label}</p>
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        // Shift+Return posts; Return alone opens a new paragraph.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="min-h-[64px] text-[12px]"
      />
      <div className="mt-1.5 flex items-center justify-between gap-1.5">
        <span className="text-[10px] text-muted-foreground">Shift + Return to post</span>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-6 text-[11px]" disabled={!text.trim()} onClick={submit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  canEdit,
  isCoordinator,
  deletedModule,
  onAdd,
  onEdit,
  onResolve,
  onDelete,
}: {
  thread: Comment;
  canEdit: boolean;
  isCoordinator: boolean;
  deletedModule: boolean;
  onAdd: (
    content: string,
    payload: ModuleAnchorPayload,
    parentId?: string,
  ) => Promise<void>;
  onEdit: (id: string, content: string) => void | Promise<void>;
  onResolve: (id: string, status: 'open' | 'resolved' | 'rejected') => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
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
        {deletedModule ? 'Deleted module' : (payload?.label ?? 'Module')}
      </p>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-semibold">
          {thread.user_name}
          {wasEdited(thread) && (
            <span className="ml-1 font-normal italic text-muted-foreground">(edited)</span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          {isAuthor && !editing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Edit comment"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Edit your comment</TooltipContent>
            </Tooltip>
          )}
          {mayResolve && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={resolved ? 'Reopen' : 'Resolve'}
                  className={`rounded p-0.5 hover:bg-muted ${
                    resolved ? 'text-blue-600' : 'text-emerald-600'
                  }`}
                  onClick={() => onResolve(thread.id, resolved ? 'open' : 'resolved')}
                >
                  {resolved ? (
                    <RotateCcw className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
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

      {editing ? (
        <div className="mt-1.5">
          <ComposeBox
            label="Edit"
            initialText={thread.content}
            submitLabel="Save"
            placeholder="Edit your comment…"
            onCancel={() => setEditing(false)}
            onSubmit={async (text) => {
              await onEdit(thread.id, text);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{thread.content}</p>
      )}

      {(thread.replies ?? []).map((r) => {
        const mine = user?.id === r.user_id;
        return (
          <div key={r.id} className="mt-1.5 border-l-2 border-border pl-2">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[11px] font-semibold">
                {r.user_name}
                {wasEdited(r) && (
                  <span className="ml-1 font-normal italic text-muted-foreground">(edited)</span>
                )}
              </span>
              {mine && editingReplyId !== r.id && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Edit reply"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setEditingReplyId(r.id)}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete reply"
                    className="rounded p-0.5 text-destructive hover:bg-muted"
                    onClick={() => onDelete(r.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            {editingReplyId === r.id ? (
              <ComposeBox
                label="Edit reply"
                initialText={r.content}
                submitLabel="Save"
                placeholder="Edit your reply…"
                onCancel={() => setEditingReplyId(null)}
                onSubmit={async (text) => {
                  await onEdit(r.id, text);
                  setEditingReplyId(null);
                }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{r.content}</p>
            )}
          </div>
        );
      })}

      {canEdit && !resolved && (
        replying ? (
          <div className="mt-1.5">
            <ComposeBox
              label="Reply"
              submitLabel="Reply"
              placeholder="Reply…"
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
