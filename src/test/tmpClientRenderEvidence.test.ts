import { describe, it } from 'vitest';
import { renderRefBadges } from '@/lib/renderRefBadges';
import type { RefSnapshot } from '@/lib/referenceData';
import { readFileSync } from 'node:fs';

function snap(): RefSnapshot {
  return {
    wpById: new Map([['27040f33-687b-4d19-9845-a5dcb203a97d', { id: '27040f33-687b-4d19-9845-a5dcb203a97d', number: 2, color: '#000000', short_name: 'Canary' }]]),
    taskById: new Map([['36e4f9a6-a68d-4ae3-8d5d-a62149f3e3cd', { id: '36e4f9a6-a68d-4ae3-8d5d-a62149f3e3cd', number: 3, wp_number: 2, wp_color: '#000000' }]]),
    deliverableById: new Map([['675d368a-ab0d-414f-95fa-906db9b011ee', { id: '675d368a-ab0d-414f-95fa-906db9b011ee', number: 'D2.2', wp_number: 2, wp_color: '#000000' }]]),
    milestoneById: new Map([['cccc3333-0000-4000-8000-0000000000a1', { id: 'cccc3333-0000-4000-8000-0000000000a1', number: 4 }]]),
    caseById: new Map([['cccc3333-0000-4000-8000-0000000000a3', { id: 'cccc3333-0000-4000-8000-0000000000a3', number: 5, case_type: 'living_lab', case_type_id: null, short_name: 'Lab', color: '#000000', include_number: true, include_abbreviation: true }]]),
    participantById: new Map([['cccc3333-0000-4000-8000-0000000000a2', { id: 'cccc3333-0000-4000-8000-0000000000a2', participant_number: 1, organisation_short_name: 'CANORG' }]]),
    figureById: new Map([['cccc3333-0000-4000-8000-0000000000a4', { id: 'cccc3333-0000-4000-8000-0000000000a4', figure_number: '2.1', figure_type: 'custom', title: 'Canary figure' }]]),
    tableCaptionMap: new Map([['table-3.1.a', 'Canary table']]),
    acronymSegments: [{ text: 'EV', color: '#111111' }, { text: 'ID', color: '#222222' }],
  };
}

describe('client render evidence', () => {
  it('prints resolved labels', () => {
    const html = readFileSync('/tmp/fixture.html', 'utf8');
    const out = renderRefBadges(html, snap());
    const tpl = document.createElement('div');
    tpl.innerHTML = out;
    for (const p of Array.from(tpl.querySelectorAll('p'))) {
      console.log('CLIENT>', (p.textContent || '').trim());
    }
  });
});
