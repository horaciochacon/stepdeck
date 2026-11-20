# figure-notes

A figure with a column of notes beside it: a title band on top, the figure in `main` on the left,
`notes` on the right and a `footer` line for the source. The workhorse layout for results slides.

| Region | Meaning |
|---|---|
| `title` | Title band across the canvas (the slide's `title` sugar goes here). |
| `main` | The figure. A single element fills the region's full height, so a chart can measure it at mount. A chart, diagram, image or terminal also fills the room the other elements leave (a source line below it, for example). |
| `notes` | Notes column to the right of the figure. Elements stack vertically, centered on the figure. |
| `footer` | Footer line across the canvas, typically the source (`role: "source"`). |

| Variable | Default | Meaning |
|---|---|---|
| `--notes-width` | `560px` | Width of the notes column; `main` takes the rest. Override per slide with `regions: { "--notes-width": "700px" }`. |
| `--notes-gap` | `72px` | Space between the figure and the notes column. |

At the default width the notes column holds about 20 characters per line at the body size
(40px); use `role: "note"` (32px) for longer notes, or widen `--notes-width`.

See `example.js`.
