# Contributing

Contributions are welcome: bug fixes, new widgets, translations, documentation, improvements to the editor or the API. This page explains
how to set up the project and what is expected of a change. To understand the code before touching it, read the [Architecture](ARCHITECTURE.md) first.

## Setting up the environment

| Tool | Why |
| --- | --- |
| **Windows 10/11** | The reader uses the Windows API; the `lazer-reader` crate only compiles its reading modules on Windows. |
| **Node.js** (recent LTS version) and npm | The interface (Vite, React, TypeScript). |
| **Recent stable Rust** (edition 2024) | The Cargo workspace. Installed with rustup (`rustup.rs`). |
| **Tauri 2 prerequisites for Windows** | Visual Studio C++ build tools and the WebView2 runtime. |
| **osu!lazer** | To test with the real game (optional: the editor and the overlay work with simulated data). |

Recommended editor: VS Code with the **Tauri** and **rust-analyzer** extensions (recommended by the repository).

```bash
npm install
npm run tauri dev
```

`npm run tauri dev` compiles the Rust, starts Vite on port `1420` and opens the application. The first compilation is long; the next
ones are incremental.

> [!SCREENSHOT] dev-terminal
> Terminal running `npm run tauri dev` (Rust compilation lines, "VITE ready" and the local URL) and, next to it, the
> application window that has just opened.

### Developing the interface without the game

```bash
npm run dev
```

Then open `http://localhost:1420/` in a browser: the interface runs with animated **fake data** (`src/lib/mock.ts`), without Tauri. Useful
for the editor and the widgets:

- `http://localhost:1420/?tab=editor`: straight to the editor;
- `http://localhost:1420/?bg=1#overlay`: the overlay over a stand-in background.

> [!SCREENSHOT] browser-editor
> Browser on `http://localhost:1420/?tab=editor`: the complete editor with the animated simulated data, and the URL
> visible in the address bar.

## Useful commands

| Command | Role |
| --- | --- |
| `npm run tauri dev` | Complete application in development. |
| `npm run dev` | Interface only, in the browser. |
| `npm test` | Interface tests (Vitest). |
| `npx tsc --noEmit` | TypeScript type check. |
| `npm run build` | Type check, then front-end build. |
| `cargo test --workspace` | Rust tests. |
| `cargo clippy --workspace --all-targets` | Rust lints. |
| `npm run tauri build` | Package the application. |

## Conventions

### Rust

- **Read-only, always**: never open the game's process with write rights, never inject anything, never simulate input.
- The workspace warns about `unwrap` and `expect` (`clippy::unwrap_used`, `expect_used`) and refuses `unsafe_op_in_unsafe_fn`: handle errors
  with `Result`; if an `expect` is justified, use `#[expect(..., reason = "...")]`. Tests may use `unwrap`.
- No byte offsets in the profiles (`profile.rs`): only field and type names.

### TypeScript / React

- The TypeScript types are strict; `npx tsc --noEmit` must pass.
- Widgets read the store with a **narrow selector** (`useReaderStore((s) => ...)`) so that they only redraw when their data changes.
- The layout format is defined in `src/overlay/layout.ts`; any change must stay **backward compatible** (`migrateLayout` reads the old
  documents).
- The editor state is in `src/editor/useEditor.ts`; the geometry (alignment, spacing, snapping) is pure code in `src/editor/geometry.ts`,
  tested.
- Follow the style of the existing interface (components of `src/editor/fields.tsx`, icons of `src/components/Icon.tsx`).

### Translations

Every visible string goes through `src/i18n`. `fr.ts` and `en.ts` must have **exactly the same keys** (the `Messages` type and a test check
it). Add the key to both files.

### API

The API is a public contract (`/api/v1`): adding a field is harmless; removing or changing the meaning of a field is a breaking change.
Every change to the API updates the four documentation pages ([Guide](API.md), [REST routes](REST_API.md), [WebSocket](WEBSOCKET.md) and
[Data model](DATA_MODEL.md)), which the application also serves on `/api/v1/docs`, and the mirror `src/lib/types.ts`.

To try the API (or develop a client) **without osu!**, start the sample server: it replays a fake play, with its keys, its events and a
background picture, on all the routes.

```bash
cargo run -p overlay-server --example sample
```

It listens on port `24051` (stop the application first); `cargo run -p overlay-server --example sample -- 24099 idle` picks another port
and simulates a game that is not running.

### Documentation

This documentation is a set of Markdown files in `docs/`, displayed in the **Documentation** tab. See
[Writing the documentation](#writing-the-documentation).

## Add a built-in widget

1. Create the component in `src/widgets/`: it receives `{ instance }` and reads what it needs with a selector
   `useReaderStore((s) => ...)`. The functions `fontSizeFor`, `animationMsFor` and `AnimatedNumber` give a text size and animated numbers
   consistent with the other widgets.
2. Add it to the exported list of the file (`BASIC_WIDGETS`, `INFO_WIDGETS`, `PLAYER_WIDGETS`…) with its `type`, the translation key of its
   name (`widget.<type>`) and its default size.
3. Put it in a palette category (`WIDGET_CATEGORIES` in `src/widgets/registry.ts`) and give it an icon in `src/editor/widgetIcons.ts`.
4. Add the name to `fr.ts` and `en.ts`.
5. Document it in [Built-in widgets](BUILTIN_WIDGETS.md).

If the widget needs a piece of data that the reader does not publish yet, first add it on the `lazer-reader` side (model `model.rs`, reading in
`readers.rs`/`session.rs`), then in `src/lib/types.ts` and in the [Local API](API.md).

## Create a community widget

No need to touch the application's code: see [Community widgets](WIDGETS.md). To share it with everyone, publish the folder in a repository.

## Writing the documentation

- The pages are the files `docs/*.md`, in French, in standard Markdown (headings, lists, tables, code blocks, links).
- To **link another page**, use its file name: `[Editor](EDITOR.md)` or, with a section, `[Groups](EDITOR.md#groups)`. For a section of the
  same page: `[text](#section-title)` (the title in lowercase, the spaces replaced by dashes).
- To **add a page** to the navigation, declare it in `src/docs/pages.ts` (identifier, title, sidebar section, file imported as `?raw`).
- The four API pages (`API.md`, `REST_API.md`, `WEBSOCKET.md`, `DATA_MODEL.md`) are also compiled into the server (`include_str!`) and served
  one after the other on `/api/v1/docs`: their links between pages are rewritten as internal links. Every REST route has its section with a
  usage example and a response example, and every WebSocket message has its example: a test (`src/docs/docs.test.ts`) checks this from the
  server's routes.
- Avoid external links: the application does not open a browser.

## Report a bug

Open a ticket with:

1. what you did, what you expected, what happened;
2. the **osu!lazer version** (**Status** tab, *Connection* card) and that of the application (`version` in `package.json`);
3. the error message from **Status**, if there is one;
4. for a display problem: the layout concerned (**Export…** in the editor) and the display mode of the game (windowed, borderless, exclusive
   fullscreen).

## Propose a change

1. Make a branch from `main`, named `type/short-description` (`feat/right-click-menu`, `fix/replay-keys`,
   `docs/updates`…). The types are the commit types: `feat`, `fix`, `perf`, `docs`, `refactor`, `test`, `build`,
   `ci`, `chore`, `security`.
2. Keep the changes **small and focused**: one idea per change.
3. Before proposing: `npx tsc --noEmit`, `npm test`, and for Rust `cargo clippy --workspace` and `cargo test --workspace`.
4. Describe what changes **and why**, with a screenshot for any visual change.
5. Update the relevant documentation in the same change.

## The title of the pull request

The repository merges with *squash*: **the title of the pull request becomes the commit message** and then a line
of the release notes. It follows [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): what
changes`, in lower case: `fix(reader): follow replays`. A `!` marks a breaking change: `feat(api)!: rename a field`.
The type gives the pull request its label (a check does it), and the changed files give the `area:` labels.

CI (**Frontend**, **Rust (Windows)**, **Conventional title**, **Secret scan**) must pass before merging.

## Publishing a release

For maintainers only: see the guide [`.github/RELEASING.md`](https://github.com/iSweat-exe/yet-another-reader/blob/main/.github/RELEASING.md)
(signing keys, automatic updates, publishing; in French). One version number for the whole application:
`npm run version:check` checks that it is the same everywhere.

The project is under the **MIT** licence: by contributing, you agree that your contribution is published under this licence.
