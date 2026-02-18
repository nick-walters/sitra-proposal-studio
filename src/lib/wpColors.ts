// WP Color System - Default palette and utilities

export const DEFAULT_WP_COLORS = [
  '#2563EB', // Royal Blue
  '#059669', // Emerald
  '#D97706', // Amber
  '#7C3AED', // Violet
  '#0891B2', // Cyan
  '#EA580C', // Orange
  '#DB2777', // Pink
  '#475569', // Slate
  '#65A30D', // Lime
  '#4F46E5', // Indigo
  '#0D9488', // Teal
  '#8B5CF6', // Purple
];


/**
 * Get a contrasting text color (black or white) based on the background color
 */
export function getContrastingTextColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
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
  
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

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
 * Get the default color for a WP number (1-indexed)
 */
export function getDefaultWPColor(wpNumber: number): string {
  const index = (wpNumber - 1) % DEFAULT_WP_COLORS.length;
  return DEFAULT_WP_COLORS[index];
}
