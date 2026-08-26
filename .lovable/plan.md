# Fix caption sequencing, participant columns & linked-table resizing

## What will change

1. **Caption numbering**
   - Make the B1.1 board count caption paragraphs using the same normalised markup that TipTap receives, across every visible module in every block.
   - Ensure SOTA consumes `Table 1.1.a.` and the TRL module receives `Table 1.1.b.` in document order.
   - Keep the editor’s derived, non-editable label materialised when template content loads asynchronously.
   - Align the Typst walk with the same subsection-wide sequence and add regression coverage for captions split across blocks and second modules.

2. **Caption styling**
   - Route stored authored captions through one Typst caption helper so both the label and description use the required typography: label bold italic; description italic.
   - Remove/normalise legacy inline formatting that currently makes SOTA differ from TRL.

3. **Participant list**
   - Change the coordinator badge to “Coordinator”.
   - Resolve case badges through the case type display settings; when numbering is disabled, show the case name rather than only its prefix.
   - Leave the logo header blank.
   - Add a `Type` column sourced from A2’s legal entity type (`HES`, `RES`, `SME`, `LE`, `PUB`, `INT`, `OTH`) to the A2 list, B1.1 mirrored table, and Typst output.
   - Update the participant table’s default column shares while preserving saved-width compatibility.

4. **Linked activities resizing**
   - Make the resize hook measure the table’s three real body columns after the metadata merge.
   - Apply a valid three-width `colgroup` to header and body together and persist the final widths under the existing table key.
   - Add a focused regression test for measurement/persistence assumptions where practical.

## Verification

- Run focused caption tests.
- Run `tsgo --noEmit` and confirm exit code 0.
- Do not run browser verification, as requested.

## Cause report to include

- Which B1.1 caption the current walk counts and misses, and why the second module receives the wrong offset.
- Why SOTA and TRL take different Typst styling paths.
- Why the merged linked-activities DOM invalidated width measurement/persistence and allowed header/body divergence.
