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

/**
 * Scan the document for all insertion/deletion marks and build
 * a list of TrackChange objects with current positions.
 */
function collectChangesFromDoc(doc: any, schema: any): TrackChange[] {
  const changeMap = new Map<string, TrackChange>();
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType && !deletionType) return [];

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type === insertionType || mark.type === deletionType) {
        const attrs = mark.attrs;
        const markEnd = pos + node.nodeSize;
        const existing = changeMap.get(attrs.changeId);
        if (existing) {
          existing.from = Math.min(existing.from, pos);
          existing.to = Math.max(existing.to, markEnd);
          existing.content = doc.textBetween(existing.from, existing.to, ' ');
        } else {
          const change: TrackChange = {
            id: attrs.changeId,
            type: mark.type === insertionType ? 'insertion' : 'deletion',
            authorId: attrs.authorId || '',
            authorName: attrs.authorName || 'Unknown',
            authorColor: attrs.authorColor || '#3B82F6',
            timestamp: new Date(attrs.timestamp || Date.now()),
            from: pos,
            to: markEnd,
            content: doc.textBetween(pos, markEnd, ' '),
          };
          changeMap.set(attrs.changeId, change);
        }
      }
    }
  });

  return Array.from(changeMap.values());
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
          // Proactive interception: strip track marks BEFORE ProseMirror inserts text
          handleTextInput(view, from, to, text) {
            // === TRACKING ON: strip deletion marks from typed text ===
            if (extension.storage.enabled) {
              const { state } = view;
              const insertionType = state.schema.marks.trackInsertion;
              const deletionType = state.schema.marks.trackDeletion;
              if (!deletionType) return false;

              const currentMarks = state.storedMarks || state.selection.$from.marks();
              const hasDeletionMark = currentMarks.some((m) => m.type === deletionType);
              if (!hasDeletionMark) return false;

              // Strip deletion marks, keep everything else
              const clean = currentMarks.filter((m) => m.type !== deletionType);
              const tr = state.tr.insertText(text, from, to);
              const insertEnd = from + text.length;
              if (deletionType) tr.removeMark(from, insertEnd, deletionType);
              tr.setStoredMarks(clean);
              tr.setMeta('addToHistory', true);
              // Don't set trackChangesInternal so appendTransaction can add insertion mark
              view.dispatch(tr);
              return true;
            }

            // === TRACKING OFF: strip all track marks ===

            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            const currentMarks =
              state.storedMarks || state.selection.$from.marks();
            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );
            if (!hasTrackMarks) return false;

            // Build clean mark set without track marks
            const clean = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );

            const tr = state.tr.insertText(text, from, to);
            // Explicitly remove track marks from the insertion range to prevent
            // content-level mark inheritance from adjacent tracked nodes
            const insertEnd = from + text.length;
            if (insertionType) tr.removeMark(from, insertEnd, insertionType);
            if (deletionType) tr.removeMark(from, insertEnd, deletionType);
            tr.setStoredMarks(clean);
            tr.setMeta('trackChangesInternal', true);
            tr.setMeta('addToHistory', true);
            view.dispatch(tr);
            return true; // we handled it
          },

          // Proactive interception for Enter key: clear stored track marks before
          // the default handler creates a new paragraph that would inherit them
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

              // Set cursor explicitly
              let cursorPos = from;
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

          // === TRACKING OFF: strip inherited marks from new content ===
          if (!extension.storage.enabled) {
            if (!insertionType && !deletionType) return null;
            const cleanTr = newState.tr;
            cleanTr.setMeta('trackChangesInternal', true);
            cleanTr.setMeta('addToHistory', false);
            let cleaned = false;

            // Strip marks from newly inserted content using correctly mapped positions
            if (hasUserChange) {
              for (const tr of transactions) {
                if (!tr.docChanged || tr.getMeta('trackChangesInternal'))
                  continue;
                tr.steps.forEach((step, stepIndex) => {
                  const stepMap = step.getMap();
                  stepMap.forEach(
                    (
                      _oldStart: number,
                      _oldEnd: number,
                      newStart: number,
                      newEnd: number
                    ) => {
                      if (newEnd > newStart) {
                        // Map through subsequent steps to get final positions in newState
                        let mappedStart = newStart;
                        let mappedEnd = newEnd;
                        for (
                          let j = stepIndex + 1;
                          j < tr.steps.length;
                          j++
                        ) {
                          mappedStart = tr.steps[j].getMap().map(mappedStart);
                          mappedEnd = tr.steps[j].getMap().map(mappedEnd);
                        }
                        if (insertionType) {
                          cleanTr.removeMark(
                            mappedStart,
                            mappedEnd,
                            insertionType
                          );
                          cleaned = true;
                        }
                        if (deletionType) {
                          cleanTr.removeMark(
                            mappedStart,
                            mappedEnd,
                            deletionType
                          );
                          cleaned = true;
                        }
                      }
                    }
                  );
                });
              }
            }

            // Always clear stored marks to prevent future typing from inheriting track styles
            const stored =
              newState.storedMarks || newState.selection.$from.marks();
            if (stored.length > 0) {
              const withoutTrack = stored.filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              );
              if (withoutTrack.length !== stored.length) {
                cleanTr.setStoredMarks(withoutTrack);
                cleaned = true;
              }
            }

            // Always reconcile the review panel when content changes with tracking OFF
            if (hasUserChange || cleaned) {
              const changes = collectChangesFromDoc(newState.doc, schema);
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
            }

            return cleaned ? cleanTr : null;
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

                  // === CROSS-BLOCK DELETION (same-block handled in filterTransaction) ===
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
                      // Set cursor at start of deleted range
                      try {
                        newTr.setSelection(TextSelection.create(newTr.doc, newStart));
                      } catch { /* let PM handle */ }
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
            // Update review panel synchronously (no setTimeout)
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
