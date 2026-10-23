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
| **Language** | System | Interface language: *System*, *Français* or *English*. The documentation is written in French. |

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
| **Overlay refresh rate** | `30` fps (5–144) | Drawing rate of the overlay and of its animations. Lower = less load on the game. |
| **Only when osu! is in the foreground** | enabled | The overlay disappears when you switch to another window. |

See [In-game overlay](OVERLAY.md) for performance and fullscreen.

## RivaTuner (RTSS)

| Setting | Default | Effect |
| --- | --- | --- |
| **Show through RivaTuner (RTSS)** | disabled | Draws a block of text over the game through RTSS, for **exclusive fullscreen**. |
| **Text position (px)** | — | X and Y coordinates of the text block. |

Under the checkbox, the application indicates whether RTSS is detected. See [In-game overlay](OVERLAY.md).

## Where are my files?

Everything is in the application's configuration folder (on Windows: `%APPDATA%\io.github.isweat-exe.yet-another-reader`):

| Path | Content |
| --- | --- |
| `settings.json` | The settings above and the active layout. |
| `overlays\<name>.json` | One layout per file (see [Layout format](LAYOUT.md)). |
| `widgets\<folder>\` | The community widgets (see [Community widgets](WIDGETS.md)). |

To **back up or share** your configuration, copy these files; to **start from scratch**, close the application and
delete the folder.

> [!SCREENSHOT] config-folder
> Windows File Explorer open on `%APPDATA%\io.github.isweat-exe.yet-another-reader`: the `settings.json` file and the `overlays` and `widgets`
> folders. The path visible in the address bar.
