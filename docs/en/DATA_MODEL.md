# Data model

The contents of the objects the API publishes: what each field contains, its type, its possible values. These are the same
objects in the [REST routes](REST_API.md) and in the messages of the [WebSocket](WEBSOCKET.md). The field names and enumeration
values listed here are stable in `v1`; new fields may appear: ignore those you do not know.

The common conventions (`camelCase`, `null`, units) are in the [guide](API.md#conventions).

## `GameState` (`/state`)

| Field | Type | Description |
| --- | --- | --- |
| `connected` | bool | `false` if osu!lazer is not readable. |
| `version` | string \| null | Detected version of osu!lazer. |
| `screen` | `Screen` | Visible screen, simplified. |
| `screenType` | string | Full .NET type of the screen (precise, useful when it is `other`). |
| `playing` | `PlayingState` | Play state of the user. |
| `ruleset` | string \| null | Selected mode: `osu`, `taiko`, `fruits`, `mania`. |
| `mods` | string[] | Acronyms of the active mods (`HD`, `DT`, ...). During a play, those of the player (the score's mods for a replay). |
| `clockRate` | number | Real playback speed: `1.13` for a DT set to 1.13x, `1` without a rate mod. The PP calculation uses it. |
| `difficultyAdjust` | `DifficultyAdjust` \| null | Values forced by Difficulty Adjust: `cs`, `ar`, `od`, `hp` (`null` for a stat left alone). `null` without that mod. |
| `beatmap` | `Beatmap` \| null | Selected beatmap. |
| `difficulty` | `Difficulty` \| null | Stars and PP with the mods. |
| `difficultyGraph` | `DifficultyGraph` \| null | How hard the map is along the song, with the mods. `null` while it is being computed (a fraction of a second after the map is picked) or if the `.osu` file cannot be found. |
| `time` | `Time` \| null | Clock of the song. |
| `user` | `User` \| null | Logged-in user. |
| `spectators` | `Spectator[]` | The users watching the logged-in player's play (100 at most). Empty when nobody watches. |
| `spectatorCount` | int | Number of spectators (not capped). |
| `gameplay` | `Gameplay` \| null | Play in progress. |

**`Screen`**: `unknown` · `menu` · `songSelect` · `playing` · `results` · `editor` · `multiplayer` · `other`

**`PlayingState`**: `notPlaying` · `break` (a break in the map) · `playing`

## `Beatmap`

| Field | Type | Description |
| --- | --- | --- |
| `title`, `titleUnicode` | string | Title (romanised / original). |
| `artist`, `artistUnicode` | string | Artist (romanised / original). |
| `version` | string | Name of the difficulty. |
| `creator` | string | Mapper. |
| `source`, `tags` | string | Source and tags. |
| `onlineId` | int | Online id of the difficulty (`-1` if not published). |
| `setOnlineId` | int | Online id of the set (`-1` if not published). |
| `status` | string | `graveyard`, `wip`, `pending`, `ranked`, `approved`, `qualified`, `loved`, `none`. |
| `ruleset` | string | Mode of the beatmap. |
| `md5` | string | MD5 of the `.osu` file. |
| `sha256` | string | SHA-256 of the `.osu` file (stable identifier of the beatmap). |
| `lengthMs` | number | Length. |
| `bpm` | number | Main BPM. |
| `starRating` | number | Stars calculated by osu!lazer, **without** the mods. |
| `cs`, `ar`, `od`, `hp` | number | Base values, **without** the mods. |
| `sliderMultiplier`, `sliderTickRate` | number | Slider parameters. |
| `objectCount` | int | Number of objects. |
| `previewTimeMs` | int | Preview point (`-1` if absent). |
| `audioFile`, `backgroundFile` | string | File names in the set. |
| `paths` | `{ beatmap, background, audio }` | **Absolute local paths** of the files in osu!lazer's storage (`null` if not found). See below. |
| `assets` | `{ background, audio }` | Can the files be downloaded through `/assets/...`? |

### Local paths (`beatmap.paths`)

osu!lazer stores its files by content: `<data folder>\files\<1st char.>\<first 2 chars.>\<sha256>`.
The paths are **absolute** and can be used directly in a design, an `<img>` via `file://`, a script, etc. Careful: the stored file
has **no extension**; its type is that of `backgroundFile` / `audioFile` (`.jpg`, `.mp3`, ...). Some tools require the extension: then use
the `/api/v1/assets/background` URL (the right `Content-Type` is provided) or copy the file.

> [!SCREENSHOT] storage-folders
> File Explorer on `%APPDATA%\osu\files`: a one-character folder (`1`), its two-character sub-folder (`1f`) and inside
> it a file with a 64-character name and no extension. Label the three levels "1st char.", "first 2 chars.", "sha256".

```js
const { background } = state.beatmap.paths;
if (background) img.src = "file:///" + background.replaceAll("\\", "/");
```

## `Difficulty`

Calculated by [rosu-pp](https://github.com/MaxOhn/rosu-pp) from the `.osu` file, **with the active mods**.

| Field | Type | Description |
| --- | --- | --- |
| `stars` | number | Stars with the mods. |
| `maxCombo` | int | Maximum combo. |
| `pp95`, `pp98`, `pp99`, `pp100` | number | PP for an accuracy of 95 / 98 / 99 / 100 %. |
| `firstObjectMs` | number | Song time (ms) of the first hit object: the "0:00" of a timer that ignores the intro. |
| `lastObjectMs` | number | Song time (ms) of the last hit object: the end of that timer (the outro is not counted). |

## `DifficultyGraph`

How hard each part of the beatmap is, **relative to the rest of the same map**: it is what a graph is drawn from (low bars =
calm sections, high bars = dense ones). Computed once per beatmap, mods and speed (off the reading thread), from the objects
of the `.osu` file: an "effort" that rises with tapping speed and the distance between objects, and falls during breaks. The
mods that change the speed (DT, HT, a set speed) or the circle size (HR, EZ, Difficulty Adjust) are taken into account.

| Field | Type | Description |
| --- | --- | --- |
| `durationMs` | number | Song time covered by `buckets`, in milliseconds: bucket `i` starts at `i × durationMs / buckets.length`. |
| `overall` | number | The **overall difficulty**: the stars with the mods (the same value as `difficulty.stars`). |
| `peakMs` | number | Song time, in milliseconds, of the hardest section. |
| `buckets` | number[] | 120 values from `0` (the calmest section) to `1` (the hardest of **this** map), rounded to 3 decimals. Two maps cannot be compared bucket by bucket: use `overall` for that. |

## `Time`

| Field | Type | Description |
| --- | --- | --- |
| `currentMs` | number | Position in the song (negative during the intro). |
| `running` | bool | `false` when paused. |
| `source` | `global` \| `gameplay` | Clock used. |

For a progress bar: `currentMs / beatmap.lengthMs` (clamped to `0..1`).

## `User`

| Field | Type | Description |
| --- | --- | --- |
| `id` | int | osu! id. |
| `username` | string | User name. |
| `countryCode` | string | Country code (`FR`). |
| `avatarUrl` | string | URL of the avatar (hosted by osu!). |
| `apiState` | string | `offline`, `failing`, `requiresSecondFactorAuth`, `connecting`, `online`. |
| `statistics` | object \| null | Statistics of the main mode, as synchronised by the game. |

`statistics`: `globalRank` (int \| null), `countryRank` (int \| null), `pp` (number \| null), `accuracy` (0–100), `playCount`,
`totalHits`, `maxCombo`, `rankedScore`, `totalScore`.

> These fields identify the user. The API is only reachable from this machine, but avoid displaying them on screen if you share your
> stream by accident.

## `Spectator`

An item of `spectators`: a user watching the logged-in player's play (read from osu!lazer's spectator client;
the list is empty when offline or when nobody watches).

| Field | Type | Description |
| --- | --- | --- |
| `id` | int | osu! id. |
| `username` | string | User name. |
| `avatarUrl` | string (optional) | `https://a.ppy.sh/{id}`; absent without a valid account. Loading this address needs Internet access. |

## `Gameplay`

| Field | Type | Description |
| --- | --- | --- |
| `score` | int | Total score (with the mod multiplier). |
| `scoreWithoutMods` | int | Score without the multiplier. |
| `accuracy` | number | `0.0`–`1.0`. |
| `combo` | int | Current combo. |
| `maxCombo` | int | Best combo of the play. |
| `beatmapMaxCombo` | int | Maximum combo possible on the map. |
| `rank` | string | Current rank: `F`, `D`, `C`, `B`, `A`, `S`, `SH`, `SS`, `SSH`. |
| `hits` | `{ great, ok, meh, miss }` | Classic 300 / 100 / 50 / miss counters. |
| `results` | object | **All** the judgement counters by name (see below). |
| `health` | number | Health, `0.0`–`1.0`. |
| `paused` | bool | Play paused. |
| `failed` | bool | Play failed. |
| `pp` | `Pp` \| null | PP, see below. |
| `unstableRate` | number \| null | UR (10 × standard deviation of the timing errors). `null` before 2 hits. |
| `hitErrors` | number[] | The last 128 timing errors in ms, from the oldest to the most recent. Negative = too early, positive = too late. |

`hits.great` groups `Great` + `Perfect`, `hits.ok` groups `Ok` + `Good`.

`results`: possible keys (only those with at least one occurrence are present): `None`, `Miss`, `Meh`, `Ok`, `Good`, `Great`, `Perfect`,
`SmallTickMiss`, `SmallTickHit`, `LargeTickMiss`, `LargeTickHit`, `SmallBonus`, `LargeBonus`, `IgnoreMiss`, `IgnoreHit`, `ComboBreak`,
`SliderTailHit`, `LegacyComboIncrease` (and `Result<n>` for an unknown value).

## PP and stars

| Field | Meaning |
| --- | --- |
| `pp.live` | PP of the play **so far**. |
| `pp.fc` | PP if you continue at your current accuracy **without any new miss** ("FC" estimate). |
| `pp.ss` | PP of a perfect play on this map with the active mods. |

The calculations come from the `pp-update` branch of rosu-pp, which follows the recent osu! formulas. They are **approximate during a
play**: the ticks and slider ends are not passed to the calculation, they are estimated. The "Classic" mode (`CL` mod) enables stable
scoring. A custom DT/HT speed is not taken into account.
