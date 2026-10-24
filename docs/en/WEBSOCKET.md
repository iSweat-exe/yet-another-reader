# WebSocket

The application publishes **three streams** live. A WebSocket is **pushed**: you receive the change at the moment it is read,
without polling. This is the right choice for anything displayed on screen. The messages on this page are **real messages**,
obtained by connecting to the server. For the routes to poll, see [REST routes](REST_API.md).

| Stream | Address | Content | Rate |
| --- | --- | --- | --- |
| **State** | `ws://127.0.0.1:24051/api/v1/ws` | The state of the game, the connection status, the events | Sampled every `pollIntervalMs` (33 ms), published on every change |
| **Keys** | `ws://127.0.0.1:24051/api/v1/inputs/ws` | The keyboard keys and mouse buttons held | Sampled every `inputPollIntervalMs` (2 ms), published on every change |
| **Events** | `ws://127.0.0.1:24051/api/v1/events/ws` | Only the events (a note hit, a miss, a play starting…), no state | Published the moment they happen |

The streams are **separate**: the keys are read much faster than the rest and do not slow down the state stream, and the events stream
never sends the state. You can open whichever you want, or several.

> [!IMPORTANT] Only `127.0.0.1` is listened to, without authentication: the WebSocket is only reachable from the player's machine.
> Any origin (a `file://` page, an OBS browser source, another port) can connect to it.

## Common rules

- The messages are **text frames** containing JSON: an object with a `type` field. The **order of the keys is not guaranteed**
  (it is alphabetical in practice): read the fields by their name.
- On connection, the server **always** sends a `hello` message with the current state. You do not need to call the REST API to
  initialise yourself.
- Nothing is sent while nothing changes.
- `seq` is a counter that increases at every change: a gap in the sequence tells you that a message was skipped. Each stream has
  its **own** counter (the events stream reuses the state's: an event carries the `seq` of the `state` that caused it).
- The client can send a text message containing `"ping"` (for example `{ "type": "ping" }`): the server answers
  `{ "type": "pong" }`. Everything else (invalid JSON, other types, binary frames) is **ignored**.
- Numbers are written as in the REST responses (`9.2`, not `9.199999809265137`).
- If your client is too slow, the intermediate messages are skipped and it directly receives the up-to-date state: no queue
  grows, no delay to catch up. The events stream has no state to send back: a client that is too slow simply **misses** some
  events, with no resynchronisation message.
- The server is **closed cleanly**: when you close the connection, it answers (normal closure); when the application stops it
  (port change, API turned off), it sends a close code `1001` (*going away*) then cuts the connection. See
  [Closing and reconnection](#closing-and-reconnection).

## State stream

`ws://127.0.0.1:24051/api/v1/ws`

### Connection

| Parameter | Value | Effect |
| --- | --- | --- |
| `topics` | comma-separated list | Keeps only these keys in `data` (the `connected` key is always included). Empty or absent: everything |
| `events` | `true` or `false` | `false` turns off the `event` messages (by default: enabled) |

The valid `topics` are `connected`, `version`, `screen`, `screenType`, `playing`, `ruleset`, `mods`, `beatmap`, `difficulty`,
`difficultyGraph`, `time`, `user`, `spectators`, `spectatorCount` and `gameplay`. The `personalBest` key of the state is **not** a topic: with `?topics=` it is not sent (without `topics`, you receive it).

```
ws://127.0.0.1:24051/api/v1/ws?topics=gameplay,time&events=false
```

Filtering reduces the traffic: a score overlay does not need to receive the beatmap at every update.

**Refusal on opening**: the response is an HTTP response `400`, not a WebSocket.

| Case | Response |
| --- | --- |
| An unknown topic (`?topics=beatmap,nope`) | `400`, JSON: `{"error":{"code":"invalidTopic","message":"unknown topic \"nope\"; valid topics: connected, version, screen, screenType, playing, ruleset, mods, beatmap, difficulty, difficultyGraph, time, user, spectators, spectatorCount, gameplay"}}` |
| `events` other than `true` or `false` (`?events=maybe`) | `400`, text: `Failed to deserialize query string: events: provided string was not `true` or `false`` |
| A request without the `Upgrade` header (for example from a browser) | `400`, text: `Connection header did not include 'upgrade'` |

### Usage example

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/ws?topics=gameplay,time");

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "hello":
    case "state": {
      const play = msg.data.gameplay; // null outside a play
      if (play) console.log(play.score, play.combo);
      break;
    }
    case "status":
      console.log("game connection:", msg.data.phase);
      break;
    case "event":
      console.log("event:", msg.event.name);
      break;
  }
};
```

```bash
npx wscat -c "ws://127.0.0.1:24051/api/v1/ws?topics=time&events=false"
```

> [!SCREENSHOT] wscat-stream
> Terminal with `npx wscat -c "ws://127.0.0.1:24051/api/v1/ws?topics=time&events=false"`: "Connected", the `hello`
> message, then several `state` messages scrolling with `time.currentMs` increasing.

### Messages received

| `type` | When | Fields |
| --- | --- | --- |
| [`hello`](#hello) | On connection | `apiVersion`, `seq`, `settings`, `status`, `data` |
| [`state`](#state) | The state changed | `seq`, `data` |
| [`status`](#status) | The connection to osu!lazer changed | `seq`, `data` |
| [`event`](#event) | A transition just happened | `seq`, `event` |
| [`pong`](#pong) | Answer to your `ping` | |

#### `hello`

Sent **once**, as soon as you connect: the current state, so that you have nothing to ask for.

```json
{
  "apiVersion": 1,
  "data": {
    "connected": true,
    "screen": "songSelect",
    "...": "the full state (like GET /state), filtered by topics"
  },
  "seq": 6,
  "settings": {
    "inputPollIntervalMs": 2,
    "pollIntervalMs": 33,
    "port": 24099
  },
  "status": {
    "connectMs": 5200,
    "phase": "connected",
    "profile": "embedded default",
    "version": "2026.1005.0-lazer+9a10d935"
  },
  "type": "hello"
}
```

| Field | Description |
| --- | --- |
| `apiVersion` | Version of the contract (`1`) |
| `seq` | The counter at the time of the connection |
| `settings` | The read [settings](REST_API.md#get-settings) in effect |
| `status` | The connection status, as [`GET /status`](REST_API.md#get-status) |
| `data` | The complete state, as [`GET /state`](REST_API.md#get-state), **filtered by `topics`** |

#### `state`

The state changed. `data` **always contains the whole state** (filtered by `topics`), never a difference: replace your state
with `data`. Example with `?topics=gameplay,time`:

```json
{
  "data": {
    "connected": true,
    "gameplay": {
      "accuracy": 0.9871,
      "beatmapMaxCombo": 348,
      "combo": 56,
      "failed": false,
      "health": 0.94,
      "hitErrors": [
        -3.78,
        -3.32,
        -1.24,
        4.5,
        8.1
      ],
      "hits": {
        "great": 56,
        "meh": 0,
        "miss": 1,
        "ok": 8
      },
      "maxCombo": 56,
      "paused": false,
      "pp": {
        "fc": 156.7,
        "live": 110.7,
        "ss": 255.4
      },
      "rank": "S",
      "results": {
        "Great": 56,
        "LargeTickHit": 15,
        "Miss": 1,
        "Ok": 8,
        "SliderTailHit": 45
      },
      "score": 61600,
      "scoreWithoutMods": 44800,
      "unstableRate": 144.6
    },
    "time": {
      "currentMs": 32000,
      "running": true,
      "source": "gameplay"
    }
  },
  "seq": 30,
  "type": "state"
}
```

A `state` message is sent every time the **complete state** changed, even if the `topics` you follow are the same as in the
previous message (the song time, for example, advances at every read). `topics` reduces the **size** of the messages, not their
number: compare with your last state yourself if you want to ignore repetitions.

#### `status`

The connection to osu!lazer changed (the game was started, closed, became unreadable…). `data` is the same object as
[`GET /status`](REST_API.md#get-status).

```json
{
  "data": {
    "phase": "connecting"
  },
  "seq": 16,
  "type": "status"
}
```

#### `event`

A transition just happened. An `event` has the **same `seq`** as the `state` that caused it, and arrives **right after** it.

```json
{
  "event": {
    "from": "playing",
    "name": "screenChanged",
    "screenType": "osu.Game.Screens.Ranking.SoloResultsScreen",
    "to": "results"
  },
  "seq": 14,
  "type": "event"
}
```

All the events are listed in [Events](#events). Turn them off with `?events=false` if you do not need them.

#### `pong`

The answer to a `ping` from the client.

```json
{
  "type": "pong"
}
```

### Events

The events describe **transitions**, more practical than comparing two states. They are sent by the state WebSocket (unless `?events=false`) and by the [events WebSocket](#event-stream), never by REST,
in the `event` field of an `event` message. Each event has a `name`. When several events arrive at the same time, they are sent in
this order: `connectionChanged`, `screenChanged`, `beatmapChanged`, `modsChanged`, then `playStarted` or `playEnded`, then `paused`,
`resumed` or `failed`, then the notes: `hit` (`great`, then `ok`, then `meh`), `miss`, and finally `comboBreak`.

| `name` | Triggered when | Extra fields |
| --- | --- | --- |
| `connectionChanged` | osu!lazer is connected or has gone away | `connected` |
| `screenChanged` | The visible screen changes | `from`, `to`, `screenType` |
| `beatmapChanged` | Another beatmap is selected | `beatmap` (`null` if the selection is cleared) |
| `modsChanged` | The selected mods change | `mods` |
| `playStarted` | A play starts | `beatmap`, `mods` |
| `playEnded` | The play screen is closed | `reason`, `beatmap`, `mods`, `result` |
| `paused` | The play is paused | |
| `resumed` | The play resumes | |
| `failed` | The player fails | |
| `hit` | Notes were hit since the last sample | `judgement`, `count`, `errorsMs`, `combo` |
| `miss` | Notes were missed since the last sample | `count`, `combo` |
| `comboBreak` | The combo just fell | `lost` |

> [!TIP] There is no separate "map start" or "map end" event: they are `playStarted` and `playEnded`
> (`reason` is `failed`, `completed` or `quit`).
The examples below are complete `event` messages. The `beatmap` and `result` objects are shortened (they are the complete
[`Beatmap`](DATA_MODEL.md#beatmap) and [`Gameplay`](DATA_MODEL.md#gameplay) objects).

**`connectionChanged`**

```json
{
  "event": {
    "name": "connectionChanged",
    "connected": true
  },
  "seq": 1,
  "type": "event"
}
```

**`screenChanged`**

```json
{
  "event": {
    "from": "playing",
    "name": "screenChanged",
    "screenType": "osu.Game.Screens.Ranking.SoloResultsScreen",
    "to": "results"
  },
  "seq": 14,
  "type": "event"
}
```

**`beatmapChanged`**

```json
{
  "event": {
    "name": "beatmapChanged",
    "beatmap": {
      "title": "hyperpop luv <3",
      "version": "collab expert",
      "...": "full Beatmap object"
    }
  },
  "seq": 2,
  "type": "event"
}
```

**`modsChanged`**

```json
{
  "event": {
    "name": "modsChanged",
    "mods": [
      "HD",
      "DT"
    ]
  },
  "seq": 3,
  "type": "event"
}
```

**`playStarted`**

```json
{
  "event": {
    "beatmap": {
      "title": "hyperpop luv <3",
      "version": "collab expert",
      "...": "full Beatmap object"
    },
    "mods": [
      "HD",
      "DT"
    ],
    "name": "playStarted"
  },
  "seq": 23,
  "type": "event"
}
```

**`playEnded`**: `reason` is `failed` (the play was failed), `completed` (the results screen follows) or `quit` (back to the menu, to
selection, or *retry*). `result` contains the **last values** of the play.

```json
{
  "event": {
    "beatmap": {
      "title": "hyperpop luv <3",
      "version": "collab expert",
      "...": "full Beatmap object"
    },
    "mods": [
      "HD",
      "DT"
    ],
    "name": "playEnded",
    "reason": "completed",
    "result": {
      "score": 69300,
      "accuracy": 0.9871,
      "combo": 63,
      "maxCombo": 63,
      "rank": "S",
      "hits": {
        "great": 63,
        "meh": 0,
        "miss": 1,
        "ok": 9
      },
      "...": "full Gameplay object"
    }
  },
  "seq": 14,
  "type": "event"
}
```

**`paused`** and **`resumed`**

```json
{
  "event": {
    "name": "paused"
  },
  "seq": 10,
  "type": "event"
}
```

```json
{
  "event": {
    "name": "resumed"
  },
  "seq": 11,
  "type": "event"
}
```

**`failed`**

```json
{
  "event": {
    "name": "failed"
  },
  "seq": 4,
  "type": "event"
}
```

**`hit`**: notes were hit. It is sent when the game's judgement counters **rise** between two samples, once per judgement (`great`, `ok` or `meh`).

| Field | Description |
| --- | --- |
| `judgement` | `great` (300), `ok` (100) or `meh` (50) |
| `count` | How many notes landed between two samples (often `1`, sometimes more) |
| `errorsMs` | The timing errors of the **newest** notes, in ms (negative = early). **Empty** when the game gave none (sliders, spinners) or when several judgements rose at the same time (we can no longer tell which error goes with which) |
| `combo` | The combo after these notes |

The sample server plays two judgements at every step, so its `errorsMs` are empty. With a single note hit and an error read by the game, the field is for example `"errorsMs": [-7.5]`.

```json
{
  "event": {
    "combo": 7,
    "count": 7,
    "errorsMs": [],
    "judgement": "great",
    "name": "hit"
  },
  "seq": 47,
  "type": "event"
}
```

```json
{
  "event": {
    "combo": 7,
    "count": 1,
    "errorsMs": [],
    "judgement": "ok",
    "name": "hit"
  },
  "seq": 47,
  "type": "event"
}
```

**`miss`**: notes were missed since the last sample. `count` is how many, `combo` the combo right after.

```json
{
  "event": {
    "combo": 7,
    "count": 1,
    "name": "miss"
  },
  "seq": 47,
  "type": "event"
}
```

**`comboBreak`**: the combo just fell. `lost` is the combo that was just **broken**. It is also sent when a slider breaks the combo **without** a miss: do not count it as a miss.

```json
{
  "event": {
    "lost": 42,
    "name": "comboBreak"
  },
  "seq": 47,
  "type": "event"
}
```

These three messages come from the same update (same `seq`) and arrive in the order of the list above: `hit`, `miss`, then `comboBreak`.

## Input stream

`ws://127.0.0.1:24051/api/v1/inputs/ws` (no parameter: any parameters are ignored)

The keyboard keys and mouse buttons that **the game sees held**. They are read in the game **apart from the rest** and **only as long
as at least one client** (or a key widget of the overlay) listens to them: connecting starts the reading, the last disconnection stops
it. It is the **game's** input state: a key pressed while osu! does not have the focus is not seen.

### Usage example

Follow which keys are held, and count the presses:

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/inputs/ws");
let held = new Set();
let presses = 0;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type !== "hello" && msg.type !== "input") return;
  const next = new Set([...msg.data.keys, ...msg.data.mouse.map((b) => `mouse:${b}`)]);
  for (const key of next) if (!held.has(key)) presses++; // a key that appears = a press
  held = next;
  console.log([...held].join(" + ") || "nothing", `(${presses} presses)`);
};
```

> [!SCREENSHOT] inputs-wscat
> Browser console (or Node terminal) running the example: lines like "Z (1 presses)", "Z + mouse:Left (2 presses)",
> "nothing (2 presses)" scrolling while playing.

### Messages received

| `type` | When | Fields |
| --- | --- | --- |
| [`hello`](#hello-1) | On connection | `apiVersion`, `intervalMs`, `seq`, `at`, `data` |
| [`input`](#input) | A key or a button changed | `seq`, `at`, `data` |
| `pong` | Answer to your `ping` | |

#### `hello`

```json
{
  "apiVersion": 1,
  "at": 1792711619102,
  "data": {
    "keys": [],
    "mouse": []
  },
  "intervalMs": 2,
  "seq": 56,
  "type": "hello"
}
```

| Field | Description |
| --- | --- |
| `apiVersion` | Version of the contract (`1`) |
| `intervalMs` | Read interval in effect (`inputPollIntervalMs`): the maximum precision of your measurements |
| `seq` | The counter of the keys: increases at every change |
| `at` | Unix time, in milliseconds, of the last change |
| `data` | The keys held **now** (often empty at connection) |

#### `input`

A key or a button changed. A press and a release are each one message. Press:

```json
{
  "at": 1792711626459,
  "data": {
    "keys": [
      "Z"
    ],
    "mouse": [
      "Left"
    ]
  },
  "seq": 57,
  "type": "input"
}
```

Release:

```json
{
  "at": 1792711626973,
  "data": {
    "keys": [],
    "mouse": []
  },
  "seq": 58,
  "type": "input"
}
```

| Field | Description |
| --- | --- |
| `seq` | Increases at every change |
| `at` | Unix time, in milliseconds, of the change |
| `data.keys` | Keyboard keys held: `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… |
| `data.mouse` | Mouse buttons held: `Left`, `Right`, `Middle`, `Button1`, `Button2` |

- An `input` message contains **all** the keys held at this moment, not only what changed: replace your state.
- To **count the presses**, compare with the previous state: a key that appears is a press.
- A **held** key sends nothing until it changes.
- A key held for less time than `intervalMs` can go unnoticed.

The names of the keys are those of osu!framework. See [Real-time inputs](API.md#real-time-inputs).

#### `pong`

```json
{
  "type": "pong"
}
```

## Event stream

`ws://127.0.0.1:24051/api/v1/events/ws`

Only the [events](#events): a note hit, a miss, a broken combo, a play starting or ending… This stream sends **neither state nor status**,
so there is nothing to sort out: it is the lightest for a widget that **reacts** (a flash on a miss, a sound on every broken combo).
To display values continuously (the combo, the score), use the [state stream](#state-stream). The state stream sends the same events,
unless `?events=false`.

### Filtering the events

| Parameter | Value | Effect |
| --- | --- | --- |
| `names` | comma-separated list | Keeps only these events. Empty or absent: all of them |

The valid `names` are `connectionChanged`, `screenChanged`, `beatmapChanged`, `modsChanged`, `playStarted`, `playEnded`, `paused`, `resumed`, `failed`, `hit`, `miss` and `comboBreak`.

```
ws://127.0.0.1:24051/api/v1/events/ws?names=hit,miss
```

**Refused on opening**: an unknown name (`?names=hit,nope`) refuses the handshake with an HTTP `400` response (not a WebSocket), in JSON:

```json
{"error":{"code":"invalidEvent","message":"unknown event \"nope\"; valid events: connectionChanged, screenChanged, beatmapChanged, modsChanged, playStarted, playEnded, paused, resumed, failed, hit, miss, comboBreak"}}
```

### Usage example

Counting the notes and reacting to misses:

```js
const ws = new WebSocket("ws://127.0.0.1:24051/api/v1/events/ws?names=hit,miss,comboBreak,playStarted");
let hits = 0;
let misses = 0;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type !== "event") return; // the first message is `hello`
  const { event } = msg;
  switch (event.name) {
    case "playStarted":
      hits = 0;
      misses = 0;
      break;
    case "hit":
      hits += event.count;
      for (const ms of event.errorsMs) console.log(ms < 0 ? "early" : "late", Math.abs(ms).toFixed(1), "ms");
      break;
    case "miss":
      misses += event.count;
      console.log(`miss! (${hits} hit, ${misses} missed)`);
      break;
    case "comboBreak":
      console.log(`combo lost: ${event.lost}`);
      break;
  }
};
```

```bash
npx wscat -c "ws://127.0.0.1:24051/api/v1/events/ws?names=miss,comboBreak"
```

### Messages received

| `type` | When | Fields |
| --- | --- | --- |
| [`hello`](#hello-2) | On connection | `apiVersion`, `events` |
| [`event`](#event-1) | A transition just happened | `seq`, `event` |
| `pong` | Answer to your `ping` | |

#### `hello`

Sent **once**, on connection. Unlike the other streams, it contains **no state**: only the list of the events the server can send.

```json
{
  "apiVersion": 1,
  "events": [
    "connectionChanged",
    "screenChanged",
    "beatmapChanged",
    "modsChanged",
    "playStarted",
    "playEnded",
    "paused",
    "resumed",
    "failed",
    "hit",
    "miss",
    "comboBreak"
  ],
  "type": "hello"
}
```

| Field | Description |
| --- | --- |
| `apiVersion` | Version of the contract (`1`) |
| `events` | The names of **all** the possible events (not only those you asked for with `names`) |

#### `event`

The same shape as on the state stream: `seq` is that of the `state` that caused the event, and `event` carries its `name` and its fields
(see [Events](#events)). An event that is not among your `names` is not sent.

```json
{
  "event": {
    "combo": 7,
    "count": 7,
    "errorsMs": [],
    "judgement": "great",
    "name": "hit"
  },
  "seq": 47,
  "type": "event"
}
```

A client that is too slow **misses** events: there is no resynchronisation message. A gap in `seq` does not mean you missed something
(the counter also advances on every `state` this stream does not send).

#### `pong`

```json
{
  "type": "pong"
}
```

## Closing and reconnection

| Who closes | What you see |
| --- | --- |
| **You** (`ws.close()`) | The server answers: the closure is **clean** (`wasClean: true`) |
| **The application**: port change, API turned off, shutdown | A close code **`1001`** (*going away*, reason `server stopping`), then the connection is cut |
| The network or the application crashed | Abnormal closure (`1006`) |

In all cases, **reconnect** with an increasing delay: on reconnection, the `hello` message gives you the current state again, so you
have nothing to catch up on. For a new port, use the URL shown in the **Status** tab.

```js
function connect(url, onMessage) {
  let delay = 500;
  const open = () => {
    const ws = new WebSocket(url);
    ws.onopen = () => (delay = 500);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(open, (delay = Math.min(delay * 2, 10_000)));
  };
  open();
}

connect("ws://127.0.0.1:24051/api/v1/ws", (msg) => console.log(msg.type));
```

```python
import asyncio, json
import websockets  # pip install websockets

async def main():
    async for ws in websockets.connect("ws://127.0.0.1:24051/api/v1/inputs/ws"):  # reconnects by itself
        try:
            async for text in ws:
                message = json.loads(text)
                if message["type"] == "input":
                    print(message["data"]["keys"], message["data"]["mouse"])
        except websockets.ConnectionClosed:
            continue

asyncio.run(main())
```

## Choosing: WebSocket or REST?

| You want to… | Use |
| --- | --- |
| Display live (overlay, widget, OBS source) | State WebSocket |
| Follow the keys with the lowest latency | Input WebSocket |
| React to the start or the end of a play | [Events](#events) |
| React to every note, a miss or a broken combo, without the state | [Events WebSocket](#event-stream) |
| Read a value once (script, `curl`) | [`GET /state`](REST_API.md#get-state) |
| Download the background or the music | [`/assets/*`](REST_API.md#beatmap-files) |
| Know whether something changed since your last call | `seq` of [`GET /snapshot`](REST_API.md#get-snapshot) |

## Quick troubleshooting

| Symptom | Probable cause |
| --- | --- |
| Connection refused | The API is turned off, the port is wrong, or the application is not running |
| HTTP `400` response on opening | An invalid `topics`, `events` or `names` (see [Connection](#connection) and [Filtering the events](#filtering-the-events)) |
| Nothing comes after `hello` | Nothing changed: the stream only sends changes |
| `connected: false` in `data` | The game is not running or not yet readable (see `status`) |
| The keys do not move | osu! does not have the focus (the game does not see the keys), or the game is not connected |
