import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ParticipantBubble } from '@/components/B31Pill';
import { Participant } from '@/types/proposal';
import { ALL_COUNTRIES } from '@/lib/countries';
import type {
  ParticipantDescriptionField,
  ParticipantDescriptions,
} from '@/hooks/useParticipantDetails';


function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length === 0;
}

interface FieldDef {
  key: ParticipantDescriptionField;
  /** Question shown as the plain-text label above the field. Uses [name] placeholder for short name. */
  labelTemplate: string;
}

const FIELD_ORDER: FieldDef[] = [
  {
    key: 'contribution_resources',
    labelTemplate:
      'How does [name] contribute to the project? Describe your roles and show that you have adequate resources in the project to fulfil those roles.',
  },
  {
    key: 'value_chain',
    labelTemplate: 'Describe which parts of the value chain [name] covers.',
  },
  {
    key: 'industrial_involvement',
    labelTemplate:
      'If applicable, describe [name]\u2019s industrial/commercial involvement in the project to ensure exploitation of the results and explain why this is consistent with and will help to achieve the specific measures which are proposed for exploitation of the results of the project.',
  },
  {
    key: 'participation_justification',
    labelTemplate: 'Explain why [name]\u2019s participation is essential to successfully carry out the project.',
  },
];

interface ParticipantDescriptionsSectionProps {
  participant: Participant;
  descriptions: ParticipantDescriptions;
  onUpdateField: (field: ParticipantDescriptionField, value: string) => void;
  saving: boolean;
  lastSaved: Date | null;
  saveError?: string | null;
  canEdit: boolean;
  /** Explicit Yes/No relevance answer; null when never answered. */
  valueChainApplicable?: boolean | null;
  onValueChainApplicableChange?: (next: boolean) => void;
  proposalId?: string;
  /** Acronym segments used when inserting an acronym cross-reference. */
  acronymSegments?: { text: string; color: string }[];
  /** Retained for API compatibility; colour control is not exposed here. */
  canManageCustomColors?: boolean;
}

/**
 * The page (PartAPageLayout) owns the ONE three-tier toolbar and the focus
 * provider; this card only renders fields.
 */
export function ParticipantDescriptionsSection({
  participant,
  descriptions,
  onUpdateField,
  canEdit,
  valueChainApplicable,
  onValueChainApplicableChange,
  proposalId,
}: ParticipantDescriptionsSectionProps) {
  const [, setAnyFieldFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const isCompany =
    participant.organisationCategory === 'SME' ||
    participant.organisationCategory === 'LE';

  const isThirdCountry = useMemo(() => {
    if (!participant.country) return false;
    return (
      ALL_COUNTRIES.find(c => c.name === participant.country)?.category === 'third'
    );
  }, [participant.country]);

  const isInternationalPartner =
    participant.organisationType === 'international_partner';

  // B3.2 mirror toggles (set by coordinator+ in A2). When a toggle is off the
  // corresponding description field is hidden on the participant page.
  const { data: mirrorToggles } = useQuery({
    queryKey: ['b32-mirror-toggles', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification')
        .eq('id', proposalId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Partial<Record<
        'mirror_value_chain' | 'mirror_industrial_involvement' | 'mirror_participation_justification',
        boolean
      >>;
    },
  });

  // Relevance default: Yes for SME and LE, No for every other type — but a
  // participant who has already written value chain text keeps it visible,
  // whatever their type, until someone answers No deliberately.
  const hasValueChainText = !isBlankHtml(descriptions.value_chain);
  const valueChainRelevant =
    valueChainApplicable ?? (isCompany || hasValueChainText);

  const visibleFields = FIELD_ORDER.filter(f => {
    if (f.key === 'value_chain')
      return (mirrorToggles?.mirror_value_chain ?? true) && valueChainRelevant;
    if (f.key === 'industrial_involvement')
      return isCompany && (mirrorToggles?.mirror_industrial_involvement ?? true);
    if (f.key === 'participation_justification')
      return (
        (isInternationalPartner || isThirdCountry) &&
        (mirrorToggles?.mirror_participation_justification ?? true)
      );
    return true;
  });

  const handleFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setAnyFieldFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setAnyFieldFocused(false);
      blurTimerRef.current = null;
    }, 150);
  }, []);

  const shortName = participant.organisationShortName || '';
  // The toggle follows the field's own mirror switch: when a coordinator has
  // turned value chain off for the whole proposal, neither is offered.
  const showValueChainToggle = mirrorToggles?.mirror_value_chain ?? true;

  if (visibleFields.length === 0 && !showValueChainToggle) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Participant description</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          This content is mirrored to Part B3.2, where the consortium and its roles are described.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleFields.map((field) => {
          const label = field.labelTemplate.replace('[name]', shortName);
          const prefixNode = (
            <ParticipantBubble
              number={participant.participantNumber}
              shortName={participant.organisationShortName}
            />
          );
          return (
            <Fragment key={field.key}>
              <div className="space-y-1.5">
                <div className="text-sm text-foreground/90">{label}</div>
                <LazyRichField
                  value={descriptions[field.key] || ''}
                  onChange={(v) => onUpdateField(field.key, v)}
                  disabled={!canEdit}
                  prefix={prefixNode}
                  minHeight="90px"
                  proposalId={proposalId ?? ''}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              {/* The relevance question sits directly above the value chain field it governs. */}
              {field.key === 'contribution_resources' && showValueChainToggle && (
                <div className="space-y-1.5">
                  <div className="text-sm text-foreground/90">
                    {`Does ${shortName} bring coverage of one or more parts of the value chain to the project?`}
                  </div>
                  <RadioGroup
                    className="flex items-center gap-6"
                    value={valueChainRelevant ? 'yes' : 'no'}
                    onValueChange={(v) => onValueChainApplicableChange?.(v === 'yes')}
                    disabled={!canEdit}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id="value-chain-yes" />
                      <Label htmlFor="value-chain-yes" className="font-normal">Yes</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id="value-chain-no" />
                      <Label htmlFor="value-chain-no" className="font-normal">No</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </Fragment>
          );
        })}
      </CardContent>
    </Card>
  );
}
