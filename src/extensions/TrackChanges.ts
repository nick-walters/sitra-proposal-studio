import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey, Transaction, TextSelection } from 'prosemirror-state';
import { Mark as PMMark, MarkType, Fragment, Slice } from 'prosemirror-model';

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
  return `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Scan the document for all insertion/deletion marks and build
 * a list of TrackChange objects with current positions.
 */
function collectChangesFromDoc(doc: any, schema: any): TrackChange[] {
  const changes: TrackChange[] = [];
  const insertionType = schema.marks.trackInsertion;
  const deletionType = schema.marks.trackDeletion;
  if (!insertionType && !deletionType) return changes;

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type === insertionType || mark.type === deletionType) {
        const attrs = mark.attrs;
        const markEnd = pos + node.nodeSize;
        const existing = changes.find(c => c.id === attrs.changeId);
        if (existing) {
          existing.from = Math.min(existing.from, pos);
          existing.to = Math.max(existing.to, markEnd);
          existing.content = doc.textBetween(existing.from, existing.to, ' ');
        } else {
          changes.push({
            id: attrs.changeId,
            type: mark.type === insertionType ? 'insertion' : 'deletion',
            authorId: attrs.authorId || '',
            authorName: attrs.authorName || 'Unknown',
            authorColor: attrs.authorColor || '#3B82F6',
            timestamp: new Date(attrs.timestamp || Date.now()),
            from: pos,
            to: markEnd,
            content: doc.textBetween(pos, markEnd, ' '),
          });
        }
      }
    }
  });

  return changes;
}

/**
 * Apply a mark to all text nodes in a fragment, preserving existing formatting marks.
 */
function addMarkToFragment(fragment: Fragment, mark: PMMark, schema: any): Fragment {
  const nodes: any[] = [];
  fragment.forEach((node: any) => {
    if (node.isText) {
      // Add the track mark while preserving existing marks (bold, italic, etc.)
      const newMarks = mark.addToSet(node.marks);
      nodes.push(node.mark(newMarks));
    } else if (node.content && node.content.size > 0) {
      // Recurse into inline nodes
      const newContent = addMarkToFragment(node.content, mark, schema);
      nodes.push(node.copy(newContent));
    } else {
      nodes.push(node);
    }
  });
  return Fragment.from(nodes);
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
    return [
      'span',
      {
        'data-track-insertion': '',
        'data-change-id': HTMLAttributes.changeId,
        'data-author-id': HTMLAttributes.authorId,
        'data-author-name': HTMLAttributes.authorName,
        'data-author-color': HTMLAttributes.authorColor,
        'data-timestamp': HTMLAttributes.timestamp,
        style: `background-color: rgba(34, 197, 94, 0.3); border-bottom: 2px solid ${HTMLAttributes.authorColor};`,
      },
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
    return [
      'span',
      {
        'data-track-deletion': '',
        'data-change-id': HTMLAttributes.changeId,
        'data-author-id': HTMLAttributes.authorId,
        'data-author-name': HTMLAttributes.authorName,
        'data-author-color': HTMLAttributes.authorColor,
        'data-timestamp': HTMLAttributes.timestamp,
        style: `background-color: rgba(239, 68, 68, 0.2); text-decoration: line-through; text-decoration-color: ${HTMLAttributes.authorColor}; color: #9ca3af;`,
      },
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
        ({ editor, tr, state, dispatch }) => {
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

        appendTransaction(transactions, oldState, newState) {
          if (!extension.storage.enabled) return null;

          let hasUserChange = false;
          for (const tr of transactions) {
            if (tr.getMeta('blockReorder')) return null;
            if (tr.docChanged && !tr.getMeta('trackChangesInternal')) {
              hasUserChange = true;
              break;
            }
          }
          if (!hasUserChange) return null;

          const authorId = extension.options.authorId;
          const authorName = extension.options.authorName;
          const authorColor = extension.options.authorColor;
          const schema = newState.schema;
          const insertionType = schema.marks.trackInsertion;
          const deletionType = schema.marks.trackDeletion;

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
