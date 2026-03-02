import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TrackChanges, TrackChange } from '@/extensions/TrackChanges';

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

function wait(ms = 50): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe('Tracked Deletion – Cursor & Styling Invariants', () => {
  it('typing after a tracked deletion with tracking OFF has no deletion mark', async () => {
    const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
    // Delete "world" with tracking ON
    editor.commands.setTextSelection({ from: 7, to: 12 });
    editor.commands.deleteSelection();
    await wait();

    // Verify deletion was tracked
    const deletionType = editor.state.schema.marks.trackDeletion;
    let hasDeletion = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some(m => m.type === deletionType)) hasDeletion = true;
    });
    expect(hasDeletion).toBe(true);

    // Toggle tracking OFF
    editor.commands.toggleTrackChanges();
    expect((editor.storage as any).trackChanges.enabled).toBe(false);

    // Place cursor at end of document and type
    const endPos = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(endPos);
    editor.commands.insertContent('X');
    await wait();

    // The 'X' should NOT have deletion mark
    let xHasDeletion = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.textContent.includes('X')) {
        if (node.marks.some(m => m.type === deletionType)) xHasDeletion = true;
      }
    });
    expect(xHasDeletion).toBe(false);

    // The original deletion should STILL exist
    let deletionStillExists = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some(m => m.type === deletionType)) deletionStillExists = true;
    });
    expect(deletionStillExists).toBe(true);

    editor.destroy();
  });

  it('tracked deletion remains in review panel after typing nearby with tracking OFF', async () => {
    const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
    editor.commands.setTextSelection({ from: 7, to: 12 });
    editor.commands.deleteSelection();
    await wait();

    const changesBefore = getChanges(editor);
    const deletionsBefore = changesBefore.filter(c => c.type === 'deletion');
    expect(deletionsBefore.length).toBeGreaterThan(0);

    // Toggle OFF and type
    editor.commands.toggleTrackChanges();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent('Z');
    await wait();

    // Deletion should still appear in review panel
    const changesAfter = getChanges(editor);
    const deletionsAfter = changesAfter.filter(c => c.type === 'deletion');
    expect(deletionsAfter.length).toBeGreaterThan(0);

    editor.destroy();
  });

  it('typing with tracking ON after deletion does not inherit strikethrough', async () => {
    const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });
    // Delete "world"
    editor.commands.setTextSelection({ from: 7, to: 12 });
    editor.commands.deleteSelection();
    await wait();

    // Reset insertion tracking
    (editor.storage as any).trackChanges.lastInsertionId = null;

    // Type new text (tracking still ON)
    const endPos = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(endPos);
    editor.commands.insertContent('earth');
    await wait();

    const deletionType = editor.state.schema.marks.trackDeletion;
    const insertionType = editor.state.schema.marks.trackInsertion;

    // "earth" should have insertion mark, NOT deletion mark
    let earthHasDeletion = false;
    let earthHasInsertion = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.textContent.includes('earth')) {
        if (node.marks.some(m => m.type === deletionType)) earthHasDeletion = true;
        if (node.marks.some(m => m.type === insertionType)) earthHasInsertion = true;
      }
    });
    expect(earthHasDeletion).toBe(false);
    expect(earthHasInsertion).toBe(true);

    editor.destroy();
  });
});
