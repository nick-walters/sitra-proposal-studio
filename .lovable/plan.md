
Goal: make tracked-change boxes in the actual review experience reliably clickable (same behavior quality as comments), with robust jump-to-location behavior and no regressions.

1) Deep analysis findings (what is actually broken)
- The previous fix was applied to `TrackChangesToolbar.tsx` popover cards.
- The user-facing “review panel” cards they are clicking are in `DocumentEditor.tsx` under the collaboration tab (`collaborationTab === 'changes'`, inline list around lines ~1643+).
- Those inline cards currently have no `onClick` jump handler at all, so they cannot navigate.
- This explains why “nothing changed” after the last patch.
- Secondary signal: console warnings about ref forwarding (`Popover`, `Badge`) indicate some Radix-asChild/ref friction in this area; not the primary cause of non-clickable cards, but worth hardening to avoid brittle interactions.

2) Root causes (comprehensive)
- Root cause A (primary): wrong component targeted previously (popover list vs inline review list).
- Root cause B: no shared navigation utility, so click-to-jump logic is duplicated/inconsistent and easy to patch in one place but miss another.
- Root cause C: once inline cards become clickable, nested action buttons (accept/reject) must be explicitly excluded from card-level navigation (same pattern already used in comments).
- Root cause D: jump logic should use editor-native scroll behavior first (`scrollIntoView`) with DOM fallback for stale positions, to avoid flaky “clicked but didn’t move” cases.

3) Implementation plan
- Step 1: Add a shared “jump to change” handler in `DocumentEditor.tsx`
  - Create a local callback (e.g. `handleJumpToTrackedChange(change)`).
  - Clamp position to doc bounds.
  - Use editor chain command: `focus -> setTextSelection -> scrollIntoView`.
  - Keep safe fallback (`try/catch`) and optional DOM `domAtPos` fallback only if needed.
- Step 2: Make inline review cards clickable (the actual panel the user uses)
  - In the inline `trackedChanges.map(...)` card container:
    - add `cursor-pointer`, hover affordance (same style language as comments),
    - add `onClick` that calls `handleJumpToTrackedChange(change)`,
    - guard against inner interactive controls (`button`, `a`, `input`, `textarea`) so accept/reject clicks do not trigger jump.
  - Add title/aria hint (“Click to jump to change”) for discoverability/accessibility.
- Step 3: Align behavior with comments pattern
  - Mirror the proven comments-card pattern:
    - whole card clickable,
    - nested actions isolated,
    - navigation callback centralized.
  - This prevents the same regression pattern recurring.
- Step 4: Keep toolbar popover behavior, but route both UIs through shared logic
  - Update `TrackChangesToolbar` card click to call the same navigation utility (or same algorithm copy if cross-file function extraction is avoided).
  - Ensures popover list and inline review list behave identically.
- Step 5: Hardening pass for interaction stability
  - Ensure card clicks work with both mouse and keyboard (`role="button"`, `tabIndex`, Enter/Space handlers) in inline panel.
  - Keep current `onOpenAutoFocus` behavior in popover only where needed.
  - Review ref-warning hotspots (`Badge`/Radix asChild usage) and fix only where they affect interaction surfaces (avoid unnecessary broad refactor).

4) Validation plan (must pass before closing)
- Functional:
  - Click inline review card → editor jumps to correct tracked change.
  - Click accept/reject icon inside card → only action runs, no jump.
  - Click toolbar popover card → same jump behavior.
  - Works for first, middle, last change and with long documents.
- State:
  - Selection lands on expected range after jump.
  - No accidental tab switch/popover close caused by click bubbling.
- Regression:
  - Comments card click-to-jump still works.
  - Tooltip accept/reject still works.
- UX:
  - Hover/focus affordance clearly indicates cards are clickable.
  - Keyboard activation works.

5) Technical details (for implementation)
- Files to update:
  - `src/components/DocumentEditor.tsx` (primary fix; inline review cards)
  - `src/components/TrackChangesToolbar.tsx` (consistency + shared jump logic parity)
  - Optional targeted UI primitive cleanup if required by interaction tests:
    - `src/components/ui/badge.tsx` (forwardRef hardening where used with Radix asChild patterns)
- No backend/schema changes required.
- No migration required.
