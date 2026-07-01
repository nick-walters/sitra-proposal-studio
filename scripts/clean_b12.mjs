import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = 'https://nfeoyxjstfehwrkgapho.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SUPABASE_URL, KEY);

const PROPOSAL_ID = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4';
const SECTION_ID = 'b1-2';

const CANONICAL_DEFAULTS = [
  'Methodologies',
  'Linked research & innovation activities',
  'Interdisciplinarity',
  'Social sciences & humanities',
  'Gender dimension',
  'Open science practices',
];
const PER_TYPE_TEXTS = new Set(['Challenges','Case Studies','Lighthouses','Demonstrations']);

const { data: latest } = await sb
  .from('section_versions')
  .select('id, content, version_number')
  .eq('proposal_id', PROPOSAL_ID)
  .eq('section_id', SECTION_ID)
  .order('version_number', { ascending: false })
  .limit(1);
const row = latest[0];

const before = {
  len: row.content.length,
  cases_tables: (row.content.match(/data-cases-table-node/g) || []).length,
  typed_tables: (row.content.match(/data-case-type-id="/g) || []).length,
  h3: (row.content.match(/<h3/g) || []).length,
  typed_headings: (row.content.match(/data-case-type-heading-id="/g) || []).length,
};

const $ = cheerio.load(row.content, { xmlMode: false }, false);

// 1. Remove every UNTYPED casesTable div (and its preceding empty <p>) — we'll let the reconciler rebuild.
$('div[data-cases-table-node]').each((_, el) => {
  const $el = $(el);
  if ($el.attr('data-case-type-id')) {
    $el.remove(); // typed too — fully wipe, reconciler rebuilds clean
    return;
  }
  $el.remove();
});

// 2. Remove stray per-type subheadings:
//    - any <h3> with data-case-type-heading-id  -> remove (reconciler rebuilds)
//    - any <h3 data-default-subheading="true"> whose text matches a per-type plural
//      (Challenges/Case Studies/Lighthouses/Demonstrations)  -> remove
const seenCanonical = new Set();
$('h3').each((_, el) => {
  const $el = $(el);
  const txt = $el.text().trim();
  if ($el.attr('data-case-type-heading-id')) { $el.remove(); return; }
  if (PER_TYPE_TEXTS.has(txt)) { $el.remove(); return; }
  if (CANONICAL_DEFAULTS.includes(txt)) {
    if (seenCanonical.has(txt)) { $el.remove(); return; }
    seenCanonical.add(txt);
  }
});

// 3. Collapse runs of empty paragraphs to at most one.
const isEmptyP = (el) => el.tagName === 'p' && $(el).text().trim() === '' && $(el).children().length === 0;
let prev = null;
$('body').children().each((_, el) => {
  if (isEmptyP(el) && prev && isEmptyP(prev)) {
    $(el).remove();
  } else {
    prev = el;
  }
});

const cleaned = $.html();

const after = {
  len: cleaned.length,
  cases_tables: (cleaned.match(/data-cases-table-node/g) || []).length,
  typed_tables: (cleaned.match(/data-case-type-id="/g) || []).length,
  h3: (cleaned.match(/<h3/g) || []).length,
  typed_headings: (cleaned.match(/data-case-type-heading-id="/g) || []).length,
};

console.log('BEFORE:', before);
console.log('AFTER :', after);

if (process.argv.includes('--write')) {
  const { data: nextVer, error } = await sb.rpc('insert_section_version', {
    p_proposal_id: PROPOSAL_ID,
    p_section_id: SECTION_ID,
    p_content: cleaned,
    p_created_by: '00000000-0000-0000-0000-000000000000',
    p_is_auto_save: false,
  });
  if (error) { console.error(error); process.exit(1); }
  console.log('Wrote version', nextVer);
} else {
  console.log('(dry run; pass --write to commit)');
  // print sample of cleaned HTML
  console.log('\n--- CLEANED ---\n', cleaned.slice(0, 4000));
}
