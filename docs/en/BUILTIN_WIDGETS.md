# Built-in widgets

The built-in widgets are provided by the application. They are in the palette of the [editor](EDITOR.md), section
**Built-in**, sorted into several categories. To create new ones without touching the code, see
[Community widgets](WIDGETS.md).

> [!SCREENSHOT] palette
> Left palette of the editor with the Gameplay, Beatmap, Player, Inputs, Miscellaneous categories: the first one
> expanded with its list of widgets and their icons, the others collapsed with the chevron. Frame the column.

In a layout, the `type` field of a widget is the identifier of the **Type** column ([format](LAYOUT.md)). Sizes are in
reference pixels (a screen 1080 px tall); the text size is a fraction of the widget's height `h`, multiplied by `style.scale`.

## Gameplay

These widgets read the current play; outside a play, they display neutral values.

> [!SCREENSHOT] gallery-gameplay
> Sheet of all the widgets of the Gameplay category over a play background (simulated data), each with its type name as
> a caption: score, combo, maxCombo, accuracy, rank, pp, ppFc, ppSs, ppTable, playStatus, ur, health, progress, great,
> ok, meh, miss, hitErrors.

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `score` | Score | The score, with thousands separators. | 500 × 84 |
| `combo` | Combo | The current combo (`124x`). | 360 × 110 |
| `maxCombo` | Max combo | The highest combo reached, with the map's maximum (`312x / 540x`). | 300 × 44 |
| `accuracy` | Accuracy | The accuracy of the play (`98.71%`). | 300 × 48 |
| `rank` | Rank | The provisional rank (`SS`, `S`, `A`…). | 120 × 80 |
| `pp` | PP | The live PP, and what they would be at **FC** and at **SS**. | 300 × 70 |
| `ppFc` | PP if FC | The PP the play would be worth at **FC**, on its own (`47pp FC`). | 240 × 44 |
| `ppSs` | PP if SS | The PP the play would be worth at **SS**, on its own (`628pp SS`). | 240 × 44 |
| `ppTable` | PP at 95 / 98 / 99 / 100 % | What the beatmap is worth at these accuracies, with the active mods. Displayable outside a play. | 420 × 64 |
| `playStatus` | Paused / failed | `PAUSED` or `FAILED` when that is the case, nothing the rest of the time. | 320 × 56 |
| `ur` | UR | The unstable rate. | 200 × 36 |
| `health` | Health | The health bar (uses `style.color`). | 620 × 14 |
| `progress` | Progress | The position in the song, as a bar. | 1000 × 6 |
| `great` | Great (300) | The number of 300s. | 100 × 80 |
| `ok` | Good (100) | The number of 100s. | 100 × 80 |
| `meh` | Meh (50) | The number of 50s. | 100 × 80 |
| `miss` | Miss | The number of misses. | 100 × 80 |
| `hitErrors` | Timing errors | The latest timing errors, as marks on a line. | 500 × 36 |

> `hitCounts` ("300 / 100 / 50 / miss" in a single widget) still exists: the classic layout and the layouts already saved use
> it. It is no longer offered in the palette; use the four separate widgets above for new layouts.

## Beatmap

These widgets read the selected or played beatmap, with the active mods.

> [!SCREENSHOT] gallery-beatmap
> Sheet of the widgets of the Beatmap category over a play background, with the type as a caption under each:
> beatmapInfo, title, artist, mapper, version, stars, bpm, cs/ar/od/hp in a row, timer, mods (HD and DT icons).

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `beatmapInfo` | Beatmap info | Title, artist, difficulty, stars, BPM, AR and OD. | 760 × 80 |
| `title` | Title | The title of the beatmap, on one line. | 700 × 44 |
| `artist` | Artist | The artist of the beatmap. | 600 × 36 |
| `mapper` | Mapper | The creator of the beatmap ("mapped by …"). | 360 × 32 |
| `version` | Difficulty name | The name of the difficulty (`collab expert`). | 420 × 32 |
| `background` | Background picture | The background picture of the beatmap. | 640 × 360 |
| `stars` | Stars | The star rating of the difficulty (with the mods). | 180 × 44 |
| `bpm` | BPM | The BPM of the map. | 200 × 44 |
| `cs` | Circle size (CS) | The CS value. | 80 × 64 |
| `ar` | Approach rate (AR) | The AR value. | 80 × 64 |
| `od` | Overall difficulty (OD) | The OD value. | 80 × 64 |
| `hp` | HP drain (HP) | The HP value. | 80 × 64 |
| `timer` | Song timer | The elapsed time over the length (`1:12 / 3:05`). | 240 × 44 |
| `mods` | Mods | The icons of the active mods. | 400 × 40 |

The text widgets (`title`, `artist`, `mapper`, `version`) stay on **one line**: a text that is too long is cut with "…"
rather than overflowing. To display a composition over several lines, use several widgets, or **Beatmap info**, which
groups everything.

`cs`, `ar`, `od` and `hp` display the **map** value (without the effect of the mods) under its label: placed side by side and
[grouped](EDITOR.md), they form a row of statistics.

### Options of the beatmap widgets

| Widget | Option | Default | Effect |
| --- | --- | --- | --- |
| `title`, `artist` | `unicode` | `false` | Shows the original text (Unicode: Japanese, etc.) rather than the romanised text. |
| `mapper` | `prefix` | `true` | Shows "mapped by" in front of the name. |
| `background` | `fit` | `cover` | `cover` fills the area by cropping, `contain` fits it entirely inside. |
| `background` | `radius` | `12` | Corner radius, in reference pixels. |
| `background` | `blur` | `0` | Blur of the picture, in pixels (0 to 60). |

> [!IMPORTANT] The **background picture** is served by the [local API](REST_API.md#get-assetsbackground): it must be
> **enabled** in the settings. When the picture is not available (simulated editor data, API turned off, beatmap without a
> picture), the widget displays a placeholder rectangle to keep its place. The style's opacity (`style.opacity`) sets the
> transparency of the picture.

> [!SCREENSHOT] background-widget
> Three Background picture widgets side by side with the same beatmap: `cover` fit, `contain`, then `cover` with a
> radius of 40 and a blur of 12. On the right, the Options panel (Fit, Corner radius, Blur).

## Player

These widgets read the profile of the player logged in to osu!lazer. They display nothing (or `—`) until the player is
logged in or their statistics are loaded.

> [!SCREENSHOT] gallery-player
> Sheet of the Player widgets: profile picture, username, global rank, country rank, player PP, player accuracy, play
> count, with a caption under each.

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `avatar` | Profile picture | The avatar (the initial letter if the picture cannot be found). | 96 × 96 |
| `username` | Username | The user name. | 320 × 48 |
| `globalRank` | Global rank | The global rank (`#12 873`). | 240 × 44 |
| `countryRank` | Country rank | The rank in the country (`FR #412`). | 240 × 44 |
| `playerPp` | Player PP | The total PP of the profile. | 240 × 44 |
| `playerAccuracy` | Player accuracy | The accuracy of the profile. | 240 × 44 |
| `playCount` | Play count | The number of plays. | 280 × 44 |

The **avatar** is loaded from its online address: an Internet connection is required.

## Miscellaneous

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `text` | Text | A fixed text: a title, a signature, a label next to another widget. | 360 × 44 |
| `clock` | Clock | The time of day. | 220 × 44 |

> [!SCREENSHOT] gallery-misc
> The Text widgets (with "Thanks for watching" as an example) and Clock widgets (with seconds, then in 12-hour mode)
> over a play background, with the Text widget's Options panel on the right.

| Widget | Option | Default | Effect |
| --- | --- | --- | --- |
| `text` | `text` | `Text` | The text to display (line breaks are kept). |
| `clock` | `seconds` | `false` | Also displays the seconds. |
| `clock` | `hour12` | `false` | 12-hour clock (AM/PM) instead of 24. |

## Inputs

These widgets show the **keys and mouse buttons that the game sees held**, in real time: enough to make a key overlay. The
keys are read in the game apart from the rest, much faster (`inputPollIntervalMs`, 2 ms by default), and **only while one of
these widgets is displayed**: without them, nothing extra is read. See [Real-time inputs](API.md#real-time-inputs) for details
and access through the API.

> [!SCREENSHOT] inputs-widgets
> A row of keys Z, X, M1, M2: two off (dark background, white outline) and two lit (pink background), with press
> counters, then a "12 KPS" widget. Caption "idle" / "held".

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `inputKey` | Key | A key or a mouse button, as a key cap that lights up when it is held. | 96 × 96 |
| `kps` | Keys per second | The number of presses per second (over the last second), all keys together. | 160 × 44 |

The **Key** widget has **options** (the *Options* section of the properties, `options` field of the layout):

| Option | Default | Effect |
| --- | --- | --- |
| `device` | `keyboard` | `keyboard` or `mouse`. |
| `key` | `Z` | Name of the key: `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… for the keyboard; `Left`, `Right`, `Middle`, `Button1`, `Button2` for the mouse. See the names in [the API](API.md#real-time-inputs). |
| `label` | *(empty)* | Text displayed in place of the key name. |
| `showCount` | `false` | Displays the number of presses under the key. The count starts again at zero for each play and only counts during a play. |
| `pressedColor` | `#f472b6` | Background colour while the key is held. |
| `trail` | `false` | Shows the **trail**: each press leaves a bar that slides away from the key and fades (the longer the press, the longer the bar). The key keeps its size (the widget's shorter side) and the trail takes the rest: **make the widget longer** along the trail (e.g. 96 × 300), otherwise it has no room. |
| `trailDirection` | `up` | Direction of the trail: `up`, `down`, `left` or `right`. |
| `trailDuration` | `1000` | Time (ms, 200 to 5000) a bar takes to cross the whole trail: the shorter, the faster it slides. |

> [!SCREENSHOT] key-options
> **Options** section of the Key widget in the Properties: the Device list (Keyboard), the Key name field (`Z`), the
> optional Text, the "Show the press count" switch and the "Colour when pressed" colour picker (pink).

The **style** colour (`style.color`) gives the colour of the outline and of the text at rest.

For a classic key overlay: add one **Key** widget per key (`Z`, `X`, `Left` for the mouse…), set their options, then
[align and space them](EDITOR.md#spacing), optionally [grouping them](EDITOR.md#groups).

## Options

Some widgets have **options** (the *Options* section of the editor's properties). They are saved in the `options` field
of the widget, in the [layout](LAYOUT.md#fields-of-a-widget):

```json
{ "id": "title", "type": "title", "anchor": "top-left", "x": 30, "y": 24, "w": 700, "h": 44,
  "pages": ["playing"], "options": { "unicode": true } }
```

A missing option takes its default value, given in the tables of this page.

## Common style

All built-in widgets accept the [style](LAYOUT.md): `color`, `scale`, `opacity`, `align`, `animate` and `animationMs` (the
numbers of gameplay widgets are animated). Widgets without text (`health`, `progress`, `hitErrors`) only use the colour and
the opacity.

## Not available yet?

Is a widget you need missing? Two options: create one in HTML ([Community widgets](WIDGETS.md)), or add it to the application
([Contributing](CONTRIBUTING.md#add-a-built-in-widget)).
