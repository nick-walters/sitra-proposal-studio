
# Plan: Fix Dialog Persistence When Switching Browser Tabs

## Problem Analysis

The current fix in `dialog.tsx` only addresses the dialog itself, but there are nested interactive components that also respond to focus/blur events:

1. **Popover** (country selector) - closes on focus loss, can cascade to dialog
2. **Select** (organisation category, participant type) - closes on focus loss

When a user switches tabs with any of these open, they close and may trigger the parent dialog's close mechanism.

## Solution

Apply the same focus/blur protection to all Radix UI components that can appear inside dialogs:

### Files to Modify

1. **`src/components/ui/popover.tsx`** - Add `onFocusOutside` handler to prevent close on tab switch
2. **`src/components/ui/select.tsx`** - Add `onFocusOutside` handler to `SelectContent`
3. **`src/components/ui/dialog.tsx`** - Improve the detection logic using `document.hidden` state

## Technical Implementation

### 1. Update PopoverContent (`popover.tsx`)

Add focus protection similar to DialogContent:

```typescript
const PopoverContent = React.forwardRef<...>(
  ({ className, align = "center", sideOffset = 4, onFocusOutside, ...props }, ref) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        onFocusOutside={(e) => {
          // Prevent popover from closing when switching browser tabs
          e.preventDefault();
          onFocusOutside?.(e);
        }}
        // ... rest
      />
    </PopoverPrimitive.Portal>
  )
);
```

### 2. Update SelectContent (`select.tsx`)

Add focus protection:

```typescript
const SelectContent = React.forwardRef<...>(
  ({ className, children, position = "popper", onFocusOutside, ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        onFocusOutside={(e) => {
          // Prevent select from closing when switching browser tabs
          e.preventDefault();
          onFocusOutside?.(e);
        }}
        // ... rest
      />
    </SelectPrimitive.Portal>
  )
);
```

### 3. Improve Dialog Detection (`dialog.tsx`)

Enhance the `onInteractOutside` handler to use `document.hidden` for more reliable tab-switch detection:

```typescript
onInteractOutside={(e) => {
  // Use document.hidden to detect if browser tab lost focus
  if (document.hidden) {
    e.preventDefault();
    return;
  }
  // Allow closing via explicit overlay click only
  const target = e.target as HTMLElement;
  const isOverlayClick = target?.getAttribute('data-state') === 'open' && 
                         target?.classList.contains('fixed');
  if (!isOverlayClick) {
    e.preventDefault();
  }
  onInteractOutside?.(e);
}}
```

## Why This Works

- **Popover/Select focus handlers**: Prevent nested dropdowns from closing when focus shifts due to tab switch
- **Document.hidden check**: The `document.hidden` property is `true` when the browser tab is not visible, providing a reliable way to detect tab switches vs genuine user interactions
- **Cascade prevention**: By preventing nested components from closing, we avoid any chain reaction that might close the parent dialog

## Testing Scenarios

After implementation, verify these scenarios:
1. Open Add Participant dialog, switch tabs - dialog stays open
2. Open Add Participant dialog, open country selector, switch tabs - both stay open
3. Open Add Participant dialog, open organisation category dropdown, switch tabs - both stay open
4. Open Add Participant dialog, click outside on overlay - dialog closes (expected)
5. Open Add Participant dialog, press Escape - dialog closes (expected)
6. Open Add Participant dialog, click X button - dialog closes (expected)
