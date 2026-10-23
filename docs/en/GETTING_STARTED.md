# Getting started

**Yet Another Reader** reads the state of **osu!lazer** while you play and makes it available in three ways:

- an **in-game overlay**: a transparent window placed over the game (score, combo, PP, UR…), which you
  compose yourself in the **editor**;
- a **local API** (HTTP + WebSocket) for your own tools, OBS browser sources, scripts;
- **community widgets** in HTML/CSS/JavaScript, which are added to the overlay without touching the code.

The application is **read-only**: it does not modify the game, does not inject any code and does not
simulate any key press. It reads the memory of osu!lazer the way a diagnostic tool would.

## What you need

| Item | Detail |
| --- | --- |
| System | **Windows** (reading the game uses the Windows API). |
| Game | **osu!lazer**. Recent versions are detected automatically at every connection. |
| WebView2 | Installed with Windows 10/11; otherwise, the Microsoft Edge WebView2 runtime. |
| Optional | **RivaTuner Statistics Server (RTSS)** to display the information in exclusive fullscreen (see [In-game overlay](OVERLAY.md)). |

## First launch

1. Start **Yet Another Reader**.
2. Start **osu!lazer**. The connection is **automatic**: the **Status** tab goes from
   "Waiting for osu!lazer" to "Connecting…" (a few seconds the first time, while the application finds
   the game's objects), then to "Connected to osu!lazer".
3. Open the **Editor** tab to see the default overlay, or start a play: the overlay is displayed over
   the game.

> [!SCREENSHOT] status-connected
> Application window on the **Status** tab, with osu!lazer running and connected. Show the "Connection" card (green dot,
> "Connected to osu!lazer", version, profile, connection time) and the "Local API" card ("Online" and the URLs). Frame
> the whole window.

> [!NOTE] On first launch the application creates its configuration folder, with an example community
> widget (`hello-score`). See [Settings](SETTINGS.md) for its location.

## Tour of the application

The application has four tabs at the top of the window:

| Tab | Role |
| --- | --- |
| **Status** | Information about the reader: connection to osu!lazer (version, profile, connection time) and state of the local API with its URLs. |
| **Settings** | Language, reading frequency, API, overlay, RTSS. See [Settings](SETTINGS.md). |
| **Editor** | Compose the overlay with the mouse. See [Editor](EDITOR.md). |
| **Documentation** | What you are reading. |

> [!SCREENSHOT] app-tabs
> Top strip of the window, cropped: the "Yet Another Reader" title and the four tabs **Status**, **Settings**,
> **Editor**, **Documentation**, with the Status tab active (pink underline). Number them 1 to 4 as an overlay.

## Where to go next?

| I want to… | Page |
| --- | --- |
| Make my first overlay step by step | [Create an overlay](CREATE_OVERLAY.md) |
| Understand all the settings | [Settings](SETTINGS.md) |
| Display the overlay in exclusive fullscreen | [In-game overlay](OVERLAY.md) |
| Know the available widgets | [Built-in widgets](BUILTIN_WIDGETS.md) |
| Create my own widget in HTML | [Community widgets](WIDGETS.md) |
| Read the data from my code or OBS | [Local API](API.md), [REST routes](REST_API.md), [WebSocket](WEBSOCKET.md) |
| Solve a problem | [Troubleshooting](TROUBLESHOOTING.md) |
| Contribute to the project | [Contributing](CONTRIBUTING.md) |

## Global shortcut

`Ctrl + Shift + O` shows or hides the in-game overlay, from any window.
