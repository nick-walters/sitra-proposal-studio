// Lightweight markdown parser for ESR rendering & PDF export.
// Supports: # h1, ## h2, ### h3, - bullets, **bold**, *italic*, paragraphs.

export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "h1" | "h2" | "h3" | "p"; runs: Run[] }
  | { type: "li"; runs: Run[] }
  | { type: "spacer" };

export function parseEsrMarkdown(src: string): Block[] {
  const lines = (src || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      const text = paraBuf.join(" ").trim();
      if (text) blocks.push({ type: "p", runs: parseRuns(text) });
      paraBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      blocks.push({ type: "h1", runs: parseRuns(line.slice(2).trim()) });
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      blocks.push({ type: "h2", runs: parseRuns(line.slice(3).trim()) });
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      blocks.push({ type: "h3", runs: parseRuns(line.slice(4).trim()) });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      blocks.push({ type: "li", runs: parseRuns(line.replace(/^[-*]\s+/, "")) });
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();
  return blocks;
}

// Parse inline **bold** and *italic* into runs.
function parseRuns(text: string): Run[] {
  // Strip stray hashes that sometimes appear inline.
  const clean = text.replace(/^#+\s*/, "");
  const runs: Run[] = [];
  // Tokenize on **...** first, then *...*
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    if (m.index > last) runs.push({ text: clean.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) {
      runs.push({ text: tok.slice(2, -2), bold: true });
    } else {
      runs.push({ text: tok.slice(1, -1), italic: true });
    }
    last = m.index + tok.length;
  }
  if (last < clean.length) runs.push({ text: clean.slice(last) });
  return runs.length ? runs : [{ text: clean }];
}

// British date formatting helper: "24th April 2026 14:35"
export function formatBritishDateTime(date: Date): string {
  const day = date.getDate();
  const suffix = ordinalSuffix(day);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day}${suffix} ${month} ${year} ${hh}:${mm}`;
}

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
