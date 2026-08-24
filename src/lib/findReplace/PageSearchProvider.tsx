/**
 * Registry of the searchable fields on the current page.
 *
 * Surfaces register a `PageSearchSource` that enumerates their fields from
 * data they have already loaded — one React Query cache read per surface, no
 * extra network round trip. The panel asks for the fields when the user
 * searches, so the list is always current without any subscription.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PageSearchSource, SearchableField } from './types';

interface PageSearchContextValue {
  register: (source: PageSearchSource) => () => void;
  /** All fields on the page, in surface registration order. */
  getFields: () => SearchableField[];
  hasSources: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const PageSearchContext = createContext<PageSearchContextValue | null>(null);

export function PageSearchProvider({ children }: { children: ReactNode }) {
  const sourcesRef = useRef<Map<string, PageSearchSource>>(new Map());
  const [sourceCount, setSourceCount] = useState(0);
  const [open, setOpen] = useState(false);

  const register = useCallback((source: PageSearchSource) => {
    sourcesRef.current.set(source.id, source);
    setSourceCount(sourcesRef.current.size);
    return () => {
      sourcesRef.current.delete(source.id);
      setSourceCount(sourcesRef.current.size);
    };
  }, []);

  const getFields = useCallback(() => {
    const out: SearchableField[] = [];
    for (const source of sourcesRef.current.values()) {
      try {
        out.push(...source.getFields());
      } catch {
        // A surface mid-render must never break the search.
      }
    }
    return out;
  }, []);

  const value = useMemo(
    () => ({ register, getFields, hasSources: sourceCount > 0, open, setOpen }),
    [register, getFields, sourceCount, open],
  );

  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>;
}

export function usePageSearch(): PageSearchContextValue | null {
  return useContext(PageSearchContext);
}

/**
 * Registers a surface's fields for the lifetime of the component.
 *
 * `getFields` is read through a ref, so a surface can pass a fresh closure on
 * every render without re-registering.
 */
export function usePageSearchSource(
  id: string,
  label: string,
  getFields: () => SearchableField[],
) {
  const ctx = useContext(PageSearchContext);
  const getFieldsRef = useRef(getFields);
  getFieldsRef.current = getFields;

  useEffect(() => {
    if (!ctx) return;
    return ctx.register({ id, label, getFields: () => getFieldsRef.current() });
  }, [ctx, id, label]);
}
