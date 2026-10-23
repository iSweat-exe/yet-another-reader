# Create an overlay

This tutorial has you compose a small play overlay from start to finish: score, combo, accuracy, a row of
map statistics, and a pause. Allow 10 minutes. The details of each tool are in the [Editor](EDITOR.md).

## The principle in two minutes

- A **layout** is an overlay: a list of **widgets** positioned on a virtual screen 1080 px tall. You can
  have as many as you like and choose which one is active in game.
- A layout is split into **pages**: *Playing*, *Paused*, *Break*, *Song select*, *Results*, *Main menu*.
  Each widget says on which pages it is displayed. The editor shows **one page at a time** (the tabs above
  the screen).
- Widgets are **anchored** to the screen (corner, edge or centre): your overlay keeps the same look on a
  16:9, 21:9 or 32:9 screen.

## 1. Create a layout

1. Open the **Editor** tab.
2. In the top bar, click **New…**, give it a name (letters, digits, spaces, `-`, `_`, 40 characters max) and
   choose the **Empty** template (or **Classic** / **Minimal** to start from an example).

> [!SCREENSHOT] new-layout-dialog
> The "New layout" dialog open over the editor: the name field filled with `my-overlay`, the "Start from" list on
> **Empty** (the three choices visible if possible: Classic, Minimal, Empty) and the Cancel / Create buttons.

The **preview data** is simulated by default (*Data* menu): you see the widgets come alive without starting
the game.

## 2. Add widgets

Select the **Playing** page tab. In the list on the left, section **Gameplay**, click **Score**, **Combo**
and **Accuracy**: each widget appears in the middle of the screen, already selected.

> [!SCREENSHOT] add-widgets-playing
> Editor on the **Playing** page with an empty layout. On the left, the **Gameplay** category expanded (Score, Combo,
> Accuracy visible). In the centre, three freshly added widgets stacked in the middle of the preview screen, the last
> one selected with its pink frame.

## 3. Place them

- **Drag** a widget to move it. **Snapping** aligns it to the edges and centres of the screen and of the
  other widgets (guide lines). Hold `Alt` to avoid it, or turn **Snapping** off in the toolbar.
- Resize it with its **handles** (`Shift` keeps the proportions). The text size follows the height of the widget.
- Set the exact position in the **Properties** panel on the right (X, Y, W, H), or use the **arrow** keys
  (`Shift` = 10 px).

> [!SCREENSHOT] move-snapping
> Capture during a drag: the Score widget is being moved towards the top-right corner of the preview screen; two cyan
> guide lines are visible (one on the right edge of the screen, the other aligned with the centre of another widget).
> The move cursor is visible.

Put the score at the top right, the combo at the bottom left, and the accuracy under the score.

> [!TIP] You don't need to worry about anchors: the editor attaches each widget to the nearest edge
> ([details](EDITOR.md#automatic-anchor)).

## 4. Adjust the style

With a widget selected, **Properties → Style**: colour, text size, opacity, text alignment, number animation.
To change several widgets at once, edit them one by one or duplicate a widget you have already adjusted
(`Ctrl + D`).

> [!SCREENSHOT] style-section
> **Properties** panel of a selected Score widget, scrolled to the **Style** section: colour (pink swatch and hex code),
> text size, opacity, text alignment (Auto), "Animate numbers" on and a 250 ms duration.

## 5. A row of statistics

1. In **Beatmap**, add **CS**, **AR**, **OD** and **HP**: these are four separate widgets.
2. Select them (selection rectangle on the empty screen, or `Ctrl + click`).
3. Click **Align top** in the toolbar to put them on one line.
4. In **Properties → Spacing**, set **Horizontal gap** (for example `16`): they are spaced evenly. With three
   widgets or more, **Distribute horizontally** evens out the gaps between the two ends.
5. Press `Ctrl + G` to **group** them: the row now moves as a single object and takes up one expandable line in
   **Layers**.

> [!SCREENSHOT] stats-row
> The four widgets CS, AR, OD, HP lined up in the preview screen and selected together (dashed frame around the group).
> On the right, the "4 widgets selected" panel with the **Spacing** section: horizontal gap 16, vertical gap 0 and the
> two Distribute buttons.

## 6. A pause page

1. Select the **Paused** page tab.
2. Add the widgets you want (for example a large **Combo** and the **Score**).

> [!SCREENSHOT] pause-page
> The page tabs with **Paused** active (the widget count visible on each tab) and, in the preview screen, a simple pause
> page: a large Combo in the centre and the Score at the top right.

A widget can be on several pages: in **Properties → Pages**, tick the moments of the game where it must appear
(at least one).

## Variant: a key overlay

Keys are read from the game, in real time. To make a key overlay:

1. In the **Inputs** category, add one **Key** widget per key to display.
2. For each, set its **options**: the key name (`Z`, `X`…), or *Mouse* and `Left` / `Right` for clicks; tick
   **Show the press count** if you want a counter.
3. Select them, **align** and **space** the keys, then `Ctrl + G` to group them.
4. Add **Keys per second** for a KPS counter.

> [!SCREENSHOT] key-overlay
> Final result of a key overlay over a play background: four keys Z, X, M1, M2 aligned, Z and M1 lit in pink (pressed),
> press counters under each letter, and a "7 KPS" counter beside them. Also show the collapsed "Group 1" line in the
> Layers if there is room.

Keys are only read from the game while the overlay displays them. See [Built-in widgets](BUILTIN_WIDGETS.md#inputs).

## 7. Test

- In the editor, switch the **Data** menu to *Live* to see the real figures of a play in progress.
- In **Settings**, **Test the overlay** displays fake data over osu! for 8 s.

> [!SCREENSHOT] data-menu
> Editor toolbar with the **Data** list open: the two choices "Simulated" (ticked) and "Live" visible. Zoom on that
> area, with the 16:9 screen format next to it.

## 8. Use it in game

Click **Use in game**: this is the layout the overlay will display. With **Auto-save** enabled (default), the
overlay follows your changes live. Start a play: the overlay appears over the game and disappears between plays
if your layout has nothing to draw on the current page.

> [!SCREENSHOT] use-in-game-badge
> Top bar of the editor, two states side by side: on the left the pink **Use in game** button (layout not active), on
> the right the **Active in game** badge (active layout), with the layout selector visible.

> [!WARNING] If you play in **exclusive fullscreen**, a transparent overlay cannot be displayed: see
> [In-game overlay](OVERLAY.md) (RTSS).

## 9. Share it

**Export…** gives the JSON of your layout (to copy or download); the other person loads it with **Import…**.
If the layout uses community widgets, they must also have their folders (they are referenced by folder name).

> [!SCREENSHOT] export-dialog
> The "Export" dialog: the layout's JSON shown in a text area (the beginning readable with `"version": 2`) and the "Copy
> the JSON" and "Download the file" buttons.

## Going further

- All available widgets: [Built-in widgets](BUILTIN_WIDGETS.md).
- A widget that does not exist? Create it in HTML: [Community widgets](WIDGETS.md).
- Edit the layout by hand: [Layout format](LAYOUT.md).
- Editor shortcuts and tips: [Editor](EDITOR.md).
