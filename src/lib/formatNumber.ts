/**
 * Format a number with thousand separators (e.g., 5000 → "5,000").
 * Uses 'en-IE' locale for Euro-style formatting with commas.
 */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-IE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number as Euro currency with thousand separators (e.g., 5000 → "€5,000").
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Parse a formatted number string back to a number (e.g., "5,000" → 5000).
 */
export function parseFormattedNumber(value: string): number {
  return parseFloat(value.replace(/[^0-9.\-]/g, '')) || 0;
}
