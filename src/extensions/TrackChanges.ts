import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Mark as PMMark, Fragment } from 'prosemirror-model';

export interface TrackChange {
  id: string;
  type: 'insertion' | 'deletion';
  authorId: string;
  authorName: string;
  authorColor: string;
  timestamp: Date;
  from: number;
  to: number;
  content?: string;
}

export interface TrackChangesOptions {
  enabled: boolean;
  authorId: string;
  authorName: string;
  authorColor: string;
  changes: TrackChange[];
  onChangesUpdate?: (changes: TrackChange[]) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    trackChanges: {
      toggleTrackChanges: () => ReturnType;
      acceptChange: (changeId: string) => ReturnType;
      rejectChange: (changeId: string) => ReturnType;
      acceptAllChanges: () => ReturnType;
      rejectAllChanges: () => ReturnType;
      navigateToNextChange: () => ReturnType;
      navigateToPreviousChange: () => ReturnType;
      acceptChangeAtCursor: () => ReturnType;
      rejectChangeAtCursor: () => ReturnType;
    };
  }
}

export const trackChangesPluginKey = new PluginKey('trackChanges');

function generateChangeId(): string {
  return `change-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Detect whether the cursor is inside a text node carrying trackDeletion.
 * Returns the absolute bounds of that text node + deletion attrs.
 */
function getDeletionCursorContext(
  state: any,
  pos: number,
  deletionType: any
): { nodeFrom: number; nodeTo: number; attrs: any } | null {
  if (!deletionType) return null;

  let $pos;
  try {
    $pos = state.doc.resolve(pos);
  } catch {
    return null;
  }

  const parent = $pos.parent;
  if (!parent || !parent.isTextblock) return null;

  const parentOffset = $pos.parentOffset;
  let offsetCursor = 0;

  for (let i = 0; i < parent.childCount; i += 1) {
    const child = parent.child(i);
    const childStart = offsetCursor;
    const childEnd = childStart + child.nodeSize;
    offsetCursor = childEnd;

    if (!child.isText) continue;
    const deletionMark = child.marks.find((m: PMMark) => m.type === deletionType);
    if (!deletionMark) continue;

    // Strictly inside this deletion text node (not at boundaries)
    if (parentOffset > childStart && parentOffset < childEnd) {
      const nodeFrom = pos - (parentOffset - childStart);
      const nodeTo = nodeFrom + child.nodeSize;
      return { nodeFrom, nodeTo, attrs: deletionMark.attrs };
    }
  }

  return null;
}

/**
 * Scan the document for all insertion/deletion marks and build
 * a list of TrackChange objects with current positions.
 * 
 * Key change: each contiguous run is a separate change item,
 * even if they share the same changeId (happens after splitting).
 */
function collectChangesFromDoc(doc: any, schema: any): TrackChange[] {
  const changes: TrackChange[] = [];
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType && !deletionType) return [];

  // Track contiguous runs: a run breaks when the changeId changes
  // or there's a gap in positions
  let currentRun: { changeId: string; type: 'insertion' | 'deletion'; attrs: any; from: number; to: number } | null = null;

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) {
      // Non-text node breaks any run
      if (currentRun) {
        changes.push({
          id: currentRun.changeId,
          type: currentRun.type,
          authorId: currentRun.attrs.authorId || '',
          authorName: currentRun.attrs.authorName || 'Unknown',
          authorColor: currentRun.attrs.authorColor || '#3B82F6',
          timestamp: new Date(currentRun.attrs.timestamp || Date.now()),
          from: currentRun.from,
          to: currentRun.to,
          content: doc.textBetween(currentRun.from, currentRun.to, ' '),
        });
        currentRun = null;
      }
      return;
    }

    for (const mark of node.marks) {
      if (mark.type === insertionType || mark.type === deletionType) {
        const markEnd = pos + node.nodeSize;
        const changeId = mark.attrs.changeId;
        const type = mark.type === insertionType ? 'insertion' : 'deletion';

        if (currentRun && currentRun.changeId === changeId && currentRun.type === type && pos <= currentRun.to) {
          // Extend contiguous run
          currentRun.to = markEnd;
        } else {
          // Flush previous run
          if (currentRun) {
            changes.push({
              id: currentRun.changeId,
              type: currentRun.type,
              authorId: currentRun.attrs.authorId || '',
              authorName: currentRun.attrs.authorName || 'Unknown',
              authorColor: currentRun.attrs.authorColor || '#3B82F6',
              timestamp: new Date(currentRun.attrs.timestamp || Date.now()),
              from: currentRun.from,
              to: currentRun.to,
              content: doc.textBetween(currentRun.from, currentRun.to, ' '),
            });
          }
          currentRun = { changeId, type, attrs: mark.attrs, from: pos, to: markEnd };
        }
        return; // only process first track mark per text node
      }
    }

    // Text node without track marks breaks any run
    if (currentRun) {
      changes.push({
        id: currentRun.changeId,
        type: currentRun.type,
        authorId: currentRun.attrs.authorId || '',
        authorName: currentRun.attrs.authorName || 'Unknown',
        authorColor: currentRun.attrs.authorColor || '#3B82F6',
        timestamp: new Date(currentRun.attrs.timestamp || Date.now()),
        from: currentRun.from,
        to: currentRun.to,
        content: doc.textBetween(currentRun.from, currentRun.to, ' '),
      });
      currentRun = null;
    }
  });

  // Flush last run
  if (currentRun) {
    const r = currentRun;
    changes.push({
      id: r.changeId,
      type: r.type,
      authorId: r.attrs.authorId || '',
      authorName: r.attrs.authorName || 'Unknown',
      authorColor: r.attrs.authorColor || '#3B82F6',
      timestamp: new Date(r.attrs.timestamp || Date.now()),
      from: r.from,
      to: r.to,
      content: doc.textBetween(r.from, r.to, ' '),
    });
  }

  return changes;
}

/**
 * Defensive invariant: a text node must never carry both insertion and deletion marks.
 * If both are present, deletion is stripped.
 */
function stripInvalidMixedTrackMarks(doc: any, tr: any, schema: any): boolean {
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType || !deletionType) return false;

  let modified = false;
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const hasInsertion = node.marks.some((m: PMMark) => m.type === insertionType);
    const hasDeletion = node.marks.some((m: PMMark) => m.type === deletionType);
    if (!hasInsertion || !hasDeletion) return;

    tr.removeMark(pos, pos + node.nodeSize, deletionType);
    modified = true;
  });

  return modified;
}

const trackChangeAttributes = () => ({
  changeId: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-change-id'),
    renderHTML: (attributes: Record<string, any>) => ({ 'data-change-id': attributes.changeId }),
  },
  authorId: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-author-id'),
    renderHTML: (attributes: Record<string, any>) => ({ 'data-author-id': attributes.authorId }),
  },
  authorName: {
    default: 'Anonymous',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-author-name'),
    renderHTML: (attributes: Record<string, any>) => ({ 'data-author-name': attributes.authorName }),
  },
  authorColor: {
    default: '#3B82F6',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-author-color'),
    renderHTML: (attributes: Record<string, any>) => ({ 'data-author-color': attributes.authorColor }),
  },
  timestamp: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-timestamp'),
    renderHTML: (attributes: Record<string, any>) => ({ 'data-timestamp': attributes.timestamp }),
  },
});

const TrackInsertionMark = Mark.create({
  name: 'trackInsertion',

  // Prevent insertion marks from bleeding to adjacent text when tracking is OFF.
  // appendTransaction handles adding insertion marks to new text when tracking is ON.
  inclusive: false,
  
  addAttributes() {
    return trackChangeAttributes();
  },

  parseHTML() {
    return [{ tag: 'span[data-track-insertion]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const authorColor = HTMLAttributes['data-author-color'] || '#3B82F6';

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-track-insertion': '',
        style: `background-color: rgba(34, 197, 94, 0.3); border-bottom: 2px solid ${authorColor};`,
      }),
      0,
    ];
  },
});

const TrackDeletionMark = Mark.create({
  name: 'trackDeletion',

  // CRITICAL: Prevent deletion marks from extending to adjacent typed text.
  // Without this, typing at the boundary of a deletion inherits strikethrough.
  inclusive: false,
  
  addAttributes() {
    return trackChangeAttributes();
  },

  parseHTML() {
    return [{ tag: 'span[data-track-deletion]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const authorColor = HTMLAttributes['data-author-color'] || '#3B82F6';

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-track-deletion': '',
        style: `background-color: rgba(239, 68, 68, 0.2); text-decoration: line-through; text-decoration-color: ${authorColor}; color: #9ca3af;`,
      }),
      0,
    ];
  },
});

export const TrackChanges = Extension.create<TrackChangesOptions>({
  name: 'trackChanges',

  addOptions() {
    return {
      enabled: false,
      authorId: '',
      authorName: 'Anonymous',
      authorColor: '#3B82F6',
      changes: [],
      onChangesUpdate: undefined,
    };
  },

  addStorage() {
    return {
      enabled: this.options.enabled,
      changes: [] as TrackChange[],
      lastInsertionId: null as string | null,
      lastInsertionTime: 0,
      lastDeletionId: null as string | null,
      lastDeletionTime: 0,
    };
  },

  addExtensions() {
    return [TrackInsertionMark, TrackDeletionMark];
  },

  addCommands() {
    return {
      toggleTrackChanges:
        () =>
        ({ editor }) => {
          this.storage.enabled = !this.storage.enabled;
          this.storage.lastInsertionId = null;
          this.storage.lastInsertionTime = 0;
          this.storage.lastDeletionId = null;
          this.storage.lastDeletionTime = 0;

          if (!this.storage.enabled) {
            const { state } = editor;
            const { storedMarks } = state;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (storedMarks && (insertionType || deletionType)) {
              const cleaned = storedMarks.filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              );
              if (cleaned.length !== storedMarks.length) {
                const tr = state.tr.setStoredMarks(cleaned);
                tr.setMeta('trackChangesInternal', true);
                tr.setMeta('addToHistory', false);
                editor.view.dispatch(tr);
                return true;
              }
            }
          }

          editor.view.dispatch(editor.state.tr);
          return true;
        },

      acceptChange:
        (changeId: string) =>
        ({ editor, tr, state, dispatch }) => {
          const doc = state.doc;
          const schema = state.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          const ranges: { from: number; to: number; type: 'insertion' | 'deletion' }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (
                (mark.type === insertionType || mark.type === deletionType) &&
                mark.attrs.changeId === changeId
              ) {
                ranges.push({
                  from: pos,
                  to: pos + node.nodeSize,
                  type: mark.type === insertionType ? 'insertion' : 'deletion',
                });
              }
            }
          });

          if (ranges.length === 0) return false;

          const changeType = ranges[0].type;

          if (changeType === 'insertion') {
            for (const range of ranges) {
              tr.removeMark(range.from, range.to, insertionType);
            }
          } else {
            const sorted = [...ranges].sort((a, b) => b.from - a.from);
            for (const range of sorted) {
              tr.delete(range.from, range.to);
            }
          }

          tr.setMeta('trackChangesInternal', true);
          if (dispatch) dispatch(tr);

          setTimeout(() => {
            this.storage.changes = collectChangesFromDoc(
              editor.state.doc,
              editor.state.schema
            );
            this.options.onChangesUpdate?.(this.storage.changes);
          }, 0);

          return true;
        },

      rejectChange:
        (changeId: string) =>
        ({ editor, tr, state, dispatch }) => {
          const doc = state.doc;
          const schema = state.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          const ranges: { from: number; to: number; type: 'insertion' | 'deletion' }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (
                (mark.type === insertionType || mark.type === deletionType) &&
                mark.attrs.changeId === changeId
              ) {
                ranges.push({
                  from: pos,
                  to: pos + node.nodeSize,
                  type: mark.type === insertionType ? 'insertion' : 'deletion',
                });
              }
            }
          });

          if (ranges.length === 0) return false;

          const changeType = ranges[0].type;

          if (changeType === 'insertion') {
            const sorted = [...ranges].sort((a, b) => b.from - a.from);
            for (const range of sorted) {
              tr.delete(range.from, range.to);
            }
          } else {
            for (const range of ranges) {
              tr.removeMark(range.from, range.to, deletionType);
            }
          }

          tr.setMeta('trackChangesInternal', true);
          if (dispatch) dispatch(tr);

          setTimeout(() => {
            this.storage.changes = collectChangesFromDoc(
              editor.state.doc,
              editor.state.schema
            );
            this.options.onChangesUpdate?.(this.storage.changes);
          }, 0);

          return true;
        },

      acceptAllChanges:
        () =>
        ({ editor, tr, state, dispatch }) => {
          const doc = state.doc;
          const schema = state.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          const deletionRanges: { from: number; to: number }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) {
                deletionRanges.push({ from: pos, to: pos + node.nodeSize });
              }
            }
          });

          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) {
                tr.removeMark(pos, pos + node.nodeSize, insertionType);
              }
            }
          });

          const sorted = [...deletionRanges].sort((a, b) => b.from - a.from);
          for (const range of sorted) {
            const mappedFrom = tr.mapping.map(range.from);
            const mappedTo = tr.mapping.map(range.to);
            tr.delete(mappedFrom, mappedTo);
          }

          tr.setMeta('trackChangesInternal', true);
          if (dispatch) dispatch(tr);

          setTimeout(() => {
            this.storage.changes = [];
            this.options.onChangesUpdate?.([]);
          }, 0);

          return true;
        },

      rejectAllChanges:
        () =>
        ({ editor, tr, state, dispatch }) => {
          const doc = state.doc;
          const schema = state.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          const insertionRanges: { from: number; to: number }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) {
                insertionRanges.push({ from: pos, to: pos + node.nodeSize });
              }
            }
          });

          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) {
                tr.removeMark(pos, pos + node.nodeSize, deletionType);
              }
            }
          });

          const sorted = [...insertionRanges].sort((a, b) => b.from - a.from);
          for (const range of sorted) {
            const mappedFrom = tr.mapping.map(range.from);
            const mappedTo = tr.mapping.map(range.to);
            tr.delete(mappedFrom, mappedTo);
          }

          tr.setMeta('trackChangesInternal', true);
          if (dispatch) dispatch(tr);

          setTimeout(() => {
            this.storage.changes = [];
            this.options.onChangesUpdate?.([]);
          }, 0);

          return true;
        },

      navigateToNextChange:
        () =>
        ({ tr, state, dispatch }) => {
          const changes = collectChangesFromDoc(state.doc, state.schema);
          if (changes.length === 0) return false;
          const cursorPos = state.selection.from;
          const sorted = [...changes].sort((a, b) => a.from - b.from);
          const next = sorted.find(c => c.from > cursorPos) || sorted[0];
          if (dispatch) {
            const sel = TextSelection.near(state.doc.resolve(next.from));
            tr.setSelection(sel);
            tr.scrollIntoView();
            dispatch(tr);
          }
          return true;
        },

      navigateToPreviousChange:
        () =>
        ({ tr, state, dispatch }) => {
          const changes = collectChangesFromDoc(state.doc, state.schema);
          if (changes.length === 0) return false;
          const cursorPos = state.selection.from;
          const sorted = [...changes].sort((a, b) => b.from - a.from);
          const prev = sorted.find(c => c.from < cursorPos) || sorted[0];
          if (dispatch) {
            const sel = TextSelection.near(state.doc.resolve(prev.from));
            tr.setSelection(sel);
            tr.scrollIntoView();
            dispatch(tr);
          }
          return true;
        },

      acceptChangeAtCursor:
        () =>
        ({ commands, state }) => {
          const cursorPos = state.selection.from;
          const changes = collectChangesFromDoc(state.doc, state.schema);
          const atCursor = changes.find(c => c.from <= cursorPos && c.to >= cursorPos);
          if (!atCursor) return false;
          return commands.acceptChange(atCursor.id);
        },

      rejectChangeAtCursor:
        () =>
        ({ commands, state }) => {
          const cursorPos = state.selection.from;
          const changes = collectChangesFromDoc(state.doc, state.schema);
          const atCursor = changes.find(c => c.from <= cursorPos && c.to >= cursorPos);
          if (!atCursor) return false;
          return commands.rejectChange(atCursor.id);
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: trackChangesPluginKey,

        filterTransaction(tr, state) {
          if (tr.getMeta('trackChangesInternal')) return true;

          const schema = state.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;
          if (!insertionType && !deletionType) return true;

          // === TRACKING OFF: strip track marks from storedMarks ===
          if (!extension.storage.enabled) {
            const stored = tr.storedMarks;
            if (stored) {
              const hasTrack = stored.some(
                (m) => m.type === insertionType || m.type === deletionType
              );
              if (hasTrack) {
                const clean = stored.filter(
                  (m) => m.type !== insertionType && m.type !== deletionType
                );
                tr.setStoredMarks(clean);
              }
            }
            return true;
          }

          // === TRACKING ON: same-block deletions are now handled in handleKeyDown ===
          // Cross-block and programmatic deletions pass through to appendTransaction.
          return true;
        },

        props: {
          /**
           * Authoritative text input handler.
           * 
           * TRACKING ON: strip deletion marks from new text so it gets insertion mark only.
           * TRACKING OFF: insert plain text, preserve existing deletion marks on document,
           *               split deletion if typing in the middle.
           */
          handleTextInput(view, from, to, text) {
            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            const currentMarks = state.storedMarks || state.selection.$from.marks();
            const cleanMarks = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );

            const isCollapsed = from === to;
            const deletionCursorContext = isCollapsed
              ? getDeletionCursorContext(state, from, deletionType)
              : null;

            const isInsideDeletion = Boolean(deletionCursorContext);

            // Typing inside an existing deletion must split it into two deletion runs
            // with plain text in the middle (never inherit tracked marks).
            if (isInsideDeletion) {
              const tr = state.tr.insertText(text, from, to);
              const insertEnd = from + text.length;

              if (deletionType) tr.removeMark(from, insertEnd, deletionType);
              if (insertionType) tr.removeMark(from, insertEnd, insertionType);

              // Split deletion into two independent runs by assigning a new changeId
              // to the right segment (prevents duplicate IDs in review lists).
              if (deletionType && deletionCursorContext) {
                const rightFrom = insertEnd;
                const rightTo = deletionCursorContext.nodeTo + text.length;
                if (rightTo > rightFrom) {
                  const rightDeletionMark = deletionType.create({
                    ...deletionCursorContext.attrs,
                    changeId: generateChangeId(),
                  });
                  tr.removeMark(rightFrom, rightTo, deletionType);
                  tr.addMark(rightFrom, rightTo, rightDeletionMark);
                }
              }

              // When tracking is ON, the inserted text should get an insertion mark
              if (extension.storage.enabled && insertionType) {
                const MERGE_WINDOW = 5000;
                const now = Date.now();
                let changeId: string;
                if (extension.storage.lastInsertionId && now - extension.storage.lastInsertionTime < MERGE_WINDOW) {
                  changeId = extension.storage.lastInsertionId;
                } else {
                  changeId = generateChangeId();
                }
                extension.storage.lastInsertionId = changeId;
                extension.storage.lastInsertionTime = now;

                const insertMark = insertionType.create({
                  changeId,
                  authorId: extension.options.authorId,
                  authorName: extension.options.authorName,
                  authorColor: extension.options.authorColor,
                  timestamp: new Date().toISOString(),
                });
                tr.addMark(from, insertEnd, insertMark);
              }

              tr.setStoredMarks(cleanMarks);
              tr.setMeta('trackChangesInternal', true);
              tr.setMeta('addToHistory', true);

              try {
                tr.setSelection(TextSelection.near(tr.doc.resolve(insertEnd), 1));
              } catch {
                // let PM recover selection if needed
              }

              view.dispatch(tr);

              const changes = collectChangesFromDoc(view.state.doc, state.schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
              return true;
            }

            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );

            // No tracked context: let PM do normal typing.
            if (!hasTrackMarks && !isInsideDeletion) return false;

            // Tracking OFF: clear stored marks only, let default insertion run.
            if (!extension.storage.enabled) {
              const tr = state.tr.setStoredMarks(cleanMarks);
              tr.setMeta('trackChangesInternal', true);
              tr.setMeta('addToHistory', false);
              view.dispatch(tr);
              return false;
            }

            // Tracking ON near tracked marks: force clean insertion point so text
            // cannot inherit deletion styling; appendTransaction will mark insertion.
            const tr = state.tr.insertText(text, from, to);
            const insertEnd = from + text.length;
            if (deletionType) tr.removeMark(from, insertEnd, deletionType);
            tr.setStoredMarks(cleanMarks);
            tr.setMeta('addToHistory', true);
            view.dispatch(tr);
            return true;
          },

          // Proactive interception for Enter key and Backspace/Delete
          handleKeyDown(view, event) {
            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            // === TRACKING ON: intercept Backspace/Delete synchronously ===
            if (extension.storage.enabled) {
              if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
              // Don't intercept Ctrl/Meta word-delete — let appendTransaction handle
              if (event.ctrlKey || event.metaKey || event.altKey) return false;

              const { selection } = state;
              let from: number, to: number;

              if (selection.empty) {
                const $pos = state.doc.resolve(selection.from);
                if (event.key === 'Backspace') {
                  if ($pos.parentOffset === 0) return false; // block boundary
                  const parentStart = selection.from - $pos.parentOffset;
                  // Skip backward over already-deleted text using nodeBefore
                  let targetPos = selection.from;
                  while (targetPos > parentStart) {
                    const $t = state.doc.resolve(targetPos);
                    const before = $t.nodeBefore;
                    if (before && before.isText && before.marks.some((m: PMMark) => m.type === deletionType)) {
                      targetPos -= before.nodeSize;
                    } else {
                      break;
                    }
                  }
                  if (targetPos <= parentStart) {
                    // Everything before cursor is already deleted — just move cursor
                    const tr = state.tr.setSelection(TextSelection.create(state.doc, parentStart));
                    tr.setMeta('trackChangesInternal', true);
                    tr.setMeta('addToHistory', false);
                    view.dispatch(tr);
                    return true;
                  }
                  // Target the single character just before targetPos
                  from = targetPos - 1;
                  to = targetPos;
                } else {
                  if ($pos.parentOffset === $pos.parent.content.size) return false; // end of block
                  const parentEnd = selection.from - $pos.parentOffset + $pos.parent.content.size;
                  // Skip forward over already-deleted text using nodeAfter
                  // Account for textOffset when inside a text node
                  let targetPos = selection.from;
                  while (targetPos < parentEnd) {
                    const $t = state.doc.resolve(targetPos);
                    const after = $t.nodeAfter;
                    if (after && after.isText && after.marks.some((m: PMMark) => m.type === deletionType)) {
                      // Skip to end of this text node (handle mid-node positions)
                      targetPos += after.nodeSize - $t.textOffset;
                    } else {
                      break;
                    }
                  }
                  if (targetPos >= parentEnd) {
                    // Everything after cursor is already deleted — just move cursor
                    const tr = state.tr.setSelection(TextSelection.create(state.doc, parentEnd));
                    tr.setMeta('trackChangesInternal', true);
                    tr.setMeta('addToHistory', false);
                    view.dispatch(tr);
                    return true;
                  }
                  from = targetPos;
                  to = targetPos + 1;
                }
              } else {
                from = selection.from;
                to = selection.to;
              }

              // Check if crosses block boundaries → let appendTransaction handle
              try {
                const $from = state.doc.resolve(from);
                const $to = state.doc.resolve(to);
                if (!$from.sameParent($to)) return false;
              } catch {
                return false;
              }

              const authorId = extension.options.authorId;
              const authorName = extension.options.authorName;
              const authorColor = extension.options.authorColor;
              const MERGE_WINDOW = 5000;
              const now = Date.now();

              const toDelete: Array<{ from: number; to: number }> = [];
              const toMarkDel: Array<{ from: number; to: number }> = [];

              state.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isInline) return;
                const nFrom = Math.max(pos, from);
                const nTo = Math.min(pos + node.nodeSize, to);

                if (!node.isText) {
                  toDelete.push({ from: nFrom, to: nTo });
                  return;
                }

                const isOwnInsertion = node.marks.some(
                  (m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId
                );
                if (isOwnInsertion) {
                  toDelete.push({ from: nFrom, to: nTo });
                  return;
                }

                const hasExistingDeletion = node.marks.some(
                  (m: PMMark) => m.type === deletionType
                );
                if (hasExistingDeletion) {
                  // Already tracked as deleted — skip it entirely
                  return;
                }

                toMarkDel.push({ from: nFrom, to: nTo });
              });

              if (toDelete.length === 0 && toMarkDel.length === 0) return false;

              const tr = state.tr;
              tr.setMeta('trackChangesInternal', true);
              tr.setMeta('addToHistory', true);

              // 1. Add deletion marks (no position change)
              let deletionEnd = from; // track rightmost edge of deletion marks
              if (toMarkDel.length > 0) {
                let changeId: string;
                if (extension.storage.lastDeletionId && now - extension.storage.lastDeletionTime < MERGE_WINDOW) {
                  changeId = extension.storage.lastDeletionId;
                } else {
                  changeId = generateChangeId();
                }
                extension.storage.lastDeletionId = changeId;
                extension.storage.lastDeletionTime = now;

                const mark = deletionType.create({
                  changeId,
                  authorId,
                  authorName,
                  authorColor,
                  timestamp: new Date().toISOString(),
                });
                for (const r of toMarkDel) {
                  // Remove any existing insertion marks to prevent double-marking corruption
                  tr.removeMark(r.from, r.to, insertionType);
                  tr.addMark(r.from, r.to, mark);
                  deletionEnd = Math.max(deletionEnd, r.to);
                }
              }

              // 2. Actually delete own insertions and non-text inline nodes (reverse order)
              const sortedDeletes = [...toDelete].sort((a, b) => b.from - a.from);
              for (const r of sortedDeletes) {
                tr.delete(r.from, r.to);
              }

              // Rule A: Set cursor to RIGHT edge of the deletion span using stable placement
              try {
                let cursorTarget: number;
                if (toMarkDel.length > 0) {
                  cursorTarget = tr.mapping.map(deletionEnd);
                } else {
                  cursorTarget = tr.mapping.map(from);
                }
                cursorTarget = Math.min(Math.max(cursorTarget, 0), tr.doc.content.size);
                const $cursor = tr.doc.resolve(cursorTarget);
                tr.setSelection(TextSelection.near($cursor));
              } catch { /* let PM handle */ }

              // Clear stored marks to prevent track mark inheritance
              const storedClean = (state.storedMarks || state.selection.$from.marks()).filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              );
              tr.setStoredMarks(storedClean);

              view.dispatch(tr);

              // Update review panel
              const changes = collectChangesFromDoc(view.state.doc, state.schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);

              return true;
            }

            // === TRACKING OFF: handle Enter ===
            if (event.key !== 'Enter') return false;

            const currentMarks =
              state.storedMarks || state.selection.$from.marks();
            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );
            if (!hasTrackMarks) return false;

            // Clear stored marks so the default Enter handler won't inherit them
            const clean = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );
            const tr = state.tr.setStoredMarks(clean);
            tr.setMeta('trackChangesInternal', true);
            tr.setMeta('addToHistory', false);
            view.dispatch(tr);
            // Return false so the default Enter behavior still runs
            return false;
          },
        },

        appendTransaction(transactions, oldState, newState) {
          // Check for internal/system transactions
          for (const tr of transactions) {
            if (tr.getMeta('blockReorder')) return null;
          }

          let hasUserChange = false;
          for (const tr of transactions) {
            if (tr.getMeta('trackChangesInternal')) continue;
            if (
              tr.getMeta('setContent') ||
              tr.getMeta('preventUpdate') !== undefined
            )
              continue;
            if (tr.docChanged) {
              hasUserChange = true;
              break;
            }
          }

          const schema = newState.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          // === TRACKING OFF ===
          // STRICT INVARIANT: existing tracked marks are IMMUTABLE.
          // Strip track marks only from genuinely NEW insertions (defensive catch-all).
          // This handles programmatic insertions (insertContent) that bypass handleTextInput.
          if (!extension.storage.enabled) {
            if (!insertionType && !deletionType) return null;
            
            let needsTr = false;
            const cleanTr = newState.tr;
            cleanTr.setMeta('trackChangesInternal', true);
            cleanTr.setMeta('addToHistory', false);

            // Only clean storedMarks — never touch pre-existing document marks
            const stored = newState.storedMarks || newState.selection.$from.marks();
            if (stored.length > 0) {
              const withoutTrack = stored.filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              );
              if (withoutTrack.length !== stored.length) {
                cleanTr.setStoredMarks(withoutTrack);
                needsTr = true;
              }
            }

            // Strip inherited track marks from newly inserted ranges
            if (hasUserChange) {
              for (const tr of transactions) {
                if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;
                tr.steps.forEach((step) => {
                  const stepMap = step.getMap();
                  stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
                    // Only target genuine insertions (new content added, not pre-existing)
                    if (newEnd > newStart && oldEnd === oldStart) {
                      // Map positions through cleanTr's own mapping
                      const mappedFrom = cleanTr.mapping.map(newStart);
                      const mappedTo = cleanTr.mapping.map(newEnd);
                      if (deletionType) {
                        cleanTr.removeMark(mappedFrom, mappedTo, deletionType);
                        needsTr = true;
                      }
                      if (insertionType) {
                        cleanTr.removeMark(mappedFrom, mappedTo, insertionType);
                        needsTr = true;
                      }
                    }
                  });
                });
              }

              if (stripInvalidMixedTrackMarks(cleanTr.doc, cleanTr, schema)) {
                needsTr = true;
              }

              // Reconcile review panel when content changes
              const changes = collectChangesFromDoc(
                needsTr ? cleanTr.doc : newState.doc, schema
              );
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
            }

            // Defensive mixed-mark sanitizer (applies even without user change)
            if (stripInvalidMixedTrackMarks(needsTr ? cleanTr.doc : newState.doc, cleanTr, schema)) {
              needsTr = true;
              const changes = collectChangesFromDoc(cleanTr.doc, schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
            }

            return needsTr ? cleanTr : null;
          }

          // === TRACKING ON ===
          if (!hasUserChange) return null;

          const authorId = extension.options.authorId;
          const authorName = extension.options.authorName;
          const authorColor = extension.options.authorColor;

          if (!insertionType) return null;

          const newTr = newState.tr;
          newTr.setMeta('trackChangesInternal', true);
          newTr.setMeta('addToHistory', false);
          let modified = false;

          const MERGE_WINDOW_MS = 5000;
          const now = Date.now();

          for (const tr of transactions) {
            if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;

            tr.steps.forEach((step, stepIndex) => {
              const stepMap = step.getMap();

              stepMap.forEach(
                (
                  oldStart: number,
                  oldEnd: number,
                  newStart: number,
                  newEnd: number
                ) => {
                  const isDelete = oldEnd > oldStart;
                  const isInsert = newEnd > newStart;

                  // === CROSS-BLOCK DELETION (same-block handled in handleKeyDown) ===
                  if (isDelete) {
                    const deletedSlice = oldState.doc.slice(oldStart, oldEnd);

                    // Check each node: only re-insert if not own insertion
                    const nodesToReinsert: any[] = [];
                    const nodesToReject: any[] = [];

                    oldState.doc.nodesBetween(
                      oldStart,
                      oldEnd,
                      (node, nodePos) => {
                        if (!node.isText) return;

                        const isOwnInsertion = node.marks.some(
                          (m: PMMark) =>
                            m.type === insertionType &&
                            m.attrs.authorId === authorId
                        );
                        if (isOwnInsertion) return; // silently removed

                        const existingDeletion = node.marks.find(
                          (m: PMMark) => m.type === deletionType
                        );

                        if (existingDeletion) {
                          const cleanMarks = node.marks.filter(
                            (m: PMMark) =>
                              m.type !== deletionType &&
                              m.type !== insertionType
                          );
                          nodesToReject.push(node.mark(cleanMarks));
                        } else {
                          nodesToReinsert.push(node);
                        }
                      }
                    );

                    let reinsertedLength = 0;

                    // Re-insert rejected nodes (restored text)
                    if (nodesToReject.length > 0) {
                      newTr.insert(newStart, Fragment.from(nodesToReject));
                      reinsertedLength += nodesToReject.reduce(
                        (sum: number, n: any) => sum + n.nodeSize,
                        0
                      );
                      modified = true;
                    }

                    // Re-insert normal text with deletion mark
                    if (nodesToReinsert.length > 0) {
                      let changeId: string;
                      if (
                        extension.storage.lastDeletionId &&
                        now - extension.storage.lastDeletionTime <
                          MERGE_WINDOW_MS
                      ) {
                        changeId = extension.storage.lastDeletionId;
                      } else {
                        changeId = generateChangeId();
                      }
                      extension.storage.lastDeletionId = changeId;
                      extension.storage.lastDeletionTime = now;

                      const deletionMark = deletionType.create({
                        changeId,
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date().toISOString(),
                      });

                      const markedNodes = nodesToReinsert.map((node: any) => {
                        const cleanMarks = node.marks.filter(
                          (m: PMMark) => m.type !== insertionType
                        );
                        const newMarks = deletionMark.addToSet(cleanMarks);
                        return node.mark(newMarks);
                      });

                      const insertPos =
                        newStart +
                        nodesToReject.reduce(
                          (sum: number, n: any) => sum + n.nodeSize,
                          0
                        );
                      newTr.insert(insertPos, Fragment.from(markedNodes));
                      
                      // Rule A: Set cursor to RIGHT edge of the deleted span
                      const rightEdge = insertPos + markedNodes.reduce(
                        (sum: number, n: any) => sum + n.nodeSize, 0
                      );
                      try {
                        newTr.setSelection(TextSelection.create(newTr.doc, rightEdge));
                      } catch { /* let PM handle */ }

                      // Clear stored marks to prevent deletion mark inheritance
                      const storedClean = (newState.storedMarks || newState.selection.$from.marks()).filter(
                        (m) => m.type !== insertionType && m.type !== deletionType
                      );
                      newTr.setStoredMarks(storedClean);

                      reinsertedLength += markedNodes.reduce(
                        (sum: number, n: any) => sum + n.nodeSize,
                        0
                      );
                      modified = true;
                    }

                    // For replacements: also mark newly inserted text
                    if (isInsert) {
                      const insertedText = newState.doc.textBetween(
                        newStart,
                        newEnd,
                        ' '
                      );
                      if (insertedText.trim()) {
                        const insertionChangeId = generateChangeId();
                        extension.storage.lastInsertionId = insertionChangeId;
                        extension.storage.lastInsertionTime = now;

                        const mark = insertionType.create({
                          changeId: insertionChangeId,
                          authorId,
                          authorName,
                          authorColor,
                          timestamp: new Date().toISOString(),
                        });

                        newTr.addMark(
                          newStart + reinsertedLength,
                          newEnd + reinsertedLength,
                          mark
                        );
                        modified = true;
                      }
                    }

                    return; // done with this step range
                  }

                  // === PURE INSERTION ===
                  if (isInsert && !isDelete) {
                    const insertedText = newState.doc.textBetween(
                      newStart,
                      newEnd,
                      ' '
                    );

                    // Typing is handled authoritatively in handleTextInput.
                    // For non-keyboard/programmatic inserts, keep normal insertion flow here.

                    const hasActiveMerge =
                      extension.storage.lastInsertionId &&
                      now - extension.storage.lastInsertionTime <
                        MERGE_WINDOW_MS;

                    if (insertedText.trim() || hasActiveMerge) {
                      let changeId: string;
                      if (hasActiveMerge) {
                        changeId = extension.storage.lastInsertionId!;
                      } else {
                        changeId = generateChangeId();
                      }

                      extension.storage.lastInsertionId = changeId;
                      extension.storage.lastInsertionTime = now;

                      const mark = insertionType.create({
                        changeId,
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date().toISOString(),
                      });

                      // Strip inherited deletion marks from newly typed text
                      if (deletionType) newTr.removeMark(newStart, newEnd, deletionType);
                      newTr.addMark(newStart, newEnd, mark);
                      modified = true;
                    }
                  }
                }
              );
            });
          }

          if (modified) {
            // Update review panel synchronously
            const changes = collectChangesFromDoc(
              newTr.doc ?? newState.doc,
              schema
            );
            extension.storage.changes = changes;
            extension.options.onChangesUpdate?.(changes);

            return newTr;
          }

          return null;
        },
      }),
    ];
  },
});
