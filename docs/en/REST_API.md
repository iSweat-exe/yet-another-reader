# REST routes

Every REST route of the application, one by one: what it is for, how to call it, what it answers (**real responses**, obtained by
querying the server), and how it fails. To receive the changes live, see [WebSocket](WEBSOCKET.md). For the meaning of each field, see the
[data model](DATA_MODEL.md).

## In short

| | |
| --- | --- |
| **Address** | `http://127.0.0.1:24051/api/v1` (the port is set in the [settings](SETTINGS.md)) |
| **Network** | Only `127.0.0.1`: never reachable from another device |
| **Method** | `GET` everywhere. No route modifies the game or the application |
| **Format** | JSON UTF-8, keys in `camelCase`, no authentication |
| **Cache** | `Cache-Control: no-store` on all responses: always fresh data |
| **CORS** | All origins are allowed (`Access-Control-Allow-Origin: *`, `OPTIONS` preflight requests included): a `file://` page, OBS or another port can call the API |
| **Version** | `v1` in the URL. Adding a field is not a breaking change, removing one is |

> [!IMPORTANT] The API must be **enabled** in the [settings](SETTINGS.md). If the port is already in use, the error is shown in the
> **Status** tab.

In the JavaScript examples on this page, `API` is `"http://127.0.0.1:24051/api/v1"`.

> [!TIP] To try all these routes without starting osu!, start the sample server:
> `cargo run -p overlay-server --example sample`. It replays a fake play on port 24051 (stop the application first). See [Contributing](CONTRIBUTING.md).

> [!SCREENSHOT] sample-server
> Terminal after `cargo run -p overlay-server --example sample`: the line "sample API on http://127.0.0.1:24051/api/v1
> (Ctrl+C to stop)"; next to it, a browser on `http://127.0.0.1:24051/api/v1` showing the JSON index of the routes.

## All the routes

| Route | Response | What it gives |
| --- | --- | --- |
| [`GET /api/v1`](#get-apiv1) | object | Index: API version, list of routes |
| [`GET /health`](#get-health) | object | Liveness probe |
| [`GET /status`](#get-status) | object | State of the connection to osu!lazer |
| [`GET /settings`](#get-settings) | object | Read intervals and port (read-only) |
| [`GET /snapshot`](#get-snapshot) | object | `seq` + status + full state, in a single consistent call |
| [`GET /state`](#get-state) | object | **All** the state of the game |
| [`GET /screen`](#get-screen) | object | Current screen and play state |
| [`GET /beatmap`](#get-beatmap) | object or `null` | The selected beatmap |
| [`GET /difficulty`](#get-difficulty) | object or `null` | Stars and PP with the active mods |
| [`GET /difficulty-graph`](#get-difficulty-graph) | object or `null` | Difficulty along the song (graph) |
| [`GET /mods`](#get-mods) | object | Selected mods and mode |
| [`GET /time`](#get-time) | object or `null` | Position in the song |
| [`GET /user`](#get-user) | object or `null` | Logged-in user and their statistics |
| [`GET /gameplay`](#get-gameplay) | object or `null` | The play in progress |
| [`GET /pp`](#get-pp) | object or `null` | Live / FC / SS PP |
| [`GET /hit-errors`](#get-hit-errors) | object | UR and latest timing errors |
| [`GET /inputs`](#get-inputs) | object | Keys and mouse buttons held, **real time** |
| [`GET /assets/background`](#get-assetsbackground) | image | Background picture of the beatmap |
| [`GET /assets/audio`](#get-assetsaudio) | audio | Audio file of the beatmap (`Range` supported) |
| [`GET /images/{id}`](#get-imagesid) | image | A picture imported for the Image widget |
| [`GET /widgets`](#get-widgets) | array | Manifests of the community widgets |
| [`GET /docs`](#get-docs) | Markdown | The API documentation |
| `GET /ws` | WebSocket | State stream: see [WebSocket](WEBSOCKET.md#state-stream) |
| `GET /inputs/ws` | WebSocket | Keys stream: see [WebSocket](WEBSOCKET.md#input-stream) |

Outside `/api/v1`, [`GET /widgets/<folder>/<file>`](#get-widgetsfolderfile) serves the files of the
[community widgets](WIDGETS.md).

A route has **no variant with a trailing `/`**: `/api/v1/state/` answers `404`.

## Application and connection

### `GET /api/v1`

The index: the API version and the list of all the routes. Useful to discover the API from a browser.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1
```

```js
const index = await (await fetch(API)).json();
console.log(index.apiVersion, index.endpoints.length);
```

**Response example**: `200`

```json
{
  "name": "yet-another-reader",
  "apiVersion": 1,
  "appVersion": "0.1.0",
  "websocket": "/api/v1/ws",
  "inputsWebsocket": "/api/v1/inputs/ws",
  "documentation": "/api/v1/docs",
  "endpoints": [
    {
      "path": "/api/v1/health",
      "description": "Liveness probe."
    },
    {
      "path": "/api/v1/status",
      "description": "Connection state of the reader."
    },
    {
      "path": "...",
      "description": "... one entry per route ..."
    }
  ]
}
```

The fields: `name`, `apiVersion` (the contract number, `1`), `appVersion` (the version of the application), `websocket` and `inputsWebsocket` (the paths of the two WebSockets), `documentation` and `endpoints` (each route with its `description`, in English).

### `GET /health`

A liveness probe: answers as long as the application runs, whether the game is started or not.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/health
```

```js
const { ok, uptimeMs } = await (await fetch(`${API}/health`)).json();
```

**Response example**: `200`

```json
{
  "ok": true,
  "uptimeMs": 4235
}
```

`uptimeMs` is the time, in milliseconds, since the server started.

### `GET /status`

The state of the connection to osu!lazer.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/status
```

```js
const status = await (await fetch(`${API}/status`)).json();
if (status.phase !== "connected") console.log("osu!lazer not ready:", status.phase);
```

**Response example**: `200`

```json
{
  "phase": "connected",
  "version": "2026.1005.0-lazer+9a10d935",
  "profile": "embedded default",
  "connectMs": 5200
}
```

| `phase` | Meaning | Extra fields |
| --- | --- | --- |
| `waiting` | osu!lazer is not running | none |
| `connecting` | Game detected, finding the game's objects (a few seconds) | none |
| `connected` | Reading in progress | `version`, `profile`, `connectMs` (connection time) |
| `error` | Game running but unreadable | `message` |

When the game is not running:

```json
{"phase": "waiting"}
```

When it is unreadable:

```json
{ "phase": "error", "message": "root object is temporarily unreadable" }
```

### `GET /settings`

The values in effect, read-only (they are changed in the application).

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/settings
```

```js
const { pollIntervalMs, inputPollIntervalMs } = await (await fetch(`${API}/settings`)).json();
```

**Response example**: `200`

```json
{
  "pollIntervalMs": 33,
  "inputPollIntervalMs": 2,
  "port": 24099
}
```

| Field | Description |
| --- | --- |
| `pollIntervalMs` | Read interval of the game state, in ms |
| `inputPollIntervalMs` | Read interval of the keys, in ms |
| `port` | The listening port of the API |

## Game state

These routes read the same state, sampled every `pollIntervalMs` ms and published when it changes.
A `null` is **not** an error: the route answers `200` with `null` when the data does not exist.

### `GET /snapshot`

Status and state in **a single call**, so they are consistent with each other. `seq` increases at every published change: compare it with the value of your previous call to know whether something moved.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/snapshot
```

```js
const { seq, status, state } = await (await fetch(`${API}/snapshot`)).json();
```

**Response example**: `200`

```json
{
  "seq": 6,
  "updatedAt": 1792711593829,
  "status": {
    "phase": "connected",
    "version": "2026.1005.0-lazer+9a10d935",
    "profile": "embedded default",
    "connectMs": 5200
  },
  "state": {
    "connected": true,
    "screen": "playing",
    "...": "same as GET /state"
  }
}
```

`updatedAt` is the Unix time, in milliseconds, of the last change. `state` is exactly the response of [`GET /state`](#get-state) (shortened here).

### `GET /state`

The complete state of the game: everything the application reads. This is the route to call when you do not know which part you want.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/state
```

```js
const state = await (await fetch(`${API}/state`)).json();
if (state.gameplay) console.log(state.gameplay.score, state.gameplay.combo);
```

**Response example**: `200`

```json
{
  "connected": true,
  "version": "2026.1005.0-lazer+9a10d935",
  "screen": "playing",
  "screenType": "osu.Game.Screens.Play.SoloPlayer",
  "playing": "playing",
  "ruleset": "osu",
  "mods": [
    "HD",
    "DT"
  ],
  "beatmap": {
    "title": "hyperpop luv <3",
    "titleUnicode": "hyperpop luv <3",
    "artist": "whyalive x Denya8",
    "artistUnicode": "whyalive x Denya8",
    "version": "collab expert",
    "creator": "Daycore",
    "source": "",
    "tags": "hyperpop electronic",
    "onlineId": 4859840,
    "setOnlineId": 2279931,
    "status": "ranked",
    "ruleset": "osu",
    "md5": "f29e9bcdd8e4ab1b4ff1e7b19fdc338a",
    "sha256": "25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
    "lengthMs": 69166.0,
    "bpm": 180.0,
    "starRating": 5.28,
    "cs": 4.4,
    "ar": 9.2,
    "od": 8.5,
    "hp": 5.0,
    "sliderMultiplier": 1.9,
    "sliderTickRate": 1.0,
    "objectCount": 327,
    "previewTimeMs": 19649,
    "audioFile": "audio.mp3",
    "backgroundFile": "1.jpg",
    "paths": {
      "beatmap": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\2\\25\\25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
      "background": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\4\\4c\\4c2a4cef18bc3b44a53cdb177b297ffddfff974161747d3eeb9b8343d3199019",
      "audio": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\6\\64\\64702a5cf236ade456609f44b8ca5f00916f8ac4a49396b773086503d150f432"
    },
    "assets": {
      "background": true,
      "audio": true
    }
  },
  "difficulty": {
    "stars": 7.4,
    "maxCombo": 348,
    "pp95": 250.0,
    "pp98": 290.0,
    "pp99": 310.0,
    "pp100": 340.0,
    "firstObjectMs": 3200.0,
    "lastObjectMs": 176400.0
  },
  "difficultyGraph": {
    "durationMs": 180000.0,
    "overall": 7.4,
    "peakMs": 174750.0,
    "buckets": [0.15, 0.158, 0.167, 0.175, 0.183, 0.192, 0.2, 0.208, 0.217, 0.225, 0.233, 0.242, 0.25, 0.258, 0.267, 0.275, 0.283, 0.292, 0.62, 0.563, 0.644, 0.714, 0.767, 0.796, 0.797, 0.772, 0.722, 0.653, 0.573, 0.61, 0.686, 0.747, 0.787, 0.8, 0.786, 0.746, 0.684, 0.608, 0.575, 0.655, 0.723, 0.773, 0.798, 0.795, 0.766, 0.713, 0.641, 0.56, 0.622, 0.696, 0.755, 0.79, 0.8, 0.781, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.6, 0.607, 0.613, 0.616, 0.625, 0.635, 0.644, 0.651, 0.653, 0.651, 0.658, 0.675, 0.688, 0.696, 0.696, 0.689, 0.689, 0.711, 0.73, 0.741, 0.741, 0.731, 0.715, 0.745, 0.77, 0.785, 0.787, 0.775, 0.753, 0.774, 0.807, 0.828, 0.834, 0.822, 0.796, 0.8, 0.84, 0.869, 0.88, 0.87, 0.843, 0.821, 0.87, 0.908, 0.926, 0.92, 0.892, 0.849, 0.895, 0.943, 0.97, 0.97, 0.943, 0.897]
  },
  "time": {
    "currentMs": 8000.0,
    "running": true,
    "source": "gameplay"
  },
  "user": {
    "id": 1,
    "username": "iSweat",
    "countryCode": "FR",
    "avatarUrl": "https://a.ppy.sh/1",
    "apiState": "online",
    "statistics": {
      "globalRank": 130103,
      "countryRank": 4120,
      "pp": 4696.0,
      "accuracy": 98.12,
      "playCount": 24511,
      "totalHits": 4200000,
      "maxCombo": 2210,
      "rankedScore": 9000000000,
      "totalScore": 21000000000
    }
  },
  "spectators": [
    { "id": 2, "username": "peppy", "avatarUrl": "https://a.ppy.sh/2" },
    { "id": 124493, "username": "Cookiezi", "avatarUrl": "https://a.ppy.sh/124493" },
    { "id": 4787150, "username": "mrekk", "avatarUrl": "https://a.ppy.sh/4787150" }
  ],
  "spectatorCount": 3,
  "gameplay": {
    "score": 15400,
    "scoreWithoutMods": 11200,
    "accuracy": 0.9871,
    "combo": 14,
    "maxCombo": 21,
    "beatmapMaxCombo": 348,
    "rank": "S",
    "hits": {
      "great": 14,
      "ok": 2,
      "meh": 0,
      "miss": 0
    },
    "results": {
      "Great": 14,
      "LargeTickHit": 15,
      "Miss": 0,
      "Ok": 2,
      "SliderTailHit": 45
    },
    "health": 0.94,
    "paused": false,
    "failed": false,
    "pp": {
      "live": 104.7,
      "fc": 156.7,
      "ss": 255.4
    },
    "unstableRate": 144.6,
    "hitErrors": [
      -3.78,
      -3.32,
      -1.24,
      4.5,
      8.1
    ]
  }
}
```

The fields are described in the [data model](DATA_MODEL.md#gamestate-state). Response when osu!lazer is not running (`connected` is `false`, everything else is empty):

```json
{
  "connected": false,
  "version": null,
  "screen": "unknown",
  "screenType": "",
  "playing": "notPlaying",
  "ruleset": null,
  "mods": [],
  "beatmap": null,
  "difficulty": null,
  "difficultyGraph": null,
  "time": null,
  "user": null,
  "spectators": [],
  "spectatorCount": 0,
  "gameplay": null
}
```

### `GET /screen`

The visible screen and the play state, without the rest: enough to know "where is the player".

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/screen
```

```js
const { screen, playing } = await (await fetch(`${API}/screen`)).json();
```

**Response example**: `200`

```json
{
  "connected": true,
  "screen": "playing",
  "screenType": "osu.Game.Screens.Play.SoloPlayer",
  "playing": "playing"
}
```

`screen` is `unknown`, `menu`, `songSelect`, `playing`, `results`, `editor`, `multiplayer` or `other`. `playing` is `notPlaying`, `break` or `playing`. See [`Screen` and `PlayingState`](DATA_MODEL.md#gamestate-state).

Game not running: {"connected": false, "screen": "unknown", "screenType": "", "playing": "notPlaying"}.

### `GET /beatmap`

The selected beatmap (the one played during a play).

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/beatmap
```

```js
const map = await (await fetch(`${API}/beatmap`)).json();
if (map) console.log(`${map.artist} - ${map.title} [${map.version}]`);
```

**Response example**: `200`

```json
{
  "title": "hyperpop luv <3",
  "titleUnicode": "hyperpop luv <3",
  "artist": "whyalive x Denya8",
  "artistUnicode": "whyalive x Denya8",
  "version": "collab expert",
  "creator": "Daycore",
  "source": "",
  "tags": "hyperpop electronic",
  "onlineId": 4859840,
  "setOnlineId": 2279931,
  "status": "ranked",
  "ruleset": "osu",
  "md5": "f29e9bcdd8e4ab1b4ff1e7b19fdc338a",
  "sha256": "25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
  "lengthMs": 69166.0,
  "bpm": 180.0,
  "starRating": 5.28,
  "cs": 4.4,
  "ar": 9.2,
  "od": 8.5,
  "hp": 5.0,
  "sliderMultiplier": 1.9,
  "sliderTickRate": 1.0,
  "objectCount": 327,
  "previewTimeMs": 19649,
  "audioFile": "audio.mp3",
  "backgroundFile": "1.jpg",
  "paths": {
    "beatmap": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\2\\25\\25d51b11477f583d2df7f9c61414dbe917e3ddd2889900e1a06322e3a1f3d694",
    "background": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\4\\4c\\4c2a4cef18bc3b44a53cdb177b297ffddfff974161747d3eeb9b8343d3199019",
    "audio": "C:\\Users\\you\\AppData\\Roaming\\osu\\files\\6\\64\\64702a5cf236ade456609f44b8ca5f00916f8ac4a49396b773086503d150f432"
  },
  "assets": {
    "background": true,
    "audio": true
  }
}
```

`null` when no beatmap is selected. The fields are described in [`Beatmap`](DATA_MODEL.md#beatmap). The `paths` are the **local** paths of the beatmap files; `assets` says whether the background and the audio can be downloaded with [`/assets/background`](#get-assetsbackground) and [`/assets/audio`](#get-assetsaudio).

### `GET /difficulty`

The difficulty of the beatmap **with the active mods**, and what it is worth at 95 / 98 / 99 / 100 % accuracy.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/difficulty
```

```js
const d = await (await fetch(`${API}/difficulty`)).json();
if (d) console.log(`${d.stars.toFixed(2)}★, ${Math.round(d.pp98)}pp at 98 %`);
```

**Response example**: `200`

```json
{
  "stars": 7.4,
  "maxCombo": 348,
  "pp95": 250.0,
  "pp98": 290.0,
  "pp99": 310.0,
  "pp100": 340.0,
  "firstObjectMs": 3200.0,
  "lastObjectMs": 176400.0
}
```

`null` if no beatmap is selected, or if its `.osu` file cannot be found. See [`Difficulty`](DATA_MODEL.md#difficulty).

### `GET /difficulty-graph`

The difficulty of the beatmap **along the whole song**, with the active mods: 120 bars normalised to the map itself
(`0` = calm section, `1` = the hardest of this map), to draw a graph. It is computed once per map, mods and speed, off the
reading thread: the response is `null` for that fraction of a second.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/difficulty-graph
```

```js
const g = await (await fetch(`${API}/difficulty-graph`)).json();
if (g) console.log(`${g.overall.toFixed(2)}★, hardest section at ${Math.round(g.peakMs / 1000)} s`);
```

**Response example**: `200`

```json
{
  "durationMs": 180000.0,
  "overall": 7.4,
  "peakMs": 174750.0,
  "buckets": [
    0.15, 0.158, 0.167, 0.175, 0.183, 0.192, 0.2, 0.208, 0.217, 0.225, 0.233, 0.242, 0.25, 0.258, 0.267,
    0.275, 0.283, 0.292, 0.62, 0.563, 0.644, 0.714, 0.767, 0.796, 0.797, 0.772, 0.722, 0.653, 0.573, 0.61,
    0.686, 0.747, 0.787, 0.8, 0.786, 0.746, 0.684, 0.608, 0.575, 0.655, 0.723, 0.773, 0.798, 0.795, 0.766,
    0.713, 0.641, 0.56, 0.622, 0.696, 0.755, 0.79, 0.8, 0.781, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12,
    0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.6, 0.607, 0.613, 0.616, 0.625, 0.635, 0.644, 0.651, 0.653,
    0.651, 0.658, 0.675, 0.688, 0.696, 0.696, 0.689, 0.689, 0.711, 0.73, 0.741, 0.741, 0.731, 0.715, 0.745,
    0.77, 0.785, 0.787, 0.775, 0.753, 0.774, 0.807, 0.828, 0.834, 0.822, 0.796, 0.8, 0.84, 0.869, 0.88,
    0.87, 0.843, 0.821, 0.87, 0.908, 0.926, 0.92, 0.892, 0.849, 0.895, 0.943, 0.97, 0.97, 0.943, 0.897
  ]
}
```

`null` if no beatmap is selected, if its `.osu` file cannot be found or until the computation is done. See [`DifficultyGraph`](DATA_MODEL.md#difficultygraph).

### `GET /mods`

The game mode and the selected mods.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/mods
```

```js
const { ruleset, mods } = await (await fetch(`${API}/mods`)).json();
console.log(ruleset, mods.join("") || "NM");
```

**Response example**: `200`

```json
{
  "ruleset": "osu",
  "mods": [
    "HD",
    "DT"
  ]
}
```

`mods` contains the mod acronyms (`HD`, `DT`, `HR`…); the list is empty when there is no mod. Game not running: {"ruleset": null, "mods": []}.

### `GET /time`

The position in the song.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/time
```

```js
const t = await (await fetch(`${API}/time`)).json();
if (t) console.log((t.currentMs / 1000).toFixed(1) + " s");
```

**Response example**: `200`

```json
{
  "currentMs": 8000.0,
  "running": true,
  "source": "gameplay"
}
```

`source` is `gameplay` during a play (the game clock) and `global` otherwise (the music preview). `running` is `false` when paused. `currentMs` can be **negative** during the intro. `null` when the game is not readable. See [`Time`](DATA_MODEL.md#time).

### `GET /user`

The user logged in to osu!lazer and their statistics (those of their main mode).

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/user
```

```js
const user = await (await fetch(`${API}/user`)).json();
if (user) console.log(user.username, user.statistics?.pp);
```

**Response example**: `200`

```json
{
  "id": 1,
  "username": "iSweat",
  "countryCode": "FR",
  "avatarUrl": "https://a.ppy.sh/1",
  "apiState": "online",
  "statistics": {
    "globalRank": 130103,
    "countryRank": 4120,
    "pp": 4696.0,
    "accuracy": 98.12,
    "playCount": 24511,
    "totalHits": 4200000,
    "maxCombo": 2210,
    "rankedScore": 9000000000,
    "totalScore": 21000000000
  }
}
```

`null` if nobody is logged in. See [`User`](DATA_MODEL.md#user).

> [!WARNING] These fields identify the player (user name, id, avatar). The API is only reachable from this machine, but avoid displaying them if you share your stream by accident.

### `GET /gameplay`

The play in progress: score, combo, accuracy, judgement counters, health, PP, UR and timing errors.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/gameplay
```

```js
const play = await (await fetch(`${API}/gameplay`)).json();
if (play) console.log(play.score, play.combo, `${(play.accuracy * 100).toFixed(2)}%`);
```

**Response example**: `200`

```json
{
  "score": 15400,
  "scoreWithoutMods": 11200,
  "accuracy": 0.9871,
  "combo": 14,
  "maxCombo": 21,
  "beatmapMaxCombo": 348,
  "rank": "S",
  "hits": {
    "great": 14,
    "ok": 2,
    "meh": 0,
    "miss": 0
  },
  "results": {
    "Great": 14,
    "LargeTickHit": 15,
    "Miss": 0,
    "Ok": 2,
    "SliderTailHit": 45
  },
  "health": 0.94,
  "paused": false,
  "failed": false,
  "pp": {
    "live": 104.7,
    "fc": 156.7,
    "ss": 255.4
  },
  "unstableRate": 144.6,
  "hitErrors": [
    -3.78,
    -3.32,
    -1.24,
    4.5,
    8.1
  ]
}
```

**`null` outside a play** (menu, selection, results…): this is the normal case, not an error. See [`Gameplay`](DATA_MODEL.md#gameplay).

### `GET /pp`

The PP of the play: live, at FC and at SS.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/pp
```

```js
const pp = await (await fetch(`${API}/pp`)).json();
if (pp) console.log(`${Math.round(pp.live)}pp (FC: ${Math.round(pp.fc)}pp)`);
```

**Response example**: `200`

```json
{
  "live": 104.7,
  "fc": 156.7,
  "ss": 255.4
}
```

`null` outside a play, or if the PP could not be calculated. See [PP and stars](DATA_MODEL.md#pp-and-stars) for the meaning of the three values.

### `GET /hit-errors`

The unstable rate and the latest timing errors (in milliseconds, negative = early), from the oldest to the most recent.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/hit-errors
```

```js
const { unstableRate, errors } = await (await fetch(`${API}/hit-errors`)).json();
console.log(unstableRate?.toFixed(1) ?? "–", errors.length);
```

**Response example**: `200`

```json
{
  "unstableRate": 144.6,
  "errors": [
    -3.78,
    -3.32,
    -1.24,
    4.5,
    8.1
  ]
}
```

Outside a play, the route always answers `200`:

```json
{"unstableRate": null, "errors": []}
```

`unstableRate` is also `null` before the second hit. The list keeps at most the last 128 errors.

## Inputs

### `GET /inputs`

The keyboard keys and mouse buttons that **the game sees held at this moment**.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/inputs
```

```js
const { keys, mouse } = await (await fetch(`${API}/inputs`)).json();
console.log(keys.includes("Z") ? "Z held" : "Z released");
```

**Response example**: `200`

```json
{
  "seq": 4,
  "at": 1792711593829,
  "keys": [
    "Z"
  ],
  "mouse": [
    "Left"
  ]
}
```

| Field | Description |
| --- | --- |
| `seq` | Increases at every change of keys (its own counter, distinct from the one of `/snapshot`) |
| `at` | Unix time, in milliseconds, of the last change |
| `keys` | Keyboard keys held: `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… (empty if nothing is held) |
| `mouse` | Mouse buttons held: `Left`, `Right`, `Middle`, `Button1`, `Button2` |

Without a connected client, keys are not read in the game: **a call to this route starts reading them for 5 seconds**.
So you can call it in a loop; the first response may still be empty. For the lowest latency, prefer the [keys WebSocket](WEBSOCKET.md#input-stream).

Game not running:

```json
{"seq": 0, "at": 1792711488033, "keys": [], "mouse": []}
```

## Beatmap files

The background and the music of the **selected** beatmap, read from osu!lazer's storage, with the right `Content-Type` (depending on the extension of the beatmap file: `image/jpeg`, `image/png`, `audio/mpeg`…). `Range` requests are supported (the response is then `206 Partial Content`).

### `GET /assets/background`

The background picture of the selected beatmap.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/assets/background -o background.jpg
```

```html
<img src="http://127.0.0.1:24051/api/v1/assets/background?v=SHA256_OF_THE_BEATMAP" />
```

```js
const map = (await (await fetch(`${API}/beatmap`)).json());
if (map?.assets.background) {
  document.body.style.backgroundImage = `url(${API}/assets/background?v=${map.sha256})`;
}
```

**Response example**: `200`, `Content-Type: image/jpeg`, `Accept-Ranges: bytes`, `Cache-Control: no-store`, then the bytes of the picture.

> [!TIP] The background changes with the beatmap but the URL stays the same: add a parameter that changes with it
> (for example `?v=<sha256>`) so that the browser does not show the old picture.

**Errors**

| Code | `error.code` | `error.message` |
| --- | --- | --- |
| `404` | `notFound` | `no beatmap is selected`: no beatmap is selected |
| `404` | `notFound` | `the beatmap has no such file`: the beatmap does not have this file (see `beatmap.assets`) |
| `404` | `notFound` | `lazer's data directory was not found`: osu!lazer's data folder cannot be found |
| `404` | `notFound` | `the file is missing from lazer's storage`: the file is missing from the storage |
| `500` | `io` | Error reading the file |

Example, no beatmap selected:

```json
{"error": {"code": "notFound", "message": "no beatmap is selected"}}
```

### `GET /assets/audio`

The audio file of the selected beatmap.

**Usage example**

```bash
curl -s -H "Range: bytes=0-99" http://127.0.0.1:24051/api/v1/assets/audio -D - -o part.bin
```

```js
const audio = new Audio(`${API}/assets/audio`);
audio.currentTime = 30; // seek in the music thanks to Range requests
audio.play();
```

**Response example**: `200`, `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`, then the file. With the header `Range: bytes=0-3`:

```
HTTP/1.1 206 Partial Content
content-type: audio/mpeg
content-range: bytes 0-3/20
accept-ranges: bytes
```

The errors are those of [`/assets/background`](#get-assetsbackground).

## Imported images

### `GET /images/{id}`

A picture the user imported for the [Image](BUILTIN_WIDGETS.md#miscellaneous) widget (the **Import an image…** button of
the editor), or a **font** imported for a widget's text (`style.font`, see [Layout](LAYOUT.md)), served with the right
`Content-Type` (`font/woff2`…). The file is copied into the app's data under a name that is a **hash of
its content**: the `id` (`<32 hexadecimal digits>.<png|jpg|gif|webp|svg|ttf|otf|woff|woff2>`) is the only thing a layout keeps, and the same
picture imported twice has the same `id`. Only **PNG, JPEG, GIF, WebP, SVG** (pictures) or **TTF, OTF, WOFF, WOFF2** (fonts) files of 15 MB at most are accepted (the
type is checked on the content, not on the extension; an SVG with a script is refused). An `id` that does not have exactly
this shape answers `404`: no other file can be reached.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/images/cb27a70bc0fd6a4607c0b158be921383.png -o image.png
```

```html
<img src="http://127.0.0.1:24051/api/v1/images/cb27a70bc0fd6a4607c0b158be921383.png" />
```

```js
const layoutOptions = { image: "cb27a70bc0fd6a4607c0b158be921383.png" }; // what an Image widget keeps
const src = `${API}/images/${layoutOptions.image}`;
```

**Response example**: `200`, `Content-Type: image/png`, `Cache-Control: public, max-age=31536000, immutable` (the `id` never
changes content), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`
(an SVG opened on its own runs nothing), then the bytes of the picture.

**Errors**

| Code | `error.code` | `error.message` |
| --- | --- | --- |
| `404` | `notFound` | `no such picture`: the `id` is invalid, the picture was deleted, or the app has no images folder |
| `500` | `io` | File read error |

Example:

```json
{"error": {"code": "notFound", "message": "no such picture"}}
```

## Widgets and documentation

### `GET /widgets`

The [community widgets](WIDGETS.md) found in the widgets folder: their manifests, with the `id` (the folder name) added. Folders without a valid `manifest.json`, or whose entry page is missing, are ignored.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/widgets
```

```js
const widgets = await (await fetch(`${API}/widgets`)).json();
console.log(widgets.map((w) => w.name));
```

**Response example**: `200`

```json
[
  {
    "id": "hello-score",
    "name": "Hello score",
    "version": "1.0.0",
    "author": "Toi",
    "description": "Affiche le score en direct.",
    "entry": "index.html",
    "defaultSize": {
      "w": 420,
      "h": 140
    },
    "options": [
      {
        "key": "color",
        "label": "Couleur",
        "type": "color",
        "default": "#f472b6",
        "min": null,
        "max": null,
        "choices": []
      }
    ]
  }
]
```

An empty array (`[]`) when there is no widget. The fields are those of the [`manifest.json`](WIDGETS.md); options without a value are `null` (`min`, `max`) or `[]` (`choices`).

### `GET /docs`

The API documentation in Markdown: the guide, the routes, the WebSocket and the data model, one after the other.

**Usage example**

```bash
curl http://127.0.0.1:24051/api/v1/docs
```

```js
const markdown = await (await fetch(`${API}/docs`)).text();
```

**Response example**: `200`, `Content-Type: text/markdown; charset=utf-8`, then the text. The application serves its documentation **in French** (the first line is the one of the French guide):

```
# Guide de l'API locale
...
```

### `GET /widgets/<folder>/<file>`

A file of a community widget (outside `/api/v1`). Only the files **of the widgets folder** are served, with the `Content-Type` of their extension.

**Usage example**

```bash
curl http://127.0.0.1:24051/widgets/hello-score/index.html
```

```js
const page = await (await fetch("http://127.0.0.1:24051/widgets/hello-score/index.html")).text();
```

**Response example**: `200`, `Content-Type: text/html`, then the file. A file that does not exist, or an attempt to leave the folder
(`..`), answers `404` with an empty body.

## Errors

An API error returns an HTTP code and a JSON body always of the same shape:

```json
{ "error": { "code": "notFound", "message": "no such endpoint; see /api/v1" } }
```

| HTTP | `error.code` | When | Verified example |
| --- | --- | --- | --- |
| `404` | `notFound` | Unknown route (`/api/v1/nope`, `/api/v1/state/`, `/`…) | `{"error":{"code":"notFound","message":"no such endpoint; see /api/v1"}}` |
| `404` | `notFound` | Beatmap file unavailable | see [Beatmap files](#beatmap-files) |
| `400` | `invalidTopic` | An invalid `topics` when opening the [state WebSocket](WEBSOCKET.md#connection) | `unknown topic "nope"; valid topics: …` |
| `500` | `io` | Error reading a file | |

Other responses are **not** JSON:

- a method other than `GET` receives `405 Method Not Allowed` with an empty body;
- a malformed WebSocket request (without the `Upgrade` header, or with `events=maybe`) receives `400` with a text message;
- a missing widget file receives `404` with an empty body.

When the API cannot be reached (connection refused), it is **turned off**, the **port** is different from the one you call, or the
application is not running.

## Using the API well

- **Display live**: open a [WebSocket](WEBSOCKET.md) rather than polling. The state arrives when it changes.
- **A one-off script**: `GET /state`, or `GET /snapshot` to get a consistent status and state.
- **Polling anyway**: there is no point calling more often than `pollIntervalMs` (33 ms by default), the state does not change faster.
  Use `seq` to detect a change.
- **The keys**: `GET /inputs` works in a loop (5 seconds of reading per call), but the keys WebSocket is more responsive.
- **Reconnection**: the API restarts when you change the port or turn it off; retry with an increasing delay.

```python
import json, urllib.request

with urllib.request.urlopen("http://127.0.0.1:24051/api/v1/state") as response:
    state = json.load(response)
print(state["screen"], state["beatmap"] and state["beatmap"]["title"])
```
