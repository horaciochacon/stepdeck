# full-bleed

One `main` region filling the 1920×1080 canvas, with an optional `title` band on top.
It is the default layout when a slide names none.

| Region | Meaning |
|---|---|
| `title` | Title band (the slide's `title` sugar goes here). Zero height when absent. |
| `main` | Elements stack vertically in the order listed. |

| Variable | Default | Meaning |
|---|---|---|
| `--title-height` | `auto` | Height of the title band. Override per slide with `regions: { "--title-height": "200px" }`. |

Elements with a `box` float on the canvas regardless of region.
