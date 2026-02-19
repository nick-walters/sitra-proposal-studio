

## Analysis: Why the Topic Button Is Not Visible

### Root Cause

The proposal in the database (`7ace25fe-1154-486f-88b4-8a1485163a45`) has `topic_url = NULL`. The button is conditionally rendered with `{proposal?.topicUrl && ...}`, so it never appears.

The "flash" you saw was actually the "View Only" badge (on the right side of the bar), not the Topic button. That badge appears briefly while `isDraft` is being determined during loading, then disappears once the proposal loads and is confirmed as a draft.

The Dashboard sample proposals have hardcoded `topicUrl` values, which is why the Topic button works there -- those are not real database records.

### Fix Plan

**1. Show the Topic button even when there is no URL (as a disabled or placeholder state)**

Since not all proposals will have a topic URL set, the button should still appear but either:
- Link to the topic URL when available, or
- Be disabled/greyed out when no URL is set, so the user knows where it will appear

**2. Place it immediately after the Status Badge (line 984)**

The button is already in the right position in the code (line 986-998, after the status badge at line 978-984). The issue is purely that `topicUrl` is null, so the conditional prevents rendering.

### Technical Changes

**File: `src/pages/ProposalEditor.tsx` (lines 986-998)**

- Remove the `proposal?.topicUrl &&` conditional guard so the button always renders when a proposal is loaded
- If `proposal?.topicUrl` exists, render as a clickable link opening in a new tab
- If `proposal?.topicUrl` is missing, render a disabled-looking button (muted colors, no click action, or optionally a tooltip saying "No topic URL set")
- Keep the `shrink-0` class to prevent it from being compressed
- Use the same `ExternalLink` icon style as the Dashboard's `ProposalCard`

