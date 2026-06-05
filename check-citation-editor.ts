import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import { CitationNode, CitationMark } from '/dev-server/src/components/CitationMark';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).navigator = dom.window.navigator;

const editor = new Editor({
  extensions: [StarterKit, CitationNode, CitationMark, Superscript],
  content: '<p>hello</p>',
});
const node = editor.schema.nodes.citation.create({ citationNumber: 3 });
editor.view.dispatch(editor.state.tr.insert(6, node));
console.log(editor.getHTML());
editor.commands.setContent('<p>a<sup>2</sup>b <span data-citation="5">5</span></p>', { emitUpdate: false });
console.log(editor.getHTML());
