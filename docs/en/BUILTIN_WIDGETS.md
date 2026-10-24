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
> a caption: score, combo, maxCombo, accuracy, rank, pp, ppFc, ppSs, ppMax, ppTable, playStatus, ur, health, progress, great,
> ok, meh, miss, hitErrors, hitErrorBar, playGraph, pbDelta.

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `score` | Score | The score, with thousands separators. | 500 × 84 |
| `combo` | Combo | The current combo (`124x`). | 360 × 110 |
| `maxCombo` | Max combo | The highest combo reached, with the map's maximum (`312x / 540x`). | 300 × 44 |
| `accuracy` | Accuracy | The accuracy of the play (`98.71%`). | 300 × 48 |
| `rank` | Rank | The provisional rank (`SS`, `S`, `A`…). | 120 × 80 |
| `pp` | Current PP | The live PP, on their own (`412pp`). | 300 × 70 |
| `ppFc` | PP if FC | The PP the play would be worth at **FC**, on its own (`47pp FC`). | 240 × 44 |
| `ppSs` | PP if SS | The PP the play would be worth at **SS**, on its own (`628pp SS`). | 240 × 44 |
| `ppMax` | Max PP | What the whole beatmap is worth as an **SS** with the active mods (`340pp MAX`). Can be shown outside a play. | 240 × 44 |
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
| `hitErrorBar` | Hit error bar | The timing errors on the scale of the hit windows, as in osu!lazer. | 500 × 48 |
| `playGraph` | PP / accuracy graph | PP, accuracy or score along the song, with the record's curve as an option. | 520 × 140 |
| `pbDelta` | Gap to record | The gap between the play and your record, **at the same point of the song**. | 280 × 84 |
| `ppDelta` | Gap to max PP | The gap between your current PP and the **highest PP** you have had on this map. | 280 × 84 |
| `ppGraph` | PP graph (shapes) | The play's PP along the song, as a line, area, steps, bars, dots or ring. | 420 × 140 |

> `hitCounts` ("300 / 100 / 50 / miss" in a single widget) still exists: the classic layout and the layouts already saved use
> it. It is no longer offered in the palette; use the four separate widgets above for new layouts.

In the palette, `hitErrorBar` is in the *Judgements* group; `playGraph` and `pbDelta` make up the *Progress and record* group; `ppDelta` and `ppGraph` are in the PP group, with `pp`, `ppFc`, `ppSs`, `ppMax` and `ppTable`.

### Hit error bar, graph and record

**Hit error bar** (`hitErrorBar`): like osu!lazer's meter, it places every hit on a timing scale, early on the left, late on the right, zero in the middle.

- The coloured **bands** are the hit windows: *great* (blue), *ok* (green) and *meh* (yellow). They come from the **effective OD**: the map's, ×1.4 (capped at 10) with **HR**, ×0.5 with **EZ**, and the value forced by **Difficulty Adjust** when it is active (it wins over HR and EZ).
- The bands are only drawn for **osu!standard**. In the other modes, the bar keeps a fixed ±120 ms scale, with no bands and no colours by judgement.
- Every hit leaves a **tick**, coloured by its judgement; the newest is **bolder**, the older ones fade.
- A **marker** (triangle) shows the **average** of the errors: you see at a glance whether you play rather early or late.

**PP / accuracy graph** (`playGraph`): the chosen value, drawn **as the play unfolds**, across the whole width of the map (from its first to its last object). The **record's** curve, dashed, can sit behind it: the play is read against what it has to beat. It comes from [`GET /personal-best`](REST_API.md#get-personal-best).

**Gap to record** (`pbDelta`): the current value minus the record's **at the same song time** (interpolated between two samples of the record), because that is what a live score should be compared with. **Green** when you are ahead (or level), **red** when you are behind. Under the gap, the record's final value (*Record 148pp*, or *No record yet*). Without a record, or outside a play, it shows "—".

**Gap to max PP** (`ppDelta`): the current PP minus the **highest PP** you have reached on this map, across every completed solo play (not only the record's: a play with a lower score but higher PP counts). **Green** when you are level with that maximum or above it (a new PP high), **red** below it; under the gap, the maximum (*Map max 152pp*). Without a known maximum, or outside a play, it shows "—". The maximum comes from `maxPp`, in [`GET /personal-best`](REST_API.md#get-personal-best).

**PP graph (shapes)** (`ppGraph`): the play's PP along the song, in the chosen shape: `line`, `area`, `step`, `bars`, `dots` or `ring`. The ring has no time axis: it shows the current PP as a share of the PP of a perfect play on the map (`difficulty.pp100`).

> [!NOTE] The record is the best **completed solo score the application has seen**: plays made before its installation are unknown. See [`GET /personal-best`](REST_API.md#get-personal-best).

| Widget | Option | Default | Effect |
| --- | --- | --- | --- |
| `hitErrorBar` | `windows` | `true` | Draws the bands of the hit windows (osu!standard only). |
| `hitErrorBar` | `colorize` | `true` | Colours every tick by its judgement (osu!standard only). |
| `hitErrorBar` | `count` | `30` | Number of recent hits shown (5 to 100). |
| `hitErrorBar` | `average` | `true` | Shows the average marker. |
| `hitErrorBar` | `labels` | `false` | Writes "Early" and "Late" at both ends. |
| `playGraph` | `metric` | `pp` | The plotted value: `pp`, `accuracy` or `score`. |
| `playGraph` | `style` | `area` | `line` (line only) or `area` (line and filled area). |
| `playGraph` | `color` | `#f472b6` | Colour of the curve. |
| `playGraph` | `lineWidth` | `3` | Thickness of the line, from 1 to 10. |
| `playGraph` | `record` | `true` | Draws the record's curve, dashed. |
| `playGraph` | `showValue` | `true` | Writes the current value in the corner. |
| `pbDelta` | `metric` | `pp` | What is compared: `pp`, `accuracy` or `score`. |
| `pbDelta` | `showRecord` | `true` | Shows the record's final value under the gap. |
| `pbDelta` | `ahead` | `#4ade80` | Colour when you are ahead of the record. |
| `pbDelta` | `behind` | `#f87171` | Colour when you are behind. |
| `ppDelta` | `showMax` | `true` | Shows the max PP under the gap. |
| `ppDelta` | `ahead` | `#4ade80` | Colour when you are level with the max or above it. |
| `ppDelta` | `behind` | `#f87171` | Colour when you are below it. |
| `ppGraph` | `shape` | `area` | `line`, `area`, `step`, `bars`, `dots` or `ring`. |
| `ppGraph` | `color` | `#f472b6` | Colour of the drawing. |
| `ppGraph` | `lineWidth` | `3` | Thickness of the line (or size of the dots), from 1 to 10. |
| `ppGraph` | `showValue` | `true` | Writes the current PP (in the corner, or in the middle of the ring). |

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
| `difficultyGraph` | Difficulty graph | The map's difficulty along the song as bars (low = calm, high = dense), with a cursor that follows the song and the overall difficulty (stars with the mods). | 720 × 90 |
| `bpm` | BPM | The BPM of the map. | 200 × 44 |
| `cs` | Circle size (CS) | The CS value. | 80 × 64 |
| `ar` | Approach rate (AR) | The AR value. | 80 × 64 |
| `od` | Overall difficulty (OD) | The OD value. | 80 × 64 |
| `hp` | HP drain (HP) | The HP value. | 80 × 64 |
| `timer` | Song timer | The elapsed time over the length (`1:12 / 3:05`), counted from the **first to the last hit object**: 0:00 is the first click, the end is the last one, the music is not looked at (skipping the intro shifts nothing). The progress bar follows the same rule. | 240 × 44 |
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
| `difficultyGraph` | `style` | `bars` | `bars`, `curve` (smooth curve, fill optional), `line` (line only), `area` (filled area without a stroke) or `points`. |
| `difficultyGraph` | `count` | `120` | Number of bars or points (20 to 240). The data has 120 values: below that, the **maximum** of each group is kept (a short spike does not vanish); above it, values are interpolated. Nothing is recomputed. |
| `difficultyGraph` | `color` | `#f472b6` | Colour: full for what has already played, faded for what is to come (in every style). |
| `difficultyGraph` | `height` | `100` | Share of the widget's height used by the graph, in % (20 to 100). |
| `difficultyGraph` | `round` | `50` | `bars` style: roundness of the bars, in % (0 = square, 100 = fully round). |
| `difficultyGraph` | `smooth` | `60` | Curve styles: smoothing, in % (0 = straight segments, 100 = full curve). The curve is monotone: it never goes beyond the values of its two neighbouring points. |
| `difficultyGraph` | `lineWidth` | `2` | Curve styles: line width (or point size), 1 to 8. |
| `difficultyGraph` | `fill` | `true` | `curve` style: fills under the curve with a gradient. |
| `difficultyGraph` | `fillOpacity` | `45` | Opacity of the top of the gradient, in % (5 to 100). |
| `difficultyGraph` | `reverse` | `false` | Flips the graph upside down (the bars hang from the top edge) so it can sit at the top of the screen. |
| `difficultyGraph` | `showValue` | `false` | Shows the overall difficulty (stars with the mods) at the top left. |

The **difficulty graph** reads [`difficultyGraph`](DATA_MODEL.md#difficultygraph): the bars are normalised to the map itself
(the tallest is the hardest section *of this map*) and follow the speed mods (DT, HT) and circle mods (HR, EZ). Until the
computation is done, or if the map file cannot be found, a faint line holds the place.

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
| `flag` | Country flag | The player's country flag (the code as text if there is no such flag). Options: show the country code, corner radius. | 72 × 48 |
| `spectators` | Spectators | The spectators of the player's play: count only, usernames, avatars, or avatars and usernames. | 280 × 48 |

The **avatar** is loaded from its online address: an Internet connection is required.

The **username** has a *Show the flag* option. The flags ship with the app (`public/Textures/flags` folder, one per
two-letter ISO country code): no network access. They are served by the overlay window; community widgets (web pages)
cannot reach them, they read `user.countryCode` from the API instead.

The **Spectators** widget has these options: the display (*Count only*, *Usernames*, *Avatars*, *Avatars and
usernames*), *Show the count*, the maximum shown (a "+N" bubble covers the rest), stacked (overlapping) avatars,
*Hide with no spectators* and *Load avatars from osu! (Internet)*.

> **Privacy.** Spectator avatars come from osu!'s servers (`https://a.ppy.sh/{id}`): showing them makes one external
> network request per avatar, loaded only while the widget is displayed. Untick *Load avatars from osu!* to make none:
> the default picture is used instead (it is also used when offline).
>
> The list comes from the game's spectator client (`SpectatorClient.watchingUsers`): it is only filled when the game
> is online and someone is watching.

## Miscellaneous

| Type | Name | Displays | Default size |
| --- | --- | --- | --- |
| `text` | Text | A fixed text: a title, a signature, a label next to another widget. | 360 × 44 |
| `clock` | Clock | The time of day. | 220 × 44 |
| `image` | Image | A picture you imported (logo, frame, decoration): PNG, JPEG, GIF, WebP or SVG. | 320 × 320 |

> [!SCREENSHOT] gallery-misc
> The Text widgets (with "Thanks for watching" as an example) and Clock widgets (with seconds, then in 12-hour mode)
> over a play background, with the Text widget's Options panel on the right.

| Widget | Option | Default | Effect |
| --- | --- | --- | --- |
| `text` | `text` | `Text` | The text to display (line breaks are kept). |
| `clock` | `seconds` | `false` | Also displays the seconds. |
| `clock` | `hour12` | `false` | 12-hour clock (AM/PM) instead of 24. |
| `image` | `image` | (none) | The picture to show: pick it in the list or click **Import an image…**. The layout only keeps its identifier. |
| `image` | `fit` | `cover` | `cover` fills the box by cropping, `contain` fits entirely inside, `fill` stretches the picture to the box. |
| `image` | `radius` | `0` | Corner radius, in reference pixels (0 to 400). |
| `image` | `borderWidth` | `0` | Border thickness, in pixels (0 to 40). |
| `image` | `borderColor` | `#ffffff` | Border colour. |
| `image` | `exposure`, `contrast`, `saturation`, `temperature`, `shadows`, `highlights` | `0` | The picture editor: exposure, contrast, saturation, temperature, shadows and highlights, -100 to 100 (0 = untouched). |
| `image` | `hue` | `0` | Hue, -180 to 180 degrees. |

The picture editor settings are a filter applied when drawing: the imported file is never changed, and **GIF** and **animated WebP** keep playing (the browser animates them, the filter follows each frame).

The Image widget's **opacity** is the style's (`style.opacity`).

> [!IMPORTANT] The chosen file is **copied** into the app's data (PNG, JPEG, GIF, WebP or SVG, 15 MB at most) and served by
> the [local API](REST_API.md#get-imagesid): it must be **enabled** in the settings, and browser sources (OBS) show the same
> picture. If the picture is deleted from the list or the API is off, the widget shows a placeholder rectangle. In the browser
> (`npm run dev`), imported pictures only live for the session.

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
| `key` | `Z` | Name of the key: `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… for the keyboard; `Left`, `Right`, `Middle`, `Button1`, `Button2` for the mouse. Picked from a list (keyboard or mouse keys depending on `device`). See the names in [the API](API.md#real-time-inputs). |
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
