import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TrackChanges } from '@/extensions/TrackChanges';

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

function wait(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getDeletionRuns(editor: Editor) {
  const deletionType = editor.state.schema.marks.trackDeletion;
  const runs: Array<{ from: number; to: number; text: string }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hasDeletion = node.marks.some((m) => m.type === deletionType);
    if (!hasDeletion) return;

    const from = pos;
    const to = pos + node.nodeSize;
    const text = node.textContent;
    const prev = runs[runs.length - 1];

    if (prev && prev.to === from) {
      prev.to = to;
      prev.text += text;
    } else {
      runs.push({ from, to, text });
    }
  });

  return runs;
}

describe('TrackChanges typing boundaries', () => {
  it('typing at deletion trailing edge with tracking OFF keeps deletion and inserts plain text', async () => {
    const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });

    editor.commands.setTextSelection({ from: 7, to: 12 });
    editor.commands.deleteSelection();
    await wait();

    editor.commands.toggleTrackChanges();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent('X');
    await wait();

    const deletionType = editor.state.schema.marks.trackDeletion;
    const insertionType = editor.state.schema.marks.trackInsertion;

    let xHasDeletion = false;
    let xHasInsertion = false;
    let deletionStillExists = false;

    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.textContent.includes('X')) {
        if (node.marks.some((m) => m.type === deletionType)) xHasDeletion = true;
        if (node.marks.some((m) => m.type === insertionType)) xHasInsertion = true;
      }
      if (node.marks.some((m) => m.type === deletionType)) deletionStillExists = true;
    });

    expect(xHasDeletion).toBe(false);
    expect(xHasInsertion).toBe(false);
    expect(deletionStillExists).toBe(true);
    editor.destroy();
  });

  it('typing inside a tracked deletion splits it into two deletion runs and marks typed text as insertion', async () => {
    const editor = createEditor({ enabled: true, content: '<p>Hello world</p>' });

    editor.commands.setTextSelection({ from: 7, to: 12 });
    editor.commands.deleteSelection();
    await wait();

    const runsBefore = getDeletionRuns(editor);
    expect(runsBefore.length).toBe(1);

    const insidePos = runsBefore[0].from + 2;
    editor.commands.setTextSelection(insidePos);
    editor.commands.insertContent('Z');
    await wait();

    const runsAfter = getDeletionRuns(editor);
    expect(runsAfter.length).toBe(2);

    const deletionType = editor.state.schema.marks.trackDeletion;
    const insertionType = editor.state.schema.marks.trackInsertion;
    let zHasDeletion = false;
    let zHasInsertion = false;

    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.textContent.includes('Z')) {
        if (node.marks.some((m) => m.type === deletionType)) zHasDeletion = true;
        if (node.marks.some((m) => m.type === insertionType)) zHasInsertion = true;
      }
    });

    expect(zHasDeletion).toBe(false);
    expect(zHasInsertion).toBe(true);
    editor.destroy();
  });
});
