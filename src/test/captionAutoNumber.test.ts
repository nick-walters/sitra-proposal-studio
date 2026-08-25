import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { CaptionAutoNumber } from '@/extensions/CaptionAutoNumber';
import { CaptionLabel } from '@/extensions/CaptionLabel';

describe('CaptionAutoNumber', () => {
  it('inserts a derived label into a migrated empty-label caption', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        CaptionLabel,
        CaptionAutoNumber.configure({
          getConfig: () => ({ sectionNumber: '1.1', tableOffset: 0, figureOffset: 0 }),
        }),
      ],
      content:
        '<p class="document-table-caption"><span data-caption-label=""></span><em>TRL progression</em></p>',
    });

    editor.view.dispatch(
      editor.state.tr.setMeta('addToHistory', false).setMeta('captionNumberingRefresh', true),
    );

    expect(editor.getText()).toBe('Table 1.1.a. TRL progression');
    expect(editor.getHTML()).toContain('data-caption-label');
    editor.destroy();
  });

  it('renumbers immediately when the section-wide offset changes', () => {
    let tableOffset = 0;
    const editor = new Editor({
      extensions: [
        StarterKit,
        CaptionLabel,
        CaptionAutoNumber.configure({
          getConfig: () => ({ sectionNumber: '2.1', tableOffset, figureOffset: 0 }),
        }),
      ],
      content: '<p class="document-table-caption"><em>Impact summary canvas</em></p>',
    });

    editor.view.dispatch(
      editor.state.tr.setMeta('addToHistory', false).setMeta('captionNumberingRefresh', true),
    );
    expect(editor.getText()).toBe('Table 2.1.a. Impact summary canvas');

    tableOffset = 2;
    editor.view.dispatch(
      editor.state.tr.setMeta('addToHistory', false).setMeta('captionNumberingRefresh', true),
    );
    expect(editor.getText()).toBe('Table 2.1.c. Impact summary canvas');
    editor.destroy();
  });
});