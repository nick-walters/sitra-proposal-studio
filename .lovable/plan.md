## Plan: AI Tools refinements

Scope: `WritingAssistantDialog.tsx`, `supabase/functions/writing-assistant/index.ts`, `supabase/functions/grammar-check/index.ts`. No DB changes.

### 1. Rename "Expand" → "Enhance content"
- Update the Content enhancement tab's primary trigger button label from "Expand" to "Enhance content" (and any "Expand" wording in headings, helper text, toast messages, empty states). The `expand` action name in the edge function payload stays the same for compatibility.

### 2. Avoid AI-style terminology
- In `writing-assistant/index.ts` (`expand` system prompt) and `grammar-check/index.ts` (system prompt, applies to all categories), add a strict rule:
  - Do not use clichéd AI/LLM-style language. Explicit ban list (non-exhaustive): "delve", "deep dive", "pivot", "leverage" (as verb), "unleash", "unlock", "navigate the landscape", "in today's fast-paced world", "game-changer", "synergy", "harness", "tapestry", "realm", "robust", "seamless", "cutting-edge", "revolutionary", "transformative" (when used as filler), "moreover" / "furthermore" as connectives if not necessary, "it is worth noting that", "embark on a journey", "at the forefront", "paradigm shift", "holistic".
  - Replace with concrete, plain language. Prefer specific verbs over vague abstractions.
  - This rule applies to every suggestion's `replacement` / `expanded` text — never introduce these terms even if the original didn't have them.

### 3. Reset checkboxes on close
- In `WritingAssistantDialog.tsx`, when `isOpen` transitions to false (or in the `onClose` handler / `Dialog`'s `onOpenChange`), reset the grammar category checkbox state to all-unchecked, and also reset the "Consortium makeup" checkbox to unchecked. Use a `useEffect` watching `isOpen` so reopening always shows a clean state.

### 4. Stricter evaluation scoring
- In `writing-assistant/index.ts` `evaluate_section` system prompt, rewrite scoring guidance:
  - Use a half-point deduction model from the 5.0 maximum: minor shortcomings = -0.5, major shortcomings = -1.0 each (cap floor at 1.0).
  - Be explicitly critical: do not inflate scores. If multiple weaknesses exist, the score must reflect them. A 4.5 or 5.0 requires no material weaknesses.
  - Add calibration anchors: 5.0 = no weaknesses, all criteria fully met; 4.0 = minor gaps; 3.0 = several minor or one major weakness; 2.0 = major structural problems; 1.0 = fails the criterion.
  - Require at least as many weaknesses as the deduction implies (e.g. a 3.5 must list ≥1 major or ≥3 minor weaknesses).
  - Allow decimal scores (0.5 increments) in the JSON output (`overallScore` and per-criterion `score`).
- In `WritingAssistantDialog.tsx`, ensure score rendering tolerates decimals (e.g. `score.toFixed(1)` and progress bar uses `score/5*100`).

### 5. Rename consortium controls
- In the Evaluation tab UI:
  - Checkbox label: "Also evaluate the consortium for this proposal" → **"Consortium makeup"**.
  - Helper/description text "Analyse the whole consortium against HE best practices and flag gaps." → **"Give feedback on how sufficiently the consortium addresses the topic"**.

### Acceptance
- Button reads "Enhance content"; no "Expand" wording remains in user-facing strings.
- Suggestions from grammar and enhance avoid the banned AI-style vocabulary.
- Reopening the dialog shows all category and consortium checkboxes unchecked.
- Evaluation returns realistically critical scores with decimal granularity; UI displays them correctly.
- Consortium checkbox + helper text use the new labels.
