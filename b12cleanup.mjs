import fs from 'fs';
import * as cheerio from 'cheerio';

const proposalId = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4';
const current = fs.readFileSync('/tmp/b12wipe/section_content_current.html', 'utf8');
const v229 = fs.readFileSync('/tmp/b12wipe/version229.html', 'utf8');
const caseTypesTsv = fs.readFileSync('/tmp/b12wipe/case_types.tsv', 'utf8').trim();

const builtIn = {
  case_study: { singular: 'Case Study', plural: 'Case Studies' },
  use_case: { singular: 'Use Case', plural: 'Use Cases' },
  living_lab: { singular: 'Living Lab', plural: 'Living Labs' },
  lighthouse: { singular: 'Lighthouse', plural: 'Lighthouses' },
  pilot: { singular: 'Pilot', plural: 'Pilots' },
  demonstration: { singular: 'Demonstration', plural: 'Demonstrations' },
  challenge: { singular: 'Challenge', plural: 'Challenges' },
};
function pluralise(word) {
  const w = (word ?? '').trim();
  if (!w) return '';
  if (w.toLowerCase() === 'case study') return 'Case Studies';
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}
function caseTypePlural(code, custom) {
  if (code === 'other') return pluralise(custom) || 'Cases';
  return builtIn[code]?.plural || 'Cases';
}
function normText(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function isEmptyP($, el) { return el?.tagName === 'p' && normText($(el).text()) === '' && $(el).children().length === 0; }
function prevEl($, el) { let p = $(el).prev(); while (p.length && p[0].type !== 'tag') p = p.prev(); return p; }
function nextEl($, el) { let n = $(el).next(); while (n.length && n[0].type !== 'tag') n = n.next(); return n; }

const caseTypes = caseTypesTsv ? caseTypesTsv.split('\n').map(line => {
  const [id, code, custom, captionText, caseCountRaw, orderRaw] = line.split('\t');
  return { id, code: code || null, custom: custom || null, captionText: captionText || '', caseCount: Number(caseCountRaw || 0), order: Number(orderRaw || 0), plural: caseTypePlural(code || null, custom || null) };
}) : [];
const casePluralSet = new Set([
  'Challenges','Case Studies','Lighthouses','Demonstrations','Pilots','Use Cases','Living Labs',
  ...caseTypes.map(t => t.plural).filter(Boolean),
]);
const caseCaptionSuffixes = new Set([
  ...caseTypes.map(t => t.captionText).filter(Boolean).map(normText),
  ...caseTypes.map(t => `${t.plural.slice(0, -1)} descriptions`).filter(Boolean).map(normText),
]);
const defaultSubheads = [
  'Methodologies',
  'Linked research & innovation activities',
  'Interdisciplinarity',
  'Social sciences & humanities',
  'Gender dimension',
  'Open science practices',
];
const defaultSet = new Set(defaultSubheads);

function isCaseH3($, el) {
  if (el?.tagName !== 'h3') return false;
  return !!$(el).attr('data-case-type-heading-id') || casePluralSet.has(normText($(el).text()));
}
function captionSuffix(text) {
  const m = normText(text).match(/^Table\s+1\.2\.[a-z]\.?\s*(.*)$/i);
  return m ? normText(m[1]) : '';
}
function isOrphanCaseCaption($, el) {
  if (el?.tagName !== 'p' || !($(el).attr('class') || '').split(/\s+/).includes('table-caption')) return false;
  const suffix = captionSuffix($(el).text());
  if (!suffix) return false;
  const nxt = nextEl($, el);
  const isFollowedByRealTable = nxt.length && nxt[0].tagName === 'table';
  // Case-table NodeViews render their own captions; stale saved caption paragraphs are orphaned plain paragraphs.
  return !isFollowedByRealTable && (caseCaptionSuffixes.has(suffix) || /descriptions?$/i.test(suffix));
}
function count(html) {
  const $ = cheerio.load(html, { decodeEntities: false }, false);
  const h3s = $('h3').toArray();
  const caseH3s = h3s.filter(el => isCaseH3($, el));
  return {
    length: html.length,
    casesTableTotal: $('[data-cases-table-node]').length,
    casesTableTyped: $('[data-cases-table-node][data-case-type-id]').length,
    casesTableUntyped: $('[data-cases-table-node]').length - $('[data-cases-table-node][data-case-type-id]').length,
    h3Total: h3s.length,
    caseTypeH3Total: caseH3s.length,
    caseTypeH3WithId: caseH3s.filter(el => !!$(el).attr('data-case-type-heading-id')).length,
    caseTypeH3TextOnly: caseH3s.filter(el => !$(el).attr('data-case-type-heading-id')).length,
    caseTypeH3ByText: Object.fromEntries([...casePluralSet].sort().map(label => [label, h3s.filter(el => normText($(el).text()) === label).length]).filter(([,n]) => n > 0)),
    orphanCaseCaptions: $('p.table-caption').toArray().filter(el => isOrphanCaseCaption($, el)).length,
    captionTexts: $('p.table-caption').toArray().map(el => normText($(el).text())),
    defaultSubheads: Object.fromEntries(defaultSubheads.map(label => [label, h3s.filter(el => normText($(el).text()) === label).length])),
    realTables: $('table').length,
    userParagraphTexts: $('p').toArray().map(el => normText($(el).text())).filter(Boolean),
    savedHeadingIds: $('h3[data-case-type-heading-id]').toArray().map(el => $(el).attr('data-case-type-heading-id')),
    savedTableIds: $('[data-cases-table-node][data-case-type-id]').toArray().map(el => $(el).attr('data-case-type-id')),
  };
}

const before = count(current);

const $ = cheerio.load(current, { decodeEntities: false }, false);

// Remove case-type h3s by ID and by text; remove immediately following empty paragraph.
$('h3').toArray().forEach(el => {
  if (!isCaseH3($, el)) return;
  const n = nextEl($, el);
  if (n.length && isEmptyP($, n[0])) n.remove();
  $(el).remove();
});

// Remove every typed/untyped casesTable placeholder node.
$('[data-cases-table-node]').remove();

// Remove orphan case-table caption paragraphs. If they are followed by empty paras from a removed unit, remove those too.
$('p.table-caption').toArray().forEach(el => {
  if (!isOrphanCaseCaption($, el)) return;
  const n = nextEl($, el);
  $(el).remove();
  if (n.length && isEmptyP($, n[0])) n.remove();
});

// Restore the lost manual Methodologies block from version 229 if no real manual table remains.
if ($('table').length === 0) {
  const $old = cheerio.load(v229, { decodeEntities: false }, false);
  const oldChildren = $old.root().children().toArray();
  const start = oldChildren.findIndex(el => el.tagName === 'h3' && normText($old(el).text()) === 'Methodologies');
  const end = oldChildren.findIndex((el, idx) => idx > start && el.tagName === 'h3' && normText($old(el).text()) === 'Linked research & innovation activities');
  const block = oldChildren.slice(start + 1, end).map(el => $old.html(el)).join('');
  const curChildren = $.root().children().toArray();
  const curStart = curChildren.findIndex(el => el.tagName === 'h3' && normText($(el).text()) === 'Methodologies');
  const curEnd = curChildren.findIndex((el, idx) => idx > curStart && el.tagName === 'h3' && normText($(el).text()) === 'Linked research & innovation activities');
  // Remove whatever is currently between those two defaults (typically one empty p), then insert the recovered block.
  curChildren.slice(curStart + 1, curEnd).forEach(el => $(el).remove());
  $(curChildren[curStart]).after(block);
}

const wipedHtml = $.root().html();
const afterWipe = count(wipedHtml);

// Build fresh reconciler-equivalent units for each case type with >= 1 case.
const $rebuilt = cheerio.load(wipedHtml, { decodeEntities: false }, false);
caseTypes
  .filter(t => t.caseCount >= 1)
  .sort((a,b) => (a.order ?? 0) - (b.order ?? 0))
  .forEach(t => {
    $rebuilt.root().append(`<h3 data-default-subheading="true" data-case-type-heading-id="${t.id}" style="text-align: justify;">${t.plural}</h3>`);
    $rebuilt.root().append('<p style="text-align: justify;"></p>');
    $rebuilt.root().append(`<div data-case-type-id="${t.id}" data-cases-table-node=""></div>`);
  });
const rebuiltHtml = $rebuilt.root().html();
const afterRebuild = count(rebuiltHtml);

const expectedIds = caseTypes.filter(t => t.caseCount >= 1).sort((a,b)=>(a.order??0)-(b.order??0)).map(t => t.id);
const report = { proposalId, expectedTypesWithCases: caseTypes.filter(t => t.caseCount >= 1).map(t => ({ id: t.id, plural: t.plural, caseCount: t.caseCount, captionText: t.captionText })), before, afterWipe, afterRebuild, expectedIds };
fs.writeFileSync('/tmp/b12wipe/wiped.html', wipedHtml);
fs.writeFileSync('/tmp/b12wipe/rebuilt.html', rebuiltHtml);
fs.writeFileSync('/tmp/b12wipe/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
