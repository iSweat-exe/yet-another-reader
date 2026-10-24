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

Then open `http://localhost:1420/` in a browser: the interface runs with animated **fake data** (`src/lib/state/mock.ts`), without Tauri. Useful
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
| `npm run e2e` | End-to-end tests (Playwright), see [End-to-end tests](#end-to-end-tests). |
| `npm run e2e:ui` | The same, in Playwright's interface. |
| `npm run widget:new -- "My widget"` | Creates a community widget from the template (see [Community widgets](WIDGETS.md#creating-a-widget-from-a-template)). |
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
- The layout format is defined in `src/overlay/model/layout.ts`; any change must stay **backward compatible** (`migrateLayout` reads the old
  documents).
- The editor state is in `src/editor/useEditor.ts`; the geometry (alignment, spacing, snapping) is pure code in `src/editor/canvas/geometry.ts`,
  tested.
- Follow the style of the existing interface (components of `src/editor/fields.tsx`, icons of `src/components/icons/Icon.tsx`).

### Translations

Every visible string goes through `src/i18n`. `fr.ts` and `en.ts` must have **exactly the same keys** (the `Messages` type and a test check
it). Add the key to both files.

### API

The API is a public contract (`/api/v1`): adding a field is harmless; removing or changing the meaning of a field is a breaking change.
Every change to the API updates the four documentation pages ([Guide](API.md), [REST routes](REST_API.md), [WebSocket](WEBSOCKET.md) and
[Data model](DATA_MODEL.md)), which the application also serves on `/api/v1/docs`, and the mirror `src/lib/state/types.ts`.

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
   name (`widget.<type>`) and its default size. For a new file, also add it to `GROUPS` in `src/widgets/registry.ts`:
   that list gives `WIDGETS` and the file shown by *View source code* (a test checks that every `type` is found in its file).
3. Put it in a palette category (`WIDGET_CATEGORIES` in `src/widgets/registry.ts`) and give it an icon in `src/editor/model/widgetIcons.ts`.
4. Add the name to `fr.ts` and `en.ts`.
5. Document it in [Built-in widgets](BUILTIN_WIDGETS.md).

If the widget needs a piece of data that the reader does not publish yet, first add it on the `lazer-reader` side (model `model.rs`, reading in
`readers.rs`/`session.rs`), then in `src/lib/state/types.ts` and in the [Local API](API.md).

## osu!lazer images and sounds

The osu!lazer textures live in `public/Textures/` (logo, icons, flags, medals, backgrounds, cursors, guest avatar)
and the interface sounds in `public/Samples/UI/`. They are plain URLs: nothing is imported into the bundle.

- **Paths**: go through `src/lib/media/assets.ts` (`LOGO_URL`, `GUEST_AVATAR_URL`, `rulesetIconUrl`, `flagUrl`,
  `menuBackgroundUrl`) and `src/lib/state/mods.ts` (`modIconUrl`) instead of writing a path by hand. A test checks that the
  files exist.
- **Backgrounds**: a background is decorative, dark, blurred and loaded lazily (`<Backdrop>`: `loading="lazy"`,
  `decoding="async"`, fades in on arrival). The menu backgrounds are **webp** files under 20 KB; their jpg originals
  (1 MB each) are kept out of the build, in `assets-src/menu/`. **No background in the in-game overlay** by default.
- **Images in a widget**: always `decoding="async"`, a fixed size, and a fallback (`onError`) like the avatar.
- **Icons**: the interface keeps a single icon set, `<Icon name="…" />` (`src/components/icons/Icon.tsx`); textures are for images that
  *represent* something of the game (ruleset, mod, country, avatar).
  - When an osu!lazer icon (`public/Textures/icons/`) has the right meaning, `Icon` uses it: the white PNG is a **CSS mask**
    over `currentColor`, so colour, size and states (hover, disabled, accent) come from the surrounding text, like an SVG.
    Otherwise the SVG icon stays (do not force a wrong meaning).
  - **Add or map an osu icon**: one line in `OSU_ICONS` (`src/components/icons/osuIcons.ts`), `name: icon("file", ext)` (path
    under `Textures/icons/`, no `.png`). A name that already has an SVG path replaces it (then delete the dead SVG); a new
    name becomes a new icon name. `ext` is how much of the square the drawing fills along its long side, in % (a bare cross
    is about 50, a circle about 90: measure it); `Icon` scales every drawing to the same visual size. `flip` mirrors the
    picture. The `osuIcons.test.ts` test checks the file exists.
  - The pictures are preloaded when the app is idle, and an `Icon` stays invisible (but keeps its room) until its PNG is
    there. Do not use osu icons in the in-game overlay without a reason: its widgets keep the lighter SVGs.
  - A hover gesture (`iconGestures.ts`) works on both kinds of icon.

### Interface sounds

`src/lib/audio/sfx.ts` plays sounds with the Web Audio API: one `AudioContext`, buffers decoded on first use and then
kept, a capped number of voices, a master volume. Nothing sounds before the first click or key press (autoplay
policy), and **never in the in-game overlay**.

`src/lib/audio/uiSounds.ts` (installed once by `App`, through `useUiSounds()`) gives each element **the sound osu!lazer
gives it**, with a few listeners on the document: a component does not have to do anything to get the standard sound.

**Rules taken from lazer**: a control plays `<set>-hover` when the pointer reaches it and `<set>-select` when it is
clicked (left button); a set without a sample of its own uses the `default` one. Hover is debounced globally
(20 ms), absent while a mouse button is held (scrolling, dragging) and for a disabled control; clicking a disabled
control plays `<set>-select-disabled`. Hover varies in pitch by ±2%, click by ±1%. A slider plays `notch-tick` only
when its value changes (30 ms apart), higher with the value.

| YAR element | lazer equivalent (`HoverSampleSet`) | Hover | Click |
| --- | --- | --- | --- |
| Button with text (Apply, Test, Cancel…) | `OsuButton`: `Button` | `button-hover` | `button-select` |
| Button without text (icon: copy, editor toolbar, panels) | `OsuClickableContainer`: `Default` | `default-hover` | `default-select` |
| OK button of a dialog (accent) | `PopupDialogOkButton`: `DialogOk` | `default-hover` (no `dialog-ok-hover`) | `dialog-ok-select` |
| Cancel / close button of a dialog | `PopupDialogCancelButton`: `DialogCancel` | `default-hover` | `dialog-cancel-select` |
| Dangerous button of a dialog (red) | `PopupDialogDangerousButton` | `button-hover` | `dialog-dangerous-select` |
| Tabs (window, layout pages) | `OsuTabControl`: `TabSelect` | `default-hover` (no `tabselect-hover`) | `tabselect-select` (only when the tab changes) |
| Switches, checkboxes | `OsuCheckbox`: `HoverSounds` + state sounds | `default-hover` | `check-on` / `check-off` |
| Sliders | `OsuSliderBar` | none | `notch-tick` on each value change |
| Header of a dropdown | `OsuDropdownHeader`: `HoverSounds` | `default-hover` | none (the list opening plays `dropdown-open`) |
| Dropdown list (open / close) | `OsuDropdownMenu` | | `dropdown-open` / `dropdown-close` |
| List option, menu item | `HoverClickSounds`: `Default` | `default-hover` | `default-select` |
| Context menu (open / close) | `OsuContextMenu` / `OsuMenu` | | `menu-open-select` / `menu-close` |
| Dialog (open / close) | `DialogOverlay` | | `dialog-pop-in` / `dialog-pop-out` |
| Documentation page list (`data-sfx="sidebar"`) | `SidebarButton`: `ButtonSidebar` | `button-sidebar-hover` | `button-sidebar-select` |
| Notification (update available / downloaded / failed) | `Notification` | | `notification-default` / `notification-done` / `notification-error` |
| Editor error toast (`role="alert"` + `toast` class) | `SimpleErrorNotification` | | `notification-error` on arrival, `overlay-pop-out` on leaving |
| Inline error (`role="alert"`) | (no equivalent found) | | `generic-error` |
| Layer "up / down" buttons (`data-sfx="swap"`) | reordering | `button-hover` | `item-swap` |
| Back (`data-sfx="back"`) | `OsuScreen` on exit | `button-hover` | `screen-back` |

Sources: `osu.Game/Graphics/UserInterface/` (`HoverSampleSet.cs`, `HoverSounds.cs`, `HoverClickSounds.cs`,
`HoverSampleDebounceComponent.cs`, `OsuButton.cs`, `OsuCheckbox.cs`, `OsuTabControl.cs`, `OsuDropdown.cs`,
`OsuSliderBar.cs`, `OsuMenu.cs`, `OsuContextMenu.cs`, `OsuMenuSamples.cs`), `Overlays/Dialog/PopupDialog*.cs`,
`Overlays/DialogOverlay.cs`, `Overlays/Notifications/*.cs`, `Overlays/Settings/SidebarButton.cs`,
`Screens/OsuScreen.cs` in <https://github.com/ppy/osu>. Not used by YAR: the `toolbar-*`, `noclick-*`, `osd-*`,
`metronome-*`, `shutter`, `wave-*` and `bss-*` samples (lazer no longer calls them, or for features YAR does not
have), and `ruleset-select-*` (YAR has no ruleset picker).

To choose by hand, a control or its container gets `data-sfx` (`none`, `default`, `button`, `sidebar`, `ok`,
`cancel`, `danger`, `back`, `swap`), or a component plays a specific sound:

```tsx
<nav data-sfx="sidebar">…</nav>
```

```ts
import { playSfx } from "../lib/sfx";
playSfx("check-on");                                   // by name (`SFX_NAMES`)
```

The settings (on/off, volume) are in **Settings → General**, kept in the window's `localStorage` (`yar.sfx`): an
interface preference, not a reader setting.

## End-to-end tests

The **E2E** tests drive the real interface in a real browser (Playwright), fed by the fake data of the browser mode and, when the API is the
point, by the sample server.

```bash
npm run e2e                # everything
npm run e2e -- editor      # the files whose name contains "editor"
npm run e2e:ui             # Playwright's interface
```

- They drive **Microsoft Edge** (present on every Windows): no browser to download. `E2E_CHANNEL=chrome` picks another one (or `chromium`, after `npx playwright install chromium`).
- The command starts **its own servers**: Vite on port `1431` and the sample server on port `24051`. **Close the application first**: it holds that port.
- The files are in `e2e/*.e2e.ts`. They cover: the editor, the layouts and their sharing, the palettes, the widgets, the settings (themes, languages), the documentation and the playground, the overlay page and the API contract, events WebSocket included. The CI runs them in the *E2E (Windows)* job.

**Writing a test**: a file `e2e/<subject>.e2e.ts`, which imports the helpers of `e2e/helpers.ts` (`openEditor`, `addWidget`, `selectWidget`, `boxOf`, `widgetIds`, `canvasWidgets`).

```ts
import { expect, test } from "@playwright/test";
import { addWidget, canvasWidgets, openEditor } from "./helpers";

test("adding a widget puts it on the screen", async ({ page }) => {
  await openEditor(page);
  const before = await canvasWidgets(page).count();
  await addWidget(page, "Clock");
  await expect(canvasWidgets(page)).toHaveCount(before + 1);
});
```

- The editor's preview screen carries `data-testid="editor-screen"`.
- The widgets' **hit boxes** are the `[data-widget]` elements (the value is the widget's id); the rows of the layers panel are the `[data-row]` elements.
- The widgets' **scene** (what they draw) is drawn **under** the hit boxes: to check what a widget shows, look in the scene (by its role or accessible name), not in the box, and click the box to select it.
- Animations are off (`reducedMotion: "reduce"`): a test checks states, not frames.

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
