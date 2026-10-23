<!--
Title: Conventional Commits, in lower case: `type(scope): what changes`
  e.g.  fix(reader): follow replays      feat(editor): right-click menu      docs: explain the updater
Types: feat, fix, perf, docs, refactor, test, build, ci, chore, security. Add `!` for a breaking change: `feat(api)!: ...`
The title becomes the commit message and a line of the release notes.
-->

## What and why

<!-- The problem, then what this does about it. Link the issue: "Closes #123". -->

## How to check

<!-- Steps, or the command. For a change to reading the game, say what you ran against the real game (lazer-probe...). -->

## Checklist

- [ ] `npx tsc --noEmit`, `npm test`, `cargo clippy --workspace --all-targets` and `cargo test --workspace` pass
- [ ] Reading the game stays **read-only** (no write to the game process, no injection, no simulated input)
- [ ] A change to the API updates `docs/` **and** `docs/en/`, `src/lib/types.ts` and `src/lib/mock.ts` (the API is a public contract)
- [ ] New visible text is in both `src/i18n/fr.ts` and `en.ts`
- [ ] A change to the layout format stays backward compatible (`migrateLayout`)
- [ ] Interface changes: looked at in the app (screenshot below), keyboard focus and "reduce motion" respected
- [ ] No secret, key or token in the diff

## Screenshots

<!-- Before / after for anything visible. -->
