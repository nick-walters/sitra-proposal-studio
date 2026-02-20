
## Fix: Sticky Formatting Toolbar Not Working

### Root Cause

The `StickyToolbarWrapper` component uses `placeholder.closest('.flex-1.overflow-auto')` to find the scroll container. However, the actual scroll container in `ProposalEditor.tsx` has the class `overflow-y-auto` (not `overflow-auto`). This means `closest()` returns `null`, the scroll listener is never attached, and the toolbar never becomes sticky.

The scroll container hierarchy is:
```text
<main class="flex-1 flex flex-col min-h-0 overflow-hidden">   -- outer main
  <div class="flex-1 overflow-y-auto">                        -- THIS is the scroll container
    <TopicInformationPage>
      <StickyToolbarWrapper>                                   -- looking for '.flex-1.overflow-auto' (WRONG)
```

### Fix

**File: `src/components/StickyToolbarWrapper.tsx`**

Change the default `scrollContainerSelector` from `'.flex-1.overflow-auto'` to `'.flex-1.overflow-y-auto'` so it matches the actual scroll container class.

Additionally, the `top` position should account for the fixed header and proposal info bar above the scroll container. Currently it uses `containerRect.top` which should already handle this correctly since it reads the scroll container's bounding rect. But we should verify this works and doesn't slide behind the header bar (z-index 20 vs header z-index 40 -- may need to bump to z-index 50).

### Changes

1. **`src/components/StickyToolbarWrapper.tsx`** -- Update the default selector from `'.flex-1.overflow-auto'` to `'.flex-1.overflow-y-auto'` and increase z-index to 50 to ensure it renders above the proposal info bar (z-40).

That is the only change needed -- a one-line selector fix plus a z-index bump.
