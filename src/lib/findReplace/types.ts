/**
 * Page-wide find and replace — shared types.
 *
 * The search runs over STORED content, never the DOM: collapsed blocks and
 * lazily-mounted fields have no DOM nodes, so a DOM walk cannot see them.
 * Each surface (Part B cards board, WP drafts, pilot drafts, milestones and
 * risks, Part A pages) contributes a `PageSearchSource` describing every
 * field it holds, built from data it has already loaded.
 */

export type FieldFormat = 'html' | 'text';

export type FieldSaveOutcome =
  | { ok: true }
  /** `conflict` marks a save-time version rejection, not a transport failure. */
  | { ok: false; conflict: boolean; error?: string };

export interface SearchableField {
  /** Stable, unique within the page. Survives re-enumeration. */
  id: string;
  /** Human label for the results list, e.g. "1.2 Block › Module header". */
  label: string;
  /** Block/card this field belongs to; used to group results. */
  groupId?: string;
  groupLabel?: string;
  /**
   * True when the field sits in a block excluded from the document. Its text
   * still exists and is still searched, but a replace there changes text that
   * will not appear in the export, so it is flagged everywhere it is shown.
   */
  hidden?: boolean;
  format: FieldFormat;
  /** The stored value, exactly as it sits in the database. */
  value: string;
  /** No save path (source-fed or read-only): searched, never replaced. */
  readOnly?: boolean;
  /**
   * Writes through the surface's own conflict-checked save path. Must return
   * `{ ok: false, conflict: true }` when the server rejects a stale write —
   * a replace is never forced.
   */
  save?: (next: string) => Promise<FieldSaveOutcome>;
  /**
   * Brings the field into view: expands its block if the user collapsed it,
   * mounts the editor if it is unmounted, scrolls to it. Optional — a field
   * with no reveal is still searchable and replaceable.
   */
  reveal?: () => void | Promise<void>;
}

export interface PageSearchSource {
  id: string;
  /** Label for the page, shown in the panel header. */
  label: string;
  /** Enumerated on demand, from already-loaded query data. */
  getFields: () => SearchableField[];
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface FieldMatch {
  fieldId: string;
  /** Index of this match within its field, in reading order. */
  indexInField: number;
  /** Offsets into the field's plain text, not its HTML. */
  start: number;
  end: number;
  text: string;
  /** Surrounding plain text for the results list. */
  snippet: string;
}
