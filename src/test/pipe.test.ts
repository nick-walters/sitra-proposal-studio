import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { normalizeRefBadges } from '@/lib/normalizeRefBadges';
const raw = `x <span data-deliverable-reference="" data-deliverable-id="a" contenteditable="false" style="display: inline-block; background: rgb(54, 122, 186); padding: 1.5px; clip-path: polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%);"><span style="display:inline-block;background:rgb(255,255,255);color:rgb(54,122,186);">D6.1</span></span>`;
describe('pipeline', () => { it('normalises', () => { const out = normalizeRefBadges(DOMPurify.sanitize(raw, RICH_TEXT_CONFIG)); console.log(JSON.stringify(out)); expect(out).toContain('position:relative'); }); });
