# In-game overlay

The overlay is a transparent window placed over osu!lazer. It never takes the focus and never blocks a click:
everything you do passes through to the game.

Its content is a [layout](LAYOUT.md) that you compose in the [editor](EDITOR.md).

> [!SCREENSHOT] overlay-in-game
> osu!lazer in the middle of a play (borderless windowed mode) with the overlay displayed over it: score at the top
> right, combo at the bottom left, health bar, accuracy and PP. An annotated arrow "transparent window: clicks pass
> through to the game" towards one of the widgets.

## Usage

- **Show / hide**: `Ctrl + Shift + O` (from any window), or the "In-game overlay" checkbox in the [settings](SETTINGS.md).
- **Only when osu! is in the foreground** (enabled by default): the overlay disappears when you switch to another
  window, so it does not cover your desktop.
- **Test**: "Test the overlay" (settings) displays fake data for 8 seconds.
- Gameplay widgets are only displayed during a play; each widget chooses its [pages](LAYOUT.md#pages).

> [!SCREENSHOT] settings-overlay
> **Overlay** section of the Settings tab, cropped: the "In-game overlay" checkbox with "Shortcut: Ctrl + Shift + O",
> the Test button, the "Overlay refresh rate" field (30 fps) and the "Only when osu! is in the foreground" checkbox.

## Performance

Placing a window over the game forces Windows to **compose** the two images instead of displaying the game
directly, which costs latency and smoothness. The application therefore limits this cost:

- **The window is only on screen if the layout draws something on the current page** (and for about 1 s after).
  By default the widgets are on the play pages; in the menus, the game is displayed normally. If you add widgets
  to other pages (song select, results, menu), the window also appears on those pages.
- **Adjustable refresh rate** (settings → "Overlay refresh rate", 5–144 fps, 30 by default). It is also the rate
  of the animations. Lower it if you notice a slowdown.
- **Light rendering**: minimal text shadows, animated numbers without React re-rendering.
- Outside a play, only useful changes are sent to the overlay (not the clock tick).

## Above fullscreen

| osu!lazer display mode | How to display the overlay |
| --- | --- |
| Windowed / borderless fullscreen (lazer's default) | The transparent overlay (nothing to do). It is forced back to "always on top" several times a second, in case the game takes the foreground again. |
| **Exclusive** fullscreen | **RivaTuner (RTSS)**: settings → "Show through RivaTuner". |

**Why RTSS?** Windows does not let a normal window display over an exclusive fullscreen. RTSS (shipped with MSI
Afterburner) already hooks into the rendering of games (DX9/10/11/12, Vulkan, OpenGL) and can draw over it. The
application only hands it **text** through its shared memory: **nothing is injected into osu!lazer**, and the
application neither reads nor writes anything else in RTSS.

1. Install and start **RivaTuner Statistics Server** (included with MSI Afterburner).
2. Enable "Show through RivaTuner (RTSS)" in the settings; set the position of the text.
3. Start a play: a block of text (score, accuracy, PP, combo, UR, 300/100/50/miss, title) appears. The setting
   indicates whether RTSS was detected.

> [!SCREENSHOT] rtss-in-game
> osu!lazer in exclusive fullscreen with the RTSS text block at the top left (score, accuracy, PP, combo, UR,
> 300/100/50/miss, title). As an inset, the RTSS section of the Settings with the green message "RTSS detected: the text
> is shown during plays".

Limits: RTSS only displays **text** (no bars or graphical widgets), and the text is limited to ASCII (special
characters in titles become `?`).

> [!WARNING] If you are in borderless windowed mode, **do not enable both** (transparent overlay and RTSS): you would see the information twice.

## Preview without the game

In a browser, with the development server (`npm run dev`, see [Contributing](CONTRIBUTING.md)), open
`http://localhost:1420/?bg=1#overlay`: the overlay animates with fake data over a stand-in background. The full
application is previewed at `http://localhost:1420/`; add `?tab=editor` to land on the editor.

> [!SCREENSHOT] browser-preview
> Browser window on `http://localhost:1420/?bg=1#overlay`: the purple-pink stand-in gradient with the overlay's animated
> widgets (score, combo, health bar). The URL visible in the address bar.

## See also

- [Create an overlay](CREATE_OVERLAY.md) for the first step-by-step guide.
- [Troubleshooting](TROUBLESHOOTING.md) if the overlay does not appear.
