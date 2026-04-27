## Goal

Add the missing GitHub Action workflow file that auto-generates `CLAUDE_CONTEXT.md` on every push to `main`.

## Current state

- `scripts/build-context.mjs` — already exists at the correct top-level path with the exact content specified. No change needed.
- `.github/workflows/update-context.yml` — **missing**. The `.github/workflows/` directory currently only contains a `scripts/` subfolder (with a stray copy of the build script), but no workflow YAML.

## Change

Create one new file: **`.github/workflows/update-context.yml`** with the exact YAML content provided in the request (checkout → setup Node 20 → run `node scripts/build-context.mjs` → commit & push `CLAUDE_CONTEXT.md` if changed, with `[skip ci]` and a guard against the bot looping on its own commits).

No other files will be modified or deleted. The stray `.github/workflows/scripts/build-context.mjs` will be left in place (cleanup not requested).

## Result

Once merged, every push to `main` will regenerate `CLAUDE_CONTEXT.md` and commit it back to the repo automatically.