# full-bleed

One `main` region filling the 1920×1080 canvas, with an optional `title` band on top.
It is the default layout when a slide names none.

| Region | Meaning |
|---|---|
| `title` | Title band (the slide's `title` sugar goes here). Without a title it holds no text but keeps its top padding (`--sd-canvas-margin`, 96px), so the first element in `main` starts at y = 120 (the margin plus `--sd-region-gap`). |
| `main` | Elements stack vertically in the order listed. |

| Variable | Default | Meaning |
|---|---|---|
| `--title-height` | `auto` | Height of the title band. Override per slide with `regions: { "--title-height": "200px" }`. |

Elements with a `box` float on the canvas regardless of region.
