import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import { SaveIndicator } from '@/components/SaveIndicator';
import { ParticipantBubble } from '@/components/B31Pill';
import {
  ToolbarButton,
  TextFormattingGroup,
} from '@/components/toolbar';
import { AlignLeft, AlignJustify, Undo2, Redo2 } from 'lucide-react';
import { StickyToolbarWrapper } from '@/components/StickyToolbarWrapper';
import { Participant } from '@/types/proposal';
import { ALL_COUNTRIES } from '@/lib/countries';
import type {
  ParticipantDescriptionField,
  ParticipantDescriptions,
} from '@/hooks/useParticipantDetails';

interface FieldDef {
  key: ParticipantDescriptionField;
  suffix: string; // guiding text after the badge
  showBadgeWill?: boolean; // Field 1 shows "will" between badge and prompt
}

const FIELD_ORDER: FieldDef[] = [
  {
    key: 'contribution_resources',
    suffix: 'contribute to the project? Describe your roles and show that you have adequate resources in the project to fulfil those roles.',
    showBadgeWill: true,
  },
  {
    key: 'value_chain',
    suffix: 'If applicable, describe which parts of the value chain you cover.',
  },
  {
    key: 'industrial_involvement',
    suffix: 'If applicable, describe the industrial/commercial involvement in the project to ensure exploitation of the results and explain why this is consistent with and will help to achieve the specific measures which are proposed for exploitation of the results of the project.',
  },
  {
    key: 'participation_justification',
    suffix: 'Explain why your participation is essential to successfully carry out the project.',
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
  // Undo/redo state per-field. Because contentEditable is used, we rely on document.execCommand('undo'/'redo').
  const [canUndo] = useState(true);
  const [canRedo] = useState(true);
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
    // Grace delay so moving focus between the 4 fields (or clicking toolbar
    // buttons via onMouseDown-preventDefault) doesn't flicker the toolbar off.
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setAnyFieldFocused(false);
      blurTimerRef.current = null;
    }, 150);
  }, []);

  const exec = useCallback((command: string) => {
    document.execCommand(command, false, undefined);
  }, []);

  // Empty component if section would render nothing (still shows the always-on fields, so always renders)
  if (visibleFields.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Participant description</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sticky toolbar — hidden until a description field is focused. */}
        {canEdit && anyFieldFocused && (
          <StickyToolbarWrapper>
            <div
              className="p-1.5 border rounded-md bg-card flex items-center gap-0.5 flex-wrap shadow-sm"
              // Prevent focus theft when the user drags-selects onto the toolbar container itself
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) e.preventDefault();
              }}
            >
              <ToolbarButton
                icon={<Undo2 className="h-3.5 w-3.5" />}
                label="Undo"
                onClick={() => exec('undo')}
                disabled={!canUndo}
              />
              <ToolbarButton
                icon={<Redo2 className="h-3.5 w-3.5" />}
                label="Redo"
                onClick={() => exec('redo')}
                disabled={!canRedo}
              />
              <Separator orientation="vertical" className="h-5 mx-1.5" />
              <TextFormattingGroup
                onBold={() => exec('bold')}
                onItalic={() => exec('italic')}
                onUnderline={() => exec('underline')}
              />
              <Separator orientation="vertical" className="h-5 mx-1.5" />
              <ToolbarButton
                icon={<AlignLeft className="h-4 w-4" />}
                label="Align left"
                onClick={() => exec('justifyLeft')}
              />
              <ToolbarButton
                icon={<AlignJustify className="h-4 w-4" />}
                label="Justify"
                onClick={() => exec('justifyFull')}
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

        {visibleFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-baseline gap-1.5 text-sm text-foreground/90 flex-wrap">
              <ParticipantBubble
                number={participant.participantNumber}
                shortName={participant.organisationShortName}
              />
              {field.showBadgeWill && <span>will</span>}
              <span>{field.suffix}</span>
            </div>
            <WPSimpleEditor
              value={descriptions[field.key] || ''}
              onChange={(v) => onUpdateField(field.key, v)}
              disabled={!canEdit}
              hideToolbar
              minHeight="90px"
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
