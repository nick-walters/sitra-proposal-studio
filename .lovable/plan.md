

## Change the "No." column width in Table 3.1.c to 40px

Set a fixed 40px width on the "No." column header and cells in the Deliverables table (3.1.c) in `src/components/B31TablesEditor.tsx`.

### Technical Details

- Update the `<TableHead>` for the "No." column: replace the current `width: '1%'` fallback with `width: '40px'`
- Update the `<TableCell>` for the deliverable bubble: replace `width: '1%'` with `width: '40px'`
- Keep `whiteSpace: 'nowrap'` on both elements to prevent wrapping

