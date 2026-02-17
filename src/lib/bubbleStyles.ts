/**
 * Unified bubble style system for all Part B proposal components.
 * All bubbles use 11pt Times New Roman bold, pill shape, minimal padding.
 */

export interface BubbleStyle {
  style: React.CSSProperties;
  className: string;
}

const BASE_STYLE: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '11pt',
  fontWeight: 700,
  borderRadius: '9999px',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 1,
  verticalAlign: 'baseline',
  padding: '0px 5px',
  userSelect: 'none',
};

const BASE_CLASS = 'inline-flex items-center rounded-full font-bold whitespace-nowrap';

/** WP bubble: fill + border = WP colour, white text */
export function wpBubbleStyles(color: string): BubbleStyle {
  return {
    style: {
      ...BASE_STYLE,
      backgroundColor: color,
      color: '#ffffff',
      border: `1.5px solid ${color}`,
    },
    className: BASE_CLASS,
  };
}

/** Participant bubble: black fill + border, white italic text */
export function participantBubbleStyles(): BubbleStyle {
  return {
    style: {
      ...BASE_STYLE,
      backgroundColor: '#000000',
      color: '#ffffff',
      border: '1.5px solid #000000',
      fontStyle: 'italic',
    },
    className: `${BASE_CLASS} italic`,
  };
}

/** Task bubble: white fill, WP colour border + text */
export function taskBubbleStyles(wpColor: string): BubbleStyle {
  return {
    style: {
      ...BASE_STYLE,
      backgroundColor: '#ffffff',
      color: wpColor,
      border: `1.5px solid ${wpColor}`,
    },
    className: BASE_CLASS,
  };
}

/** Deliverable bubble: white fill, WP colour border + text */
export function deliverableBubbleStyles(wpColor: string): BubbleStyle {
  return {
    style: {
      ...BASE_STYLE,
      backgroundColor: '#ffffff',
      color: wpColor,
      border: `1.5px solid ${wpColor}`,
    },
    className: BASE_CLASS,
  };
}

/** Milestone bubble: white fill, black border + text */
export function milestoneBubbleStyles(): BubbleStyle {
  return {
    style: {
      ...BASE_STYLE,
      backgroundColor: '#ffffff',
      color: '#000000',
      border: '1.5px solid #000000',
    },
    className: BASE_CLASS,
  };
}

/** Risk bubble: white fill, level colour border + text */
export function riskBubbleStyles(levelColor: string): BubbleStyle {
  return {
    style: {
      ...BASE_STYLE,
      backgroundColor: '#ffffff',
      color: levelColor,
      border: `1.5px solid ${levelColor}`,
      fontStyle: 'normal',
    },
    className: `${BASE_CLASS} not-italic`,
  };
}

/** Get risk level color */
export function getRiskLevelColor(level: 'L' | 'M' | 'H'): string {
  switch (level) {
    case 'H': return '#ef4444'; // red-500
    case 'M': return '#f59e0b'; // amber-500
    case 'L': return '#22c55e'; // green-500
    default: return '#000000';
  }
}
