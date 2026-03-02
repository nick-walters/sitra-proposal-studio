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
 * Find the contiguous deletion segment surrounding `pos`.
 * Returns { from, to, attrs } or null.
 */
function findDeletionSegmentAtPos(doc: any, pos: number, deletionType: any): { from: number; to: number; attrs: any } | null {
  if (!deletionType) return null;

  // Resolve position, check marks at cursor
  let $pos;
  try {
    $pos = doc.resolve(pos);
  } catch { return null; }

  // Check node before and after cursor for deletion marks
  const nodeBefore = $pos.nodeBefore;
  const nodeAfter = $pos.nodeAfter;

  let targetMark: PMMark | null = null;
  let searchPos = pos;

  if (nodeBefore && nodeBefore.isText) {
    const m = nodeBefore.marks.find((m: PMMark) => m.type === deletionType);
    if (m) { targetMark = m; searchPos = pos - 1; }
  }
  if (!targetMark && nodeAfter && nodeAfter.isText) {
    const m = nodeAfter.marks.find((m: PMMark) => m.type === deletionType);
    if (m) { targetMark = m; searchPos = pos; }
  }
  if (!targetMark) return null;

  const changeId = targetMark.attrs.changeId;

  // Walk backwards to find segment start
  let segFrom = searchPos;
  doc.nodesBetween(0, pos, (node: any, nodePos: number) => {
    if (!node.isText) return;
    const end = nodePos + node.nodeSize;
    if (end <= segFrom && node.marks.some((m: PMMark) => m.type === deletionType && m.attrs.changeId === changeId)) {
      segFrom = nodePos;
    }
  });

  // Walk forward to find segment end
  let segTo = searchPos;
  doc.nodesBetween(searchPos, doc.content.size, (node: any, nodePos: number) => {
    if (!node.isText) return;
    if (node.marks.some((m: PMMark) => m.type === deletionType && m.attrs.changeId === changeId)) {
      segTo = Math.max(segTo, nodePos + node.nodeSize);
    } else if (nodePos >= segTo) {
      return false; // stop
    }
  });

  // More precise: find exact contiguous range containing `pos`
  // Re-scan for contiguous run
  let from = -1;
  let to = -1;
  doc.descendants((node: any, nodePos: number) => {
    if (!node.isText) return;
    const nEnd = nodePos + node.nodeSize;
    const hasMark = node.marks.some((m: PMMark) => m.type === deletionType && m.attrs.changeId === changeId);
    if (hasMark) {
      if (from === -1) {
        // Check if this run touches our position
        if (nEnd >= pos - nodeBefore?.nodeSize! || nodePos <= pos) {
          from = nodePos;
          to = nEnd;
        }
      } else if (nodePos <= to) {
        // Extend contiguous range
        to = nEnd;
      }
    } else if (from !== -1 && nodePos >= to) {
      // Gap found, stop extending
    }
  });

  if (from === -1 || to === -1) return null;
  // Verify our pos is actually within this segment
  if (pos < from || pos > to) return null;

  return { from, to, attrs: targetMark.attrs };
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
            // === TRACKING ON: strip deletion marks from typed text ===
            if (extension.storage.enabled) {
              const { state } = view;
              const deletionType = state.schema.marks.trackDeletion;
              if (!deletionType) return false;

              const currentMarks = state.storedMarks || state.selection.$from.marks();
              const hasDeletionMark = currentMarks.some((m) => m.type === deletionType);
              if (!hasDeletionMark) return false;

              // Strip deletion marks, keep everything else
              const clean = currentMarks.filter((m) => m.type !== deletionType);
              const tr = state.tr.insertText(text, from, to);
              const insertEnd = from + text.length;
              tr.removeMark(from, insertEnd, deletionType);
              tr.setStoredMarks(clean);
              tr.setMeta('addToHistory', true);
              // Don't set trackChangesInternal so appendTransaction can add insertion mark
              view.dispatch(tr);
              return true;
            }

            // === TRACKING OFF: authoritative handler ===
            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            // Check if cursor is at/inside a deletion mark
            const currentMarks = state.storedMarks || state.selection.$from.marks();
            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );

            if (!hasTrackMarks) {
              // Also check nodeBefore/nodeAfter for deletion marks that might inherit
              const $pos = state.doc.resolve(from);
              const beforeHasDel = $pos.nodeBefore?.marks?.some((m: PMMark) => m.type === deletionType);
              const afterHasDel = $pos.nodeAfter?.marks?.some((m: PMMark) => m.type === deletionType);
              if (!beforeHasDel && !afterHasDel) return false;
            }

            // Build clean mark set without ANY track marks
            const clean = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );

            // Insert the text
            const tr = state.tr.insertText(text, from, to);
            const insertEnd = from + text.length;

            // Strip track marks ONLY from the newly inserted range
            if (insertionType) tr.removeMark(from, insertEnd, insertionType);
            if (deletionType) tr.removeMark(from, insertEnd, deletionType);

            // Set clean stored marks so subsequent typing doesn't inherit
            tr.setStoredMarks(clean);

            // Mark as internal so appendTransaction won't touch it
            tr.setMeta('trackChangesInternal', true);
            tr.setMeta('addToHistory', true);
            view.dispatch(tr);

            // Reconcile review panel
            const changes = collectChangesFromDoc(view.state.doc, state.schema);
            extension.storage.changes = changes;
            extension.options.onChangesUpdate?.(changes);

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
                  from = selection.from - 1;
                  to = selection.from;
                } else {
                  if ($pos.parentOffset === $pos.parent.content.size) return false; // end of block
                  from = selection.from;
                  to = selection.from + 1;
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
              const toReject: Array<{ from: number; to: number }> = [];
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
                  toReject.push({ from: nFrom, to: nTo });
                  return;
                }

                toMarkDel.push({ from: nFrom, to: nTo });
              });

              if (toDelete.length === 0 && toReject.length === 0 && toMarkDel.length === 0) return false;

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
                  tr.addMark(r.from, r.to, mark);
                  deletionEnd = Math.max(deletionEnd, r.to);
                }
              }

              // 2. Remove deletion marks from rejected text
              for (const r of toReject) {
                tr.removeMark(r.from, r.to, deletionType);
              }

              // 3. Actually delete own insertions and non-text inline nodes (reverse order)
              const sortedDeletes = [...toDelete].sort((a, b) => b.from - a.from);
              for (const r of sortedDeletes) {
                tr.delete(r.from, r.to);
              }

              // Rule A: Set cursor to RIGHT edge of the deletion span
              let cursorPos: number;
              if (toMarkDel.length > 0) {
                // Map the deletion end through any actual deletions that happened
                cursorPos = tr.mapping.map(deletionEnd);
              } else {
                cursorPos = tr.mapping.map(from);
              }
              try {
                cursorPos = Math.min(Math.max(cursorPos, 0), tr.doc.content.size);
                tr.setSelection(TextSelection.create(tr.doc, cursorPos));
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
          // Only clean storedMarks and reconcile review panel.
          // Do NOT strip marks from document ranges — handleTextInput handles that for new text.
          if (!extension.storage.enabled) {
            if (!insertionType && !deletionType) return null;
            
            let needsTr = false;
            const cleanTr = newState.tr;
            cleanTr.setMeta('trackChangesInternal', true);
            cleanTr.setMeta('addToHistory', false);

            // Only clean storedMarks — never touch document marks
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

            // Reconcile review panel when content changes
            if (hasUserChange) {
              const changes = collectChangesFromDoc(newState.doc, schema);
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
