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
      // Place cursor at end of "Hello world" and type
      editor.commands.setTextSelection(12); // end of "Hello world"
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

      // Find the change ID
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

      // Text should still be there
      expect(editor.state.doc.textContent).toContain('everyone');
      // But no insertion marks
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
      // Select "world" and delete it
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.deleteSelection();
      await waitForChanges();

      // "world" should still be visible (as tracked deletion)
      expect(editor.state.doc.textContent).toContain('world');

      // Find deletion change
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
        // "world" should now be gone
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
  });

  describe('Accept/Reject All', () => {
    it('acceptAllChanges removes all marks and deletes tracked deletions', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello beautiful world</p>' });
      // Insert text
      editor.commands.setTextSelection(24);
      editor.commands.insertContent('!');
      await waitForChanges();

      editor.commands.acceptAllChanges();
      await waitForChanges();

      // No track marks should remain
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
      // Insert at two positions
      editor.commands.setTextSelection(6);
      editor.commands.insertContent('X');
      // Reset merge window
      (editor.storage as any).trackChanges.lastInsertionId = null;
      editor.commands.setTextSelection(18);
      editor.commands.insertContent('Y');
      await waitForChanges();

      // Move cursor to start
      editor.commands.setTextSelection(1);
      editor.commands.navigateToNextChange();

      // Cursor should have moved forward
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

      // Move cursor to end
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      const endPos = editor.state.selection.from;
      editor.commands.navigateToPreviousChange();

      expect(editor.state.selection.from).toBeLessThan(endPos);
      editor.destroy();
    });
  });

  describe('Cursor commands', () => {
    it('acceptChangeAtCursor accepts change at cursor position', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('!');
      await waitForChanges();

      // Cursor should be right after the insertion
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

  describe('Replacement tracking', () => {
    it('tracks a replacement as deletion + insertion', async () => {
      const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
      // Select "world" and replace with "earth"
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
      // Insert text
      editor.commands.setTextSelection(12);
      editor.commands.insertContent(' added');
      await waitForChanges();

      // Now delete the inserted text - should vanish without deletion mark
      const docText = editor.state.doc.textContent;
      const addedPos = docText.indexOf(' added');
      // Select and delete " added"
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

      // Should NOT have a deletion mark - own insertions are silently removed
      expect(hasDeletion).toBe(false);
      expect(editor.state.doc.textContent).not.toContain('added');
      editor.destroy();
    });
  });

  describe('Reject at cursor', () => {
    it('rejectChangeAtCursor rejects the change at cursor position', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('!');
      await waitForChanges();

      // Cursor should be right after the insertion
      editor.commands.rejectChangeAtCursor();
      await waitForChanges();

      expect(editor.state.doc.textContent).not.toContain('!');
      editor.destroy();
    });
  });
});

  describe('Merge window', () => {
    it('consecutive insertions within 5s share the same changeId', async () => {
      const editor = createEditor({ enabled: true });
      editor.commands.setTextSelection(12);
      editor.commands.insertContent('A');
      await waitForChanges();

      // Second insertion within merge window
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

      // Should have exactly 1 changeId (merged)
      expect(changeIds.size).toBe(1);
      editor.destroy();
    });
  });
});
