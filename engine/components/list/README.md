# list

Numbered, lettered, bulleted or checklist items, revealed one by one. Item text is inline Markdown.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `items` | `[{ id?, text, sub? }]` | (required) | snap | The items. `text` and `sub` are inline Markdown (emphasis, code, links); raw HTML is shown as text. `id` is unique and defaults to the index as a string. |
| `marker` | `"number"` \| `"letter"` \| `"bullet"` \| `"check"` | (required) | snap | `1.` `2.`, `a.` `b.` (always latin, also in a Spanish deck), a bullet, or a box that ticks. |
| `shown` | integer >= 0 | all items | fade | Items `0..shown-1` are visible. Hidden items keep their space. |
| `done` | integer or `string[]` | none | draw | For `check`: how many items from the top are done, or the ids that are. An unknown id is an element error naming it. |
| `active` | integer or string | none | fade | One item emphasised: its index or its id. The text of the others turns muted. An unknown id is an element error naming it. |
| `rule` | boolean | `false` | snap | An accent rule on the left of the list. |

Behaviour:
- **Driven by props only.** The component never reads the slide's step. Set `shown`, `done` and `active` per step
  with `advance` (`advance: { prop: "shown", values: [0, 1, 2, 3], start: "start" }`) or with `set` on a step.
- **Motion** (forward by exactly one step only; any other move renders directly): items that become visible rise and
  fade in, staggered; a check mark is drawn when an item becomes done; `active` fades the text color between the
  emphasised and the muted one. Going backward, a ticked item unticks and a shown item hides, with no motion.
- **Idempotent.** Every `update` writes the state straight from the props first and removes the inline styles the
  motion used, so the markup after playing equals the markup after jumping.
- **Layout.** Hidden items keep their space (`visibility`), so nothing reflows between steps. Long text wraps inside
  the item. Item text is the body size and `sub` the note size, both at least `--sd-min-audience-font`; colors come
  from theme tokens.
- **Checklists** draw a box (an SVG) instead of a text marker; `done` as a number ticks the first n items, as a list
  it ticks the named ids. For other markers `done` has no effect.

See `example.js` for a slide that uses it.
