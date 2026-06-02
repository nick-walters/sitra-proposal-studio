
## AI Tools dialog — full restructure

Scope: `src/components/WritingAssistantDialog.tsx` (major rewrite), `supabase/functions/grammar-check/index.ts` (categories), `supabase/functions/writing-assistant/index.ts` (expand returns array). No DB changes. Caller props in `DocumentEditor.tsx` are preserved.

### 1. Cancellable analyses

- Each AI call uses an `AbortController` stored in a ref (`grammarAbortRef`, `expandAbortRef`, `evalAbortRef`).
- Calls switch from `supabase.functions.invoke` to a direct `fetch` against `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<fn>` with the session access token, so `signal` can be passed.
- While loading, the trigger button becomes a red **Stop** button. Clicking aborts the request and resets state silently.

### 2. Scrollable popup, fixed tabs, fixed action footers

- `DialogContent` keeps `max-h-[85vh] flex flex-col`.
- Each tab uses a 3-row flex layout:
  ```text
  [ controls (non-scrolling) ]
  [ results body (flex-1, overflow-y-auto) ]
  [ primary action button (fixed footer) ]
  ```
- Per-tab `ScrollArea` becomes a single scroll container so **Process selections** / **Evaluate** / **Stop** never scroll out of view.

### 3. Final tab set

1. **Grammar & writing style**
2. **Content enhancement**
3. **Evaluation**

Removed: Result, Consortium (folded into Evaluation), original Grammar / Writing labels.

### 4. Grammar & writing style tab

Top (non-scrolling) — five checkboxes (all off by default):

- **Grammar** — correct grammar (Grammarly-style)
- **Conciseness** — remove redundant words, restructure where needed
- **Clarity** — improve clarity of content
- **Tone** — Sitra tone (see prompt below)
- **Terminology** — EU policy & Horizon Europe terminology

Primary trigger: **Suggest grammatical and writing style improvements** (disabled when no boxes ticked; becomes **Stop** while running).

Body (scrolling): each suggestion card shows original → replacement, category badge, explanation, plus a `RadioGroup` with **Accept** / **Reject** (default unselected).

Footer (fixed): **Process selections** — applies each Accept via `onApplyGrammarSuggestion`, drops Rejects, removes processed items.

Edge function (`grammar-check`): accepts `categories: string[]` and only flags those categories. The Tone category injects the Sitra tone model:

> **Sitra tone:** inspiring, curious, hopeful, understandable (clear, plain language), expert (credible, evidence-based, confident but not arrogant). Solution-oriented framing (what can be done, not just problems); collaboration & partnership language (Sitra as strategic partner, bridge-builder, networker); future tense and formal language ("X will be done" rather than "We do X"); active voice; no jargon; no hype, speculation, or unsupported claims; professional, neutral, non-political; not promotional or marketing-style; accessible to international audiences. Preserve original meaning and commitments — invent no new facts.

### 5. Content enhancement tab (was "Writing")

- Single function: **Expand**. Improve Clarity / Improve Tone / Make Concise / EU Language / Evaluate Section are removed from this tab.
- Top (non-scrolling): selected-text preview + word count, **Expand** button (→ **Stop** while loading).
- Body (scrolling): one or more expansion suggestion cards, each with:
  - The original snippet
  - An editable `Textarea` pre-filled with the AI's expanded text — user can refine before accepting
  - `RadioGroup`: **Accept** / **Reject**
- Footer (fixed): **Process selections** — for each Accept, calls `onApply` with the current textarea value; Rejects are dropped.
- Backend: `writing-assistant` `expand` returns `{ suggestions: [{ original, expanded, rationale }] }` via tool calling. Prompt enforces Sitra tone (same model as above) and "no new facts".

### 6. Evaluation tab

- Top (non-scrolling):
  - **Evaluate** button — evaluates the whole section text (no selection required).
  - Checkbox: **Also evaluate the consortium for this proposal** (default off; hidden when `!canUseConsortiumBuilder` or `!proposalId`).
  - Button becomes **Stop** while loading.
- Body (scrolling), stacked:
  - Section evaluation: overall score + per-criterion `ScoreBar` + strengths / weaknesses / suggestions (current Evaluation UI).
  - If checkbox was on: consortium summary + strengths + recommended partners (current Consortium UI).
- Logic: clicking **Evaluate** runs `writing-assistant` `evaluate_section` (and `analyse-consortium` in parallel when the checkbox is ticked); shared Stop button aborts both. Results render progressively.
- The standalone Consortium tab is removed.

### 7. Result tab removal

- Delete the Result `TabsTrigger` and `TabsContent`.
- Remove the `result`/`copied`/`handleCopy`/`handleApply` single-text-replace flow (no longer needed). `onApply` prop is kept and used by Content enhancement's per-suggestion apply.

### 8. What the Evaluation tab does (user-facing copy in the tab)

Runs a Horizon Europe-style reviewer simulation on the current section: scores 1–5 against the relevant EC criterion (Excellence for B1.1, Implementation for B1.2, Impact for B2.1, or all three otherwise), with specific strengths, weaknesses, and improvement suggestions per criterion plus an overall summary. With the optional consortium checkbox on, it also analyses the whole proposal's consortium against HE best practices and flags geographic / expertise / role-coverage gaps with suggested partner profiles.

### Files touched

- `src/components/WritingAssistantDialog.tsx` — rewrite
- `supabase/functions/grammar-check/index.ts` — categories + Sitra tone prompt
- `supabase/functions/writing-assistant/index.ts` — expand returns suggestions array via tool calling
