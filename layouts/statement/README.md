# statement

One large centred sentence or question. `main` sits in the middle of the canvas, set in
`--sd-font-size-statement` with balanced lines; an optional `title` hangs from the top margin and a
`footer` line sits on the bottom margin. Use it for a claim, a question to the room, or a quote.

| Region | Meaning |
|---|---|
| `title` | Optional title at the top (the slide's `title` sugar goes here). Leave it out for a bare statement. |
| `main` | The statement, centred horizontally and vertically in `--sd-font-size-statement`. Use a `markdown` element to bold key words. |
| `footer` | Footer line on the bottom margin, typically the source (`role: "source"`). |

| Variable | Default | Meaning |
|---|---|---|
| `--statement-width` | `1500px` | Measure of the statement. Override per slide with `regions: { "--statement-width": "1200px" }` for a shorter line. |

Keep a statement to one or two sentences: at 64px the default measure holds about 45 characters
per line, and long text wraps with balanced lines. Every size stays at or above
`--min-audience-font` (28px). The main text is centred between the title row and the footer row,
so it sits about 24px below the geometric centre of the canvas, which is the canvas margin
asymmetry shared with the other layouts.

See `example.js`.
