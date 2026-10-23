# Community widgets

A community widget is a small **HTML / CSS / JavaScript** page that is displayed in the overlay. It reads the game data
through the [local API](API.md) (like an OBS browser source) and can declare **options** that the editor shows as a form.
No compilation, no native code: a folder is enough.

## Quick start

1. In the editor, open the **widgets folder** ("Open widgets folder" under *Community*). On first launch it contains an
   example, `hello-score`.
2. Copy this folder, rename it (`my-widget`), edit it.
3. Click **Refresh** in the palette: your widget appears, add it to the layout.

> [!SCREENSHOT] community-palette
> **Community** section of the palette: the "Hello score" example widget with its icon, the Refresh button (circular
> arrows) next to the title and the "Open widgets folder" link at the bottom.

> [!IMPORTANT] The **local API must be enabled** (settings): the widgets are served by it.

## Structure

```
widgets/
  my-widget/
    manifest.json     # required
    index.html        # entry page (name can be changed)
    ...               # your scripts, styles, images, fonts
```

The folder name is the identifier of the widget (letters, digits, `-`, `_`, spaces; no dot at the start). All the files are
served at `http://127.0.0.1:<port>/widgets/<folder>/...`.

> [!SCREENSHOT] widgets-folder
> File Explorer on the `widgets` folder: a `my-widget` sub-folder expanded with `manifest.json`, `index.html` and an
> `images` folder. The full path visible.

## `manifest.json`

```json
{
  "name": "Hello score",
  "version": "1.0.0",
  "author": "You",
  "description": "Displays the score live.",
  "entry": "index.html",
  "defaultSize": { "w": 420, "h": 140 },
  "options": [
    { "key": "label", "type": "string", "label": "Label", "default": "SCORE" },
    { "key": "color", "type": "color", "label": "Colour", "default": "#f472b6" },
    { "key": "showAccuracy", "type": "boolean", "label": "Show the accuracy", "default": true },
    { "key": "size", "type": "number", "label": "Text size", "default": 56, "min": 12, "max": 200 },
    {
      "key": "mode", "type": "select", "label": "Mode", "default": "score",
      "choices": [{ "value": "score", "label": "Score" }, { "value": "pp", "label": "PP" }]
    }
  ]
}
```

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Name shown in the editor. |
| `version`, `author`, `description` | no | Information displayed (tooltip). |
| `entry` | no | Entry page, `index.html` by default (relative path, without `..`). |
| `defaultSize` | no | Size `{ w, h }` when added, in reference pixels (1080 tall). |
| `options` | no | Configurable options (see below). |

A folder without a valid `manifest.json`, or whose entry page does not exist, is ignored.

### Options

| `type` | Control in the editor | Value |
| --- | --- | --- |
| `string` | text field | string |
| `number` | number field (`min`, `max`) | number |
| `boolean` | checkbox | boolean |
| `color` | colour picker | `"#rrggbb"` |
| `select` | list (`choices: [{ value, label }]`) | the chosen `value` |

> [!SCREENSHOT] widget-options-form
> The Hello score widget selected in the editor and, on the right, the **Options** section generated from its manifest:
> text field (Label), colour picker, "Show the accuracy" checkbox, number field (Text size) and list (Mode).

Each option has a `key`, a `label` (displayed) and a default value `default`.

## What your page receives

The address of the API and the options are passed in the URL, so that the **first display** is already correct:

- `?api=http://127.0.0.1:24051`: base of the API (the port can change);
- `&options={"color":"#f472b6","size":56}`: values of the options (defaults + the user's choices), as JSON.

When the user changes an option in the editor, the page is **not reloaded**: it receives a message:

```js
window.addEventListener("message", (event) => {
  if (event.data?.type === "yar:options") {
    const options = event.data.options; // all the values, up to date
    // ... update your display
  }
});
```

### Reading the data

```js
const params = new URLSearchParams(location.search);
const api = params.get("api");
let options = JSON.parse(params.get("options") || "{}");

const ws = new WebSocket(api.replace("http", "ws") + "/api/v1/ws?topics=gameplay&events=false");
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "hello" || msg.type === "state") {
    // msg.data.gameplay.score, .combo, .accuracy, .pp ... (see the [data model](DATA_MODEL.md))
  }
};
```

See the full example: [`examples/hello-score`](../examples/hello-score/index.html).

## Reading the keys

The keyboard keys and mouse buttons seen by the game are available in real time on their own WebSocket,
`/api/v1/inputs/ws` (see [Local API](API.md#real-time-inputs)): a custom key widget connects to it like to the main stream.

```js
const input = new WebSocket(api.replace("http", "ws") + "/api/v1/inputs/ws");
input.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "hello" || msg.type === "input") draw(msg.data.keys, msg.data.mouse);
};
```

As long as your widget keeps this WebSocket open, the application reads the keys in the game.

## Good practice

- **Transparent background**: `html, body { background: transparent; }`: the widget is drawn over the game. Add a text shadow
  (`text-shadow`) for legibility.
- **Fill the area**: the page occupies exactly the box of the widget; use relative units (`%`, `em`, `vw`) or CSS variables so that
  it adapts when resized.
- **Reconnection**: the API can be restarted (change of port, restart of the app); reopen the WebSocket with a delay when it closes.
- **Stay light**: the overlay is painted over the game. Avoid permanent animations or expensive effects (blurs, large shadows); a low
  refresh rate is enough for text.
- **Filter what you receive**: `?topics=gameplay,time` reduces the traffic; `&events=false` turns off the events if you do not need them.

## Security: what your widget can (and cannot) do

Each widget runs in an **isolated iframe** (`sandbox="allow-scripts"`, without `allow-same-origin`): its page has an "opaque"
origin. In practice:

- it runs its own JavaScript and can read the local API by `GET` / WebSocket;
- it **cannot** access the application, its internal commands, the browser storage, nor the other widgets;
- it cannot open a window or a form (no `allow-popups` / `allow-forms`).

A downloaded widget can however make network requests (like any web page):

> [!WARNING] **Only install widgets whose source you trust**, as you would for an OBS browser source.

## Sharing a widget

A widget is a simple folder: zip it, or publish it in a repository. To use it, drop it into the widgets folder and refresh the
palette. The layouts that use it are shared separately (JSON export from the editor); they reference the widget by its folder name.
