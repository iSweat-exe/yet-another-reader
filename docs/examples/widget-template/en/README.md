# __NAME__

A community widget for **Yet Another Reader**: a small web page (HTML, CSS, JavaScript) drawn over osu!lazer by the
in-game overlay. This folder is a clean, empty starting point; everything you need to fill it is in here.

## What is in this folder

| File | What it is |
| --- | --- |
| `manifest.json` | The widget's identity: name, default size and the **options** the user can change in the editor. |
| `index.html` | The page. Loads `style.css` and `script.js`. |
| `style.css` | The look. The page background is transparent: it is drawn over the game. |
| `script.js` | The logic: receives the game state, the events and the options, and draws. Start here. |
| `types.d.ts` | Types of the API data, so an editor (VS Code) completes `state.gameplay.combo` for you. |
| `docs/` | The documentation of the API, copied here so it travels with the widget: `WIDGETS.md` (this format), `DATA_MODEL.md` (every field), `REST_API.md`, `WEBSOCKET.md` (state and events). |

Edit any file and save: **the overlay and the editor reload the widget by themselves** (hot reload).

## How it works

- The overlay shows `index.html` in an isolated frame (`sandbox="allow-scripts"`): your script can run, call the local API and
  nothing else. No cookies, no `localStorage`, no access to the app.
- The address is `index.html?api=http://127.0.0.1:24051&options={...}`: read both from `location.search`
  (`script.js` already does).
- When the user changes an option in the editor, the page gets a message `{ type: "yar:options", options }`
  instead of being reloaded.
- The game data comes from the local API, like for an OBS browser source:
  - **State** (what the game looks like now): WebSocket `/api/v1/ws`. `?topics=gameplay,beatmap` keeps only what you use.
  - **Events** (something just happened: a hit, a miss, a combo break, a play started or ended): WebSocket
    `/api/v1/events/ws`, `?names=miss,comboBreak` to filter.
  - **One-off reads**: REST routes such as `/api/v1/beatmap` or `/api/v1/personal-best`.

## Add an option

In `manifest.json`, add an entry to `options`; the editor shows a control for it:

```json
{ "key": "color", "type": "color", "label": "Colour", "default": "#f472b6" }
```

Types: `string`, `number` (`min`, `max`), `boolean`, `color`, `select` (`choices: [{ "value": "a", "label": "A" }]`).
In `script.js`, read it with `options.color` and react in `applyOptions()`.

## Size

`defaultSize` in the manifest is the size (in layout pixels, for a 1080 px tall screen) of the widget when it is added.
The user can resize it; make the page fill its frame (`#app` is 100 % wide and tall) and use relative units.

## Try it

- In the editor, add the widget from the palette (Community section, **Refresh** if it is not there yet): the simulation feeds it.
- Outside the app: run `cargo run -p overlay-server --example sample` in the project, open `index.html` through the widgets
  folder URL `http://127.0.0.1:24051/widgets/<folder>/index.html` and watch a scripted play.
- The documentation is also in the app (Documentation tab, **API** and **Community widgets**) and has an API playground.

## Share it

Zip this folder (without anything private). To install a widget someone shared, unzip it in the widgets folder
(editor palette, **Open the widgets folder**): it appears in the palette on its own.
