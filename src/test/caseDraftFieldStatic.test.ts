import { describe, it, expect } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import { CASE_DRAFT_FIELD_EXTENSIONS as EXT } from '@/components/cases/caseDraftFieldExtensions';

function roundTrip(html: string): string {
  return generateHTML(generateJSON(html, EXT), EXT);
}

describe('case draft static render schema', () => {
  it('keeps lists', () => {
    const out = roundTrip('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    expect(out).toContain('<ul');
    expect(out).toContain('one');
    expect(out).toContain('two');
  });

  it('keeps ordered lists with a marker style', () => {
    const out = roundTrip('<ol style="list-style-type: lower-alpha"><li><p>a</p></li></ol>');
    expect(out).toContain('lower-alpha');
  });

  it('keeps tables', () => {
    const out = roundTrip(
      '<table><tbody><tr><th><p>H</p></th></tr><tr><td><p>C</p></td></tr></tbody></table>',
    );
    expect(out).toContain('<table');
    expect(out).toContain('<th');
    expect(out).toContain('C');
  });

  it('keeps bold, italic, underline, sub and superscript and colour', () => {
    const out = roundTrip(
      '<p><strong>b</strong><em>i</em><u>u</u><sub>s</sub><span style="color: #ff0000">red</span></p>',
    );
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
    expect(out).toContain('<u>');
    expect(out).toContain('<sub>');
    expect(out).toContain('#ff0000');
  });

  it('keeps paragraph spacing attributes', () => {
    const out = roundTrip('<p data-spacing-before="6" data-spacing-after="12">x</p>');
    expect(out).toContain('data-spacing-before="6"');
    expect(out).toContain('data-spacing-after="12"');
  });

  it('keeps citations', () => {
    const out = roundTrip('<p>text<sup data-citation="3">3</sup></p>');
    expect(out).toContain('data-citation="3"');
  });

  it('resolves reference badges from attributes, not baked text', () => {
    const out = roundTrip(
      '<p><span data-wp-reference data-wp-id="w1" data-wp-number="4" data-wp-short-name="Demo" data-wp-color="#73C92D">WP99: Wrong</span></p>',
    );
    expect(out).toContain('WP4');
    expect(out).not.toContain('WP99');
  });

  it('keeps task, deliverable, milestone, participant, case and acronym badges', () => {
    const out = roundTrip(
      '<p>' +
        '<span data-inline-reference data-ref-type="task" data-wp-number="1" data-task-number="2" data-task-id="t1">T1.2</span>' +
        '<span data-deliverable-reference data-deliverable-id="d1" data-deliverable-label="D1.1">D1.1</span>' +
        '<span data-milestone-reference data-milestone-id="m1" data-milestone-number="3">MS3</span>' +
        '<span data-participant-reference data-participant-id="p1" data-participant-number="2" data-participant-short-name="SDU">SDU</span>' +
        '<span data-case-reference data-case-id="c1" data-case-number="1" data-case-type="pilot">P1</span>' +
        '<span data-acronym-reference data-acronym-segments=\'[{"text":"SUS","color":"#000"}]\'>SUS</span>' +
        '</p>',
    );
    expect(out).toContain('data-task-id="t1"');
    expect(out).toContain('data-deliverable-id="d1"');
    expect(out).toContain('data-milestone-id="m1"');
    expect(out).toContain('data-participant-id="p1"');
    expect(out).toContain('data-case-id="c1"');
    expect(out).toContain('data-acronym-reference');
  });
});
