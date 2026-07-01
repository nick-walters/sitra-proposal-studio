import * as cheerio from 'cheerio';
import fs from 'fs';

const input = fs.readFileSync('/tmp/b12_input.html', 'utf8');

const CANONICAL_DEFAULTS = ['Methodologies','Linked research & innovation activities','Interdisciplinarity','Social sciences & humanities','Gender dimension','Open science practices'];
const PER_TYPE_TEXTS = new Set(['Challenges','Case Studies','Lighthouses','Demonstrations']);

const $ = cheerio.load(input, null, false);

$('div[data-cases-table-node]').each((_, el) => $(el).remove());

const seen = new Set();
$('h3').each((_, el) => {
  const $el = $(el);
  const txt = $el.text().trim();
  if ($el.attr('data-case-type-heading-id')) { $el.remove(); return; }
  if (PER_TYPE_TEXTS.has(txt)) { $el.remove(); return; }
  if (CANONICAL_DEFAULTS.includes(txt)) {
    if (seen.has(txt)) { $el.remove(); return; }
    seen.add(txt);
  }
});

const isEmptyP = (el) => el?.tagName === 'p' && $(el).text().trim() === '' && $(el).children().length === 0;
let prev = null;
$.root().children().each((_, el) => {
  if (isEmptyP(el) && prev && isEmptyP(prev)) { $(el).remove(); }
  else { prev = el; }
});

const out = $.html();
fs.writeFileSync('/tmp/b12_output.html', out);
console.log('BEFORE len:', input.length, 'tables:', (input.match(/data-cases-table-node/g)||[]).length, 'h3:', (input.match(/<h3/g)||[]).length);
console.log('AFTER  len:', out.length, 'tables:', (out.match(/data-cases-table-node/g)||[]).length, 'h3:', (out.match(/<h3/g)||[]).length);
