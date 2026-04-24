## Goal

Restructure the ESR to four major sections only, render it with proper typography (no raw `**` or `#`), and make the download a properly formatted A4 PDF.

## Changes

### 1. Restructure the ESR (edge function)

**File:** `supabase/functions/run-panel-evaluation/index.ts` — `runSynthesisPhase`

Rewrite the synthesis system prompt so the rapporteur produces a single ESR with exactly four major sections (no panel composition / scores summary / individual evaluator scores table sections):

1. `# European Commission initial check` — eligibility flags summary + blind-evaluation note (Stage 1) and any identifying information found, in narrative form.
2. `# 1. Excellence` — consensus score on its own line (`**Score:** X.X / 5` plus threshold), then a narrative with strengths and at least two specific weaknesses.
3. `# 2. Impact` — same pattern; include weighted note for IA proposals.
4. `# 3. Implementation` — same pattern; include lump-sum budget commentary; **omitted entirely for Stage 1**.

End with a `## Overall panel assessment` paragraph (3–4 sentences) under the last section — no separate top-level section.

Pass the `eligibility_flags` array into the synthesis user prompt so the EC initial check has real content to summarise. Update the deterministic fallback ESR to follow the same four-section structure.

### 2. Render ESR with formatted text (no raw markdown chars)

**File:** `src/components/PanelEvaluator.tsx` — replace the `<pre>` at line 796.

Add a small inline markdown renderer (no new dependency) that handles:
- `# ` → `<h1>` (Excellence / Impact / Implementation / EC initial check)
- `## ` → `<h2>` (Overall panel assessment)
- `### ` → `<h3>`
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- bullet lines starting with `- ` → `<ul><li>`
- blank line → paragraph break

Render inside a styled container (Times New Roman 11pt, prose-like spacing) so the on-screen ESR matches the PDF.

### 3. PDF download (replaces the current `.md` download)

**File:** `src/components/PanelEvaluator.tsx` — rewrite `downloadEsr`.

Use the already-installed `jspdf` library (no new packages). Build an A4 PDF with:

- Page size: A4 portrait, 1.5 cm margins on all sides.
- Font: Times New Roman 11pt body. Headings are still Times, sized 16/13/12pt and bold.
- Title (top of page 1, bold, 14pt, centred): `ACRONYM ESR, 24th April 2026 14:35` — use existing British date conventions (`XXth Month YEAR`, no comma, 24-hour time `HH:MM`).
- Body: parse the same markdown structure (headings, bold, italic, bullets, paragraphs), wrap text to the content width, and add page breaks automatically.
- Bullet items get a hanging indent.
- Filename: `ACRONYM ESR YYYY-MM-DD HH-MM.pdf`.

Tooltip on the download button updates from "Download ESR (Markdown)" to "Download ESR (PDF)".

## Technical details

- jsPDF supports the standard PDF `Times-Roman` / `Times-Bold` / `Times-Italic` fonts natively (rendered as Times New Roman by all viewers); no custom font embedding required.
- A small shared parser converts the markdown string into an array of typed tokens (`{type: 'h1'|'h2'|'h3'|'p'|'li', runs: [{text, bold, italic}]}`) consumed by both the React renderer and the jsPDF writer, so on-screen and PDF output stay in sync.
- Date formatting uses a tiny helper for ordinal suffixes (1st, 2nd, 3rd, 4th…) consistent with project memory standards.
- No database migration required — the change is purely in the synthesis prompt and the client renderer/exporter.
- Existing ESRs already in the database will re-render through the new client renderer; their structure may still contain the old "panel composition" / "scores summary" sections (those will simply render as additional headings). Only newly run evaluations get the cleaner four-section layout.

## Out of scope

- No changes to evaluation scoring, evaluator selection, or polling logic.
- No changes to delete behaviour or access control.
- Backfilling old ESRs to the new structure — only new runs use the new prompt.