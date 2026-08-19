import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { ParticipantReferenceNode } from '@/extensions/ParticipantReferenceNode';

function parse(html: string) {
  const editor = new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      InlineReferenceNode,
      WPReferenceNode,
      CaseReferenceNode,
      ParticipantReferenceNode,
    ],
    content: `<p>${html}</p>`,
  });
  const json = editor.getJSON();
  const nodes: any[] = [];
  const walk = (n: any) => {
    if (n.type && n.type !== 'doc' && n.type !== 'paragraph') nodes.push(n);
    (n.content || []).forEach(walk);
  };
  walk(json);
  const text = editor.state.doc.textContent;
  editor.destroy();
  return { nodes, text };
}

describe('legacy contentEditable badge parse rules', () => {
  it('parses a legacy task badge', () => {
    const { nodes, text } = parse(
      '<span contenteditable="false" data-task-reference="" data-task-id="task-1" style="color:#73C92D">T2.3</span>',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('inlineReference');
    expect(nodes[0].attrs.refType).toBe('task');
    expect(nodes[0].attrs.taskId).toBe('task-1');
    expect(nodes[0].attrs.wpNumber).toBe(2);
    expect(nodes[0].attrs.taskNumber).toBe(3);
    expect(text).not.toContain('T2.3');
  });

  it('parses a generation 1 deliverable badge (SVG pentagon)', () => {
    const { nodes, text } = parse(
      '<span contenteditable="false" data-deliverable-id="del-1">' +
        '<svg width="44" height="17"><path d="M 0,0 L 36,0 L 44,8.5 L 36,17 L 0,17 Z" fill="#ffffff" stroke="#73C92D" stroke-width="1.5"/></svg>' +
        '<span style="color:#73C92D">D1.2</span>' +
        '</span>',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('inlineReference');
    expect(nodes[0].attrs.refType).toBe('deliverable');
    expect(nodes[0].attrs.deliverableId).toBe('del-1');
    expect(nodes[0].attrs.deliverableNumber).toBe('D1.2');
    expect(nodes[0].attrs.wpColor).toBe('#73C92D');
    expect(text).not.toContain('D1.2');
  });

  it('parses a generation 2 deliverable badge (nested layer spans)', () => {
    const { nodes, text } = parse(
      '<span data-deliverable-reference="" data-deliverable-id="del-2" data-deliverable-label="D3.4" data-wp-color="#2563EB">' +
        '<span style="background-color:#2563EB"></span>' +
        '<span style="background-color:#ffffff"></span>' +
        '<span>D3.4</span>' +
        '</span>',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].attrs.refType).toBe('deliverable');
    expect(nodes[0].attrs.deliverableId).toBe('del-2');
    expect(nodes[0].attrs.deliverableNumber).toBe('D3.4');
    expect(nodes[0].attrs.wpColor).toBe('#2563EB');
    expect(text).not.toContain('D3.4');
  });

  it('parses a legacy milestone badge', () => {
    const { nodes, text } = parse(
      '<span contenteditable="false" data-milestone-id="ms-1" style="clip-path:polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)">MS5</span>',
    );
    expect(nodes[0].type).toBe('inlineReference');
    expect(nodes[0].attrs.refType).toBe('milestone');
    expect(nodes[0].attrs.milestoneId).toBe('ms-1');
    expect(nodes[0].attrs.milestoneNumber).toBe(5);
    expect(text).not.toContain('MS5');
  });

  it('parses the data-inline-reference milestone shape', () => {
    const { nodes } = parse(
      '<span data-inline-reference="" data-ref-type="milestone" data-milestone-id="ms-2" data-milestone-number="7">MS7</span>',
    );
    expect(nodes[0].attrs.refType).toBe('milestone');
    expect(nodes[0].attrs.milestoneId).toBe('ms-2');
  });

  it('parses a bare WP badge and does not claim deliverable spans', () => {
    const { nodes, text } = parse(
      '<span contenteditable="false" data-wp-id="wp-1" data-wp-number="4" data-wp-short-name="Needs">WP4: Needs</span>' +
        '<span contenteditable="false" data-deliverable-id="del-3" data-wp-color="#73C92D" data-deliverable-label="D4.1">D4.1</span>',
    );
    expect(nodes.map((n) => n.type)).toEqual(['wpReference', 'inlineReference']);
    expect(nodes[0].attrs.wpId).toBe('wp-1');
    expect(nodes[1].attrs.refType).toBe('deliverable');
    expect(text).not.toContain('WP4');
  });

  it('parses bare case and participant badges', () => {
    const { nodes, text } = parse(
      '<span contenteditable="false" data-case-id="case-1" data-case-number="2" data-case-type="case_study">CS2</span>' +
        '<span contenteditable="false" data-participant-id="p-1" data-participant-number="3" data-participant-short-name="SITRA">SITRA</span>',
    );
    expect(nodes.map((n) => n.type)).toEqual(['caseReference', 'participantReference']);
    expect(nodes[0].attrs.caseId).toBe('case-1');
    expect(nodes[1].attrs.participantId).toBe('p-1');
    expect(text).not.toContain('SITRA');
  });
});
