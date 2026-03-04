import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
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
const trackDecorationsPluginKey = new PluginKey('trackDecorations');

function generateChangeId(): string {
  return `change-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ── Collect changes from doc ─────────────────────────────────────────────

function collectChangesFromDoc(doc: any, schema: any): TrackChange[] {
  const changes: TrackChange[] = [];
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType && !deletionType) return [];

  let currentRun: {
    changeId: string;
    type: 'insertion' | 'deletion';
    attrs: any;
    from: number;
    to: number;
  } | null = null;

  const flush = () => {
    if (!currentRun) return;
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
  };

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) { flush(); return; }

    let trackMark: PMMark | undefined;
    for (const m of node.marks) {
      if (m.type === insertionType || m.type === deletionType) { trackMark = m; break; }
    }

    if (!trackMark) { flush(); return; }

    const changeId = trackMark.attrs.changeId;
    const type = trackMark.type === insertionType ? 'insertion' : 'deletion';
    const markEnd = pos + node.nodeSize;

    if (currentRun && currentRun.changeId === changeId && currentRun.type === type && pos <= currentRun.to) {
      currentRun.to = markEnd;
    } else {
      flush();
      currentRun = { changeId, type, attrs: trackMark.attrs, from: pos, to: markEnd };
    }
  });

  flush();
  return changes;
}

// ── Build decorations from doc ───────────────────────────────────────────

function buildDecorations(doc: any, schema: any): DecorationSet {
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType && !deletionType) return DecorationSet.empty;

  const decos: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type === insertionType) {
        const color = mark.attrs.authorColor || '#3B82F6';
        decos.push(
          Decoration.inline(pos, pos + node.nodeSize, {
            style: `background-color: rgba(34, 197, 94, 0.3); border-bottom: 2px solid ${color};`,
            'data-track-insertion': '',
            'data-change-id': mark.attrs.changeId,
          })
        );
      } else if (mark.type === deletionType) {
        const color = mark.attrs.authorColor || '#EF4444';
        decos.push(
          Decoration.inline(pos, pos + node.nodeSize, {
            style: `background-color: rgba(239, 68, 68, 0.2); text-decoration: line-through; text-decoration-color: ${color}; color: #9ca3af;`,
            'data-track-deletion': '',
            'data-change-id': mark.attrs.changeId,
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decos);
}

// ── Mark definitions ─────────────────────────────────────────────────────

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
  excludes: 'trackDeletion',
  addAttributes() { return trackChangeAttributes(); },
  parseHTML() { return [{ tag: 'span[data-track-insertion]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-track-insertion': '' }), 0];
  },
});

const TrackDeletionMark = Mark.create({
  name: 'trackDeletion',
  inclusive: false,
  excludes: 'trackInsertion',
  addAttributes() { return trackChangeAttributes(); },
  parseHTML() { return [{ tag: 'span[data-track-deletion]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-track-deletion': '' }), 0];
  },
});

// ── Main extension ───────────────────────────────────────────────────────

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
          editor.view.dispatch(editor.state.tr.setMeta('trackChangesInternal', true));
          return true;
        },

      acceptChange:
        (changeId: string) =>
        ({ editor, tr, state, dispatch }) => {
          const insertionType = state.schema.marks.trackInsertion;
          const deletionType = state.schema.marks.trackDeletion;
          const ranges: { from: number; to: number; type: 'insertion' | 'deletion' }[] = [];

          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if ((mark.type === insertionType || mark.type === deletionType) && mark.attrs.changeId === changeId) {
                ranges.push({ from: pos, to: pos + node.nodeSize, type: mark.type === insertionType ? 'insertion' : 'deletion' });
              }
            }
          });

          if (ranges.length === 0) return false;
          const changeType = ranges[0].type;

          if (changeType === 'insertion') {
            for (const r of ranges) tr.removeMark(r.from, r.to, insertionType);
          } else {
            for (const r of [...ranges].sort((a, b) => b.from - a.from)) tr.delete(r.from, r.to);
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
          const insertionType = state.schema.marks.trackInsertion;
          const deletionType = state.schema.marks.trackDeletion;
          const ranges: { from: number; to: number; type: 'insertion' | 'deletion' }[] = [];

          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if ((mark.type === insertionType || mark.type === deletionType) && mark.attrs.changeId === changeId) {
                ranges.push({ from: pos, to: pos + node.nodeSize, type: mark.type === insertionType ? 'insertion' : 'deletion' });
              }
            }
          });

          if (ranges.length === 0) return false;
          const changeType = ranges[0].type;

          if (changeType === 'insertion') {
            for (const r of [...ranges].sort((a, b) => b.from - a.from)) tr.delete(r.from, r.to);
          } else {
            for (const r of ranges) tr.removeMark(r.from, r.to, deletionType);
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
          const insertionType = state.schema.marks.trackInsertion;
          const deletionType = state.schema.marks.trackDeletion;
          const deletionRanges: { from: number; to: number }[] = [];

          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) deletionRanges.push({ from: pos, to: pos + node.nodeSize });
              if (mark.type === insertionType) tr.removeMark(pos, pos + node.nodeSize, insertionType);
            }
          });

          for (const r of [...deletionRanges].sort((a, b) => b.from - a.from)) {
            tr.delete(tr.mapping.map(r.from), tr.mapping.map(r.to));
          }

          tr.setMeta('trackChangesInternal', true);
          tr.setMeta('addToHistory', false);
          if (dispatch) dispatch(tr);
          setTimeout(() => { this.storage.changes = []; this.options.onChangesUpdate?.([]); }, 0);
          return true;
        },

      rejectAllChanges:
        () =>
        ({ editor, tr, state, dispatch }) => {
          const insertionType = state.schema.marks.trackInsertion;
          const deletionType = state.schema.marks.trackDeletion;
          const insertionRanges: { from: number; to: number }[] = [];

          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) insertionRanges.push({ from: pos, to: pos + node.nodeSize });
              if (mark.type === deletionType) tr.removeMark(pos, pos + node.nodeSize, deletionType);
            }
          });

          for (const r of [...insertionRanges].sort((a, b) => b.from - a.from)) {
            tr.delete(tr.mapping.map(r.from), tr.mapping.map(r.to));
          }

          tr.setMeta('trackChangesInternal', true);
          tr.setMeta('addToHistory', false);
          if (dispatch) dispatch(tr);
          setTimeout(() => { this.storage.changes = []; this.options.onChangesUpdate?.([]); }, 0);
          return true;
        },

      navigateToNextChange:
        () =>
        ({ tr, state, dispatch }) => {
          const changes = collectChangesFromDoc(state.doc, state.schema);
          if (changes.length === 0) return false;
          const cursorPos = state.selection.from;
          const next = [...changes].sort((a, b) => a.from - b.from).find((c) => c.from > cursorPos) || changes[0];
          if (dispatch) { tr.setSelection(TextSelection.near(state.doc.resolve(next.from))); tr.scrollIntoView(); dispatch(tr); }
          return true;
        },

      navigateToPreviousChange:
        () =>
        ({ tr, state, dispatch }) => {
          const changes = collectChangesFromDoc(state.doc, state.schema);
          if (changes.length === 0) return false;
          const cursorPos = state.selection.from;
          const prev = [...changes].sort((a, b) => b.from - a.from).find((c) => c.from < cursorPos) || changes[0];
          if (dispatch) { tr.setSelection(TextSelection.near(state.doc.resolve(prev.from))); tr.scrollIntoView(); dispatch(tr); }
          return true;
        },

      acceptChangeAtCursor:
        () =>
        ({ commands, state }) => {
          const cursorPos = state.selection.from;
          const atCursor = collectChangesFromDoc(state.doc, state.schema).find((c) => c.from <= cursorPos && c.to >= cursorPos);
          if (!atCursor) return false;
          return commands.acceptChange(atCursor.id);
        },

      rejectChangeAtCursor:
        () =>
        ({ commands, state }) => {
          const cursorPos = state.selection.from;
          const atCursor = collectChangesFromDoc(state.doc, state.schema).find((c) => c.from <= cursorPos && c.to >= cursorPos);
          if (!atCursor) return false;
          return commands.rejectChange(atCursor.id);
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    // ── Decoration plugin ──────────────────────────────────────────────
    const decorationPlugin = new Plugin({
      key: trackDecorationsPluginKey,
      state: {
        init(_, { doc, schema }) { return buildDecorations(doc, schema); },
        apply(tr, old, _oldState, newState) {
          if (!tr.docChanged && !tr.getMeta('trackChangesInternal')) return old.map(tr.mapping, tr.doc);
          return buildDecorations(newState.doc, newState.schema);
        },
      },
      props: {
        decorations(state) { return this.getState(state); },
      },
    });

    // ── Keyboard handler plugin ────────────────────────────────────────
    // Handles Backspace/Delete when tracking ON, and Enter cleanup when tracking OFF
    const keyPlugin = new Plugin({
      key: trackChangesPluginKey,
      props: {
        handleKeyDown(view, event) {
          console.error('TC KEYDOWN', event.key);
          const { state } = view;
          const insertionType = state.schema.marks.trackInsertion;
          const deletionType = state.schema.marks.trackDeletion;

          // ── Tracking ON: intercept Backspace / Delete ──
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
                  const before = state.doc.resolve(targetPos).nodeBefore;
                  if (before?.isText && before.marks.some((m: PMMark) => m.type === deletionType)) {
                    targetPos -= before.nodeSize;
                  } else break;
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
                  if (after?.isText && after.marks.some((m: PMMark) => m.type === deletionType)) {
                    targetPos += after.nodeSize - $t.textOffset;
                  } else break;
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
              if (!state.doc.resolve(from).sameParent(state.doc.resolve(to))) return false;
            } catch { return false; }

            const authorId = extension.options.authorId;
            const authorName = extension.options.authorName;
            const authorColor = extension.options.authorColor;
            const now = Date.now();
            const MERGE_WINDOW = 5000;

            const toDelete: Array<{ from: number; to: number }> = [];
            const toMarkDel: Array<{ from: number; to: number }> = [];

            state.doc.nodesBetween(from, to, (node: any, pos: number) => {
              if (!node.isInline) return;
              const nFrom = Math.max(pos, from);
              const nTo = Math.min(pos + node.nodeSize, to);
              if (!node.isText) { toDelete.push({ from: nFrom, to: nTo }); return; }
              if (node.marks.some((m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId)) {
                toDelete.push({ from: nFrom, to: nTo }); return;
              }
              if (node.marks.some((m: PMMark) => m.type === deletionType)) return;
              toMarkDel.push({ from: nFrom, to: nTo });
            });

            if (toDelete.length === 0 && toMarkDel.length === 0) return false;

            const tr = state.tr;
            tr.setMeta('trackChangesInternal', true);

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

              const mark = deletionType.create({ changeId, authorId, authorName, authorColor, timestamp: new Date().toISOString() });
              for (const r of toMarkDel) {
                tr.removeMark(r.from, r.to, insertionType);
                tr.addMark(r.from, r.to, mark);
                deletionEnd = Math.max(deletionEnd, r.to);
              }
            }

            for (const r of [...toDelete].sort((a, b) => b.from - a.from)) tr.delete(r.from, r.to);

            try {
              const cursorTarget = Math.min(
                Math.max(toMarkDel.length > 0 ? tr.mapping.map(deletionEnd) : tr.mapping.map(from), 0),
                tr.doc.content.size
              );
              tr.setSelection(TextSelection.near(tr.doc.resolve(cursorTarget)));
            } catch { /* let PM handle */ }

            tr.setStoredMarks(
              (state.storedMarks ?? state.selection.$from.marks()).filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              )
            );

            view.dispatch(tr);
            const changes = collectChangesFromDoc(view.state.doc, state.schema);
            extension.storage.changes = changes;
            extension.options.onChangesUpdate?.(changes);
            return true;
          }

          // ── Tracking OFF: clean stored marks on Enter ──
          if (event.key !== 'Enter') return false;
          const currentMarks = state.storedMarks ?? state.selection.$from.marks();
          if (!currentMarks.some((m) => m.type === insertionType || m.type === deletionType)) return false;
          const tr = state.tr.setStoredMarks(
            currentMarks.filter((m) => m.type !== insertionType && m.type !== deletionType)
          );
          tr.setMeta('trackChangesInternal', true);
          tr.setMeta('addToHistory', false);
          view.dispatch(tr);
          return false;
        },
      },
    });

    return [decorationPlugin, keyPlugin];
  },
});
