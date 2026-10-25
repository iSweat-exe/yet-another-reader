# Editor

The **Editor** tab composes the overlay with the mouse, using the real widgets on simulated data (or live
data). For a step-by-step guide, see [Create an overlay](CREATE_OVERLAY.md).

## Overview

| Area | Content |
| --- | --- |
| **Top bar** | Layout choice, **Use in game**, new / duplicate / rename / import / export / delete, saving state. |
| **Toolbar** | Undo / redo, alignment, spacing, groups, snapping, grid, screen format, data source, auto-save. |
| **Left** | The widget palette: **Built-in** (by category) and **Community**. A click adds the widget. |
| **Centre** | The **page** tabs, the preview screen, and the reminder of shortcuts. |
| **Right, top** | The **Properties** of the selection. |
| **Right, bottom** | The **Layers**. |

> [!SCREENSHOT] editor-overview
> Full editor window with the "Classic" layout loaded. Number the six zones of the table as an overlay: 1 top bar, 2
> toolbar, 3 widget palette, 4 preview screen with the page tabs, 5 properties, 6 layers.

The separators between the panels can be moved with the mouse; a double-click puts them back at their
original size.

## Pages

A layout covers every moment of the game. The editor shows **one page at a time**: *Playing*, *Paused*,
*Break*, *Song select*, *Results*, *Main menu* (the number next to each tab is the number of widgets on it).
A widget that is added goes on the displayed page; its properties let you show it on other pages. See
[Layout format](LAYOUT.md) for details.

> [!SCREENSHOT] page-tabs
> The six page tabs (Playing, Paused, Break, Song select, Results, Main menu), each with its widget count next to the
> name; the Playing tab active. Crop on the row of tabs.

## Selecting, moving, resizing

- **Click** a widget: selects it. `Shift` or `Ctrl` + click: adds it to or removes it from the selection.
- **Selection rectangle**: drag over the empty screen. `Ctrl + A` selects everything.
- **Drag**: moves the selection. The **handles** of a single widget resize it; `Shift` keeps its proportions.
- **Snapping**: the widget aligns to the edges and centres of the screen and of the other widgets (guide
  lines). `Alt` turns it off while dragging. The optional **Grid** helps placement: its size is adjustable (2 to 200 px, 10 by default) in the field that appears next to the button.
- **Arrows**: move by one pixel (`Shift`: 10).
- **Rotation**: the circle above the frame of a selection turns it around its centre; the widget follows the pointer
  exactly. `Shift`: 15° steps. **Double-click** the circle: back to 0°. `Escape` during the gesture cancels it. One
  gesture = one history entry. The **Rotation (°)** field of the inspector (typing, slider, reset button) sets the value
  of a single widget.
- A turned widget keeps its handles, which follow its rotation: they move the edge along the widget's own axis and the
  opposite edge stays fixed. Clicking and the selection rectangle aim at the turned shape.
- **Multi-selection and groups**: the rotation is rigid. Each widget turns around the centre of the selection (so a
  group turns as one block): its position orbits that centre and its own angle grows by the same amount.
- **Snapping and guides**: they work on the bounding box of the turned widget, as you see it. Resizing a turned widget
  does not snap to guides.

> [!SCREENSHOT] selection-handles
> A single widget selected on the preview screen: pink frame, eight white handles (corners and mid-points), a pink label
> with its name above. Next to it, a translucent blue selection rectangle in the middle of enclosing two other widgets.

> [!TIP] To move a widget without it snapping to its neighbours, hold `Alt` while dragging.

## Automatic anchor

You do not have to choose an anchor. When you move, resize, align, add or paste a widget, the editor attaches
it on its own to the area of the screen where it sits: a widget near the right edge becomes anchored to the
right and stays there on a wider screen.

To force an anchor, choose it in the 3×3 selector of the **Properties**: it is then **fixed** and no longer
follows the position. Untick then tick **Automatic anchor** to go back to automatic mode. The **screen format**
(16:9, 21:9, 16:10, 4:3, 32:9) lets you check that the layout fits everywhere.

> [!SCREENSHOT] anchor-selector
> **Placement** section of the Properties: the 3×3 anchor selector with "Top right" in pink, the X, Y, W, H fields, and
> the "Automatic anchor" switch with its help text. Show the on state then the off state (anchor fixed) side by side.

## Smart alignment

While dragging, the widget **snaps** by itself, and the editor draws what it snapped to:

- **Edges and centres**: those of the screen and of the other widgets, with pink guide lines;
- **The grid**, when it is shown;
- **Equal spacing**: the widget takes the **gap that two other widgets already have between them**, or **centres itself between its two neighbours** so that both gaps are equal. Pink **dimension markers** show the distance in pixels. Only widgets that **overlap on the other axis** count: a gap between two widgets of different rows means nothing.

`Alt` turns all the snapping off for the current gesture.

The fields and buttons of [Alignment](#alignment) and [Spacing](#spacing) (align, distribute, gaps) set the same thing by hand. With several widgets selected, **Same size** (*Width*, *Height* or *Both*, in **Properties → Spacing**) gives all of them the size of the **first selected widget**; locked widgets do not change.

## Alignment

The **Align** buttons (left, centre, right, top, middle, bottom) act on the selection: **one** object aligns to
the screen, **several** align to their common bounding box.

> [!SCREENSHOT] align-buttons
> Toolbar cropped on the "Alignment" group: the six buttons (left, centre, right, top, middle, bottom) with the "Align
> left" tooltip visible on the first, and three widgets before / after a left alignment as an inset.

## Spacing

With **at least two objects** selected, **Properties → Spacing** sets the gap between them:

- **Horizontal gap** / **Vertical gap**: the current gap between neighbours (the average if it is uneven).
  Enter a value: all objects are spaced evenly, from the first to the last, **the first staying in place**. A
  negative value makes them overlap.
- **Distribute horizontally / vertically** (also in the toolbar): evens out the gaps while keeping the two
  end objects in place. It needs **three objects** or more.

> [!SCREENSHOT] spacing-panel
> Three widgets selected on a line, unevenly spaced (before) then evenly (after distributing). On the right, the
> **Spacing** section with the two gap fields and the Distribute horizontally / vertically buttons. Two images side by
> side.

A **group** counts as **one object**; locked objects do not move. Successive entries in a spacing field form
a single undo step.

## Groups

A group gathers several widgets into **one object**: it is selected, moved, aligned and spaced as one block.

| Action | How |
| --- | --- |
| **Group** | `Ctrl + G` with at least two widgets selected (or the **Group** button). |
| **Ungroup** | `Ctrl + Shift + G` (or the **Ungroup** button). |
| **Select the group** | Click one of its widgets on the screen, or its line in the **Layers**. |
| **Select a single member** | Expand the group in the **Layers** (chevron) and click the widget. |

> [!SCREENSHOT] groups-layers
> **Layers** panel with an expanded "Group 1" line: chevron, group icon, counter "4", hover buttons (ungroup, move up,
> move down, lock) and its four widgets indented below. On the preview screen, the dashed frame around the selected
> group.

In the **Layers**, a group is **a single line**: a chevron expands it, a counter gives the number of widgets,
and buttons let you ungroup it, move it up or down one block, and lock it. The members of a group form a
contiguous block in the stacking order. Duplicating or copying a group creates a **new** one, without merging
with the original. A group that no longer contains more than one widget is dissolved automatically.

## Widget properties

| Section | Content |
| --- | --- |
| Header | The **Name** shown in the editor, duplicate, delete. For a built-in widget, the **View source code** button opens, read-only, the file that defines it (the text is inside the application, nothing is downloaded). |
| **Placement** | Anchor (3×3), `X`, `Y`, `W`, `H`, **Automatic anchor**. |
| **Pages** | The pages where the widget is displayed (at least one). |
| **Style** | Colour, **Text size** (multiplier), **Opacity** (a 0 to 100 % slider), **Text alignment** (auto = follows the anchor), **Animate numbers** and its duration. |
| **Typography** | **Font** (built-in, or imported from a TTF, OTF, WOFF or WOFF2 file), **Weight**, **Letter spacing**, **Shadow** (automatic, none, soft, strong, glow) and **Outline**. For built-in widgets. |
| **Options** | For a community widget: the options of its manifest. |

> [!SCREENSHOT] properties-panel
> Complete **Properties** panel of a Score widget, the whole panel visible (in two images if needed): header with the
> name, Placement, Pages (six switches), Style. Label each section with its name from the table.

## Copying and pasting the style

To give widgets the look of another one without touching their position or size:

1. select the model widget, then **Copy the style** (properties header, the widget's context menu, `Ctrl + Alt + C` or the [command palette](#command-palette));
2. select one or more widgets, then **Paste the style** (same places, `Ctrl + Alt + V`).

The copied **style** is that of the *Style* and *Typography* sections: colour, text size, opacity, alignment, number animation and typography. **Locked** widgets are skipped. If several widgets are selected when you copy, the first one is the model. Pasting is **a single** undo step.

## Layers

The layers list the widgets **of the displayed page**, from the front to the back. Each line lets you **move up /
down** the widget in the stacking order and **lock** it (a locked widget can neither be moved nor deleted, and can no longer
be selected by clicking the preview: only here). Drag a line to **reorder** it; `Escape` cancels. A line shows what tells
two widgets of the same kind apart (the key of a key cap, the words of a text).

> [!SCREENSHOT] layers-panel
> **Layers** panel of the Playing page: about ten widgets from front to back, one hovered line showing the move up /
> move down / lock buttons, another with the closed padlock (locked widget) always visible.

## Managing several layouts

Create as many named layouts as you like: **New…** (**Classic**, **Minimal**, **Top graph**, **Inputs**, **Focus** or **Empty** template),
**Duplicate…**, **Rename…**, **Delete**. **Use in game** chooses the one the overlay displays (the **Active in
game** badge marks the active one).

> [!SCREENSHOT] layout-management
> Top bar with the layout list open (default, Stream, Minimal, the active layout ticked) and, on the right, the New,
> Duplicate, Rename, Import, Export, Delete buttons, the tooltip of one of them visible.

**Import / export**: see [Sharing a layout](#sharing-a-layout).

## Sharing a layout

**Export…** gives two things:

- a **`.yarlayout` file** (**Download file**): JSON that contains the layout **and every picture and font it uses**, encoded in base64. A layout alone only keeps the *ids* of its pictures and fonts, which mean nothing on another computer: the file carries them along. It weighs **40 MB** at most, for **64 files** at most;
- a **share code** `yar1:…` (**Copy the code**): the same content, compressed, as a short text to paste in a message. It is only offered if it is **120,000 characters at most**; beyond that, share the file.

A layout whose picture or font is no longer in the application cannot be exported: import it again, or remove the widget that uses it.

**Import…** accepts a **file** (`.yarlayout` or `.json`), a `yar1:…` **code**, the pasted **text of a file**, or a **plain layout JSON** (what the editor exported before). The embedded pictures and fonts are imported **under the same id** (an id is the hash of its content), so the layout works straight away. An invalid file, or an embedded file that is neither a valid picture nor a valid font, is **refused**.

## Saved versions

Auto-save overwrites the file on every change; to go back, the **Saved versions** button (a clock, next to Undo / Redo)
lists the older versions of the layout, kept before a burst of changes overwrote it (at most one every two minutes, the
latest 40). Pick one to see it, then **Restore this version**: it is an edit like any other, which `Ctrl + Z` undoes.

## Saving

With **Auto-save**, each change is saved half a second later and the in-game overlay picks it up live. Without it,
`Ctrl + S` saves. The state ("Saved", "Unsaved changes") is shown at the top right.

> [!SCREENSHOT] save-state
> Two cropped details side by side: at the top right of the top bar, the green "Saved" indicator with its tick; and,
> next to it, the amber "Unsaved changes" state. Under each, the "Auto-save" switch.

## Command palette

`Ctrl + K` (or the magnifier button) opens the command palette: one search to **add a widget**, **open a layout**,
change the **theme** or the preview **background**, go to a **page**, or run an action (save, undo, grid, snapping, copy or paste the style). The
arrows move through the list, `Enter` runs, `Escape` closes. As you move through the list, the right side shows the
result: the real widget, the theme's miniature or the background.

## Preview data

The **Data** menu chooses what the widgets show: **Simulated** (an animated fictional play, to work without the
game) or **Live** (the real state of osu!lazer).

## Shortcuts

| Keys | Action |
| --- | --- |
| `Delete` / `Backspace` | Delete the selection |
| `Ctrl + Z` / `Ctrl + Y` (or `Ctrl + Shift + Z`) | Undo / redo |
| `Ctrl + C` / `Ctrl + V` / `Ctrl + D` | Copy / paste / duplicate |
| `Ctrl + Alt + C` / `Ctrl + Alt + V` | Copy / paste the style |
| `Ctrl + G` / `Ctrl + Shift + G` | Group / ungroup |
| `Ctrl + A` | Select all |
| Arrows (`Shift`: ×10) | Move the selection |
| `Alt` while dragging | Turn snapping off |
| `Shift` while resizing | Keep the proportions |
| `Shift` while rotating | 15° steps |
| `Escape` during a gesture | Cancel the gesture (move, resize, rotate) |
| `Ctrl + S` | Save |
| `Ctrl + K` | Command palette |
| `Escape` | Deselect |

> [!SCREENSHOT] shortcuts-bar
> Shortcut strip at the bottom of the editor, cropped: the keys Delete, Ctrl Z / Ctrl Y, Ctrl C / Ctrl V / Ctrl D, Ctrl
> G / Ctrl Shift G, arrows, Shift, Alt and Ctrl S with their labels.

The shortcuts are inactive while you type in a field or while a dialogue box is open.
