# title

A cover slide, laid out like a printed cover. The `title` region spans the top rows: the slide's
`section` (the kicker, a small label) sits on the top margin and the title on the bottom of that band, so
the title and the subtitle land in the upper middle. The meta block (authors, affiliation, date) sits on
the bottom margin, with the footer line below it; the space between the subtitle and the meta block is
the flexible row. No rules, boxes or color fields: the hierarchy comes from size, weight and the muted
color, and a theme may add its own marks.

| Region | Meaning |
|---|---|
| `title` | The talk title in `--sd-font-size-cover` (the slide's `title` sugar goes here), and the kicker from the slide's `section` above it. |
| `subtitle` | Subtitle in `--sd-font-size-heading` and `--sd-color-muted`. |
| `meta` | Authors, affiliation, venue and date, on the bottom margin. Elements stack with a small gap, in `--sd-font-size-note`. |
| `figure` | Optional figure on the right margin, beside the title column: an image, a chart or a map. Leave it empty for a plain cover. |
| `footer` | Footer line on the bottom margin: a source, license or event line (use `role: "source"`). |

| Variable | Default | Meaning |
|---|---|---|
| `--title-width` | `1400px` | Measure of the title, subtitle and meta column. Override per slide with `regions: { "--title-width": "1600px" }` for a long title. |
| `--meta-gap` | `64px` | The least space between the subtitle and the meta block (the row between them takes all the free height above that). |
| `--figure-width` | `720px` | Width of the figure column. Only applies when `figure` holds an element; override with `regions: { "--figure-width": "900px" }`. |

While `figure` is empty the layout is the plain cover. When it holds an element, the layout
switches to two columns: the figure takes `--figure-width` on the right margin, in the rows above the
footer (several elements are centered vertically there), and the title column takes the rest of the
width (it no longer stops at `--title-width`), with a canvas-margin gap between them. A single figure
element fills the region's height, so a chart can measure it at mount (a chart, diagram, image or
terminal fills what the other elements leave). With a figure the title uses
`--sd-font-size-cover-figure` instead of `--sd-font-size-cover`, so a title of about 40 characters stays
within three lines at 1920×1080. The layout has `kind: "cover"`; core picks the smaller size only for a
region named `figure`.

Set a `section` on the slide to get the kicker. Without one the band holds only the title, still on its
bottom. The title region is a stretched column and an inline-size container, so a copy of this layout
must keep it in a `1fr` or sized column, never `auto`.

Long titles wrap with balanced lines. Keep the title to one to three lines at 1920×1080. At the
default cover size (`modern`: 140px) three lines fit; a kicker plus four lines overflows the cover,
four lines can too once the meta block has two lines and there is a footer, and five or more always
do (`check` reports `text-outside-region`); widen `--title-width` or shorten the title before
shrinking type. Every size stays at or above `--min-audience-font` (28px).

See `example.js`.
