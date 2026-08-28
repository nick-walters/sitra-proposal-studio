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
import { useSearchParams } from 'react-router-dom';
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
import {
  RAIL_BUTTON_SIZE,
  RAIL_COMMENT_RIGHT_INSET,
  RAIL_COMMENT_TOP,
  railFrame,
} from '@/components/cards/MarginRail';
import { Button } from '@/components/ui/button';
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
import { useRightPanel } from '@/components/panels/RightPanelRegion';
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
    updateCommentAssignee,
    deleteComment,
    refetch,
  } = useSectionComments({ proposalId, sectionId });

  const { user } = useAuth();
  const { data: members = [] } = useProposalMembers(proposalId);
  const actorName =
    members.find((m) => m.id === user?.id)?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Someone';

  // The comments panel is one of the two occupants of the shared right-hand
  // region. Where that region exists, it owns the toggle (and its
  // persistence); a surface without it keeps the old local state.
  const rightPanel = useRightPanel();
  const [localOpen, setLocalOpen] = useState(false);
  const open = rightPanel ? rightPanel.commentsOpen : localOpen;
  const setOpen = rightPanel ? rightPanel.setCommentsOpen : setLocalOpen;
  const showing = rightPanel ? rightPanel.visiblePanel === 'comments' : open;
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

  const startComposing = useCallback(
    (targetKey: string, label: string) => {
      // A module holds as many threads as people want to start, so this always
      // opens a FRESH composer — never the existing thread.
      if (rightPanel) rightPanel.showPanel('comments');
      else setOpen(true);
      setComposing({ targetKey, label });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rightPanel?.showPanel, setOpen],
  );

  // Arriving from a notification: ?comment=<id> opens the comments panel,
  // brings the commented module into view and highlights the thread. The id
  // may name a REPLY, so the owning thread is resolved first.
  //
  // The parameter is read REACTIVELY (react-router's search params, not a
  // one-off snapshot of window.location): a notification clicked while the
  // proposal page is already open changes the URL without remounting this
  // provider, so a mount-time snapshot would never see it.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlComment = searchParams.get('comment');
  const [focusCommentId, setFocusCommentId] = useState<string | null>(urlComment);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!urlComment || urlComment === focusCommentId) return;
    scrolledRef.current = false;
    setFocusCommentId(urlComment);
  }, [urlComment, focusCommentId]);

  const focusThread = useMemo(() => {
    if (!focusCommentId) return null;
    return (
      comments.find(
        (c) => c.id === focusCommentId || c.replies?.some((r) => r.id === focusCommentId),
      ) ?? null
    );
  }, [comments, focusCommentId]);
  const focusThreadId = focusThread?.id ?? null;
  useEffect(() => {
    if (!focusCommentId || scrolledRef.current) return;
    // Open the panel — and, where the shared region exists, make sure the
    // comments panel is the occupant showing rather than the review panel.
    if (rightPanel) rightPanel.showPanel('comments');
    else setOpen(true);
    const key = focusThread ? payloadOf(focusThread)?.targetKey : null;
    if (!key) return;
    const el = elements.current.get(key);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    scrolledRef.current = true;
    // The link has been honoured; drop it from the URL so a later reload does
    // not re-scroll. The highlight lives in state, so it survives this.
    if (searchParams.get('comment')) {
      const next = new URLSearchParams(searchParams);
      next.delete('comment');
      setSearchParams(next, { replace: true });
    }
  }, [focusCommentId, focusThread, rightPanel, setOpen, tick, searchParams, setSearchParams]);


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

  /** Everything a notification needs to name the place a comment lives. */
  const notifyTarget = (commentId: string, payload: ModuleAnchorPayload) => ({
    proposalId,
    sectionId,
    sectionTitle: sectionId,
    commentId,
    targetKey: payload.targetKey,
    moduleLabel: payload.label,
    actorId: user?.id ?? '',
    actorName,
  });

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {showing && (
        <ModuleCommentsRail
          host={rightPanel?.host ?? null}
          threads={moduleThreads}
          elements={elements}
          tick={tick}
          canEdit={canEdit}
          isCoordinator={isCoordinator}
          composing={composing}
          setComposing={setComposing}
          openCount={openCount}
          members={members}
          focusCommentId={focusThreadId}
          onClose={() => setOpen(false)}
          onAdd={async (content, payload, parentId, assignedTo) => {
            const row = await addComment(content, {
              anchorType: MODULE_ANCHOR_TYPE,
              anchorPayload: payload,
              parentCommentId: parentId,
              assignedTo,
            });
            if (row) {
              // A tag or an assignment notifies; an ordinary reply does not.
              await notifyCommentTags(
                extractMentionedUserIds(content),
                notifyTarget(row.id, payload),
              );
              await notifyCommentAssignment(
                assignedTo ?? null,
                notifyTarget(row.id, payload),
              );
            }
            refetch();
          }}
          onAssign={async (commentId, assignedTo, payload) => {
            await updateCommentAssignee(commentId, assignedTo);
            await notifyCommentAssignment(
              assignedTo,
              notifyTarget(commentId, payload),
            );
          }}
          onEdit={async (id, content) => {
            await updateCommentContent(id, content);
            // Editing in a new tag notifies that person too; people already
            // tagged were notified when the tag first appeared.
            const thread = comments.find(
              (c) => c.id === id || c.replies?.some((r) => r.id === id),
            );
            const payload = thread ? payloadOf(thread) : null;
            const before = new Set(
              extractMentionedUserIds(
                (thread?.id === id ? thread?.content : thread?.replies?.find((r) => r.id === id)?.content) ?? '',
              ),
            );
            const added = extractMentionedUserIds(content).filter((u) => !before.has(u));
            if (payload && added.length > 0) {
              await notifyCommentTags(added, notifyTarget(id, payload));
            }
          }}
          onResolve={updateCommentStatus}
          onDelete={deleteComment}
        />
      )}
    </Ctx.Provider>
  );
}

/* ----------------------------------------------------------------- anchor */

/**
 * The comment rail: every comment control on the platform sits in ONE vertical
 * line, outside the block, in the page's right margin. An anchor may wrap a
 * whole module (right edge = page edge) or a single table cell (right edge far
 * to the left), so the offset is measured rather than hard-coded: find the
 * enclosing block edge (`[data-comment-rail-edge]`, falling back to the page
 * frame) and push the control 8 px beyond it.
 */
/** Distance from the anchor's own right edge when no page frame is found. */
const RAIL_GAP = -(RAIL_COMMENT_RIGHT_INSET + RAIL_BUTTON_SIZE);

/**
 * The control row this comment button lines up with: the anchor's own rail
 * group when it has one, otherwise the rail of the header row the anchor
 * SITS IN — a block title or task pill is wrapped by the anchor while its
 * delete and visibility glyphs are siblings further up the tree.
 */
function findRailRow(el: HTMLElement): HTMLElement | null {
  const own = (Array.from(el.querySelectorAll('[data-rail-row]')) as HTMLElement[]).find(
    (r) => r.closest('[data-comment-target]') === el,
  );
  if (own) return own;
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const row = node.querySelector(':scope > [data-rail-row]') as HTMLElement | null;
    // Only a rail that belongs to no OTHER commentable module is ours.
    const owner = row?.closest('[data-comment-target]');
    if (row && (owner === null || owner === el)) {
      return row;
    }
  }
  return null;
}


/**
 * Positions the floating comment control: horizontally on the shared rail, and
 * vertically on the CENTRE of the module's own control row, so it lines up
 * with the delete and visibility glyphs beside it instead of riding above them.
 */
function useRailOffset(ref: React.RefObject<HTMLElement>) {
  const [offset, setOffset] = useState({ left: RAIL_GAP, top: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      // The OUTERMOST page frame, and no rounding: a rounded offset put each
      // surface's rail up to a pixel off the deliverable row's line.
      const edge = railFrame(el);
      const left = edge
        ? edge.getBoundingClientRect().right - box.right - RAIL_COMMENT_RIGHT_INSET - RAIL_BUTTON_SIZE
        : RAIL_GAP;
      // The control row this button belongs to. Its own rail group is the
      // reference: same row, same vertical centre. A rail belonging to a
      // NESTED commentable module is not ours, so it is skipped.
      const row = findRailRow(el);

      let top = 0;
      if (row) {
        const r = row.getBoundingClientRect();
        if (r.height > 0) {
          top = Math.round(r.top + r.height / 2 - box.top - RAIL_BUTTON_SIZE / 2) + RAIL_COMMENT_TOP;
        }
      } else if (box.height > 0 && box.height <= 64) {
        // A bare anchor — a block title, a task pill — has no rail of its own,
        // so it centres on itself rather than hanging off its top edge.
        top = Math.round(box.height / 2 - RAIL_BUTTON_SIZE / 2) + RAIL_COMMENT_TOP;
      }
      setOffset((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const edge = railFrame(el);
    if (edge) ro.observe(edge);
    const railRow = findRailRow(el);
    if (railRow) ro.observe(railRow);
    // The control row a title anchor belongs to is a SIBLING, and its glyphs
    // often arrive a tick after the title — a control that appears on load, or
    // once permissions resolve. Watching the row's container for added nodes
    // re-measures then, so the button never stays stranded at the top edge.
    const rowHost = el.parentElement?.parentElement ?? null;
    const mo = rowHost ? new MutationObserver(measure) : null;
    if (rowHost && mo) mo.observe(rowHost, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);

  return offset;
}


interface AnchorProps {
  targetKey: string;
  /** Human-readable name of the module, shown on the comment card. */
  label: string;
  children: ReactNode;
  className?: string;
  /** Where the hover control sits — defaults to the top right of the module. */
  controlClassName?: string;
  /**
   * `'floating'` puts the control in the shared right-hand rail; `'none'`
   * measures the module only, for the rare surface that renders its own.
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
  const railOffset = useRailOffset(ref);

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
      /* Read by the review panel, so focusing a module that carries comments
         can open the panel on its Comments tab without a click. */
      data-has-comments={openThreads > 0 ? 'true' : undefined}
      className={`group/comment relative ${
        // Subtle mark so you can see at a glance which modules carry comments.
        openThreads > 0 ? 'rounded-[3px] ring-1 ring-amber-300/70' : ''
      } ${className ?? ''}`}
    >
      {children}
      {control === 'floating' && (
        <div
          className={`absolute z-10 ${controlClassName ?? ''}`}
          style={{ left: `calc(100% + ${railOffset.left}px)`, top: `${railOffset.top}px` }}
        >
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
          aria-label={
            openThreads > 0
              ? `Start another comment on ${label} (${openThreads} open)`
              : `Comment on ${label}`
          }
          className={`relative h-7 w-7 shrink-0 text-blue-600 hover:text-blue-700 ${className}`}
          // ALWAYS a new thread. A module carries as many threads as anyone
          // wants; the existing ones stay listed in the panel beside it.
          onClick={() => ctx.startComposing(targetKey, label)}
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
        {openThreads > 0
          ? `Start another comment — ${openThreads} open on ${label}`
          : `Comment on ${label}`}
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
  /** Where the rail renders — the shared region, or the page when there is none. */
  host: HTMLElement | null;
  members: ProposalMember[];
  focusCommentId: string | null;
  onClose: () => void;
  onAdd: (
    content: string,
    payload: ModuleAnchorPayload,
    parentId?: string,
    assignedTo?: string | null,
  ) => Promise<void>;
  onAssign: (
    commentId: string,
    assignedTo: string | null,
    payload: ModuleAnchorPayload,
  ) => void | Promise<void>;
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
  host,
  members,
  focusCommentId,
  onClose,
  onAdd,
  onAssign,
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
      className={
        host
          ? 'flex h-full w-full flex-col'
          : 'fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-background/95 shadow-lg backdrop-blur'
      }
      style={host ? undefined : { width: RAIL_WIDTH }}
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
          {/* Hosted in the review panel, the panel's own close control is the
              only one: a second X beside "Show resolved" simply duplicated it. */}
          {!host && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {composing && (
        <ComposeBox
          label={composing.label}
          members={members}
          allowAssignment
          onCancel={() => setComposing(null)}
          onSubmit={async (text, assignedTo) => {
            await onAdd(text, composing, undefined, assignedTo);
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
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <MessageSquarePlus className="h-5 w-5 text-blue-600" />
            <p className="text-[12px] text-muted-foreground">Add a comment to a field</p>
          </div>
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
                  members={members}
                  focused={focusCommentId === thread.id}
                  onAdd={onAdd}
                  onAssign={onAssign}
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

  return createPortal(body, host ?? document.body);
}

/* ------------------------------------------------------------------ cards */

function ComposeBox({
  label,
  members,
  onCancel,
  onSubmit,
  initialText = '',
  submitLabel = 'Comment',
  placeholder = 'Leave a comment on this module… type @ to tag someone',
  allowAssignment = false,
}: {
  label: string;
  members: ProposalMember[];
  onCancel: () => void;
  onSubmit: (text: string, assignedTo: string | null) => void | Promise<void>;
  initialText?: string;
  submitLabel?: string;
  placeholder?: string;
  allowAssignment?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const submit = () => {
    if (text.trim()) void onSubmit(text.trim(), assignedTo);
  };
  return (
    <div
      className="border-b border-border bg-muted/40 p-2"
      // Shift+Return posts wherever the caret is, including inside the tag
      // picker's textarea; Return alone opens a new paragraph.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <p className="mb-1 truncate text-[11px] text-muted-foreground">On: {label}</p>
      <MentionTextarea
        autoFocus
        value={text}
        onChange={setText}
        teamMembers={members.map((m) => ({ ...m, full_name: m.full_name || m.email }))}
        placeholder={placeholder}
        className="min-h-[64px] text-[12px]"
      />
      {allowAssignment && (
        <div className="mt-1.5">
          <AssigneePicker
            members={members}
            value={assignedTo}
            onChange={setAssignedTo}
            compact
          />
        </div>
      )}
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

/**
 * WHO IS THIS COMMENT FOR
 *
 * Assignment is deliberately separate from tagging: a comment names any number
 * of people in its text, but exactly one person owns it.
 */
function AssigneePicker({
  members,
  value,
  onChange,
  compact = false,
  disabled = false,
}: {
  members: ProposalMember[];
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const assignee = members.find((m) => m.id === value);
  const name = assignee ? assignee.full_name || assignee.email : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
            value
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
              : 'text-muted-foreground'
          } hover:bg-muted disabled:opacity-50`}
        >
          {value ? <UserCheck className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
          {value
            ? `Assigned to ${name ?? 'someone no longer on this proposal'}`
            : compact
              ? 'Assign to…'
              : 'Unassigned'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onClick={() => onChange(m.id)} className="text-[12px]">
            {m.full_name || m.email}
          </DropdownMenuItem>
        ))}
        {value && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(null)} className="text-[12px]">
              Clear the assignment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThreadCard({
  thread,
  canEdit,
  isCoordinator,
  deletedModule,
  members,
  focused,
  onAdd,
  onAssign,
  onEdit,
  onResolve,
  onDelete,
}: {
  thread: Comment;
  canEdit: boolean;
  isCoordinator: boolean;
  deletedModule: boolean;
  members: ProposalMember[];
  focused: boolean;
  onAdd: (
    content: string,
    payload: ModuleAnchorPayload,
    parentId?: string,
    assignedTo?: string | null,
  ) => Promise<void>;
  onAssign: (
    commentId: string,
    assignedTo: string | null,
    payload: ModuleAnchorPayload,
  ) => void | Promise<void>;
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
  const mayAssign = isAuthor || isCoordinator;
  const resolved = thread.status === 'resolved';

  return (
    <div
      className={`rounded-md border bg-card p-2 text-[12px] shadow-sm ${
        resolved ? 'opacity-60' : ''
      } ${focused ? 'border-blue-500 ring-1 ring-blue-500' : 'border-border'}`}
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
            members={members}
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
        <p className="whitespace-pre-wrap">{renderMentionContent(thread.content)}</p>
      )}

      {/* Assignment survives resolving and reopening — it is a property of the
          comment, not of its status. */}
      <div className="mt-1.5">
        <AssigneePicker
          members={members}
          value={thread.assigned_to}
          disabled={!mayAssign}
          onChange={(id) => {
            if (payload) void onAssign(thread.id, id, payload);
          }}
        />
      </div>

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
                members={members}
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
              <p className="whitespace-pre-wrap">{renderMentionContent(r.content)}</p>
            )}
          </div>
        );
      })}

      {canEdit && !resolved && (
        replying ? (
          <div className="mt-1.5">
            <ComposeBox
              label="Reply"
              members={members}
              submitLabel="Reply"
              placeholder="Reply… type @ to tag someone"
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
