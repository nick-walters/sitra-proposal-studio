import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import { describe, expect, it } from 'vitest';
import { CaptionAutoNumber, materializeCaptionLabels } from '@/extensions/CaptionAutoNumber';
import { CaptionLabel } from '@/extensions/CaptionLabel';

const CaptionParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attributes) => attributes.class ? { class: attributes.class } : {},
      },
    };
  },
});

describe('CaptionAutoNumber', () => {
  it('materialises a missing migrated label before the editor mounts', () => {
    const html = materializeCaptionLabels(
      '<p class="document-table-caption"><em>Starting &amp; target technology readiness levels</em></p>',
      { sectionNumber: '1.1', tableOffset: 1, figureOffset: 0 },
    );

    expect(html).toContain('data-caption-label');
    expect(html).toContain('Table 1.1.b. ');
  });

  it('inserts a derived label into a migrated empty-label caption', () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ paragraph: false }),
        CaptionParagraph,
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
        StarterKit.configure({ paragraph: false }),
        CaptionParagraph,
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

  it.each([
    ['B1.1 SOTA', '<p class="document-table-caption"><span data-caption-label="">Table 1.1.a. </span><em>Advances beyond the state of the art</em></p>', 'Table 1.1.a. Advances beyond the state of the art'],
    ['B1.1 TRL', '<p class="document-table-caption"><em>Starting &amp; target technology readiness levels</em></p>', 'Table 1.1.b. Starting & target technology readiness levels'],
    ['B2.1 impact summary', '<p class="document-table-caption"><em>Impact summary canvas</em></p>', 'Table 2.1.a. Impact summary canvas'],
  ])('renders the derived label for %s', (_name, storedHtml, expectedText) => {
    const sectionNumber = expectedText.startsWith('Table 2.1') ? '2.1' : '1.1';
    const tableOffset = expectedText.startsWith('Table 1.1.b') ? 1 : 0;
    const preparedHtml = materializeCaptionLabels(storedHtml, {
      sectionNumber,
      tableOffset,
      figureOffset: 0,
    });
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ paragraph: false }),
        CaptionParagraph,
        CaptionLabel,
        CaptionAutoNumber.configure({
          getConfig: () => ({ sectionNumber, tableOffset, figureOffset: 0 }),
        }),
      ],
      content: preparedHtml,
    });

    editor.view.dispatch(
      editor.state.tr.setMeta('addToHistory', false).setMeta('captionNumberingRefresh', true),
    );

    expect(editor.getText()).toBe(expectedText);
    expect(editor.getHTML()).toContain('data-caption-label');
    editor.destroy();
  });
});