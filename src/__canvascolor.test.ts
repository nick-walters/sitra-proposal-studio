import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { CanvasFontSize } from '@/extensions/CanvasFontSize';
import { CanvasHeader } from '@/extensions/CanvasHeader';

describe('canvas colour', () => {
  it('round-trips', () => {
    const el = document.createElement('div');
    const editor = new Editor({
      element: el,
      extensions: [StarterKit.configure({ heading: false }), Superscript, Subscript, TextStyle, Color, CanvasFontSize, CanvasHeader],
      content: '<p>hello world</p>',
    });
    editor.chain().focus().setTextSelection({ from: 1, to: 6 }).setColor('#ff0000').run();
    const html = editor.getHTML();
    console.log('AFTER SETCOLOR:', html);
    const e2 = new Editor({ element: document.createElement('div'), extensions: [StarterKit.configure({ heading: false }), Superscript, Subscript, TextStyle, Color, CanvasFontSize, CanvasHeader], content: html });
    console.log('REPARSED:', e2.getHTML());
    // also with a font size mark applied first
    editor.chain().setTextSelection({from:1,to:6}).setCanvasFontSize(14).run();
    console.log('WITH SIZE:', editor.getHTML());
    expect(html).toContain('color');
  });
});
