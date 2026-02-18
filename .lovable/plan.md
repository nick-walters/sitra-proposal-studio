
# Fix: Cross-Reference Cursor Focus and Formatting Reset

## Root Cause

Both the `insertFigureTableReference` and `insertAcronymReference` commands use `commands.insertContent()` inside their command definitions. In TipTap, `commands.insertContent()` dispatches the transaction immediately, which **breaks the chain**. This means everything after the command in the chain -- `.insertContent(' ').unsetBold().unsetItalic().run()` -- silently never executes.

- For figure/table refs: the reference inserts, but the trailing space and format reset are lost, so typing continues in bold italic.
- For acronym refs: the reference inserts, but focus is never restored (`.focus()` ran before, but the immediate dispatch resets the editor state).

## Fix

### 1. Rewrite `insertFigureTableReference` command (src/extensions/FigureTableReferenceMark.ts)

Change from `commands.insertContent()` to direct transaction manipulation so it participates in the chain:

```ts
insertFigureTableReference:
  ({ refText }) =>
  ({ tr, dispatch, editor }) => {
    if (dispatch) {
      const mark = editor.schema.marks.figureTableReference.create();
      const textNode = editor.schema.text(refText, [mark]);
      tr.replaceSelectionWith(textNode, false);
    }
    return true;
  },
```

### 2. Rewrite `insertAcronymReference` command (src/extensions/AcronymReference.ts)

Same fix -- use direct transaction manipulation:

```ts
insertAcronymReference:
  (attributes) =>
  ({ tr, dispatch }) => {
    if (dispatch) {
      const node = this.type.create(attributes);
      tr.replaceSelectionWith(node);
    }
    return true;
  },
```

### 3. Add `unsetMark('figureTableReference')` to the chain (src/components/DocumentEditor.tsx)

The `figureTableReference` mark can bleed into the trailing space even after the chain fix. Update the cross-ref handler to also remove that mark:

```ts
editor.chain().focus()
  .insertFigureTableReference({ refText })
  .insertContent(' ')
  .unsetMark('figureTableReference')
  .unsetBold()
  .unsetItalic()
  .run();
```

### Summary of file changes

| File | Change |
|------|--------|
| `src/extensions/FigureTableReferenceMark.ts` | Rewrite command to use `tr` directly |
| `src/extensions/AcronymReference.ts` | Rewrite command to use `tr` directly |
| `src/components/DocumentEditor.tsx` | Add `.unsetMark('figureTableReference')` to cross-ref handler chain |
