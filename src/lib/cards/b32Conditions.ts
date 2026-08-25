/**
 * B3.2's two conditional blocks.
 *
 * `b32.value_chain_industrial` and `b32.other_countries` only belong in the
 * document when the consortium actually has the thing they describe, and their
 * heading names only the halves that are present. Both facts are derived from
 * A2 at RENDER time — nothing is stored, so a change in A2 is reflected
 * everywhere without a migration and without a write.
 *
 * Signals used (see the report in chat for why):
 *  - value chain          → `proposals.mirror_value_chain`
 *  - industrial involvement → `proposals.mirror_industrial_involvement`
 *      AND at least one participant is a company (organisation_category
 *      SME or LE) — the same gate A2 uses to show the field.
 *  - other countries      → at least one participant sits in a country that is
 *      neither an EU member state nor an associated country (category 'third')
 *  - international organisations → at least one participant whose
 *      organisation type is `international_partner`
 *  Both halves of the second block are additionally gated by
 *  `proposals.mirror_participation_justification`, which stays the source of
 *  truth for whether that mirror runs at all.
 *
 * The condition GATES visibility; it never writes `proposal_cards.is_visible`
 * and never writes the `mirror_*` booleans. A block with content therefore can
 * never be hidden by this module writing anything away.
 */
import { ALL_COUNTRIES } from '@/lib/countries';

export const B32_CONDITIONAL_KEYS = ['b32.value_chain_industrial', 'b32.other_countries'] as const;

export interface B32Signals {
  mirrorValueChain: boolean;
  mirrorIndustrialInvolvement: boolean;
  mirrorParticipationJustification: boolean;
  anyCompany: boolean;
  anyThirdCountry: boolean;
  anyInternationalOrganisation: boolean;
}

export interface B32ConditionResult {
  /** True when this block is one of the two conditional ones. */
  conditional: boolean;
  /** False → the block is hidden from the mirror, the preview and the export. */
  met: boolean;
  /** Heading to render, adapted to which halves are present. Null = keep the block's own title. */
  title: string | null;
}

const NOT_CONDITIONAL: B32ConditionResult = { conditional: false, met: true, title: null };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function deriveB32Signals(
  proposal: any,
  participants: any[],
): B32Signals {
  const isThird = (country: string | null | undefined) =>
    !!country && ALL_COUNTRIES.find((c) => c.name === country)?.category === 'third';
  return {
    mirrorValueChain: proposal?.mirror_value_chain !== false,
    mirrorIndustrialInvolvement: proposal?.mirror_industrial_involvement !== false,
    mirrorParticipationJustification: proposal?.mirror_participation_justification !== false,
    anyCompany: (participants || []).some(
      (p) => p?.organisation_category === 'SME' || p?.organisation_category === 'LE',
    ),
    anyThirdCountry: (participants || []).some((p) => isThird(p?.country)),
    anyInternationalOrganisation: (participants || []).some(
      (p) => p?.organisation_type === 'international_partner',
    ),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function resolveB32Condition(
  templateKey: string | null | undefined,
  signals: B32Signals | null | undefined,
): B32ConditionResult {
  if (!templateKey || !signals) return NOT_CONDITIONAL;

  if (templateKey === 'b32.value_chain_industrial') {
    const valueChain = signals.mirrorValueChain;
    const industrial = signals.mirrorIndustrialInvolvement && signals.anyCompany;
    if (valueChain && industrial)
      return { conditional: true, met: true, title: 'Value chain coverage & industrial involvement' };
    if (valueChain) return { conditional: true, met: true, title: 'Value chain coverage' };
    if (industrial) return { conditional: true, met: true, title: 'Industrial involvement' };
    return { conditional: true, met: false, title: null };
  }

  if (templateKey === 'b32.other_countries') {
    const gate = signals.mirrorParticipationJustification;
    const countries = gate && signals.anyThirdCountry;
    const organisations = gate && signals.anyInternationalOrganisation;
    if (countries && organisations)
      return { conditional: true, met: true, title: 'Other countries and international organisations' };
    if (countries) return { conditional: true, met: true, title: 'Other countries' };
    if (organisations) return { conditional: true, met: true, title: 'International organisations' };
    return { conditional: true, met: false, title: null };
  }

  return NOT_CONDITIONAL;
}

/** Why a conditional block is currently left out, for the editor's badge. */
export function b32UnmetReason(templateKey: string | null | undefined): string {
  return templateKey === 'b32.other_countries'
    ? 'No participant from a non-associated country and no international organisation in A2'
    : 'Neither value chain coverage nor industrial involvement is relevant in A2';
}
