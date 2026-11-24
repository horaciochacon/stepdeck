# Design defaults

These are the defaults that make a stepdeck slide read. They are not rules of the engine: `validate` and `check` enforce only the ones that name a rule id. Follow them unless the user asks for something else.

The numbers on this page were measured with `dump` on the `modern` theme at the default sizes. They are limits, not targets.

## One slide, one claim

- **The title is the claim, as a sentence.** "Group B overtakes Group A after 2020", not "Results by group". A reader who sees only the titles should follow the talk.
- **One accent phrase.** Put `*…*` around the words that carry the claim: `title: "Group B *overtakes Group A* after 2020"`.
- **Keep the title to one line.** That is about 50 characters on the content layouts (a line holds 52 to 58, depending on the letters). A second line takes 73px from the figure.
- **The `lede` is the sentence that changes.** The title holds for the whole slide; the `lede` under it says what this step shows, and a step can `set` it. One line is about 100 characters.
- **Every number comes from a data file**, through a binding or a chart column. **Every figure has a source line.** `validate` enforces only the source line (`figure-source`); the rest is yours to keep.

## Steps: one click, one new thing

- **Step 0 shows the frame**: the title, the axes, the first series, the question. Each click adds one thing or moves the focus. **The last step is the takeaway.**
- **Two to five steps on a content slide.** The repository's own example slides have 1 to 6 steps, with a median of 3. A cover and a statement often have one.
- **Every step changes what is on screen.** A step that changes nothing is `noop-step`. A slide that shows everything at step 0 is `step0-shows-all`: hold something back.
- **Change a prop rather than swap elements.** Grow `series_shown` or `shown`, move `highlight`, change `sort`, `view`, `until`, `progress` or `done`, with `set`, `only` or `advance`. The component animates the change, and nothing else moves. The catalog's `animates` list says which props move.
- **Reserve the space.** An element with `from` keeps its space while hidden; `ghost` shows a dashed placeholder there. Use `collapse: true` only when you want the rest to reflow.
- **Do not add steps to get motion.** Everything that appears on a step enters by itself, in turn.
- **At most about four elements entering on one step.** More reads as noise. `transition: { stagger }` spaces them, up to 1000 ms; an entrance that settles 8 s or more after the click is `motion-budget`.
- **Put what you will say in the step's `notes`**, on a step that also changes something.
- **Make each change big enough to see.** A `sort` step moves only rows whose order changes, so write the data in a neutral order (alphabetical) rather than nearly sorted. `active` on a list only dims the other items: pair it with a `lede` change. A waterfall from a large level (24.6 M) to the next shows its changes as slivers: chart the changes and put the two levels in `big-number`s.
- **Keep a number with its words.** In `markdown`, `&nbsp;` between a bound number and its unit stops a line break between them. Put a phrase such as "a year" in a `big-number`'s `label`, and keep `suffix` for a short unit.

## Pick the layout by its job

| The slide is | Layout |
|---|---|
| The opening, or a section opener | `title` |
| One sentence or one question | `statement` |
| A chart with two or three short notes, or a chart beside a big number | `figure-notes` |
| One large figure: a map, a diagram, a wide chart, a terminal, a chat | `full-bleed` |
| Two things side by side: before and after, a prompt and its result | `halves` |

A chart, a diagram or a map never goes in `statement` `main`: that region has no set height, and the figure collapses.

## Pick the component by the claim

| The claim is about | Component |
|---|---|
| A trend, a forecast, uncertainty over time | `chart.line` (`forecast`, `draws`) |
| A ranking or a comparison of categories | `chart.bar` |
| What adds up to a change | `chart.bar` with `mode: "waterfall"` |
| Two groups across the same categories | `chart.bar` with `mode: "back-to-back"` |
| Estimates with intervals, or before and after | `chart.points` |
| One number | `big-number` |
| Where | `map` |
| How parts connect | `diagram` |
| A short ordered set | `list` |
| Stages along a path | `timeline` |
| A prompt, a quote, an exchange | `chat` |
| What was run | `terminal` |
| Anything else | a [custom component](custom-components.md) |

For a "you are here" copy of a diagram or a map beside another figure, use `compact: true`. There is no scatter plot and no table component; a small table fits in `markdown`.

## How much fits

| Where | Limit |
|---|---|
| Title on a content layout | 1 line, about 50 characters |
| Title on the `title` cover | about 20 characters a line, 3 lines at most |
| `lede` | 1 line, about 100 characters |
| A `statement` sentence | about 45 characters a line; two or three lines |
| Body text across `full-bleed` | about 90 characters a line |
| `figure-notes` notes column, `role: "note"` | about 33 characters a line (about 25 at the body size) |
| A `list` in `full-bleed` `main`, under a one-line title | 11 one-line items, or 7 with a `sub` line |
| A `chat` in `full-bleed` `main`, under a one-line title | 5 one-line messages that each have a `label` (6 overflow); 7 when only each speaker's first message has one (6 with a `lede`) |
| Any audience text | 28px or more; only the source line and the `footer` region may be smaller (`font-too-small`) |

These are limits, not targets. Aim for three to five list items, two or three notes of under 80 characters each, and one figure per slide. When text overflows, `check` reports `text-outside-region`: cut words before you shrink type.

## Look before you call it done

`check` measures text only. It does not see a note that covers a chart's marks, a cropped image or a chart with nothing in it. Open every shot (or read the dump) and ask:

1. Does the title state the claim, and does the last step show it?
2. Does step 0 orient the audience and still hold something back?
3. Does anything cover the figure's marks, or crowd an edge of the slide?
4. Is each step's change visible at 960 px wide, the size of the shots?
5. Is any region empty at a step where it should not be (a blank notes column, a figure with a blank half below it)?
