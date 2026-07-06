// WP Color System - Default palette and utilities

/** Convert a theme's zero-based order_index to a display letter: 0 → 'A', 1 → 'B', … */
export function themeLetter(orderIndex: number): string {
  if (orderIndex < 0) return '';
  // Support beyond 'Z' by wrapping (AA, BB…) — rare, but safe.
  if (orderIndex < 26) return String.fromCharCode(65 + orderIndex);
  const first = String.fromCharCode(65 + Math.floor(orderIndex / 26) - 1);
  const second = String.fromCharCode(65 + (orderIndex % 26));
  return `${first}${second}`;
}


// Content WP colors (used for WPs other than the last two)
export const WP_CONTENT_COLORS = [
  '#73C92D', // Lime Green
  '#008549', // Emerald
  '#FF9F37', // Orange
  '#E8114B', // Red
  '#9163CB', // Violet
  '#86247E', // Purple
  '#129498', // Teal
];

// Special WP colors (always assigned to last two WPs)
export const WP_EXPLOITATION_COLOR = '#75CFEB'; // Penultimate WP
export const WP_COORDINATION_COLOR = '#367ABA'; // Last WP

// Standard names for the fixed last-two WP/theme slots.
// Sourced from the seeded wp_draft_templates (DEC / COORD) — must stay in sync.
export const STANDARD_EXPLOITATION_NAME = 'Dissemination, exploitation & communication';
export const STANDARD_COORDINATION_NAME = 'Project coordination & administration';
export const STANDARD_EXPLOITATION_SHORT = 'DEC';
export const STANDARD_COORDINATION_SHORT = 'COORD';

// Full palette for the palette editor (content colors + special colors + white + black).
// White and black are display-only swatches for manual selection (font/case pickers);
// they are NOT part of the positional rotation (see computeWPColorForPosition, which
// uses WP_CONTENT_COLORS). WP/theme pickers exclude them via `excludePaletteColors`
// (a white or black WP bubble would be invisible / unreadable).
export const WHITE_SWATCH = '#FFFFFF';
export const BLACK_SWATCH = '#000000';
export const DEFAULT_WP_COLORS = [
  ...WP_CONTENT_COLORS,
  WP_EXPLOITATION_COLOR,
  WP_COORDINATION_COLOR,
  WHITE_SWATCH,
  BLACK_SWATCH,
];


/**
 * Get a contrasting text color (black or white) based on the background color
 */
export function getContrastingTextColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Convert hex color to HSL values for CSS variables
 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  // Remove # if present
  hex = hex.replace('#', '');
  
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Lighten a hex color by a percentage
 */
export function lightenColor(hex: string, percent: number): string {
  const { h, s, l } = hexToHSL(hex);
  const newL = Math.min(100, l + percent);
  // Desaturate proportionally to produce pastels instead of garish tints
  const newS = Math.max(0, s * (1 - percent / 100));
  return `hsl(${h}, ${newS}%, ${newL}%)`;
}

/**
 * Get the color for a WP based on its position and total WP count.
 * The last WP always gets the coordination color (#367ABA).
 * The penultimate WP always gets the exploitation color (#75CFEB).
 * Other WPs cycle through the content colors.
 */
export function getWPColor(wpNumber: number, totalWPs: number): string {
  if (totalWPs >= 2 && wpNumber === totalWPs) return WP_COORDINATION_COLOR;
  if (totalWPs >= 2 && wpNumber === totalWPs - 1) return WP_EXPLOITATION_COLOR;
  const index = (wpNumber - 1) % WP_CONTENT_COLORS.length;
  return WP_CONTENT_COLORS[index];
}

/**
 * Get the default color for a WP number (1-indexed)
 * @deprecated Use getWPColor(wpNumber, totalWPs) for position-aware coloring
 */
export function getDefaultWPColor(wpNumber: number): string {
  const index = (wpNumber - 1) % DEFAULT_WP_COLORS.length;
  return DEFAULT_WP_COLORS[index];
}
