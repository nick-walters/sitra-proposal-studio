

## Fix: Case Cross-Reference Not Working

### Root Cause

The `CaseReferenceMark` extension is registered in two places in `RichTextEditor.tsx`:
1. The `FormattingToolbar` component's internal editor (around line 893) -- this is only used for the toolbar's own preview editor, not the main document editor.
2. The `useRichTextEditor` hook (around line 1039-1045) -- this is the **actual editor instance** used by `DocumentEditor`.

**The problem:** `CaseReferenceMark` is missing from the `useRichTextEditor` hook's extensions list. It appears after `WPReferenceMark` in the toolbar editor but was never added to the hook. Without the extension registered, the `insertCaseReference` command simply doesn't exist on the editor, so clicking a case in the dialog silently fails.

### Fix (1 file, 1 line)

**`src/components/RichTextEditor.tsx`** -- Add `CaseReferenceMark` to the extensions array inside the `useRichTextEditor` hook, right after `WPReferenceMark` (around line 1041):

```
WPReferenceMark,
CaseReferenceMark,          // <-- add this line
ParticipantReferenceMark,
```

No other changes are needed. The import already exists at the top of the file.

