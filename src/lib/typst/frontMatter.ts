/**
 * Page-one furniture for the Typst document: the Sitra logo bitmap, the list
 * of participants and the AI usage statement.
 *
 * WHERE EACH PIECE COMES FROM — these are the same sources the browser-print
 * export (`printRenderer.tsx`) uses, re-issued as plain async queries because
 * Typst is compiled outside React:
 *
 *  - Sitra logo        → `SITRA_LOGO_BASE64` (the same inline PNG the on-screen
 *                        banner and the PDF export draw), decoded to bytes and
 *                        handed to the compiler as a shadow file.
 *  - participant list  → `participants` for the rows, `wp_drafts` and
 *                        `case_drafts` for the "Lead roles" bubbles, and the
 *                        storage bucket for each organisation's logo. Sorted
 *                        by participant number, coordinator = number 1.
 *  - AI statement      → `part_a1.ai_statement_text`, gated by
 *                        `ai_statement_enabled`, resolved through the shared
 *                        `resolveAiStatementHtml` so the default wording is
 *                        identical to A1 and to the PDF export.
 *
 * Only the FIRST section of Part B (B1.1) carries any of this — see
 * `buildSectionTypstDocument`.
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';
import { resolveAiStatementHtml } from '@/lib/aiStatement';
import { buildCaseLabel, getCaseTypePrefix } from '@/lib/caseTypeLabels';
import { SITRA_LOGO_BASE64 } from '@/lib/sitraLogo';
import type { TypstAsset } from './typstCompiler';
import { typstString, htmlToTypstBlocks, type ConvertContext } from './htmlToTypst';
import {
  B11_PARTICIPANTS_TABLE_KEY,
  B11_PARTICIPANT_COLUMN_SHARES,
} from '@/components/B11ParticipantListTable';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Virtual path the banner's logo is mapped to inside the compiler. */
export const SITRA_LOGO_ASSET_PATH = '/assets/sitra-logo.png';

interface RoleBubble {
  label: string;
  color: string;
  filled: boolean;
}

interface FrontMatterParticipant {
  number: number;
  shortName: string;
  legalName: string;
  englishName: string;
  country: string;
  organisationType: string;
  roles: RoleBubble[];
  /** Virtual asset path of the organisation logo, when one was resolvable. */
  logoPath: string | null;
}

export interface TypstFrontMatter {
  participants: FrontMatterParticipant[];
  /**
   * Column widths, in px, as the author left them on the B1.1 participant
   * list block (`table_column_widths`, table_key `b11-participants`). Empty
   * when the author never resized: the default shares are used instead.
   */
  columnWidths: number[];
  aiStatementHtml: string | null;
  /** Logo bitmaps (Sitra + organisations) to map as compiler shadow files. */
  assets: TypstAsset[];
}

function decodeBase64(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Typst picks the decoder from the extension, so sniff the real format. */
function extensionFor(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x3c) return 'svg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return null; // GIF: unsupported
  return null;
}

/** The coordinator badge is BLACK, exactly as the platform draws it. */
const COORD_BADGE = '#000000';

function safeHex(value: string | null | undefined, fallback = '#000000'): string {
  const raw = (value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

/** Fetches everything page one needs, including the bitmaps. */
export async function fetchTypstFrontMatter(proposalId: string): Promise<TypstFrontMatter> {
  const assets: TypstAsset[] = [
    { path: SITRA_LOGO_ASSET_PATH, bytes: decodeBase64(SITRA_LOGO_BASE64) },
  ];

  const [{ data: partRows }, { data: wpRows }, { data: caseRows }, { data: caseTypes }, { data: aiRow }, { data: widthRow }] =
    await Promise.all([
      supabase
        .from('participants')
        .select(
          'id, participant_number, organisation_name, organisation_short_name, english_name, country, logo_url, organisation_category',
        )
        .eq('proposal_id', proposalId)
        .order('participant_number'),
      supabase
        .from('wp_drafts')
        .select('number, lead_participant_id, color')
        .eq('proposal_id', proposalId)
        .order('number'),
      supabase
        .from('case_drafts')
        .select('number, short_name, lead_participant_id, color, case_type, case_type_id, custom_type_name')
        .eq('proposal_id', proposalId)
        .order('number'),
      supabase
        .from('proposal_case_types')
        .select('id, include_number, include_abbreviation')
        .eq('proposal_id', proposalId),
      supabase
        .from('part_a1')
        .select('ai_statement_enabled, ai_statement_text')
        .eq('proposal_id', proposalId)
        .maybeSingle(),
      supabase
        .from('table_column_widths')
        .select('column_widths')
        .eq('proposal_id', proposalId)
        .eq('table_key', B11_PARTICIPANTS_TABLE_KEY)
        .maybeSingle(),
    ]);

  const rolesByParticipant = new Map<string, RoleBubble[]>();
  const caseTypeById = new Map(((caseTypes || []) as any[]).map((type) => [type.id, type]));
  const push = (id: string | null, bubble: RoleBubble) => {
    if (!id) return;
    if (!rolesByParticipant.has(id)) rolesByParticipant.set(id, []);
    rolesByParticipant.get(id)!.push(bubble);
  };
  for (const wp of (wpRows || []) as any[]) {
    push(wp.lead_participant_id, {
      label: `WP${wp.number}`,
      color: safeHex(wp.color, '#334155'),
      filled: true,
    });
  }
  for (const c of (caseRows || []) as any[]) {
    const prefix = getCaseTypePrefix(c.case_type, c.custom_type_name);
    const settings = c.case_type_id ? caseTypeById.get(c.case_type_id) : undefined;
    const includeNumber = settings?.include_number !== false;
    push(c.lead_participant_id, {
      label: includeNumber
        ? buildCaseLabel({ prefix, number: c.number, shortName: c.short_name, includeNumber: true, includeAbbreviation: settings?.include_abbreviation !== false, withShortName: false })
        : c.short_name || buildCaseLabel({ prefix, number: c.number, shortName: c.short_name, includeNumber: false, includeAbbreviation: false, withShortName: false }),
      color: '#000000',
      filled: false,
    });
  }

  const participants: FrontMatterParticipant[] = [];
  for (const row of ((partRows || []) as any[]).sort(
    (a, b) => (a.participant_number || 999) - (b.participant_number || 999),
  )) {
    const legalName = (row.organisation_name || '').trim();
    const english = (row.english_name || '').trim();
    const roles: RoleBubble[] = [];
    if (row.participant_number === 1) {
      roles.push({ label: 'Coordinator', color: COORD_BADGE, filled: true });
    }
    roles.push(...(rolesByParticipant.get(row.id) || []));

    let logoPath: string | null = null;
    if (row.logo_url) {
      try {
        const resolved = await resolveStorageUrl(row.logo_url);
        if (resolved) {
          const bytes = new Uint8Array(await (await fetch(resolved)).arrayBuffer());
          const ext = extensionFor(bytes);
          if (ext) {
            logoPath = `/assets/participant-${row.participant_number || participants.length + 1}.${ext}`;
            assets.push({ path: logoPath, bytes });
          }
        }
      } catch {
        /* a missing logo is shown as an em dash, exactly as in the PDF export */
      }
    }

    participants.push({
      number: row.participant_number || participants.length + 1,
      shortName: (row.organisation_short_name || '').trim(),
      legalName,
      englishName: english && english.toLowerCase() !== legalName.toLowerCase() ? english : '',
      country: (row.country || '').trim(),
      organisationType: (row.organisation_category || '').trim(),
      roles,
      logoPath,
    });
  }

  const ai = (aiRow || null) as { ai_statement_enabled?: boolean | null; ai_statement_text?: string | null } | null;
  const aiStatementHtml =
    ai && ai.ai_statement_enabled !== false ? resolveAiStatementHtml(ai.ai_statement_text) : null;

  const rawWidths = (widthRow as { column_widths?: unknown } | null)?.column_widths;
  const columnWidths =
    Array.isArray(rawWidths) && rawWidths.length === B11_PARTICIPANT_COLUMN_SHARES.length
      ? (rawWidths as unknown[]).map((n) => (typeof n === 'number' && n > 0 ? n : 0))
      : [];

  return {
    participants,
    columnWidths: columnWidths.every((n) => n > 0) ? columnWidths : [],
    aiStatementHtml,
    assets,
  };
}

function bubble(b: RoleBubble): string {
  return `chip-pill(${typstString(b.label)}, rgb(${typstString(b.color)}), filled: ${b.filled})`;
}

/**
 * The participant list, as the B1.1 source-fed block renders it. Column widths
 * are the ones stored for that block (`table_column_widths`), converted to
 * Typst `fr` shares so the printed proportions match the editor exactly.
 */
export function emitParticipantList(fm: TypstFrontMatter): string[] {
  if (!fm.participants.length) return [];
  const out: string[] = [];
  out.push('he-h2-plain(' + typstString('List of Participants') + ')');
  const header = [
    't("Short name")',
    't("Participant legal name | ") + emph(t("English name, if different"))',
    't("")',
    't("Lead roles")',
    't("Type")',
    't("Country")',
  ];
  const rows = fm.participants.map((p) => {
    const short = p.shortName
      ? `chip-pill(${typstString(`${p.number}. ${p.shortName}`)}, black, filled: true)`
      : 't("—")';
    const name = p.englishName
      ? `t(${typstString(p.legalName)}) + linebreak() + text(fill: rgb("#666666"), emph(t(${typstString(p.englishName)})))`
      : `t(${typstString(p.legalName)})`;
    const logo = p.logoPath
      ? `align(center, image(${typstString(p.logoPath)}, height: 8mm, fit: "contain"))`
      : 't("—")';
    const roles = p.roles.length ? p.roles.map(bubble).join(' + t(" ") + ') : 't("")';
    return `(${short}, ${name}, ${logo}, ${roles}, t(${typstString(p.organisationType || '—')}), t(${typstString(p.country || '—')}))`;
  });
  const shares = fm.columnWidths.length ? fm.columnWidths : B11_PARTICIPANT_COLUMN_SHARES;
  const cols = shares.map((w) => `${Math.max(1, Math.round(w))}fr`).join(', ');
  out.push(`he-table((${cols},), (${header.join(', ')},), (${rows.join(', ')},))`);
  out.push('text(size: 8pt, t("HES: Higher or secondary education establishment; RES: Research organisation; SME: Small or medium-sized enterprise; LE: Large enterprise; PUB: Public body; INT: International organisation; OTH: Other."))');
  return out;
}

/** Emits the list of participants and the AI statement, in that order. */
export function emitFrontMatter(fm: TypstFrontMatter, ctx: ConvertContext): string[] {
  const out: string[] = [...emitParticipantList(fm)];

  if (fm.aiStatementHtml && fm.aiStatementHtml.trim()) {
    out.push(...htmlToTypstBlocks(fm.aiStatementHtml, ctx));
  }

  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
