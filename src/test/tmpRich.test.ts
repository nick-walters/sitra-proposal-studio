import { describe, it } from 'vitest';
import { htmlToTypstInline } from '@/lib/typst/htmlToTypst';
describe('rich', () => {
  it('emits', () => {
    const ctx: any = { unsupported: new Set(), data: {}, citations: null };
    console.log(htmlToTypstInline('<p style="text-align: justify;">Project meetings.</p>', ctx));
    console.log(htmlToTypstInline('8 physical meetings with 2 people.\n ', ctx));
  });
});
