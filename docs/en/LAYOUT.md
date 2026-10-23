# Layout format

Layouts are JSON files in the application's configuration folder (`overlays/<name>.json`). They are normally edited in
the [editor](EDITOR.md), but the format is open: you can read, generate or correct them by hand.

```json
{
  "version": 2,
  "name": "default",
  "referenceHeight": 1080,
  "widgets": [
    {
      "id": "score",
      "type": "score",
      "anchor": "top-right",
      "x": 30, "y": 24, "w": 500, "h": 84,
      "pages": ["playing", "paused", "break"],
      "style": { "color": "#ffffff", "align": "right", "scale": 1, "opacity": 1 }
    }
  ]
}
```

| Document field | Description |
| --- | --- |
| `version` | `2`. `version: 1` layouts are converted automatically (see below). |
| `name` | Name of the layout (that of the file). |
| `referenceHeight` | Height of the screen the layout is designed for (`1080`). |
| `widgets` | List of widgets. The **order** is the stacking order: the last one is in front. |

## Anchors: a layout that fits every screen

Each widget is **attached** to one of the nine points of the screen: `top-left`, `top`, `top-right`, `left`,
`center`, `right`, `bottom-left`, `bottom`, `bottom-right`. `x` and `y` are the distances to this point:

- on an axis attached to an **edge**, it is the margin **inward** (a `top-right` widget with `x: 30` is 30 px from the right edge);
- on a **centred** axis, it is a signed offset from the centre (positive = right / down).

> [!SCREENSHOT] anchors-diagram
> Diagram (not a screenshot): a 16:9 screen with the nine anchor points labelled (top-left, top, top-right, left,
> center, right, bottom-left, bottom, bottom-right) and a widget attached to top-right with arrows labelled `x: 30`
> (inward from the right edge) and `y: 24` (from the top).

The layout is designed for a screen `referenceHeight` pixels tall (1080) and **scaled by height** to the window of
the game. On a wider screen (21:9, 32:9), the screen has more width but the widgets keep their size and stay on their
edges.

> [!SCREENSHOT] anchors-ultrawide
> The same layout seen in the editor in 16:9 then in 21:9 (two stacked images): the widgets stay attached to their
> edges, the wider screen only adds space in the middle.

## Fields of a widget

| Field | Description |
| --- | --- |
| `id` | Unique identifier of the widget in the layout. |
| `type` | Built-in widget ([list](BUILTIN_WIDGETS.md)) or `web` for a community widget. |
| `widget`, `options` | For `web`: folder of the widget and values of its options (see [Community widgets](WIDGETS.md)). |
| `name` | Name shown in the editor (optional). |
| `anchor`, `x`, `y` | Anchor and distances (see above). |
| `anchorLocked` | `true` if the anchor was chosen by hand (it then no longer follows the position). |
| `w`, `h` | Size in reference pixels. |
| `pages` | Pages of the game where the widget is displayed (see below). |
| `style.color` | CSS colour of the text / bars. |
| `style.scale` | Multiplier of the text size (default `1`). The base size depends on `h`. |
| `style.opacity` | `0`–`1`. |
| `style.align` | `left`, `center` or `right`. Absent = automatic: follows the widget's anchor. |
| `style.animate`, `style.animationMs` | Number animation (see below). |
| `locked` | Editor: the widget cannot be moved. |
| `group` | Editor: identifier of the group the widget belongs to (`group-1`…). Widgets that share the same value form a group, selected and moved as one block. A group of a single widget is ignored. Does not affect rendering. |

## Pages

| Value | Moment of the game |
| --- | --- |
| `playing` | In a play |
| `paused` | Play paused |
| `break` | Break in the middle of a map |
| `songSelect` | Song selection |
| `results` | Results screen |
| `menu` | Main menu |

Default value: `playing`, `paused`, `break`. The old `visibleWhen` field is still read: `always` = all pages, any other
value = the play pages. Widgets that read the score have no data on `results` (the score is only read during a play).

The overlay is only on screen if the layout draws something on the current page (see [In-game overlay](OVERLAY.md)).

## Animated numbers

Numbers (score, combo, accuracy, PP, UR, key counters) **count towards their new value** instead of jumping: they go up,
or down (for example a combo falling back to 0), with a curve that slows down on arrival.

| `style` field | Default | Effect |
| --- | --- | --- |
| `animate` | `true` | `false` turns the animation off (the number jumps directly). |
| `animationMs` | `250` | Duration of the animation. |

```json
{ "id": "score", "type": "score", "anchor": "top-right", "x": 30, "y": 24, "w": 500, "h": 84,
  "pages": ["playing"], "style": { "animate": true, "animationMs": 400 } }
```

The animation advances at the chosen refresh rate: at 30 fps, it makes 30 steps per second.

## Compatibility

- `version: 1` layouts (absolute positions on 1920×1080) are converted when opened: their widgets become anchored to the
  top left.
- Unknown fields are ignored; an invalid document is refused ("This is not a valid layout").
- Duplicate widget identifiers receive a suffix (`score-2`).
