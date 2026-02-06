
# Fix: Remove Large Gap Before B3.1 Tables

## Problem

Section 3.1 displays a large whitespace gap between the editor content and the interactive tables (Deliverables, Milestones, Risks), even when there's minimal text in the editor.

## Root Cause

The `useRichTextEditor` hook in `src/components/RichTextEditor.tsx` hardcodes `min-h-[400px]` directly on the ProseMirror editor element via `editorProps.attributes.class`:

```tsx
editorProps: {
  attributes: {
    class: 'document-content min-h-[400px] outline-none prose prose-sm max-w-none',
    ...
  },
},
```

This minimum height is applied to the internal `.ProseMirror` element, not the wrapper `EditorContent` component. Previous fixes only removed the `min-h-[400px]` from the `EditorContent` className, but the ProseMirror element inside still retains the 400px minimum height.

## Solution

Add a CSS override in `src/index.css` to remove the minimum height specifically for B3.1 sections:

```css
.b31-editor-container .ProseMirror {
  min-height: 0 !important;
}
```

This targets the inner ProseMirror element when it's within a B3.1 editor container, overriding the hardcoded 400px minimum height.

## Implementation Steps

1. **Update `src/index.css`** - Add CSS rule to override the min-height on `.ProseMirror` for B3.1 sections
   - Add new rule: `.b31-editor-container .ProseMirror { min-height: 0 !important; }`
   - Place this near the existing `.b31-editor-container` rule for organization

## Technical Details

- The fix uses CSS specificity to override the Tailwind utility class (`min-h-[400px]`) that's hardcoded in the hook
- The `!important` flag is necessary because Tailwind utility classes are applied inline
- This approach is minimal and doesn't require modifying the shared `useRichTextEditor` hook, which is used by other components
- The existing `b31-editor-container` class is already being applied to the wrapper div in DocumentEditor.tsx

## Files to Modify

1. `src/index.css` - Add CSS override rule

