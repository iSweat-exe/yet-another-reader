# Settings

Everything is set in the **Settings** tab. Changes only take effect after a click on **Apply** (**Cancel** goes
back to the values in effect). They are saved to `settings.json` and applied immediately, without restarting.

> [!SCREENSHOT] settings-tab
> The whole **Settings** tab: Language, Read interval (slider + field), Key read interval, Local API (checkbox + port),
> Overlay (all its options) and RivaTuner, with the Cancel / Apply buttons at the bottom. Label each block with its
> title from the document.

## General

| Setting | Default | Effect |
| --- | --- | --- |
| **Language** | System | Interface language: *System* (the first language of your system that the app knows), *English*, *Français*, *Español*, *Deutsch*, *Português*, *Русский*, *简体中文*, *한국어* or *日本語*. The documentation only exists in French and English: the other languages read the English one. |
| **Theme** | Graphite | The look of the app: *Graphite* (the original), *Midnight*, *Paper* (light), *Terminal*, *Sakura*, *Ember*, *Monochrome*, *Synthwave*, *Game Boy*, *Blueprint*, *Newsprint*, *Amber CRT*, *Nord*, *Cyber* and *Matcha*. It applies at once, without "Apply", and does not change the in-game overlay. |

## Updates

| Setting | Default | Effect |
| --- | --- | --- |
| **Check automatically** (`autoUpdateCheck`) | On | The app looks for a new version 20 seconds after it starts, then every 6 hours. |
| **Check** | | Looks right now, and shows the installed version. |

When a version is available, an **Update X.Y.Z** button appears at the top right of the window. It leads to this
block, which shows **what's new** and the **Install and restart** button. **Nothing is installed without your
click.** The app downloads the installer, checks its **signature** against the public key it carries (a file that does
not match is refused), then closes and starts again. Your game is not touched.

If the check fails (no network, for example), the app carries on normally: the reason is in the **Journal**
(**Status** tab, *Debug* section). See [Troubleshooting](TROUBLESHOOTING.md#the-update-does-not-happen).

## Reading the game

| Setting | Default | Range | Effect |
| --- | --- | --- | --- |
| **Read interval** (`pollIntervalMs`) | `33` ms (≈ 30 updates/s) | `8` – `5000` ms | Sampling frequency of the game's memory. The slider and the field show the number of updates per second this gives. |

Choosing the interval:

- `16` ms for smooth animations at 60 Hz;
- `33` ms (default) for most overlays;
- `100` ms or more to save processor time if you only display text.

It is also the maximum frequency of the WebSocket messages of the [API](API.md): a message is only sent **if the state
has changed**.

## Keys

| Setting | Default | Range | Effect |
| --- | --- | --- | --- |
| **Key read interval** (`inputPollIntervalMs`) | `2` ms (≈ 500 reads/s) | `1` – `100` ms | Sampling frequency of the held keyboard keys and mouse buttons. Much faster than the game's read interval: keys must be real time. |

Keys are only read **if someone is watching them**: a key widget displayed in the overlay, the editor on live data, or
an [API](API.md#real-time-inputs) client. Without this, no extra reading is done in the game. Lower the frequency
(for example 4 or 8 ms) if you want to reduce the load; a key held for less time than the interval could be missed.

> [!SCREENSHOT] settings-keys
> The "Key read interval" field, cropped: value 2, unit "ms", and the help text "≈ 500 reads per second, only while an
> overlay shows the keys".

## Local API

| Setting | Default | Range | Effect |
| --- | --- | --- | --- |
| **Local API** (`apiEnabled`) | enabled | — | Starts or stops the HTTP/WebSocket server on `127.0.0.1`. |
| **Port** (`apiPort`) | `24051` | `1024` – `65535` | Listening port. If the port is in use, the error is shown in the **Status** tab. |

> [!IMPORTANT] **Community widgets** are served by the API: they do not work when it is turned off.

> [!SCREENSHOT] settings-api
> Local API section of the Settings (checkbox ticked, port 24051) above the "Local API" card of the Status tab with the
> green "Online" badge and the copyable URLs. Variant: the red card with the message "Could not listen on
> 127.0.0.1:24051" when the port is taken.

## Overlay

| Setting | Default | Effect |
| --- | --- | --- |
| **In-game overlay** | enabled | Shows or hides the overlay (shortcut `Ctrl + Shift + O`). |
| **Test the overlay** | — | Displays fake data over osu! for 8 seconds, to judge the rendering without playing. |
| **Overlay refresh rate** | `30` fps (5–360) | Drawing rate of the overlay and of its animations. Lower = less load on the game. |
| **Only when osu! is in the foreground** | enabled | The overlay disappears when you switch to another window. |

See [In-game overlay](OVERLAY.md) for performance and fullscreen.

## RivaTuner (RTSS)

| Setting | Default | Effect |
| --- | --- | --- |
| **Show through RivaTuner (RTSS)** | disabled | Draws a block of text over the game through RTSS, for **exclusive fullscreen**. |
| **Text position (px)** | — | X and Y coordinates of the text block. |

Under the checkbox, the application indicates whether RTSS is detected. See [In-game overlay](OVERLAY.md).

## Now playing

The current map, written to **files**: a text and the cover picture. An OBS text source and image source, or a chat bot, can read a file: no browser source needed.

| Setting | Default | Effect |
| --- | --- | --- |
| **Write the current map to files** | off | Turns on writing the files below. Off, nothing is written (files already there are not deleted). |
| **Text** (`Text`) | `{artist} - {title} [{version}]` | The template of the text of `nowplaying.txt`, with placeholders in braces (see below). 500 characters at most. |
| **Folder** (`Folder`) | empty | Where the files are written. Empty: the `nowplaying` folder of the [config folder](#where-are-my-files). |

Two files are written in this folder:

| File | Content |
| --- | --- |
| `nowplaying.txt` | The text, **on a single line** (newlines become spaces). Empty when no map is selected. It is rewritten **only when its text changes**: the application checks twice a second. |
| `cover.jpg`, `cover.png` or `cover.webp` | A copy of the beatmap's background, with the extension of the background file (`jpg` by default). The other extensions are removed: there is only ever one cover. No cover if the map has no background. |

The placeholders of the text:

| Placeholder | Value |
| --- | --- |
| `{artist}`, `{title}` | Artist and title (romanised). |
| `{artistUnicode}`, `{titleUnicode}` | Original artist and title. |
| `{version}` | Name of the difficulty. |
| `{creator}` | Mapper. |
| `{mods}` | The active mods, joined: `HDDT`. |
| `{stars}` | The stars with the mods, to 2 decimals. |
| `{bpm}` | The main BPM, rounded to a whole number. |
| `{link}` | `https://osu.ppy.sh/b/<id>`; empty for an unsubmitted map. |
| `{score}`, `{combo}`, `{accuracy}`, `{pp}` | The values of the play in progress: score, combo, accuracy (from `0` to `1`, 2 decimals) and live PP (rounded to a whole number). They are **0** outside a play. |

An unknown placeholder is **left as typed** (`{nope}` stays `{nope}`): a typo is visible straight away.

> [!TIP] In **OBS**, add a **Text** source and tick *Read from file* (`nowplaying.txt`), then an **Image** source on
> `cover.jpg`. They update by themselves when you change map. The cover's extension follows the map's background: if your maps
> have several types, only one file exists at a time. A **chat bot** that can read a text file can answer a `!np` command with
> the content of `nowplaying.txt`.

With a text such as `{artist} - {title} [{version}] +{mods} ({stars}★) {link}`, the file contains for example:

```text
whyalive x Denya8 - hyperpop luv <3 [collab expert] +HDDT (7.40★) https://osu.ppy.sh/b/4859840
```

> [!NOTE] The config folder is not shown anywhere in the application. The editor's **Open the widgets folder** button opens
> `widgets`: `nowplaying` is its neighbouring folder, in the same parent folder.

## Where are my files?

Everything is in the application's configuration folder (on Windows: `%APPDATA%\io.github.isweat-exe.yet-another-reader`):

| Path | Content |
| --- | --- |
| `settings.json` | The settings above and the active layout. |
| `overlays\<name>.json` | One layout per file (see [Layout format](LAYOUT.md)). |
| `widgets\<folder>\` | The community widgets (see [Community widgets](WIDGETS.md)). |
| `nowplaying\` | `nowplaying.txt` and `cover.*` (see [Now playing](#now-playing)), unless you chose another folder. |
| `records\<sha256>.json` | The best score of every beatmap the application has seen (see [`GET /personal-best`](REST_API.md#get-personal-best)). |

To **back up or share** your configuration, copy these files; to **start from scratch**, close the application and
delete the folder.

> [!SCREENSHOT] config-folder
> Windows File Explorer open on `%APPDATA%\io.github.isweat-exe.yet-another-reader`: the `settings.json` file and the `overlays` and `widgets`
> folders. The path visible in the address bar.
