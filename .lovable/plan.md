# Fix float-top figure rendering

## Change
- Emit figure, caption, and spacing calls as executable Typst code inside the float content block.
- Preserve the selected caption type, current spacing, numbering, and top-of-page placement.

## Verification
- Add focused coverage for float-top figure and table captions.
- Run typecheck, focused tests, and the production build.
- Make no proposal content changes.
