import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TrackChanges, TrackChange, trackChangesPluginKey } from '@/extensions/TrackChanges';

function createEditor(opts: { enabled?: boolean; content?: string } = {}) {
  return new Editor({
    extensions: [
      StarterKit,
      TrackChanges.configure({
        enabled: opts.enabled ?? true,
        authorId: 'user-1',
        authorName: 'Alice',
        authorColor: '#3B82F6',
      }),
    ],
    content: opts.content ?? '<p>Hello world</p>',
  });
}

function getChanges(editor: Editor): TrackChange[] {
  return (editor.storage as any).trackChanges?.changes ?? [];
}

function waitForChanges(): Promise<void> {
  return new Promise(r => setTimeout(r, 50));
}

describe('TrackChanges Extension', () => {
  describe('Insertion tracking', () => {
    it('marks typed text as an insertion when enabled', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('!');
      await waitForChanges();

      const doc = editor.state.doc;
      const insertionType = editor.state.schema.marks.trackInsertion;
      let foundInsertion = false;
      doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === insertionType)) {
          foundInsertion = true;
        }
      });
      expect(foundInsertion).toBe(true);
      editor.destroy();
    });

    it('does NOT mark text when tracking is disabled', async () => {
      const editor = createEditor({ enabled: false });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('!');
      await waitForChanges();

      const doc = editor.state.doc;
      const insertionType = editor.state.schema.marks.trackInsertion;
      let foundInsertion = false;
      doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === insertionType)) {
          foundInsertion = true;
        }
      });
      expect(foundInsertion).toBe(false);
      editor.destroy();
    });
  });

  describe('Toggle', () => {
    it('toggles tracking on/off', () => {
      const editor = createEditor({ enabled: false });
      expect((editor.storage as any).trackChanges.enabled).toBe(false);
      editor.commands.toggleTrackChanges();
      expect((editor.storage as any).trackChanges.enabled).toBe(true);
      editor.commands.toggleTrackChanges();
      expect((editor.storage as any).trackChanges.enabled).toBe(false);
      editor.destroy();
    });
  });

  describe('Accept change', () => {
    it('accepts an insertion by removing the mark but keeping text', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent(' everyone');
      await waitForChanges();

      const insertionType = editor.state.schema.marks.trackInsertion;
      let changeId = '';
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === insertionType) changeId = mark.attrs.changeId;
          }
        }
      });
      expect(changeId).not.toBe('');

      editor.commands.acceptChange(changeId);
      await waitForChanges();

      expect(editor.state.doc.textContent).toContain('everyone');
      let hasInsertionMark = false;
      editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === insertionType)) {
          hasInsertionMark = true;
        }
      });
      expect(hasInsertionMark).toBe(false);
      editor.destroy();
    });

    it('accepts a deletion by removing the deleted text', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.deleteSelection();
      await waitForChanges();

      expect(editor.state.doc.textContent).toContain('world');

      const deletionType = editor.state.schema.marks.trackDeletion;
      let changeId = '';
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === deletionType) changeId = mark.attrs.changeId;
          }
        }
      });

      if (changeId) {
        editor.commands.acceptChange(changeId);
        await waitForChanges();
        expect(editor.state.doc.textContent).not.toContain('world');
      }
      editor.destroy();
    });
  });

  describe('Reject change', () => {
    it('rejects an insertion by removing the inserted text', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent(' extra');
      await waitForChanges();

      const insertionType = editor.state.schema.marks.trackInsertion;
      let changeId = '';
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === insertionType) changeId = mark.attrs.changeId;
          }
        }
      });

      if (changeId) {
        editor.commands.rejectChange(changeId);
        await waitForChanges();
        expect(editor.state.doc.textContent).not.toContain('extra');
      }
      editor.destroy();
    });

    it('rejects a deletion by restoring the deleted text', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.deleteSelection();
      await waitForChanges();

      const deletionType = editor.state.schema.marks.trackDeletion;
      let changeId = '';
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === deletionType) changeId = mark.attrs.changeId;
          }
        }
      });

      expect(changeId).not.toBe('');
      editor.commands.rejectChange(changeId);
      await waitForChanges();

      // Text should still be there, but without deletion mark
      expect(editor.state.doc.textContent).toContain('world');
      let hasDeletionMark = false;
      editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === deletionType)) {
          hasDeletionMark = true;
        }
      });
      expect(hasDeletionMark).toBe(false);
      editor.destroy();
    });
  });

  describe('Accept/Reject All', () => {
    it('acceptAllChanges removes all marks and deletes tracked deletions', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello beautiful world</p>' });
      editor.commands.setTextSelection(24);
      editor.commands.insertContent('!');
      await waitForChanges();

      editor.commands.acceptAllChanges();
      await waitForChanges();

      const insertionType = editor.state.schema.marks.trackInsertion;
      const deletionType = editor.state.schema.marks.trackDeletion;
      let hasMarks = false;
      editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === insertionType || m.type === deletionType)) {
          hasMarks = true;
        }
      });
      expect(hasMarks).toBe(false);
      editor.destroy();
    });

    it('rejectAllChanges removes insertions and restores deletions', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent(' added');
      await waitForChanges();

      editor.commands.rejectAllChanges();
      await waitForChanges();

      expect(editor.state.doc.textContent).not.toContain('added');
      editor.destroy();
    });
  });

  describe('Navigation', () => {
    it('navigateToNextChange moves cursor to the next change', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world test</p>' });
      editor.commands.setTextSelection(6);
      editor.commands.insertContent('X');
      (editor.storage as any).trackChanges.lastInsertionId = null;
      editor.commands.setTextSelection(18);
      editor.commands.insertContent('Y');
      await waitForChanges();

      editor.commands.setTextSelection(1);
      editor.commands.navigateToNextChange();

      expect(editor.state.selection.from).toBeGreaterThan(1);
      editor.destroy();
    });

    it('navigateToPreviousChange moves cursor to the previous change', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world test</p>' });
      editor.commands.setTextSelection(6);
      editor.commands.insertContent('X');
      (editor.storage as any).trackChanges.lastInsertionId = null;
      editor.commands.setTextSelection(18);
      editor.commands.insertContent('Y');
      await waitForChanges();

      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      const endPos = editor.state.selection.from;
      editor.commands.navigateToPreviousChange();

      expect(editor.state.selection.from).toBeLessThan(endPos);
      editor.destroy();
    });

    it('navigateToNextChange wraps around to first change', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
      editor.commands.setTextSelection(6);
      editor.commands.insertContent('X');
      await waitForChanges();

      // Place cursor after all changes, navigation should wrap to first
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.navigateToNextChange();

      // Should wrap to the change near position 6
      expect(editor.state.selection.from).toBeLessThan(10);
      editor.destroy();
    });

    it('returns false when no changes exist', () => {
      const editor = createEditor({ enabled: true });
      const result = editor.commands.navigateToNextChange();
      expect(result).toBe(false);
      editor.destroy();
    });
  });

  describe('Cursor commands', () => {
    it('acceptChangeAtCursor accepts change at cursor position', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('!');
      await waitForChanges();

      editor.commands.acceptChangeAtCursor();
      await waitForChanges();

      expect(editor.state.doc.textContent).toContain('!');
      const insertionType = editor.state.schema.marks.trackInsertion;
      let hasMarks = false;
      editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === insertionType)) hasMarks = true;
      });
      expect(hasMarks).toBe(false);
      editor.destroy();
    });

    it('rejectChangeAtCursor rejects the change at cursor position', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('!');
      await waitForChanges();

      editor.commands.rejectChangeAtCursor();
      await waitForChanges();

      expect(editor.state.doc.textContent).not.toContain('!');
      editor.destroy();
    });

    it('returns false when cursor is not on a change', () => {
      const editor = createEditor({ enabled: true });
      const result = editor.commands.acceptChangeAtCursor();
      expect(result).toBe(false);
      editor.destroy();
    });
  });

  describe('Mark attributes', () => {
    it('stores author info and timestamp in marks', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('X');
      await waitForChanges();

      const insertionType = editor.state.schema.marks.trackInsertion;
      let attrs: any = null;
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === insertionType) attrs = mark.attrs;
          }
        }
      });

      expect(attrs).not.toBeNull();
      expect(attrs.authorId).toBe('user-1');
      expect(attrs.authorName).toBe('Alice');
      expect(attrs.authorColor).toBe('#3B82F6');
      expect(attrs.timestamp).toBeTruthy();
      expect(attrs.changeId).toBeTruthy();
      editor.destroy();
    });
  });

  describe('Merge window', () => {
    it('consecutive insertions within 5s share the same changeId', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('A');
      await waitForChanges();

      editor.commands.insertContent('B');
      await waitForChanges();

      const insertionType = editor.state.schema.marks.trackInsertion;
      const changeIds = new Set<string>();
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type === insertionType) changeIds.add(mark.attrs.changeId);
          }
        }
      });

      expect(changeIds.size).toBe(1);
      editor.destroy();
    });
  });

  describe('Replacement tracking', () => {
    it('tracks a replacement as deletion + insertion', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.insertContent('earth');
      await waitForChanges();

      const insertionType = editor.state.schema.marks.trackInsertion;
      const deletionType = editor.state.schema.marks.trackDeletion;
      let hasInsertion = false;
      let hasDeletion = false;
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          if (node.marks.some(m => m.type === insertionType)) hasInsertion = true;
          if (node.marks.some(m => m.type === deletionType)) hasDeletion = true;
        }
      });

      expect(hasInsertion).toBe(true);
      expect(hasDeletion).toBe(true);
      expect(editor.state.doc.textContent).toContain('earth');
      expect(editor.state.doc.textContent).toContain('world');
      editor.destroy();
    });
  });

  describe('Own insertion deletion', () => {
    it('silently removes own tracked insertions when deleted', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent(' added');
      await waitForChanges();

      const docText = editor.state.doc.textContent;
      const addedPos = docText.indexOf(' added');
      editor.commands.setTextSelection({ from: 1 + addedPos, to: 1 + addedPos + 6 });
      editor.commands.deleteSelection();
      await waitForChanges();

      const deletionType = editor.state.schema.marks.trackDeletion;
      let hasDeletion = false;
      editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some(m => m.type === deletionType)) {
          hasDeletion = true;
        }
      });

      expect(hasDeletion).toBe(false);
      expect(editor.state.doc.textContent).not.toContain('added');
      editor.destroy();
    });
  });
});
