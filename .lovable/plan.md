# Match table-captioned image spacing

## Changes
- Make the editor use the same explicit tiny caption-to-image gap for a table-captioned image as for a figure caption below an image.
- Make the Typst output use that identical gap in both directions, without changing spacing before the image/caption pair or after it.
- Keep ordinary table captions unchanged.

## Verification
- Check both caption orientations in the editor and compiled output.
- Run the project typecheck and production build.
- Do not change any SUSIE-Q content.

## Technical details
- Limit changes to the image caption rendering and Typst authored-image emitter.
- Remove any compounded margins at the internal caption–image boundary and apply one 1.5pt/2px gap.
