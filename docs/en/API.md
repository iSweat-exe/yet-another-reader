# Local API guide

Yet Another Reader reads the state of osu!lazer **read-only** and publishes it on a local API (HTTP + WebSocket).
It serves as a basis for building overlays: web components, OBS browser sources, scripts, etc.

- **Contract version**: `1` (prefix `/api/v1`). Changes that are not backward compatible increment this number;
  adding a field is not a breaking change.
- **Network**: listens only on `127.0.0.1` (never exposed to the local network).
- **Read-only**: no route modifies the game or the application. Everything is `GET`.
- **This documentation** is also served by the application: `GET /api/v1/docs` (the four pages one after the other).

## Contents

1. [The four pages of the API](#the-four-pages-of-the-api)
2. [Quick start](#quick-start)
3. [Settings](#settings)
4. [Conventions](#conventions)
5. [Real-time inputs](#real-time-inputs)
6. [REST or WebSocket?](#rest-or-websocket)
7. [Full examples](#full-examples)
8. [Notes and limits](#notes-and-limits)

---

## The four pages of the API

It is **a single API**, described in four pages. It can be read in two ways (REST and WebSocket) and publishes the same data.

| Page | It answers… |
| --- | --- |
| **Guide** (this page) | How do I start? Which settings? Which common rules? A complete example? |
| [REST routes](REST_API.md) | Which route should I call for which data? What does it answer, how does it fail? Each route has a usage example and a real response |
| [WebSocket](WEBSOCKET.md) | How do I receive the changes live: the state, the events, the keys? Each message has a real example |
| [Data model](DATA_MODEL.md) | What does each field contain (`beatmap`, `gameplay`, `user`…)? Which values can it take? |

---

## Quick start

1. Start **Yet Another Reader** then **osu!lazer** (the connection is automatic; it takes a few seconds the first time).
2. Check that the API responds:

> [!SCREENSHOT] curl-health
> Terminal with the command `curl http://127.0.0.1:24051/api/v1/health` and its response `{"ok":true,"uptimeMs":17023}`;
> below it, `curl .../api/v1/state` with the beginning of the JSON.

```bash
curl http://127.0.0.1:24051/api/v1/health
```

```json
{ "ok": true, "uptimeMs": 17023 }
```

3. Get the complete state, or open a WebSocket to be notified of every change:

```bash
curl http://127.0.0.1:24051/api/v1/state
```

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

> The default port is **24051**. It is changed in the application (the "Settings" card).

---

## Settings

These settings are changed in the application. They are saved to `settings.json`
(the application's configuration folder) and applied immediately.

| Setting | Default | Range | Effect |
| --- | --- | --- | --- |
| Read interval (`pollIntervalMs`) | `33` ms (≈ 30/s) | `8` – `5000` ms | Sampling frequency of the game's memory. It is also the maximum frequency of the WebSocket messages: a message is only sent **if the state has changed**. |
| Key read interval (`inputPollIntervalMs`) | `2` ms (≈ 500/s) | `1` – `100` ms | Sampling frequency of the held keys and mouse buttons ([see below](#real-time-inputs)). Much faster than the rest: keys must be real time. They are only read if someone listens to them. |
| Local API (`apiEnabled`) | enabled | — | Starts or stops the HTTP/WebSocket server. |
| Port (`apiPort`) | `24051` | `1024` – `65535` | Listening port on `127.0.0.1`. If the port is in use, the application displays the error. |

Choosing the interval: `16` ms for smooth animations at 60 Hz, `33` ms (default) for most overlays, `100`+ ms to save processor
time if you only display text.

The values in effect can be read via `GET /api/v1/settings` (read-only).

---

## Conventions

| Topic | Rule |
| --- | --- |
| Format | JSON UTF-8, keys in `camelCase`. |
| No value | `null` (e.g. `gameplay` outside a play). A route that returns "nothing" answers `200` with `null`, not `404`. |
| Time | Milliseconds (`...Ms`). The song time can be negative during the intro. |
| Percentages | Play `accuracy`: `0.0`–`1.0`. User `statistics.accuracy`: `0`–`100`. `health`: `0.0`–`1.0`. |
| Cache | `Cache-Control: no-store` on all responses: always fresh data. |
| CORS | All origins are allowed (`Access-Control-Allow-Origin: *`): a `file://` page, OBS or another port can call the API. |
| Errors | HTTP code + body `{"error": {"code": "...", "message": "..."}}`. |
| Version | `GET /api/v1` returns `apiVersion` (no trailing `/`: `/api/v1/` answers `404`). |

Error codes: `notFound` (404) · `invalidTopic` (400) · `io` (500). The details are in the [REST routes](REST_API.md#errors).

```json
{ "error": { "code": "notFound", "message": "no such endpoint; see /api/v1" } }
```

---

## Real-time inputs

The application also reads **the keyboard keys and mouse buttons that the game sees held**, which is what a key overlay
needs ("key overlay"). They are read **apart from the rest**, in a much faster loop (`inputPollIntervalMs`, `2` ms by default,
that is about 500 reads per second, against about 30 for the state of the play), and published **on every change**.

- To follow them live: the [keys WebSocket](WEBSOCKET.md#input-stream).
- To read them once: [`GET /inputs`](REST_API.md#get-inputs).
- In the application: the **Key** and **Keys per second** widgets of the editor.

> [!IMPORTANT] Keys are only read **as long as someone listens to them**: a client connected to `/inputs/ws`, a recent request
> to `/inputs` (for 5 seconds), or a key widget displayed in the overlay. Otherwise, no extra reading is done in the game.

It is the **game's own** input state: a key pressed while another window has the focus is not seen. During a **replay**, the replayed presses (the ones the game shows) appear too: they are derived from the ruleset's actions and your key bindings (Z/X by default). Your own keys are then **ignored** (the game ignores them too), so the two are not mixed. The names are those of
osu!framework (`osuTK.Input.Key` and `MouseButton`): letters (`Z`), digits (`Number1`), `Space`, `ShiftLeft`, `ControlLeft`,
`Escape`, `Tilde`, `Up`, `F1`, `Keypad0`…, and for the mouse `Left`, `Right`, `Middle`, `Button1`, `Button2`.

---

## REST or WebSocket?

| You want to… | Use |
| --- | --- |
| Display live (overlay, widget, OBS source) | [WebSocket](WEBSOCKET.md#state-stream) |
| Follow the keys with the lowest latency | [Keys WebSocket](WEBSOCKET.md#input-stream) |
| React to the start or the end of a play | [Events](WEBSOCKET.md#events) |
| Read a value once (script, `curl`) | [`GET /state`](REST_API.md#get-state) |
| Download the background or the music | [`/assets/*`](REST_API.md#beatmap-files) |
| Know whether something changed since your last call | `seq` of [`GET /snapshot`](REST_API.md#get-snapshot) |

---

## Full examples

### Example: read the state once (fetch)

```js
const BASE = "http://127.0.0.1:24051/api/v1";

const state = await (await fetch(`${BASE}/state`)).json();
if (!state.connected) {
  console.log("osu!lazer is not running");
} else if (state.gameplay) {
  console.log(`${state.gameplay.score} — ${(state.gameplay.accuracy * 100).toFixed(2)}%`);
}
```

### Example: WebSocket with automatic reconnection

```js
function connect(onState, onEvent) {
  const url = "ws://127.0.0.1:24051/api/v1/ws?topics=beatmap,gameplay,time,mods";
  let delay = 500;
  let ws;

  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => (delay = 500);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "hello" || msg.type === "state") onState(msg.data);
      else if (msg.type === "event") onEvent(msg.event);
    };
    // The application may restart: retry with an increasing delay.
    ws.onclose = () => setTimeout(open, (delay = Math.min(delay * 2, 8000)));
  };

  open();
  return () => ws?.close();
}

connect(
  (data) => console.log("score", data.gameplay?.score ?? "-"),
  (event) => event.name === "playEnded" && console.log("end of play:", event.reason),
);
```

### Example: OBS browser source (PP counter)

Create a file `pp.html`, then in OBS add a **Browser source** → *Local file*:

> [!SCREENSHOT] obs-browser-source
> OBS properties window for a browser source: the "Local file" checkbox ticked with the path of `pp.html`, width and
> height filled in; behind it, the OBS preview with the "188pp / FC: 231pp" counter in white.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  body { margin: 0; background: transparent; color: white; font: 700 48px system-ui; }
  small { font-size: 18px; opacity: 0.7; }
</style>
<div id="pp">–</div>
<small id="fc"></small>
<script>
  const el = document.getElementById("pp");
  const fc = document.getElementById("fc");
  function connect() {
    const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/ws?topics=gameplay&events=false");
    ws.onmessage = (e) => {
      const { type, data } = JSON.parse(e.data);
      if (type !== "hello" && type !== "state") return;
      const pp = data.gameplay?.pp;
      el.textContent = pp ? `${Math.round(pp.live)}pp` : "–";
      fc.textContent = pp ? `FC: ${Math.round(pp.fc)}pp` : "";
    };
    ws.onclose = () => setTimeout(connect, 1000);
  }
  connect();
</script>
```

### Example: background picture and progress bar

```js
const state = await (await fetch("http://127.0.0.1:24051/api/v1/state")).json();
const map = state.beatmap;
if (map?.assets.background) {
  document.body.style.backgroundImage =
    `url(http://127.0.0.1:24051/api/v1/assets/background?v=${map.sha256})`;
}
const progress = Math.min(1, Math.max(0, state.time.currentMs / map.lengthMs));
```

### Example: Python

```python
import json, urllib.request

with urllib.request.urlopen("http://127.0.0.1:24051/api/v1/gameplay") as r:
    play = json.load(r)
print("not playing" if play is None else f"{play['score']} pts, {play['accuracy']:.2%}")
```

### Example: curl

```bash
curl -s http://127.0.0.1:24051/api/v1/gameplay | jq '{score, combo, rank}'
curl -s http://127.0.0.1:24051/api/v1/assets/background -o background.jpg
curl -s -H "Range: bytes=0-99" http://127.0.0.1:24051/api/v1/assets/audio -D -
```

---

## Notes and limits

- **Read-only and local.** The application never writes to the game's memory, does not inject anything and does not send any
  key press. It only works with **osu!lazer** (not osu!stable).
- **Frequency.** The values are sampled every `pollIntervalMs` ms; an overlay cannot be more precise than this interval.
- **Exclusive fullscreen.** An overlay window is not displayed over a game in exclusive fullscreen; use borderless windowed mode
  (the default in lazer) or an OBS source.
- **osu!lazer updates.** The detected version is in `version` / `status.version`. If an update changes the internal organisation of
  the game, `status.phase` becomes `error` or some fields become `null` until the application is updated (it follows the names of the
  game's fields, not their memory addresses, and the same profile serves all known versions today).
- **Game stars vs calculated stars.** `beatmap.starRating` comes from osu!lazer (without mods); `difficulty.stars` is recalculated
  with the mods: a very slight difference is normal.
- **Contract stability.** The field names and enumeration values listed here are stable in `v1`. New fields may appear: ignore those
  you do not know.
