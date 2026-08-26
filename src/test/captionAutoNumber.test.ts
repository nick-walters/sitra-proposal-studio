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

    expect(html).not.toContain('data-caption-label');
    expect(html).not.toContain('Table 1.1.b. ');
    expect(html).toContain('Starting &amp; target technology readiness levels');
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

    expect(editor.getText()).toBe('TRL progression');
    expect(editor.getHTML()).not.toContain('data-caption-label');
    expect(editor.view.dom.querySelector('[data-caption-label]')?.textContent).toBe('Table 1.1.a. ');
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
    expect(editor.getText()).toBe('Impact summary canvas');
    expect(editor.view.dom.querySelector('[data-caption-label]')?.textContent).toBe('Table 2.1.a. ');

    tableOffset = 2;
    editor.view.dispatch(
      editor.state.tr.setMeta('addToHistory', false).setMeta('captionNumberingRefresh', true),
    );
    expect(editor.getText()).toBe('Impact summary canvas');
    expect(editor.view.dom.querySelector('[data-caption-label]')?.textContent).toBe('Table 2.1.c. ');
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

    expect(editor.getText()).toBe(expectedText.replace(/^Table \d+\.\d+\.[a-z]\. /, ''));
    expect(editor.getHTML()).not.toContain('data-caption-label');
    expect(editor.view.dom.querySelector('[data-caption-label]')?.textContent).toBe(
      expectedText.match(/^Table \d+\.\d+\.[a-z]\. /)?.[0],
    );
    editor.destroy();
  });

  it('accepts text in a caption whose authored description is empty', () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ paragraph: false }),
        CaptionParagraph,
        CaptionLabel,
        CaptionAutoNumber.configure({
          getConfig: () => ({ sectionNumber: '1.1', tableOffset: 1, figureOffset: 0 }),
        }),
      ],
      content: '<p class="document-table-caption"></p>',
    });

    editor.commands.setTextSelection(1);
    expect(editor.commands.insertContent('New caption')).toBe(true);
    expect(editor.getText()).toBe('New caption');
    expect(editor.getHTML()).not.toContain('Table 1.1.b.');
    expect(editor.view.dom.querySelector('[data-caption-label]')?.textContent).toBe('Table 1.1.b. ');
    editor.destroy();
  });
});