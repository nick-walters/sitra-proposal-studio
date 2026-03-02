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
          // Reset merge window so new changes don't merge with pre-toggle changes
          this.storage.lastInsertionId = null;
          this.storage.lastInsertionTime = 0;

          // When toggling OFF, clear any stored marks that are track marks
          // to prevent strikethrough/insertion styling from persisting on new text
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
                const tr = state.tr.setStoredMarks(cleaned.length > 0 ? cleaned : null);
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
            // Accept deletion = actually delete the text (process in reverse)
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

          // Collect all deletion ranges first (before any mutations)
          const deletionRanges: { from: number; to: number }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) {
                deletionRanges.push({ from: pos, to: pos + node.nodeSize });
              }
            }
          });

          // Remove all insertion marks (keep text) — mark removal doesn't shift positions
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) {
                tr.removeMark(pos, pos + node.nodeSize, insertionType);
              }
            }
          });

          // Delete all deletion-marked text in reverse order to maintain valid positions
          // Use tr.mapping to map original positions through prior deletions
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

          // Collect all insertion ranges first (before any mutations)
          const insertionRanges: { from: number; to: number }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) {
                insertionRanges.push({ from: pos, to: pos + node.nodeSize });
              }
            }
          });

          // Remove all deletion marks (keep text) — mark removal doesn't shift positions
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) {
                tr.removeMark(pos, pos + node.nodeSize, deletionType);
              }
            }
          });

          // Delete all insertion-marked text in reverse order
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

        props: {
          // Proactive interception: strip track marks BEFORE ProseMirror inserts text
          handleTextInput(view, from, to, text) {
            if (extension.storage.enabled) return false;

            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            const currentMarks = state.storedMarks || state.selection.$from.marks();
            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );
            if (!hasTrackMarks) return false;

            // Build clean mark set without track marks
            const clean = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );

            const tr = state.tr
              .insertText(text, from, to)
              .setStoredMarks(clean.length > 0 ? clean : null);
            tr.setMeta('trackChangesInternal', true);
            tr.setMeta('addToHistory', true);
            view.dispatch(tr);
            return true; // we handled it
          },

          // Proactive interception for Enter key: clear stored track marks before
          // the default handler creates a new paragraph that would inherit them
          handleKeyDown(view, event) {
            if (extension.storage.enabled) return false;
            if (event.key !== 'Enter') return false;

            const { state } = view;
            const insertionType = state.schema.marks.trackInsertion;
            const deletionType = state.schema.marks.trackDeletion;
            if (!insertionType && !deletionType) return false;

            const currentMarks = state.storedMarks || state.selection.$from.marks();
            const hasTrackMarks = currentMarks.some(
              (m) => m.type === insertionType || m.type === deletionType
            );
            if (!hasTrackMarks) return false;

            // Clear stored marks so the default Enter handler won't inherit them
            const clean = currentMarks.filter(
              (m) => m.type !== insertionType && m.type !== deletionType
            );
            const tr = state.tr.setStoredMarks(clean.length > 0 ? clean : null);
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
            if (tr.getMeta('setContent') || tr.getMeta('preventUpdate') !== undefined) continue;
            if (tr.docChanged) {
              hasUserChange = true;
              break;
            }
          }

          const schema = newState.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

          // When tracking is OFF, always clear stored track marks (even on cursor moves)
          // AND strip inherited marks from new insertions
          if (!extension.storage.enabled) {
            if (!insertionType && !deletionType) return null;
            const cleanTr = newState.tr;
            cleanTr.setMeta('trackChangesInternal', true);
            cleanTr.setMeta('addToHistory', false);
            let cleaned = false;

            // Strip marks from newly inserted content
            if (hasUserChange) {
              for (const tr of transactions) {
                if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;
                tr.steps.forEach((step) => {
                  const stepMap = step.getMap();
                  stepMap.forEach((_oldStart: number, _oldEnd: number, newStart: number, newEnd: number) => {
                    if (newEnd > newStart) {
                      if (insertionType) {
                        cleanTr.removeMark(newStart, newEnd, insertionType);
                        cleaned = true;
                      }
                      if (deletionType) {
                        cleanTr.removeMark(newStart, newEnd, deletionType);
                        cleaned = true;
                      }
                    }
                  });
                });
              }
            }

            // Always clear stored marks to prevent future typing from inheriting track styles
            const stored = newState.storedMarks || newState.selection.$from.marks();
            if (stored.length > 0) {
              const withoutTrack = stored.filter(
                (m) => m.type !== insertionType && m.type !== deletionType
              );
              if (withoutTrack.length !== stored.length) {
                cleanTr.setStoredMarks(withoutTrack.length > 0 ? withoutTrack : null);
                cleaned = true;
              }
            }

            return cleaned ? cleanTr : null;
          }

          if (!hasUserChange) return null;

          const authorId = extension.options.authorId;
          const authorName = extension.options.authorName;
          const authorColor = extension.options.authorColor;

          if (!insertionType) return null;

          const newTr = newState.tr;
          newTr.setMeta('trackChangesInternal', true);
          newTr.setMeta('addToHistory', false);
          let modified = false;

          const MERGE_WINDOW_MS = 5000; // reduced from 10s to 5s for more Word-like grouping
          const now = Date.now();

          for (const tr of transactions) {
            if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;

            tr.steps.forEach((step, stepIndex) => {
              const stepMap = step.getMap();

              stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
                const isDelete = oldEnd > oldStart;
                const isInsert = newEnd > newStart;

                // === REPLACEMENT: text was selected and typed over ===
                if (isDelete && isInsert) {
                  const deletedSlice = oldState.doc.slice(oldStart, oldEnd);
                  const deletedText = oldState.doc.textBetween(oldStart, oldEnd, ' ');

                  let reinsertedLength = 0;

                  if (deletedText.trim()) {
                    // Check each text node individually: only re-insert nodes that are NOT
                    // tracked insertions by the same author (those should just vanish).
                    let hasUntrackedContent = false;
                    
                    oldState.doc.nodesBetween(oldStart, oldEnd, (node, nodePos) => {
                      if (!node.isText) return;
                      const isOwnInsertion = node.marks.some(
                        (m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId
                      );
                      if (!isOwnInsertion) {
                        hasUntrackedContent = true;
                      }
                    });

                    if (hasUntrackedContent) {
                      const deletionChangeId = generateChangeId();
                      const deletionMark = deletionType.create({
                        changeId: deletionChangeId,
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date().toISOString(),
                      });

                      // Filter: only re-insert non-own-insertion nodes with deletion mark
                      const filteredNodes: any[] = [];
                      deletedSlice.content.forEach((node: any) => {
                        if (node.isText) {
                          const isOwnInsertion = node.marks.some(
                            (m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId
                          );
                          if (!isOwnInsertion) {
                            // Remove any existing track insertion marks from other authors, keep formatting
                            const cleanMarks = node.marks.filter((m: PMMark) => m.type !== insertionType);
                            const newMarks = deletionMark.addToSet(cleanMarks);
                            filteredNodes.push(node.mark(newMarks));
                            reinsertedLength += node.nodeSize;
                          }
                        } else {
                          filteredNodes.push(node);
                        }
                      });

                      if (filteredNodes.length > 0) {
                        newTr.insert(newStart, Fragment.from(filteredNodes));
                        modified = true;
                      }
                    }
                  }

                  // Mark the newly inserted text with an insertion mark
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

                    // Adjust positions: the deletion re-insert shifted things
                    newTr.addMark(newStart + reinsertedLength, newEnd + reinsertedLength, mark);
                    modified = true;
                  }

                  return; // done with this step range
                }

                // === PURE DELETION ===
                if (isDelete && !isInsert) {
                  const deletedSlice = oldState.doc.slice(oldStart, oldEnd);
                  const deletedText = oldState.doc.textBetween(oldStart, oldEnd, ' ');

                  if (deletedText.trim()) {
                    // Check per-node: only re-insert nodes not tracked as own insertion
                    let hasUntrackedContent = false;
                    oldState.doc.nodesBetween(oldStart, oldEnd, (node) => {
                      if (node.isText) {
                        const isOwnInsertion = node.marks.some(
                          (m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId
                        );
                        if (!isOwnInsertion) hasUntrackedContent = true;
                      }
                    });

                    if (hasUntrackedContent) {
                      const changeId = generateChangeId();
                      const deletionMark = deletionType.create({
                        changeId,
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date().toISOString(),
                      });

                      const filteredNodes: any[] = [];
                      deletedSlice.content.forEach((node: any) => {
                        if (node.isText) {
                          const isOwnInsertion = node.marks.some(
                            (m: PMMark) => m.type === insertionType && m.attrs.authorId === authorId
                          );
                          if (!isOwnInsertion) {
                            const cleanMarks = node.marks.filter((m: PMMark) => m.type !== insertionType);
                            const newMarks = deletionMark.addToSet(cleanMarks);
                            filteredNodes.push(node.mark(newMarks));
                          }
                        } else {
                          filteredNodes.push(node);
                        }
                      });

                      if (filteredNodes.length > 0) {
                        newTr.insert(newStart, Fragment.from(filteredNodes));
                        modified = true;
                      }
                    }
                  }
                }

                // === PURE INSERTION ===
                if (isInsert && !isDelete) {
                  const insertedText = newState.doc.textBetween(newStart, newEnd, ' ');

                  const hasActiveMerge =
                    extension.storage.lastInsertionId &&
                    now - extension.storage.lastInsertionTime < MERGE_WINDOW_MS;

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

                    newTr.addMark(newStart, newEnd, mark);
                    modified = true;
                  }
                }
              });
            });
          }

          if (modified) {
            setTimeout(() => {
              const changes = collectChangesFromDoc(
                extension.editor.state.doc,
                extension.editor.state.schema
              );
              extension.storage.changes = changes;
              extension.options.onChangesUpdate?.(changes);
            }, 10);

            return newTr;
          }

          return null;
        },
      }),
    ];
  },
});
