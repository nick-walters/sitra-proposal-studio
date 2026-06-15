/**
 * Shared constants used across the app.
 * Centralised to avoid duplication and keep colour palettes consistent.
 */

/**
 * Vibrant, distinct palette used to colour collaborators in presence-related
 * UI (block locking, collaborative cursors, proposal user colours).
 * Order is significant — `useProposalUserColors` maps role-creation order
 * onto this list.
 */
export const PRESENCE_COLORS = [
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#00BCD4', // Cyan
  '#009688', // Teal
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#FF5722', // Deep Orange
] as const;

/**
 * Risk-level colour coding used in B3.1 pills and the WP risks table.
 * H = high, M = medium, L = low.
 */
export const RISK_COLORS: Record<'H' | 'M' | 'L', string> = {
  H: '#ef4444',
  M: '#f59e0b',
  L: '#22c55e',
};
