import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as ProseMirrorNode, Slice, Fragment } from 'prosemirror-model';

export interface TrackChange {
  id: string;
  type: 'insertion' | 'deletion';
  authorId: string;
  authorName: string;
  authorColor: string;
  timestamp: Date;
  from: number;
  to: number;
  content?: string; // For deletions, store the deleted content
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
      changes: [...this.options.changes],
    };
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
        ({ editor, tr, state }) => {
          const changeIndex = this.storage.changes.findIndex(
            (c: TrackChange) => c.id === changeId
          );
          if (changeIndex === -1) return false;

          const change = this.storage.changes[changeIndex];
          
          if (change.type === 'deletion' && change.content) {
            // For deletions, accepting means actually deleting the content
            // Find and remove the content that was marked for deletion
            try {
              if (change.from >= 0 && change.to <= state.doc.content.size && change.to > change.from) {
                tr.delete(change.from, change.to);
              }
            } catch (e) {
              console.warn('Could not delete content for accepted deletion:', e);
            }
          }
          // For insertions, accepting means keeping the content (already there)
          
          this.storage.changes.splice(changeIndex, 1);
          this.options.onChangesUpdate?.(this.storage.changes);
          editor.view.dispatch(tr);
          return true;
        },
      rejectChange:
        (changeId: string) =>
        ({ editor, tr, state }) => {
          const changeIndex = this.storage.changes.findIndex(
            (c: TrackChange) => c.id === changeId
          );
          if (changeIndex === -1) return false;

          const change = this.storage.changes[changeIndex];
          
          if (change.type === 'insertion') {
            // For insertions, rejecting means removing the content
            try {
              if (change.from >= 0 && change.to <= state.doc.content.size) {
                tr.delete(change.from, change.to);
              }
            } catch (e) {
              console.warn('Could not delete rejected insertion:', e);
            }
          }
          // For deletions, rejecting means keeping the content (already there, just remove strike-through)
          
          this.storage.changes.splice(changeIndex, 1);
          this.options.onChangesUpdate?.(this.storage.changes);
          editor.view.dispatch(tr);
          return true;
        },
      acceptAllChanges:
        () =>
        ({ editor, tr }) => {
          // Accept all - just clear all change tracking
          this.storage.changes = [];
          this.options.onChangesUpdate?.([]);
          editor.view.dispatch(tr);
          return true;
        },
      rejectAllChanges:
        () =>
        ({ editor, tr, state }) => {
          // Process changes in reverse order to maintain positions
          const sortedChanges = [...this.storage.changes].sort(
            (a, b) => b.from - a.from
          );
          
          for (const change of sortedChanges) {
            if (change.type === 'insertion') {
              tr.delete(change.from, change.to);
            }
          }
          
          this.storage.changes = [];
          this.options.onChangesUpdate?.([]);
          editor.view.dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: trackChangesPluginKey,
        
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorationSet, oldState, newState) => {
            if (!extension.storage.enabled) {
              return DecorationSet.empty;
            }

            // Create decorations for all tracked changes
            const decorations: Decoration[] = [];
            
            for (const change of extension.storage.changes) {
              try {
                // Validate positions
                if (change.from < 0 || change.to > newState.doc.content.size) {
                  continue;
                }
                
                if (change.type === 'insertion') {
                  decorations.push(
                    Decoration.inline(change.from, change.to, {
                      class: 'track-change-insertion',
                      style: `background-color: rgba(34, 197, 94, 0.3); border-bottom: 2px solid ${change.authorColor};`,
                      'data-change-id': change.id,
                      'data-author': change.authorName,
                      'data-type': 'insertion',
                    })
                  );
                } else if (change.type === 'deletion') {
                  decorations.push(
                    Decoration.inline(change.from, change.to, {
                      class: 'track-change-deletion',
                      style: `background-color: rgba(239, 68, 68, 0.2); text-decoration: line-through; text-decoration-color: ${change.authorColor}; color: #9ca3af;`,
                      'data-change-id': change.id,
                      'data-author': change.authorName,
                      'data-type': 'deletion',
                    })
                  );
                }
              } catch (e) {
                // Position might be invalid after doc changes
              }
            }
            
            return DecorationSet.create(newState.doc, decorations);
          },
        },
        
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },

        appendTransaction(transactions, oldState, newState) {
          if (!extension.storage.enabled) return null;
          
          let hasChanges = false;
          const authorId = extension.options.authorId;
          const authorName = extension.options.authorName;
          const authorColor = extension.options.authorColor;
          const MERGE_WINDOW_MS = 2000; // Merge changes within 2 seconds
          
          for (const tr of transactions) {
            if (!tr.docChanged || tr.getMeta('trackChangesInternal')) continue;
            
            tr.steps.forEach((step, stepIndex) => {
              const stepMap = step.getMap();
              
              stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
                // Deletion
                if (oldEnd > oldStart && newEnd === newStart) {
                  const deletedContent = oldState.doc.textBetween(oldStart, oldEnd, ' ');
                  if (deletedContent.trim()) {
                    // Try to merge with an adjacent recent deletion by the same author
                    const now = Date.now();
                    const existing = extension.storage.changes.find(
                      (c: TrackChange) =>
                        c.type === 'deletion' &&
                        c.authorId === authorId &&
                        now - new Date(c.timestamp).getTime() < MERGE_WINDOW_MS &&
                        (c.from === newStart || c.from === newStart + 1 || c.from - 1 === newStart)
                    );
                    
                    if (existing) {
                      // Merge: prepend or append deleted content
                      if (newStart <= existing.from) {
                        existing.content = deletedContent + (existing.content || '');
                        existing.from = newStart;
                      } else {
                        existing.content = (existing.content || '') + deletedContent;
                      }
                      existing.timestamp = new Date();
                    } else {
                      extension.storage.changes.push({
                        id: generateChangeId(),
                        type: 'deletion',
                        authorId,
                        authorName,
                        authorColor,
                        timestamp: new Date(),
                        from: newStart,
                        to: newStart,
                        content: deletedContent,
                      });
                    }
                    hasChanges = true;
                  }
                }
                
                // Insertion
                if (newEnd > newStart) {
                  if (oldEnd === oldStart) {
                    const insertedContent = newState.doc.textBetween(newStart, newEnd, ' ');
                    if (insertedContent.trim()) {
                      // Try to merge with an adjacent recent insertion by the same author
                      const now = Date.now();
                      const existing = extension.storage.changes.find(
                        (c: TrackChange) =>
                          c.type === 'insertion' &&
                          c.authorId === authorId &&
                          now - new Date(c.timestamp).getTime() < MERGE_WINDOW_MS &&
                          (c.to === newStart || c.to === newStart - 1 || c.to + 1 === newStart)
                      );
                      
                      if (existing) {
                        // Extend the existing insertion range and content
                        existing.to = newEnd;
                        existing.content = (existing.content || '') + insertedContent;
                        existing.timestamp = new Date();
                      } else {
                        extension.storage.changes.push({
                          id: generateChangeId(),
                          type: 'insertion',
                          authorId,
                          authorName,
                          authorColor,
                          timestamp: new Date(),
                          from: newStart,
                          to: newEnd,
                          content: insertedContent,
                        });
                      }
                      hasChanges = true;
                    }
                  }
                }
              });
            });
          }
          
          if (hasChanges) {
            extension.options.onChangesUpdate?.(extension.storage.changes);
          }
          
          return null;
        },
      }),
    ];
  },
});
