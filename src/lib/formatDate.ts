// Centralized British-style date formatting helpers.
// Project standard: "20th February 2026" (no commas).

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "20th February 2026" */
export function formatDate(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()}${ordinalSuffix(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "20th February 2026 14:35" */
export function formatDateTime(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
}

/** "14:35" */
export function formatTime(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
