# Troubleshooting

Always start with the **Status** tab: it tells you whether the application sees the game and whether the API is running.

## See what the application is doing

Under the connection card, the **Debug** section of the Status tab shows the software's work live:

- **Game reading**: how many times per second the game state is read (against what the settings ask for), the time of one read, failed reads, whether the keys are read and **who asks for them** (overlay window, WebSocket, REST client), the connected WebSocket clients and the session length.
- **What the app reads**: the screen, the mode, the mods (with the real speed), the beatmap, the clock, the current play and the held keys, as the application sees them.
- **Journal**: the latest events (connection, screen or mod changes, play start and end, read errors, API start, settings changed). The copy button puts the whole journal on the clipboard: attach it to a ticket.

## The application does not connect to osu!lazer

| What you see | Probable cause | What to do |
| --- | --- | --- |
| **Waiting for osu!lazer** | The game is not running (or not detected yet). | Start osu!lazer. The application retries on its own every 2 seconds. |
| **Connecting…** that lasts | First detection of the game's objects, which takes a few seconds; longer just after the game starts. | Wait about ten seconds. If it does not pass, restart the game. |
| **Cannot read the game** + a message | The game changed version, or access to its process is refused. | Read the message. After an osu!lazer update, restart both programs. If the message persists, open a ticket with the message and the displayed version (see [Contributing](CONTRIBUTING.md)). |

> [!SCREENSHOT] status-states
> The three states of the Connection card of the Status tab side by side: "Waiting for osu!lazer" (grey dot),
> "Connecting…" (pulsing amber dot) and "Cannot read the game" with its error message (red dot).

If the game is running **as administrator** and not the application, Windows may refuse the reading: start both with the same rights.

Once connected, rare isolated read failures are normal (the game's garbage collector moves objects): the application ignores them and
only reconnects after a long series of failures.

## The overlay does not appear

Check in this order:

1. **In-game overlay** is enabled in the [settings](SETTINGS.md) (or toggle it with `Ctrl + Shift + O`).
2. **The active layout contains widgets on the current page.** The overlay is only on screen if something is to be drawn on the page
   where the game is. By default the widgets are on the play pages: in the menus, it is normal to see nothing. See [Layout format](LAYOUT.md#pages).
3. **The right layout is used in game**: the **Active in game** badge in the editor, otherwise **Use in game**.
4. **"Only when osu! is in the foreground"**: if another window is in the foreground, the overlay hides itself on purpose.
5. **You play in exclusive fullscreen.** Windows does not display any window over it. Switch osu!lazer to borderless windowed, or use **RTSS**
   ([In-game overlay](OVERLAY.md)).
6. Use **Test the overlay** (settings) to see whether the overlay displays with fake data.

> [!SCREENSHOT] overlay-checklist
> Two details assembled for the checklist: the "In-game overlay" checkbox ticked in the Settings, and the top bar of the
> editor with the **Active in game** badge next to the layout selector.

## The overlay is displayed but empty or at zero

- Check the **connection** in the **Status** tab.
- The gameplay widgets only show values **during a play**.
- The **Player** widgets (rank, PP…) wait for the profile to be loaded by the game.
- The **avatar** requires an Internet connection.

## The overlay disturbs the game (stutters)

Placing a window over the game has a cost (see [In-game overlay](OVERLAY.md#performance)). In the [settings](SETTINGS.md):

- lower the **Overlay refresh rate** (for example 20 or 15 fps);
- raise the **Read interval** (`50`–`100` ms);
- remove unneeded widgets and avoid expensive community widgets (permanent animations, blurs).

## The API does not respond

| Symptom | What to do |
| --- | --- |
| **Error** in the API card of **Status** | The message says why, most often: **the port is already in use**. Change the port in the [settings](SETTINGS.md). |
| **Disabled** | Enable **Local API** in the settings. |
| `curl` gets no response | Check the URL shown in **Status** (the port may have changed): `http://127.0.0.1:<port>/api/v1/health`. |
| Another PC cannot connect | Normal: the API only listens on `127.0.0.1`, never on the network. |

> [!SCREENSHOT] api-port-busy
> "Local API" card of the Status tab in error: red "Error" badge and the message "Could not listen on 127.0.0.1:24051"
> (port already in use), with the Port field of the Settings below it to change it.

See [Local API](API.md#notes-and-limits).

## A community widget does not appear

- The **local API must be enabled**: the widgets are served by it.
- Click **Refresh** in the editor palette (**Community** section).
- The folder must contain a **valid** `manifest.json` and the announced entry page (`index.html` by default). An invalid folder is ignored,
  without a message. See [Community widgets](WIDGETS.md).
- In the editor, "This widget is not in the widgets folder" means that a layout references a folder that no longer exists (or was renamed).

> [!SCREENSHOT] palette-api-off
> Community section of the palette with the amber warning "Community widgets need the local API: enable it in the
> settings." above the list.

## RTSS displays nothing

- RivaTuner Statistics Server must be **running** (the setting says "RTSS not found" otherwise).
- The text only appears **during a play**.
- RTSS only displays ASCII text (special characters become `?`).
- Do not enable it in addition to the transparent overlay: you would see the information twice.

## My layout has disappeared or is invalid

Layouts are `overlays\<name>.json` files in the configuration folder (see [Settings](SETTINGS.md#where-are-my-files)). An invalid
document is refused on import with "This is not a valid layout": compare it with the [format](LAYOUT.md). Remember to **export** your
layouts to keep a copy.

## The update does not happen

Look at the **Journal** first (**Status** tab, *Debug* section): the `updates` lines say what happened.

| Message or symptom | Likely cause |
| --- | --- |
| Nothing is offered although a version exists | The version is still a draft or a pre-release on GitHub, or its number is not greater than yours. Click **Check** in **Settings > Updates**. |
| `update check failed` with a network error | No connection, or a firewall blocks `github.com`. The app tries again by itself (every 6 h); **Check** tries again right away. |
| `signature` in the error | The downloaded file does not carry the expected signature: it is **refused on purpose**. Do not work around it: reinstall from the project's releases page and tell the maintainers. |
| The installation fails at restart | Close the app completely (notification-area icon, Task Manager), then run **Install and restart** again. Otherwise run the installer downloaded from the releases page. |

## Start from scratch

Close the application, then delete the configuration folder (`%APPDATA%\io.github.isweat-exe.yet-another-reader`). Your layouts and community widgets are also there:
back them up first.

## Reporting a problem

A bug, an unrecognised game version, a missing widget? See [Contributing](CONTRIBUTING.md#report-a-bug).
