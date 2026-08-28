/**
 * Shared block chrome for the WP draft page.
 *
 * Every WP block — header, Objectives, Description of work, Deliverables —
 * wears the same frame, the same header row and the same left control stack,
 * so their collapse chevrons line up with each other and with Part B's.
 *
 * The geometry: the header row is padded 20px on the left, the control stack
 * is pulled back 14px (so a 24px chevron starts at 6px and ends at 30px), the
 * row's 6px gap follows, and the title is then indented by
 * `calc(1.5cm - 36px)` so it lands exactly on the 18 cm text column's left
 * edge — identical to `MethodologyCardsBoard`'s block header.
 */

export const WP_BLOCK_FRAME = 'wp-block-frame rounded-md border border-border bg-card';

export const WP_BLOCK_HEADER = 'flex items-center gap-1.5 py-2 pl-5 pr-[13px]';

/** Left control stack: collapse chevron on top, drag grip beneath it. */
export const WP_CONTROL_STACK =
  '-ml-3.5 flex shrink-0 flex-col items-center gap-0.5 self-start';

/** The chevron size Part B uses; passed to `CollapseChevron`. */
export const WP_CHEVRON_SIZE = 'h-6 w-6';

/** Indent that puts a block or module title on the 18 cm column's left edge. */
export const WP_TITLE_INDENT = 'calc(1.5cm - 36px)';

/** The document face every WP block title and body is set in. */
export const WP_DOC_FONT = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '11pt',
} as const;
