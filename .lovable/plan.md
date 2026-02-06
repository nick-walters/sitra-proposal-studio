

# Plan: Fix Add Participant Dialog Persistence on Tab/App Switch

## Problem Analysis

The current fix attempts to use `document.hidden` to detect tab switches, but this approach has a critical timing issue: the `document.hidden` property may not be updated at the exact moment when Radix UI fires its dismissal events. The blur/focus sequence is:

1. User switches tab/app
2. Window fires `blur` event
3. Radix components fire `onFocusOutside` / `onInteractOutside`
4. Browser updates `document.hidden` to `true` (slightly delayed)

Since step 4 happens after step 3, checking `document.hidden` in the event handlers returns `false`, and the dialog closes.

## Solution: Window Blur State Tracking

Create a global utility that tracks window focus state synchronously using the `blur` and `focus` events on the window object. Components can then check this state to determine if dismissal should be prevented.

## Files to Create/Modify

### 1. Create New Hook: `src/hooks/useWindowFocus.ts`

Create a reusable hook that tracks window blur/focus state:

```typescript
import { useEffect, useSyncExternalStore } from 'react';

// Global state tracked outside React for synchronous updates
let windowHasFocus = true;
let listeners: Set<() => void> = new Set();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return windowHasFocus;
}

// Initialize listeners once
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    windowHasFocus = false;
    listeners.forEach(l => l());
  });
  window.addEventListener('focus', () => {
    windowHasFocus = true;
    listeners.forEach(l => l());
  });
}

export function useWindowFocus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

// Direct function for use in event handlers (non-hook)
export function isWindowFocused() {
  return windowHasFocus;
}
```

### 2. Update `src/components/ui/dialog.tsx`

Import and use the `isWindowFocused` function:

```typescript
import { isWindowFocused } from '@/hooks/useWindowFocus';

// In DialogContent:
onFocusOutside={(e) => {
  // Prevent dialog from closing when window loses focus (tab/app switch)
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  onFocusOutside?.(e);
}}
onInteractOutside={(e) => {
  // Prevent dialog from closing when window loses focus
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  // Allow closing via explicit overlay click
  const target = e.target as HTMLElement;
  const isOverlayClick = target?.getAttribute('data-state') === 'open' && 
                         target?.classList.contains('fixed');
  if (!isOverlayClick) {
    e.preventDefault();
  }
  onInteractOutside?.(e);
}}
```

### 3. Update `src/components/ui/popover.tsx`

Add protection for all dismissal event handlers:

```typescript
import { isWindowFocused } from '@/hooks/useWindowFocus';

// In PopoverContent, add all three handlers:
onFocusOutside={(e) => {
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  onFocusOutside?.(e);
}}
onInteractOutside={(e) => {
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  onInteractOutside?.(e);
}}
onPointerDownOutside={(e) => {
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  onPointerDownOutside?.(e);
}}
```

### 4. Update `src/components/ui/select.tsx`

Add protection for all dismissal event handlers:

```typescript
import { isWindowFocused } from '@/hooks/useWindowFocus';

// In SelectContent:
onPointerDownOutside={(e) => {
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  onPointerDownOutside?.(e);
}}
onFocusOutside={(e) => {
  if (!isWindowFocused()) {
    e.preventDefault();
    return;
  }
  onFocusOutside?.(e);
}}
```

## Why This Solution Works

1. **Synchronous Event Handling**: The window `blur` event fires synchronously when focus leaves, immediately updating our `windowHasFocus` variable before any Radix UI events fire.

2. **Race Condition Free**: Unlike checking `document.hidden`, our state is updated in the same event loop as the blur, so it's always accurate when Radix components check it.

3. **All Event Types Covered**: We handle `onFocusOutside`, `onInteractOutside`, and `onPointerDownOutside` - the three event types Radix uses for dismissal.

4. **Cascade Prevention**: By preventing nested components (Popover, Select) from closing, we avoid the chain reaction that could close the parent Dialog.

5. **Normal Behavior Preserved**: Clicking outside, pressing Escape, and clicking the X button still work as expected when the window has focus.

## Testing Scenarios

After implementation, verify:
1. Open Add Participant dialog, switch to another browser tab - dialog stays open
2. Open Add Participant dialog, switch to another application - dialog stays open
3. Open country selector popover, switch tabs - both popover and dialog stay open
4. Open organisation category dropdown, switch tabs - both select and dialog stay open
5. Open dialog, click on the dark overlay - dialog closes (expected)
6. Open dialog, press Escape key - dialog closes (expected)
7. Open dialog, click X button - dialog closes (expected)

