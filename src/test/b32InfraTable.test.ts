import { describe, it, expect } from 'vitest';
import { B32InfraTableNode, B32_INFRA_DEFAULT_HEADER } from '@/extensions/B32InfraTableNode';
import { emitB32InfraTable, joinInfraNotes } from '@/lib/typst/b32InfraData';

/**
 * Guard for the B3.2 "Access to critical infrastructure" table.
 *
 * Its migration is applied in production: `b32.capacity` stores
 * `<div data-b32-infra-table>`. If the extension, the NodeView or the Typst
 * emitter is ever removed again, the module silently renders and exports
 * nothing. These assertions fail loudly instead.
 */
describe('B3.2 infrastructure table', () => {
  it('keeps a node that parses the migrated HTML', () => {
    expect(B32InfraTableNode.name).toBe('b32InfraTable');
    const rules = B32InfraTableNode.config.parseHTML?.call({} as never) as { tag: string }[];
    expect(rules.some((r) => r.tag === 'div[data-b32-infra-table]')).toBe(true);
    expect(B32_INFRA_DEFAULT_HEADER).toContain('critical infrastructure');
  });

  it('joins only the project_support notes with semicolons', () => {
    expect(joinInfraNotes(['Cleanroom access', 'Pilot line time;'])).toBe(
      'Cleanroom access; Pilot line time',
    );
  });

  it('emits nothing when no participant has project_support notes', () => {
    expect(
      emitB32InfraTable({ rows: [], caption: 'Access to critical infrastructure' }, 'H', {
        unsupported: new Set(),
      } as never),
    ).toEqual([]);
  });

  it('emits one row per participant with its badge', () => {
    const out = emitB32InfraTable(
      {
        caption: 'Access to critical infrastructure',
        rows: [
          { participantId: 'a', number: 1, shortName: 'Sitra', notes: ['Cleanroom'] },
          { participantId: 'b', number: 12, shortName: 'Advania', notes: ['HPC', 'Storage'] },
        ],
      },
      B32_INFRA_DEFAULT_HEADER,
      { unsupported: new Set() } as never,
    );
    const src = out.join('\n');
    expect(src).toContain('Access to critical infrastructure');
    expect(src).toContain('HPC; Storage');
    expect(src).toContain('12. Advania');
    expect(src).toContain('he-authored-table((1fr,)');
  });
});
