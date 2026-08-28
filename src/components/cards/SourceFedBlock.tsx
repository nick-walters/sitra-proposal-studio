import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { useB31SectionData } from '@/hooks/useB31SectionData';
import { useB31JustificationToggles } from '@/hooks/useB31JustificationToggles';
import { B31WPListTable } from '@/components/B31WPListTable';
import { B31WPDescriptionTables } from '@/components/B31WPDescriptionTables';
import { B31DeliverablesTable, B31MilestonesTable, B31RisksTable } from '@/components/B31TablesEditor';
import { B31EffortMatrix } from '@/components/B31EffortMatrix';
import { B31SubcontractingTable } from '@/components/B31SubcontractingTable';
import { B31MergedJustificationTable, type MergedBlock } from '@/components/B31MergedJustificationTable';
import { useB31CostPresence } from '@/hooks/useB31CostPresence';

import { GanttChartFigure } from '@/components/GanttChartFigure';
import { PERTChartFigure } from '@/components/PERTChartFigure';
import { B12LinkedActivitiesSlotContent } from '@/components/B12LinkedActivitiesSlotContent';
import { B32MirrorSlotLiveView } from '@/components/B32MirrorSlotNodeView';
import type { B32SlotKey } from '@/extensions/B32MirrorSlotNode';
import { sourceFedEmptyReason } from '@/lib/cards/sourceFedEmptyReasons';
import { B11ParticipantListTable } from '@/components/B11ParticipantListTable';

/**
 * Read-only render of a source-fed block.
 *
 * Every renderer here is the SAME component the section mirrors use, mounted
 * non-interactively. Nothing new was written for the board: if a source has no
 * renderer yet, this returns an honest note rather than a fake table.
 */

const B32_SLOTS: Record<string, B32SlotKey> = {
  'b32.roles': 'capacity',
  'b32.value_chain': 'value-chain',
  'b32.commercial': 'industrial',
  'b32.non_eligible': 'international',
};

const B31_KEYS = new Set([
  'b31.gantt',
  'b31.pert',
  'b31.table_a',
  'b31.table_b',
  'b31.table_c',
  'b31.table_d',
  'b31.table_e',
  'b31.table_f',
  'b31.table_g',
  'b31.table_h',
]);

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-muted-foreground">{children}</p>;
}

/**
 * Shown in place of a source-fed block whose source is empty. The block keeps
 * its place on the board (B3.1's tables are lettered, so a gap is meaningful)
 * and states plainly why it will not be in the produced document. Nothing here
 * is editable: there is nothing to author.
 *
 * The reason re-evaluates on every render, and every source behind these
 * blocks is a live query, so the note turns into the real table the moment the
 * data appears — and back again if it is removed.
 */
function UnmetNote({ sourceKey }: { sourceKey: string | null | undefined }) {
  return (
    <p
      data-source-fed-unmet=""
      data-source-key={sourceKey ?? ''}
      className="text-sm text-muted-foreground"
    >
      {sourceFedEmptyReason(sourceKey)}
    </p>
  );
}

/* -------------------------------------------------------- figure capture */

/**
 * Marks the rendered chart so the block header's "Download" control can find
 * it and hand it to the shared figure export path (`exportAsPng`). The
 * controls themselves live in the block header, alongside every other block's
 * add / restore / delete column, rather than floating above the chart.
 */
function FigureCapture({
  kind,
  children,
}: {
  kind: 'pert' | 'gantt';
  children: React.ReactNode;
}) {
  return <div data-figure-type={kind}>{children}</div>;
}

/* ------------------------------------------------------------------ B3.1 */

function B31Source({ proposalId, sourceKey }: { proposalId: string; sourceKey: string }) {
  const { toggles, loading: togglesLoading } = useB31JustificationToggles(proposalId);
  const presence = useB31CostPresence(proposalId);
  const {
    wpData,
    participants,
    pertFigure,
    ganttFigure,
    subcontractingByParticipant,
    equipmentByParticipant,
    travelByParticipant,
    otherGoodsByParticipant,
    loading,
  } = useB31SectionData(proposalId);



  const { data: proposalDuration } = useQuery({
    queryKey: ['proposal-duration', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('duration')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data?.duration || 36;
    },
  });

  if (loading || togglesLoading) return <Note>Loading the source data…</Note>;

  // Purchase-cost sub-blocks follow the A3 flags, with the >15% equipment rule
  // forcing equipment on exactly as the legacy mirror does.
  const c2ForcedOn = presence.equipmentAboveThreshold;
  const purchaseBlocks: MergedBlock[] = [];
  if (toggles.travel && travelByParticipant.length > 0)
    purchaseBlocks.push({ categoryLabel: 'Travel', participants: travelByParticipant });
  if ((c2ForcedOn || toggles.equipment) && equipmentByParticipant.length > 0)
    purchaseBlocks.push({ categoryLabel: 'Equipment', participants: equipmentByParticipant });
  if (toggles.other_goods && otherGoodsByParticipant.length > 0)
    purchaseBlocks.push({ categoryLabel: 'Other', participants: otherGoodsByParticipant });

  switch (sourceKey) {
    case 'b31.table_a':
      if (!wpData.length) return <UnmetNote sourceKey={sourceKey} />;
      return <B31WPListTable wpData={wpData} participants={participants} proposalId={proposalId} />;
    case 'b31.table_b':
      if (!wpData.length) return <UnmetNote sourceKey={sourceKey} />;
      return (
        <B31WPDescriptionTables
          wpData={wpData}
          participants={participants}
          proposalId={proposalId}
          projectDuration={proposalDuration || 36}
        />
      );
    case 'b31.table_c':
      if (!wpData.some((wp) => (wp.deliverables || []).length > 0))
        return <UnmetNote sourceKey={sourceKey} />;
      return <B31DeliverablesTable proposalId={proposalId} />;
    case 'b31.table_d':
      return <B31MilestonesTable proposalId={proposalId} />;
    case 'b31.table_e':
      return <B31RisksTable proposalId={proposalId} />;
    case 'b31.table_f':
      if (!wpData.length || !participants.length) return <UnmetNote sourceKey={sourceKey} />;
      return <B31EffortMatrix wpData={wpData} participants={participants} proposalId={proposalId} />;
    case 'b31.table_g':
      return subcontractingByParticipant.length > 0 ? (
        <B31SubcontractingTable
          items={subcontractingByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableLabel="Table 3.1.g."
        />
      ) : (
        <UnmetNote sourceKey={sourceKey} />
      );
    case 'b31.table_h':
      return purchaseBlocks.length > 0 ? (
        <B31MergedJustificationTable
          blocks={purchaseBlocks}
          participants={participants}
          proposalId={proposalId}
          tableKey="purchase-costs"
          tableLabel="Table 3.1.h."
          defaultCaption="Purchase cost justifications"
        />
      ) : (
        <UnmetNote sourceKey={sourceKey} />
      );

    case 'b31.gantt':
      return ganttFigure ? (
        <FigureCapture kind="gantt">
          <div data-figure-chart="gantt">
            <GanttChartFigure
              figureId={ganttFigure.id}
              proposalId={proposalId}
              figureNumber={ganttFigure.figure_number}
              content={ganttFigure.content as never}
              onContentChange={() => {}}
              canEdit={false}
            />
          </div>
          <EditableCaption
            proposalId={proposalId}
            figureId={ganttFigure.id}
            label={`Figure ${ganttFigure.figure_number}.`}
            defaultCaption={ganttFigure.caption || ganttFigure.title || 'Gantt chart'}
            className="mt-1"
          />
        </FigureCapture>
      ) : (
        <UnmetNote sourceKey={sourceKey} />
      );
    case 'b31.pert':
      return pertFigure ? (
        <FigureCapture kind="pert">
          <div data-figure-chart="pert">
            <PERTChartFigure
              figureId={pertFigure.id}
              proposalId={proposalId}
              figureNumber={pertFigure.figure_number}
              content={pertFigure.content as never}
              onContentChange={() => {}}
              canEdit={false}
            />
          </div>
          <EditableCaption
            proposalId={proposalId}
            figureId={pertFigure.id}
            label={`Figure ${pertFigure.figure_number}.`}
            defaultCaption={pertFigure.caption || pertFigure.title || 'Pert chart'}
            className="mt-1"
          />
        </FigureCapture>
      ) : (
        <UnmetNote sourceKey={sourceKey} />
      );

    default:
      return <Note>This source has no renderer yet.</Note>;
  }
}

/* ----------------------------------------------------------------- block */

export interface SourceFedBlockProps {
  proposalId: string;
  sourceKey: string | null;
  kind: string;
}

export function SourceFedBlock({ proposalId, sourceKey, kind }: SourceFedBlockProps) {
  const body = useMemo(() => {
    if (kind === 'references' || sourceKey?.endsWith('.references')) {
      return (
        <Note>
          The reference list is generated from the citations in this section when the document is
          produced.
        </Note>
      );
    }
    if (sourceKey === 'b11.participants') {
      // Mirrored list of participants: the same rows (and the same column
      // widths) the Typst export prints on page one.
      return <B11ParticipantListTable proposalId={proposalId} />;
    }
    if (sourceKey === 'b12.linked_activities') {
      return (
        <B12LinkedActivitiesSlotContent
          proposalId={proposalId}
          emptyFallback={<UnmetNote sourceKey={sourceKey} />}
        />
      );
    }
    if (sourceKey && B32_SLOTS[sourceKey]) {
      return <B32MirrorSlotLiveView proposalId={proposalId} slotKey={B32_SLOTS[sourceKey]} />;
    }
    if (sourceKey && B31_KEYS.has(sourceKey)) {
      return <B31Source proposalId={proposalId} sourceKey={sourceKey} />;
    }
    return <Note>This source has no renderer yet.</Note>;
  }, [kind, proposalId, sourceKey]);

  // Read-only: text stays selectable, but nothing inside can take a caret or
  // be clicked. `contentEditable={false}` stops any nested editor mounting a
  // caret; the CSS rule kills pointer events on controls only.
  return (
    <div
      data-source-fed-block=""
      data-source-key={sourceKey ?? ''}
      contentEditable={false}
      suppressContentEditableWarning
      className="source-fed-readonly source-fed-constrained w-full max-w-full select-text overflow-x-hidden"
      aria-readonly="true"
    >
      {body}
    </div>
  );
}

export default SourceFedBlock;
