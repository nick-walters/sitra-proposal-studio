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
 * Returns the absolute bounds of that deletion node + its attrs.
 *
 * BUG FIX: Use strict interior check (> and <) to avoid triggering the
 * split path when the cursor is sitting exactly at the boundary between
 * a deletion node and a non-deletion node. Boundary positions should fall
 * through to normal typing, not into the split-deletion path.
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

    // STRICT interior check: cursor must be strictly inside the deletion node,
    // NOT at either boundary. Boundary positions (== childStart or == childEnd)
    // are handled by the normal typing path with inclusive: false on the mark.
    console.log('TC-DEBUG', { parentOffset, childStart, childEnd, isText: child.isText });
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
 */
function collectChangesFromDoc(doc: any, schema: any): TrackChange[] {
  const changes: TrackChange[] = [];
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType && !deletionType) return [];

  let currentRun: { changeId: string; type: 'insertion' | 'deletion'; attrs: any; from: number; to: number } | null = null;

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) {
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
          currentRun.to = markEnd;
        } else {
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
        return;
      }
    }

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
            this.storage.changes = collectChangesFromDoc(editor.state.doc, editor.state.schema);
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
            this.storage.changes = collectChangesFromDoc(editor.state.doc, editor.state.schema);
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

          return true;
        },

        props: {
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

            // BUG FIX: getDeletionCursorContext now uses strict interior check (> and <),
            // so this only fires when cursor is genuinely INSIDE a deletion node,
            // never at its boundaries. Boundary typing falls through to normal paths.
            const deletionCursorContext = isCollapsed
              ? getDeletionCursorContext(state, from, deletionType)
              : null;

            const isInsideDeletion = Boolean(deletionCursorContext);

            // ── Path 1: Typing STRICTLY INSIDE an existing deletion ──
            // Split the deletion into two runs with typed text (plain or insertion) between.
            if (isInsideDeletion && deletionCursorContext) {
              const tr = state.tr.insertText(text, from, to);
              const insertEnd = from + text.length;

              // Strip any track marks from the newly inserted range
              if (deletionType) tr.removeMark(from, insertEnd, deletionType);
              if (insertionType) tr.removeMark(from, insertEnd, insertionType);

              // Re-apply deletion mark to the RIGHT segment of the split.
              // BUG FIX: nodeTo is a pre-insert absolute position. After insertText,
              // positions after `from` shift by text.length. Use tr.mapping.map()
              // to get the correct post-insert position for the right segment end.
              const rightFrom = insertEnd;
              const rightTo = tr.mapping.map(deletionCursorContext.nodeTo);
              if (rightTo > rightFrom) {
                const rightDeletionMark = deletionType.create({
                  ...deletionCursorContext.attrs,
                  changeId: generateChangeId(),
                });
                tr.removeMark(rightFrom, rightTo, deletionType);
                tr.addMark(rightFrom, rightTo, rightDeletionMark);
              }

              // BUG FIX: When tracking is ON, add insertion mark to the typed text.
              // Previously this branch added the insertion mark correctly, but the
              // boundary branch below did NOT — causing strikethrough on boundary typing.
              // Both paths now consistently add insertion marks when tracking is ON.
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

            // No tracked context and not inside deletion: let PM handle normally.
            if (!hasTrackMarks) return false;

            // ── Path 2: Tracking OFF near tracked marks ──
            // Clear stored marks only; let default insertion run.
            if (!extension.storage.enabled) {
              const tr = state.tr.setStoredMarks(cleanMarks);
              tr.setMeta('trackChangesInternal', true);
              tr.setMeta('addToHistory', false);
              view.dispatch(tr);
              return false;
            }

            // ── Path 3: Tracking ON at boundary of tracked marks ──
            // BUG FIX: Previously this path stripped deletion marks and dispatched
            // the transaction, then returned true — which blocked appendTransaction
            // from adding the insertion mark. The insertion mark was never applied,
            // causing new text to appear plain (and potentially inherit strikethrough
            // from adjacent deletion nodes visually). Fix: apply the insertion mark
            // HERE, directly in this transaction, before dispatching.
            const tr = state.tr.insertText(text, from, to);
            const insertEnd = from + text.length;

            // Strip any inherited deletion marks from the newly inserted text
            if (deletionType) tr.removeMark(from, insertEnd, deletionType);

            // Apply insertion mark immediately — do not rely on appendTransaction
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

            tr.setStoredMarks(cleanMarks);
            tr.setMeta('trackChangesInternal', true);
            tr.setMeta('addToHistory', true);
            view.dispatch(tr);

            const changes = collectChangesFromDoc(view.state.doc, state.schema);
            extension.storage.changes = changes;
            extension.options.onChangesUpdate?.(changes);
            return true;
          },

          handleKeyDown(view, event) {
            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            // === TRACKING ON: intercept Backspace/Delete synchronously ===
            if (extension.storage.enabled) {
              if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
              if (event.ctrlKey || event.metaKey || event.altKey) return false;

              const { selection } = state;
              let from: number, to: number;

              if (selection.empty) {
                const $pos = state.doc.resolve(selection.from);
                if (event.key === 'Backspace') {
                  if ($pos.parentOffset === 0) return false;
                  const parentStart = selection.from - $pos.parentOffset;
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
                    const tr = state.tr.setSelection(TextSelection.create(state.doc, parentStart));
                    tr.setMeta('trackChangesInternal', true);
                    tr.setMeta('addToHistory', false);
                    view.dispatch(tr);
                    return true;
                  }
                  from = targetPos - 1;
                  to = targetPos;
                } else {
                  if ($pos.parentOffset === $pos.parent.content.size) return false;
                  const parentEnd = selection.from - $pos.parentOffset + $pos.parent.content.size;
                  let targetPos = selection.from;
                  while (targetPos < parentEnd) {
                    const $t = state.doc.resolve(targetPos);
                    const after = $t.nodeAfter;
                    if (after && after.isText && after.marks.some((m: PMMark) => m.type === deletionType)) {
                      targetPos += after.nodeSize - $t.textOffset;
                    } else {
                      break;
                    }
                  }
                  if (targetPos >= parentEnd) {
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
                  return;
                }

                toMarkDel.push({ from: nFrom, to: nTo });
              });

              if (toDelete.length === 0 && toMarkDel.length === 0) return false;

              const tr = state.tr;
              tr.setMeta('trackChangesInternal', true);
              tr.setMeta('addToHistory', true);

              let deletionEnd = from;
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
                  tr.removeMark(r.from, r.to, insertionType);
                  tr.addMark(r.from, r.to, mark);
                  deletionEnd = Math.max(deletionEnd, r.to);
                }
              }

              const sortedDeletes = [...toDelete].sort((a, b) => b.from - a.from);
              for (const r of sortedDeletes) {
                tr.delete(r.from, r.to);
              }

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

              const storedClean = (state.storedMarks || state.selection.$from.marks()).filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              );
              tr.setStoredMarks(storedClean);

              view.dispatch(tr);

              const changes = collectChangesFromDoc(view.state.doc, state.schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);

              return true;
            }

            // === TRACKING OFF: handle Enter ===
            if (event.key !== 'Enter') return false;

            const currentMarks = state.storedMarks || state.selection.$from.marks();
            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );
            if (!hasTrackMarks) return false;

            const clean = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );
            const tr = state.tr.setStoredMarks(clean);
            tr.setMeta('trackChangesInternal', true);
            tr.setMeta('addToHistory', false);
            view.dispatch(tr);
            return false;
          },
        },

        appendTransaction(transactions, oldState, newState) {
          for (const tr of transactions) {
            if (tr.getMeta('blockReorder')) return null;
          }

          let hasUserChange = false;
          for (const tr of transactions) {
            if (tr.getMeta('trackChangesInternal')) continue;
            if (tr.getMeta('setContent') || tr.getMeta('preventUpdate') !== undefined) continue;
            if (tr.docChanged) {
              hasUserChange = true;
              break;
            }
          }

          const schema = newState.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          // === TRACKING OFF ===
          if (!extension.storage.enabled) {
            if (!insertionType && !deletionType) return null;
            
            let needsTr = false;
            const cleanTr = newState.tr;
            cleanTr.setMeta('trackChangesInternal', true);
            cleanTr.setMeta('addToHistory', false);

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

            if (hasUserChange) {
              for (const tr of transactions) {
                if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;
                tr.steps.forEach((step) => {
                  const stepMap = step.getMap();
                  stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
                    if (newEnd > newStart) {
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

              const changes = collectChangesFromDoc(needsTr ? cleanTr.doc : newState.doc, schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
            }

            if (stripInvalidMixedTrackMarks(needsTr ? cleanTr.doc : newState.doc, cleanTr, schema)) {
              needsTr = true;
              const changes = collectChangesFromDoc(cleanTr.doc, schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
            }

            return needsTr ? cleanTr : null;
          }

          // === TRACKING ON ===
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

            tr.steps.forEach((step) => {
              const stepMap = step.getMap();

              stepMap.forEach(
                (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
                  const isDelete = oldEnd > oldStart;
                  const isInsert = newEnd > newStart;

                  // === CROSS-BLOCK DELETION ===
                  if (isDelete) {
                    const nodesToReinsert: any[] = [];
                    const nodesToReject: any[] = [];

                    oldState.doc.nodesBetween(oldStart, oldEnd, (node, _nodePos) => {
                      if (!node.isText) return;

                      const isOwnInsertion = node.marks.some(
                        (m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId
                      );
                      if (isOwnInsertion) return;

                      const existingDeletion = node.marks.find(
                        (m: PMMark) => m.type === deletionType
                      );

                      if (existingDeletion) {
                        const cleanMarks = node.marks.filter(
                          (m: PMMark) => m.type !== deletionType && m.type !== insertionType
                        );
                        nodesToReject.push(node.mark(cleanMarks));
                      } else {
                        nodesToReinsert.push(node);
                      }
                    });

                    let reinsertedLength = 0;

                    if (nodesToReject.length > 0) {
                      newTr.insert(newStart, Fragment.from(nodesToReject));
                      reinsertedLength += nodesToReject.reduce(
                        (sum: number, n: any) => sum + n.nodeSize, 0
                      );
                      modified = true;
                    }

                    if (nodesToReinsert.length > 0) {
                      let changeId: string;
                      if (extension.storage.lastDeletionId && now - extension.storage.lastDeletionTime < MERGE_WINDOW_MS) {
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

                      const insertPos = newStart + nodesToReject.reduce(
                        (sum: number, n: any) => sum + n.nodeSize, 0
                      );
                      newTr.insert(insertPos, Fragment.from(markedNodes));

                      const rightEdge = insertPos + markedNodes.reduce(
                        (sum: number, n: any) => sum + n.nodeSize, 0
                      );
                      try {
                        newTr.setSelection(TextSelection.create(newTr.doc, rightEdge));
                      } catch { /* let PM handle */ }

                      const storedClean = (newState.storedMarks || newState.selection.$from.marks()).filter(
                        (m) => m.type !== insertionType && m.type !== deletionType
                      );
                      newTr.setStoredMarks(storedClean);

                      reinsertedLength += markedNodes.reduce(
                        (sum: number, n: any) => sum + n.nodeSize, 0
                      );
                      modified = true;
                    }

                    if (isInsert) {
                      const insertedText = newState.doc.textBetween(newStart, newEnd, ' ');
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

                        newTr.addMark(newStart + reinsertedLength, newEnd + reinsertedLength, mark);
                        modified = true;
                      }
                    }

                    return;
                  }

                  // === PURE INSERTION (programmatic only) ===
                  // BUG FIX: handleTextInput now sets trackChangesInternal = true on ALL
                  // keyboard transactions (including the boundary/Path 3 case), so this
                  // block only runs for genuinely programmatic insertions. The previous
                  // version left Path 3 transactions unmarked, causing appendTransaction
                  // to double-apply insertion marks via the hasActiveMerge path.
                  if (isInsert && !isDelete) {
                    const insertedText = newState.doc.textBetween(newStart, newEnd, ' ');

                    // Only mark if there is actual text content (not just whitespace/cursor moves)
                    if (insertedText.trim()) {
                      // For programmatic inserts, always generate a fresh changeId.
                      // Do NOT merge with lastInsertionId here — that ID was set by
                      // handleTextInput for keyboard typing and should not bleed into
                      // programmatic insertions.
                      const changeId = generateChangeId();

                      const mark = insertionType.create({
                        changeId,
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date().toISOString(),
                      });

                      if (deletionType) newTr.removeMark(newStart, newEnd, deletionType);
                      newTr.addMark(newStart, newEnd, mark);
                      modified = true;
                    }
                  }
                }
              );
            });
          }

          if (stripInvalidMixedTrackMarks(modified ? newTr.doc : newState.doc, newTr, schema)) {
            modified = true;
          }

          if (modified) {
            const changes = collectChangesFromDoc(newTr.doc ?? newState.doc, schema);
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
