# halves

Two halves side by side under a title band, with a footer line: before and after, a prompt and its
tasks, two options. The halves are equal by default and `--split` changes the ratio.

| Region | Meaning |
|---|---|
| `title` | Title band across the canvas (the slide's `title` sugar goes here). |
| `left` | The left half. A single element fills the half's full height, so a figure can measure it at mount. |
| `right` | The right half, same rules as `left`. |
| `footer` | Footer line across the canvas, typically the source (`role: "source"`). |

| Variable | Default | Meaning |
|---|---|---|
| `--split` | `1fr 1fr` | Column tracks of the halves. Override per slide with `regions: { "--split": "2fr 1fr" }` for a wide left half. Give exactly two tracks. |
| `--gutter` | `var(--sd-region-gap)` | Space between the halves. Override with `regions: { "--gutter": "96px" }`. |
| `--align` | `start` | Vertical alignment of each half's content: `start`, `center` or `end`. Override with `regions: { "--align": "center" }` when short halves leave the lower part of the slide empty. A single element still fills its half, so a figure measures the full height; its content moves inside it. |

Elements in a half stack vertically with `--sd-region-gap` between them. Each half is about 840px
wide at the default split, so text wraps at roughly 40 characters per line at the body size
(40px); use `--split` to give the denser half more room.

See `example.js`.
