// Shared types for the generic Part B card model (Phase 1 data layer).

// 'table' was removed with the table blocks: tables now live inside text
// blocks as TipTap tables.
export type CardKind = 'text' | 'figure' | 'outcome_list' | 'references';
export type CardAnchor = 'head' | 'free' | 'tail';
export type CardDocument = 'part_b' | 'fstp_annex';
export type CardOrigin = 'auto' | 'manual';
export type CardFieldRole = 'narrative' | 'case_placeholder';
/** How a block's header behaves: hidden, mirrored to the preview, or editor-only. */
export type CardTitleMode = 'off' | 'mirrored' | 'editor_only';

export interface ProposalCard {
  id: string;
  proposalId: string;
  sectionId: string;
  document: CardDocument;
  kind: CardKind;
  templateKey: string | null;
  title: string | null;
  orderIndex: number;
  anchor: CardAnchor;
  isDeletable: boolean;
  isHideable: boolean;
  isSourceFed: boolean;
  isFixedPosition: boolean;
  isVisible: boolean;
  titleVersion: number;
  titleMode: CardTitleMode;
  sourceKey: string | null;
  renderGroup: string | null;
  origin: CardOrigin;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Which of a module's two text boxes a value belongs to. */
export type CardTextBox = 'header' | 'content';

export interface CardField {
  id: string;
  cardId: string;
  proposalId: string;
  heading: string | null;
  /** When false the header text box is collapsed; `heading` is retained. */
  headingEnabled: boolean;
  /** Module-level visibility: a hidden module is omitted from Part B. */
  isVisible: boolean;
  contentHtml: string | null;
  /** Optimistic-concurrency counters, one per text box. */
  contentVersion: number;
  headingVersion: number;
  orderIndex: number;
  fieldRole: CardFieldRole;
  placeholderCaseTypeId: string | null;
  assignedParticipantId: string | null;
  origin: CardOrigin;
  deletedAt: string | null;
  deletedWithCard: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CardFieldVersion {
  id: string;
  fieldId: string;
  proposalId: string;
  textBox: CardTextBox;
  versionNumber: number;
  contentHtml: string | null;
  heading: string | null;
  isAutoSave: boolean;
  createdBy: string | null;
  createdAt: string;
}


export interface CardDeletionEntry {
  id: string;
  proposalId: string;
  sectionId: string | null;
  targetType: 'card' | 'field';
  targetId: string;
  parentCardId: string | null;
  deletedAt: string;
  deletedBy: string | null;
  purgeAfter: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  /** Resolved heading for display in the recycle bin, null when it has none. */
  label: string | null;
  /** Stored HTML used for the collapsed preview. */
  contentHtml?: string | null;
  /** Number of fields held by a deleted card. */
  fieldCount?: number | null;
  /** Figure blocks identify themselves in the bin by caption and thumbnail. */
  figureCaption?: string | null;
  figureImagePath?: string | null;
  figureTitle?: string | null;

}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapCard(row: any): ProposalCard {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    sectionId: row.section_id,
    document: row.document,
    kind: row.kind,
    templateKey: row.template_key ?? null,
    title: row.title ?? null,
    orderIndex: row.order_index,
    anchor: row.anchor,
    isDeletable: row.is_deletable,
    isHideable: row.is_hideable,
    isSourceFed: row.is_source_fed,
    isFixedPosition: row.is_fixed_position,
    isVisible: row.is_visible,
    titleVersion: row.title_version ?? 1,
    titleMode: (row.title_mode ?? 'mirrored') as CardTitleMode,
    sourceKey: row.source_key ?? null,
    renderGroup: row.render_group ?? null,
    origin: row.origin,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapField(row: any): CardField {
  return {
    id: row.id,
    cardId: row.card_id,
    proposalId: row.proposal_id,
    heading: row.heading ?? null,
    headingEnabled: row.heading_enabled ?? true,
    isVisible: row.is_visible ?? true,
    contentHtml: row.content_html ?? null,
    contentVersion: row.content_version ?? 1,
    headingVersion: row.heading_version ?? 1,
    orderIndex: row.order_index,
    fieldRole: row.field_role,
    placeholderCaseTypeId: row.placeholder_case_type_id ?? null,
    assignedParticipantId: row.assigned_participant_id ?? null,
    origin: row.origin,
    deletedAt: row.deleted_at ?? null,
    deletedWithCard: row.deleted_with_card,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFieldVersion(row: any): CardFieldVersion {
  return {
    id: row.id,
    fieldId: row.field_id,
    proposalId: row.proposal_id,
    textBox: (row.text_box ?? 'content') as CardTextBox,
    versionNumber: row.version_number,
    contentHtml: row.content_html ?? null,
    heading: row.heading ?? null,
    isAutoSave: row.is_auto_save,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
