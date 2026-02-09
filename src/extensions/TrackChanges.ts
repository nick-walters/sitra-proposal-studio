import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Mark as PMMark, MarkType } from 'prosemirror-model';

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
        // Find the full extent of this mark from pos
        const markEnd = pos + node.nodeSize;
        // Check if we already have this changeId (mark may span multiple text nodes)
        const existing = changes.find(c => c.id === attrs.changeId);
        if (existing) {
          // Extend range
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
 * The TrackInsertion mark — applied to newly inserted text.
 */
const TrackInsertionMark = Mark.create({
  name: 'trackInsertion',
  
  addAttributes() {
    return {
      changeId: { default: null },
      authorId: { default: '' },
      authorName: { default: 'Anonymous' },
      authorColor: { default: '#3B82F6' },
      timestamp: { default: null },
    };
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
        style: `background-color: rgba(34, 197, 94, 0.3); border-bottom: 2px solid ${HTMLAttributes.authorColor};`,
      },
      0,
    ];
  },
});

/**
 * The TrackDeletion mark — applied to text that was "deleted" but kept visible with strikethrough.
 */
const TrackDeletionMark = Mark.create({
  name: 'trackDeletion',
  
  addAttributes() {
    return {
      changeId: { default: null },
      authorId: { default: '' },
      authorName: { default: 'Anonymous' },
      authorColor: { default: '#3B82F6' },
      timestamp: { default: null },
    };
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
      // We keep a local `changes` array derived from marks for the UI
      changes: [] as TrackChange[],
      // Track the current merge target for consecutive typing
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

          // Collect ranges for this changeId
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
            // Accept insertion = just remove the mark, keep the text
            for (const range of ranges) {
              tr.removeMark(range.from, range.to, insertionType);
            }
          } else {
            // Accept deletion = actually delete the text (process in reverse to keep positions valid)
            const sorted = [...ranges].sort((a, b) => b.from - a.from);
            for (const range of sorted) {
              tr.delete(range.from, range.to);
            }
          }

          tr.setMeta('trackChangesInternal', true);
          if (dispatch) dispatch(tr);

          // Update changes list from new doc
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
            // Reject insertion = delete the text
            const sorted = [...ranges].sort((a, b) => b.from - a.from);
            for (const range of sorted) {
              tr.delete(range.from, range.to);
            }
          } else {
            // Reject deletion = just remove the mark, keep the text
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

          // First remove all insertion marks (keep text)
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) {
                tr.removeMark(pos, pos + node.nodeSize, insertionType);
              }
            }
          });

          // Then delete all deletion-marked text (reverse order)
          const deletionRanges: { from: number; to: number }[] = [];
          // Re-scan because positions haven't shifted yet in tr
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) {
                deletionRanges.push({ from: pos, to: pos + node.nodeSize });
              }
            }
          });

          // Merge adjacent ranges and delete in reverse
          const sorted = [...deletionRanges].sort((a, b) => b.from - a.from);
          for (const range of sorted) {
            tr.delete(range.from, range.to);
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

          // Remove all deletion marks (keep text)
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === deletionType) {
                tr.removeMark(pos, pos + node.nodeSize, deletionType);
              }
            }
          });

          // Delete all insertion-marked text (reverse order)
          const insertionRanges: { from: number; to: number }[] = [];
          doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type === insertionType) {
                insertionRanges.push({ from: pos, to: pos + node.nodeSize });
              }
            }
          });

          const sorted = [...insertionRanges].sort((a, b) => b.from - a.from);
          for (const range of sorted) {
            tr.delete(range.from, range.to);
          }

          tr.setMeta('trackChangesInternal', true);
          if (dispatch) dispatch(tr);

          setTimeout(() => {
            this.storage.changes = [];
            this.options.onChangesUpdate?.([]);
          }, 0);

          return true;
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
          let modified = false;

          const MERGE_WINDOW_MS = 10000;
          const now = Date.now();

          for (const tr of transactions) {
            if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;

            tr.steps.forEach((step, stepIndex) => {
              const stepMap = step.getMap();

              stepMap.forEach((oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
                // Handle deletions: in Word-style, we don't actually delete.
                // Instead we should re-insert the deleted content with a deletion mark.
                // However, since the content is already gone in newState, we need to
                // get it from oldState and re-insert it.
                if (oldEnd > oldStart && newEnd <= newStart) {
                  // Text was deleted. We need to reinsert it with a deletion mark.
                  const deletedSlice = oldState.doc.slice(oldStart, oldEnd);
                  const deletedText = oldState.doc.textBetween(oldStart, oldEnd, ' ');

                  if (deletedText.trim()) {
                    // Check if the deleted text already had a trackInsertion mark
                    // If so, just let it be deleted (don't track deletion of tracked insertions)
                    let wasTrackedInsertion = false;
                    oldState.doc.nodesBetween(oldStart, oldEnd, (node) => {
                      if (node.isText) {
                        for (const mark of node.marks) {
                          if (mark.type === insertionType && mark.attrs.authorId === authorId) {
                            wasTrackedInsertion = true;
                          }
                        }
                      }
                    });

                    if (!wasTrackedInsertion) {
                      // Determine changeId: merge with adjacent deletion if recent
                      let changeId: string;
                      const lastId = extension.storage.lastInsertionId;
                      // For deletions, always create a new change
                      changeId = generateChangeId();

                      // Re-insert the deleted text at newStart with a deletion mark
                      const deletionMark = deletionType.create({
                        changeId,
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date().toISOString(),
                      });

                      const textNode = schema.text(deletedText, [deletionMark]);
                      newTr.insert(newStart, textNode);
                      modified = true;
                    }
                  }
                }

                // Handle insertions: mark the new content with an insertion mark
                if (newEnd > newStart && oldEnd <= oldStart) {
                  const insertedText = newState.doc.textBetween(newStart, newEnd, ' ');

                  // Merge with recent insertion even for whitespace/newlines
                  const hasActiveMerge =
                    extension.storage.lastInsertionId &&
                    now - extension.storage.lastInsertionTime < MERGE_WINDOW_MS;

                  // Skip only if it's pure whitespace AND there's no active merge
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
            // Update changes list from marks
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
