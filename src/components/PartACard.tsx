import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/control-tip';
import { useKeyedCollapse } from '@/hooks/useKeyedCollapse';
import { cn } from '@/lib/utils';

/**
 * Part A cards, given the same appearance and collapse behaviour as Part B
 * blocks.
 *
 * Part A cards are NOT blocks: they are not reorderable, deletable or
 * hideable and they have no `proposal_cards` row. All that is shared is the
 * chrome — border, radius, header layout, chevron — and the per-user collapse
 * preference, which is keyed by a stable string (`a1.abstract`) rather than a
 * uuid. Collapsing changes nothing about the data or the document.
 */

interface PartACollapseContextValue {
  collapsedKeys: Set<string>;
  toggle: (key: string) => void;
  register: (key: string) => void;
  unregister: (key: string) => void;
}

const PartACollapseContext = createContext<PartACollapseContextValue | null>(null);

/**
 * Page-level state for every Part A card beneath it. Rendered by
 * `PartAPageLayout`, so any page using that layout gets collapse for free.
 */
export function PartACollapseProvider({
  proposalId,
  children,
  onStateChange,
}: {
  proposalId: string | null | undefined;
  children: ReactNode;
  /** Lets the layout render the page-wide "Collapse all" control. */
  onStateChange?: (state: { keys: string[]; allCollapsed: boolean; pending: boolean }) => void;
}) {
  const { collapsedKeys, setCollapsed } = useKeyedCollapse(proposalId);
  const [keys, setKeys] = useState<string[]>([]);

  const register = useCallback((key: string) => {
    setKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);
  const unregister = useCallback((key: string) => {
    setKeys((prev) => prev.filter((k) => k !== key));
  }, []);

  const toggle = useCallback(
    (key: string) => setCollapsed.mutate({ keys: [key], collapsed: !collapsedKeys.has(key) }),
    // collapsedKeys is a fresh Set each render; the mutation is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collapsedKeys, setCollapsed.mutate],
  );

  const allCollapsed = keys.length > 0 && keys.every((k) => collapsedKeys.has(k));

  useEffect(() => {
    onStateChange?.({ keys, allCollapsed, pending: setCollapsed.isPending });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, allCollapsed, setCollapsed.isPending]);

  const value = useMemo<PartACollapseContextValue>(
    () => ({ collapsedKeys, toggle, register, unregister }),
    [collapsedKeys, toggle, register, unregister],
  );

  return <PartACollapseContext.Provider value={value}>{children}</PartACollapseContext.Provider>;
}

/** Used by `PartAPageLayout` to drive its page-wide collapse control. */
export function usePartACollapseAll(proposalId: string | null | undefined) {
  const { setCollapsed } = useKeyedCollapse(proposalId);
  return setCollapsed;
}

export interface PartACardProps {
  /**
   * Stable identifier for this card, unique within the proposal, e.g.
   * `a1.abstract`. Never a database id — Part A cards have none.
   */
  collapseKey: string;
  title: ReactNode;
  /** Icon shown before the title, matching the previous card headers. */
  icon?: ReactNode;
  /** One-line "what's inside", shown only while collapsed. */
  summary?: ReactNode;
  /** Guideline text or description, shown under the title when expanded. */
  description?: ReactNode;
  /** Controls rendered at the right end of the header row. */
  headerRight?: ReactNode;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function PartACard({
  collapseKey,
  title,
  icon,
  summary,
  description,
  headerRight,
  className,
  titleClassName,
  contentClassName,
  children,
}: PartACardProps) {
  const ctx = useContext(PartACollapseContext);
  // Outside a provider (previews, standalone dialogs) the card still
  // collapses, just without persistence.
  const [localCollapsed, setLocalCollapsed] = useState(false);

  const { register, unregister } = ctx ?? {};
  useEffect(() => {
    register?.(collapseKey);
    return () => unregister?.(collapseKey);
  }, [collapseKey, register, unregister]);

  const collapsed = ctx ? ctx.collapsedKeys.has(collapseKey) : localCollapsed;
  const onToggle = () =>
    ctx ? ctx.toggle(collapseKey) : setLocalCollapsed((v) => !v);

  return (
    <Card className={className}>
      <CardHeader className="relative flex flex-row items-center gap-1.5 space-y-0 px-5 py-3">
        {/* Same left-edge control position as a Part B block. Part A cards
            are not reorderable, so there is no grip below the chevron. */}
        <div className="-ml-3.5 flex shrink-0 flex-col items-center gap-0.5 self-start">
          <Tip label={collapsed ? 'Expand card' : 'Collapse card'}>
            <Button variant="ghost" size="icon" onClick={onToggle} className="h-6 w-6">
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </Tip>
        </div>

        <div className="min-w-0 flex-1">
          <CardTitle className={cn('flex items-center gap-2 text-sm', titleClassName)}>
            {icon}
            {title}
          </CardTitle>
          {collapsed
            ? summary && <p className="truncate text-xs text-muted-foreground">{summary}</p>
            : description}
        </div>

        {headerRight && <div className="ml-auto flex shrink-0 items-center gap-1">{headerRight}</div>}
      </CardHeader>

      <CardContent className={cn('px-5 pb-4 pt-0', collapsed && 'hidden', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
