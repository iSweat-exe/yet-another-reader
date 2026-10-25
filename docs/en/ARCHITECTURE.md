# Architecture

An overview to understand how the application is built, before modifying it ([Contributing](CONTRIBUTING.md)).

## In one sentence

A thread periodically reads the memory of osu!lazer, **read-only**, and derives a `GameState` from it that is published to three
recipients: the windows of the application (Tauri events), the local API (HTTP/WebSocket) and the RTSS module.

> [!SCREENSHOT] architecture-diagram
> Diagram (not a screenshot): osu!lazer on the left, a "read-only" arrow to the lazer-reader box, then the reading
> thread (src-tauri) in the centre splitting into three arrows to: application windows (Tauri events), Hub / local API
> (REST, WebSocket, widgets), RTSS module. Two annotated rates: "state 33 ms" and "keys 2 ms".

```
osu!lazer ──read-only──▶ lazer-reader ──GameState──▶ "lazer-reader" thread (src-tauri)
                                                              │
              ┌───────────────────────────────────────────────┼───────────────────────────┐
              ▼                                               ▼                           ▼
      Tauri events                                     Hub (overlay-server)            RTSS module
   (main window + overlay)                             REST / WebSocket / widgets      (text via RTSS)
```

## The three parts

The repository is a Cargo workspace (`Cargo.toml`) plus a React interface.

| Folder | Role | Language |
| --- | --- | --- |
| `crates/lazer-reader` | Read osu!lazer and produce a `GameState`. No dependency on Tauri. | Rust |
| `crates/overlay-server` | The local API: REST, WebSocket, community widgets, API documentation. | Rust (axum) |
| `src-tauri` | The application: reading thread, settings, layouts, overlay window, RTSS, global shortcut, Tauri commands. | Rust (Tauri 2) |
| `src` | The interface: tabs, editor, overlay rendering, widgets, translations. | TypeScript, React 19 |
| `docs` | This documentation (also displayed in the application) and the example widget. | Markdown |

### `crates/lazer-reader`

- **Security contract**: the process is only opened with **read** rights. Nothing writes to the game's memory, injects code or
  simulates input.
- `process`, `clr`, `dac`: access to the process, to its .NET runtime and to its metadata.
- `version`, `profile`: detection of the exact game version at each connection, and the **names** of the fields followed. The profile
  never contains byte offsets: they are **resolved from the running game**, so a profile only changes if osu! renames a field.
- `session`: attaches to the game, finds the root object only once (memory scan), then each snapshot only follows a few pointers.
- `readers`: beatmap, mods, time, user; `pp`: PP calculation (rosu-pp); `graph`: the map's difficulty along the song (the graph), computed on its own thread (the latest pick wins, results kept per map, mods and speed); `events`: detection of events (screen change, start of a play, and per note: `hit`, `miss`, `comboBreak`);
  `model`: the published types (`GameState`, `Beatmap`, `Gameplay`, `PersonalBest`…, serialised in `camelCase`).
- `input`: the keys and mouse buttons held, read from the game's input state (`InputState` of osu!framework). The path is in the profile;
  the reading remembers the addresses and only costs a few reads: it can run hundreds of times per second.
- `window`: location of the game window (for the overlay).

### `crates/overlay-server`

- `hub`: state shared between the producer (the reading thread) and the consumers. A broadcast channel feeds the WebSockets; a client
  that is too slow receives a fresh state rather than a backlog. The hub also keeps the beatmap's record with its samples (`ghost`, served on `/personal-best`).
- `routes`: the REST endpoints and the documentation (the four pages `docs/API.md`, `REST_API.md`, `WEBSOCKET.md` and `DATA_MODEL.md` are
  included at compile time, one after the other, and served on `/api/v1/docs`).
- `ws`: the WebSockets: the state (topics, events, reconnection), the keys and the events alone (`/events/ws`, filtered by `names`). `widgets`: the manifests and files of the community widgets.
  `images`: the pictures imported for the Image widget (type checked on the signature, size limit, name = hash of the content, never a
  path given by the caller), served on `/api/v1/images/{id}`; the Tauri commands `import_image`, `list_images` and `delete_image`
  (`src-tauri/src/images.rs`) write them into `<config>/images`.

### `src-tauri`

- `reader`: the reading thread, which has **two rhythms**: the play state every `pollIntervalMs` and the keys every `inputPollIntervalMs`
  (2 ms), the latter **only if someone listens to them** (`Hub::inputs_wanted`: a WebSocket, a window of the application, or a recent REST
  request). Outside a play, with no state WebSocket client, reading slows down (state >= 100 ms, keys >= 8 ms) and the slow fields (mods, ruleset) are only re-read a few times per second. While the keys are read, the application asks Windows for a 1 ms timer.
- The keys have their own channel: `Hub::publish_inputs` only broadcasts on change, to `/api/v1/inputs/ws` and to the windows of the
  application (Tauri event `input-state`).
- The session contains non-`Send` handles: it is created and used **only** in this thread. `UiEmitter` limits the rate of the updates to the
  windows (the overlay at its configured rate, the menus about 10 times a second outside a play).
- `overlay`: the transparent overlay window, without focus and click-through; a thread follows the game window and shows or hides the overlay
  according to the current page.
- `layout`, `settings`: JSON persistence (`overlays/<name>.json`, `settings.json`) in the configuration folder. The layouts are stored as
  opaque JSON: the **format is defined on the TypeScript side** (`src/overlay/model/layout.ts`); the Rust only reads, writes and computes the page
  mask.
- `records`: the personal bests. The reading thread passes it every state: during a solo play it keeps one sample per second, and on the results screen it replaces the beatmap's record if the score is higher (`records/<sha256>.json`). It fills in the state's `personalBest` and the hub's `ghost`.
- `nowplaying`: a thread that writes `nowplaying.txt` and `cover.*` when the map changes (see [Settings](SETTINGS.md#now-playing)). `widgetwatch`: a thread that polls the widgets folder twice a second and tells the windows (Tauri event `widgets-changed`) for the [hot reload](WIDGETS.md#hot-reload).
- `rtss`: bridge to RivaTuner (writing a text slot into its shared memory).
- `commands`: the interface called by the front end (`get_game_state`, `get_settings`, `set_settings`, `list_layouts`, `get_layout`,
  `save_layout`, `delete_layout`, `list_widgets`, `open_widgets_folder`…).
- `lib`: start-up, the global shortcut `Ctrl + Shift + O`, installation of the example widget on first launch.

### `src` (interface)

| Path | Content |
| --- | --- |
| `main.tsx` | Entry point: `#overlay` loads the overlay, otherwise the application. |
| `App.tsx` | The tabs (Status, Settings, Editor, Documentation). |
| `lib/store.ts` | The store (zustand) fed by the Tauri events; `lib/mock.ts` provides fake data in a plain browser. |
| `lib/types.ts` | TypeScript mirror of the API's JSON. |
| `lib/layoutBundle.ts`, `lib/layoutShare.ts` | Layout sharing: `.yarlayout` file and `yar1:` code. |
| `overlay/` | Overlay rendering: `layout.ts` (format, anchors, migration, presets), `pages.ts`, canvas, animated numbers. |
| `widgets/` | The built-in widgets and their registry (`registry.ts`). |
| `editor/` | The editor: state (`useEditor.ts`, history, groups, spacing), geometry (`geometry.ts`), canvas, properties, layers. |
| `docs/` | The Documentation tab. |
| `i18n/` | The `fr` and `en` translations. |

## The data, from the game to the screen

1. The reading thread samples the game every `pollIntervalMs` milliseconds.
2. The `GameState` is published to the `Hub` **only if it changed** (this is what limits the WebSocket traffic).
3. The same state is emitted to the Tauri windows (`game-state`), where the store in `src/lib/state/store.ts` receives it.
4. The widgets read the store with fine-grained selectors: only those whose data changes are redrawn.

The **community** widgets do not go through the store: they run in an isolated iframe and read the local API like any other client.

## Platform boundary

Everything that talks to Windows lives in a `platform/` folder; the rest of the code never names an operating system:

- `crates/lazer-reader/src/platform/`: `windows/` (process, DAC, window, file version) and `unsupported/` (same surface,
  returning `ReaderError::Unsupported`). `types.rs` holds the shared data, `paths.rs` the per-system paths.
- `src-tauri/src/platform/`: `windows.rs` (topmost overlay, 1 ms timer, thread priority, RTSS, browser shortcuts) and
  `unsupported.rs`.

To port the application to another system, fill in the matching `unsupported` folder (or add a new one) without touching
the game logic. The "Rust (Linux check)" CI job verifies that these boundaries compile.

## Design choices to know

- **Read-only first.** Any change to the reader must respect the security contract above.
- **Versioned API contract** (`/api/v1`). Adding a field is not a breaking change; removing one or changing its meaning is (see
  [Local API](API.md#conventions)).
- **Anchored layouts**, scaled by height: a layout does not depend on the resolution.
- **Low load on the game.** The hot loops of the reader are optimised even in the development profile, the overlay is only on screen when
  needed, and the refresh rate is adjustable.
