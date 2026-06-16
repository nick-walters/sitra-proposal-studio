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
 * Format a number as Euro currency with € symbol prefix and 2 decimal places (e.g., 5000 → "€5,000.00").
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse a formatted number string back to a number (e.g., "5,000" → 5000).
 */
export function parseFormattedNumber(value: string): number {
  return parseFloat(value.replace(/[^0-9.\-]/g, '')) || 0;
}

/**
 * Format a number as a percentage string (e.g., 12.345 → "12.3%").
 * Pass `decimals` to control precision; defaults to 1.
 */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a byte count as a human-readable file size (e.g., 2_621_440 → "2.5 MB").
 * Uses binary units (1024-based) up to TB.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  const decimals = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[i]}`;
}
