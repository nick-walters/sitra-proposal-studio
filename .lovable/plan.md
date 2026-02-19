

## Fix: Collaboration Panel Toggle Always Visible

### Problem
The collaboration panel (and its collapsed toggle strip) is placed inside a flex row with `overflow-hidden`, which clips it when the viewport isn't wide enough. The `shrink-0` on the panel prevents it from shrinking, but the parent's `overflow-hidden` hides anything that extends beyond its bounds.

### Root Cause
In `DocumentEditor.tsx` at line 1040, the layout is:
```text
div.flex-1.flex.min-w-0.overflow-hidden
  |-- div.flex-1.min-w-0 (main editor content)
  |-- SplitViewPanel (optional, variable width)
  |-- Collaboration panel (w-80 or w-8, shrink-0)
```

The main editor content area is `flex-1 min-w-0` but has no max constraint that accounts for the panel. When the total available width is limited (e.g. sidebar open + narrow screen), the flex container overflows and `overflow-hidden` clips the rightmost element -- the collaboration panel.

### Solution
Restructure the flex layout so the collaboration panel width is always reserved first, and the main content fills the remainder:

1. **Remove `overflow-hidden` from the flex row** (line 1040) and replace with `overflow-visible` or just remove it.

2. **Wrap the main content + split view in their own container** that gets `flex-1 min-w-0 overflow-hidden` (so only the editor content scrolls/clips, not the panel).

3. **Keep the collaboration panel outside that inner wrapper**, directly in the outer flex row, so it always has its reserved space.

### Technical Changes

**File: `src/components/DocumentEditor.tsx`**

Change the layout structure from:
```text
<div className="flex-1 flex min-w-0 overflow-hidden">
  <div className="flex-1 min-w-0 overflow-auto ...">  <!-- editor -->
  <SplitViewPanel />                                    <!-- optional -->
  <CollaborationPanel (w-80 or w-8) />                  <!-- clipped! -->
</div>
```

To:
```text
<div className="flex-1 flex min-w-0">
  <div className="flex-1 flex min-w-0 overflow-hidden">
    <div className="flex-1 min-w-0 overflow-auto ...">  <!-- editor -->
    <SplitViewPanel />                                    <!-- optional -->
  </div>
  <CollaborationPanel (w-80 or w-8) />                   <!-- always visible -->
</div>
```

This nests the editor and optional split view inside an inner flex container that handles overflow, while the collaboration panel sits alongside at the top level where it cannot be clipped.

The change is minimal -- just wrapping the editor content + split view in one additional `div` and moving the collaboration panel out of the overflow-hidden scope.
