import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PrefixedInlineEditor } from '@/components/participant/PrefixedInlineEditor';
import { SaveIndicator } from '@/components/SaveIndicator';
import { ParticipantBubble } from '@/components/B31Pill';
import {
  ToolbarButton,
  TextFormattingGroup,
  FontColorToolbarButton,
} from '@/components/toolbar';
import { Undo2, Redo2 } from 'lucide-react';
import { StickyToolbarWrapper } from '@/components/StickyToolbarWrapper';
import { Participant } from '@/types/proposal';
import { ALL_COUNTRIES } from '@/lib/countries';
import type {
  ParticipantDescriptionField,
  ParticipantDescriptions,
} from '@/hooks/useParticipantDetails';

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
    labelTemplate: 'If applicable, describe which parts of the value chain [name] covers.',
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
}

export function ParticipantDescriptionsSection({
  participant,
  descriptions,
  onUpdateField,
  saving,
  lastSaved,
  saveError,
  canEdit,
}: ParticipantDescriptionsSectionProps) {
  const [anyFieldFocused, setAnyFieldFocused] = useState(false);
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

  const visibleFields = FIELD_ORDER.filter(f => {
    if (f.key === 'industrial_involvement') return isCompany;
    if (f.key === 'participation_justification') return isInternationalPartner || isThirdCountry;
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

  const exec = useCallback((command: string) => {
    document.execCommand(command, false, undefined);
  }, []);

  if (visibleFields.length === 0) return null;

  const shortName = participant.organisationShortName || '';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Participant description</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && anyFieldFocused && (
          <StickyToolbarWrapper>
            <div
              className="p-1.5 border rounded-md bg-card flex items-center gap-0.5 flex-wrap shadow-sm"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) e.preventDefault();
              }}
            >
              <ToolbarButton
                icon={<Undo2 className="h-3.5 w-3.5" />}
                label="Undo"
                onClick={() => exec('undo')}
              />
              <ToolbarButton
                icon={<Redo2 className="h-3.5 w-3.5" />}
                label="Redo"
                onClick={() => exec('redo')}
              />
              <Separator orientation="vertical" className="h-5 mx-1.5" />
              <TextFormattingGroup
                onBold={() => exec('bold')}
                onItalic={() => exec('italic')}
                onUnderline={() => exec('underline')}
              />



              <div className="ml-auto">
                <SaveIndicator
                  saving={saving}
                  lastSaved={lastSaved}
                  saveError={saveError ?? null}
                />
              </div>
            </div>
          </StickyToolbarWrapper>
        )}

        {visibleFields.map((field) => {
          const label = field.labelTemplate.replace('[name]', shortName);
          const prefixNode = (
            <ParticipantBubble
              number={participant.participantNumber}
              shortName={participant.organisationShortName}
            />
          );
          return (
            <div key={field.key} className="space-y-1.5">
              <div className="text-sm text-foreground/90">{label}</div>
              <PrefixedInlineEditor
                value={descriptions[field.key] || ''}
                onChange={(v) => onUpdateField(field.key, v)}
                disabled={!canEdit}
                prefix={prefixNode}
                minHeight="90px"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
