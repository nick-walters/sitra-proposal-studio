import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';
import { buildCaseLabel, getCaseTypePrefix } from '@/lib/caseTypeLabels';

/**
 * The mirrored List of participants, rendered at the top of B1.1.
 *
 * This is the SAME list the exported cover page carries — the export no longer
 * composes it on its own: it reads these rows (`participants`, `wp_drafts`,
 * `case_drafts`) and the column widths this table stores, so what the author
 * arranges here is what the PDF prints.
 *
 * Column widths live in the shared `table_column_widths` table, keyed by
 * (proposal_id, table_key = 'b11-participants'), exactly as authored Part B
 * tables store theirs. Source-fed tables have no `card_table_columns` row
 * because their columns are not authored — only their widths are.
 */

export const B11_PARTICIPANTS_TABLE_KEY = 'b11-participants';

/** Default proportions (percent of the 18cm text column), as the export uses. */
export const B11_PARTICIPANT_COLUMN_SHARES = [14, 35, 7, 10, 19, 15];

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
// House table style: no vertical rules, a 1.5px black rule under the header,
// a 1px light rule between rows and none under the last one.
const cellStyles =
  "px-[3pt] py-[0.75pt] font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle border-0 border-b border-b-[#e5e7eb] [tr:last-child>&]:border-b-0";
const headerCellStyles =
  "px-[3pt] py-[0.75pt] font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle border-0 border-b-[1.5px] border-b-black font-bold";


interface RoleBubble {
  label: string;
  color: string;
  filled: boolean;
}

export interface B11ParticipantRow {
  id: string;
  number: number;
  shortName: string;
  legalName: string;
  englishName: string;
  country: string;
  organisationType: string;
  roles: RoleBubble[];
  logoUrl: string | null;
}

function safeHex(value: string | null | undefined, fallback = '#334155'): string {
  const raw = (value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

export function useB11ParticipantRows(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['b11-participant-list', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<B11ParticipantRow[]> => {
      const [{ data: partRows }, { data: wpRows }, { data: caseRows }, { data: caseTypes }] = await Promise.all([
        supabase
          .from('participants')
          .select(
            'id, participant_number, organisation_name, organisation_short_name, english_name, country, logo_url, organisation_category',
          )
          .eq('proposal_id', proposalId!)
          .order('participant_number'),
        supabase
          .from('wp_drafts')
          .select('number, lead_participant_id, color')
          .eq('proposal_id', proposalId!)
          .order('number'),
        supabase
          .from('case_drafts')
          .select('number, short_name, lead_participant_id, color, case_type, case_type_id, custom_type_name')
          .eq('proposal_id', proposalId!)
          .order('number'),
        supabase
          .from('proposal_case_types')
          .select('id, include_number, include_abbreviation')
          .eq('proposal_id', proposalId!),
      ]);

      const caseTypeById = new Map((caseTypes || []).map((type) => [type.id, type]));

      const roles = new Map<string, RoleBubble[]>();
      const push = (id: string | null, bubble: RoleBubble) => {
        if (!id) return;
        if (!roles.has(id)) roles.set(id, []);
        roles.get(id)!.push(bubble);
      };
      for (const wp of wpRows || []) {
        push(wp.lead_participant_id, {
          label: `WP${wp.number}`,
          color: safeHex(wp.color),
          filled: true,
        });
      }
      for (const c of caseRows || []) {
        const prefix = getCaseTypePrefix(c.case_type, c.custom_type_name);
        const settings = c.case_type_id ? caseTypeById.get(c.case_type_id) : undefined;
        const includeNumber = settings?.include_number !== false;
        push(c.lead_participant_id, {
          label: includeNumber
            ? buildCaseLabel({
                prefix,
                number: c.number,
                shortName: c.short_name,
                includeNumber: true,
                includeAbbreviation: settings?.include_abbreviation !== false,
                withShortName: false,
              })
            : c.short_name || buildCaseLabel({
                prefix,
                number: c.number,
                shortName: c.short_name,
                includeNumber: false,
                includeAbbreviation: false,
                withShortName: false,
              }),
          color: '#000000',
          filled: false,
        });
      }

      const rows: B11ParticipantRow[] = [];
      for (const row of (partRows || []).slice().sort(
        (a, b) => (a.participant_number || 999) - (b.participant_number || 999),
      )) {
        const legalName = (row.organisation_name || '').trim();
        const english = (row.english_name || '').trim();
        const bubbles: RoleBubble[] = [];
        // The coordinator badge is BLACK on the platform, and now in the export too.
        if (row.participant_number === 1) {
          bubbles.push({ label: 'Coordinator', color: '#000000', filled: true });
        }
        bubbles.push(...(roles.get(row.id) || []));
        rows.push({
          id: row.id,
          number: row.participant_number || rows.length + 1,
          shortName: (row.organisation_short_name || '').trim(),
          legalName,
          englishName:
            english && english.toLowerCase() !== legalName.toLowerCase() ? english : '',
          country: (row.country || '').trim(),
          organisationType: (row.organisation_category || '').trim(),
          roles: bubbles,
          logoUrl: row.logo_url || null,
        });
      }
      return rows;
    },
  });
}

function Bubble({ bubble }: { bubble: RoleBubble }) {
  return (
    <span
      className="mr-1 inline-block whitespace-nowrap rounded-full px-[5px] text-[11pt] font-bold leading-tight"
      style={
        bubble.filled
          ? { background: bubble.color, color: '#ffffff' }
          : { background: '#ffffff', color: bubble.color, border: `1.5px solid ${bubble.color}` }
      }
    >
      {bubble.label}
    </span>
  );
}

function LogoCell({ url }: { url: string | null }) {
  const { data: src } = useQuery({
    queryKey: ['b11-participant-logo', url],
    enabled: !!url,
    queryFn: async () => (url ? await resolveStorageUrl(url) : null),
  });
  if (!src) return <>—</>;
  return <img src={src} alt="" className="mx-auto max-h-[30px] max-w-[30px] object-contain" />;
}

export function B11ParticipantListTable({ proposalId }: { proposalId: string }) {
  const { isAdminOrOwner } = useUserRole();
  const { data: rows = [] } = useB11ParticipantRows(proposalId);
  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId,
    tableKey: B11_PARTICIPANTS_TABLE_KEY,
    canResize: isAdminOrOwner,
    maxTotalWidth: 768,
    minWidth: 30,
    expectedColumnCount: B11_PARTICIPANT_COLUMN_SHARES.length,
  });

  const headers = [
    'Short name',
    'Participant legal name | English name, if different',
    '',
    'Type',
    'Lead roles',
    'Country',
  ];
  const fixed = colWidths.length === headers.length;

  return (
    <table
      data-table-key={B11_PARTICIPANTS_TABLE_KEY}
      ref={tableRef}
      className={`${tableStyles} w-full border-collapse`}
      style={{
        tableLayout: fixed ? 'fixed' : 'fixed',
        width: fixed ? `${colWidths.reduce((s, w) => s + w, 0)}px` : '100%',
      }}
    >
      <colgroup>
        {headers.map((h, i) => (
          <col
            key={`${i}-${h}`}
            style={{
              width: fixed
                ? `${colWidths[i]}px`
                : `${B11_PARTICIPANT_COLUMN_SHARES[i]}%`,
            }}
          />
        ))}
      </colgroup>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={h} className={`${headerCellStyles} relative text-left`}>
              {i === 1 ? (
                <>
                  Participant legal name | <em>English name, if different</em>
                </>
              ) : (
                h
              )}
              {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(i)} />}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className={cellStyles}>
              {p.shortName ? (
                <span className="inline-block whitespace-nowrap rounded-full bg-black px-[5px] text-[11pt] font-bold leading-tight text-white">
                  {p.number}. {p.shortName}
                </span>
              ) : (
                '—'
              )}
            </td>
            <td className={cellStyles}>
              {p.legalName}
              {p.englishName && (
                <>
                  <br />
                  <span className="italic text-[#666]">{p.englishName}</span>
                </>
              )}
            </td>
            <td className={`${cellStyles} text-center`}>
              <LogoCell url={p.logoUrl} />
            </td>
            <td className={cellStyles}>{p.organisationType || '—'}</td>
            <td className={cellStyles}>
              {p.roles.length ? p.roles.map((b) => <Bubble key={b.label} bubble={b} />) : '—'}
            </td>
            <td className={cellStyles}>{p.country || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
