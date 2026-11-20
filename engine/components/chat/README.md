# chat

An exchange shown as bubbles, or a single prompt or quote shown as a bordered card. Message text is inline Markdown.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `messages` | `[{ role, label?, text }]` | (required) | snap | The messages. `role` is `"user"`, `"agent"` or `"note"`. `label` is an optional line above the text. `text` is inline Markdown (emphasis, code, links); raw HTML is shown as text. |
| `style` | `"bubbles"` \| `"card"` | `"bubbles"` | snap | Rounded bubbles, or full-width bordered cards with the label on top. |
| `shown` | integer >= 0 | all messages | fade | Messages `0..shown-1` are visible. Hidden messages keep their space. |
| `typing` | boolean | `false` | draw | Type the newest message on a forward step. |

Behaviour:
- **Driven by props only.** The component never reads the slide's step. Set `shown` per step with `advance`
  (`advance: { prop: "shown", values: [0, 1, 2], start: "start" }`) or with `set` on a step.
- **Bubbles.** `user` aligns right, `agent` and `note` align left; a bubble is at most 80% of the width. A user
  bubble is the surface tinted with the accent, an agent bubble the plain surface, a note a dashed outline with
  muted text. Text is ink on those surfaces (at least 4.5:1 contrast in the built-in theme).
- **Cards.** Each message is a full-width card with a 2px border (the accent, or the rule color for a note) and
  its `label` at the top. Use one message for a prompt or a quote.
- **Motion** (forward by exactly one step only; any other move renders directly): messages that become visible rise
  and fade in, staggered. With `typing`, the newest message is then typed, character by character; the untyped
  rest keeps its place (hidden), so the box never grows while typing. The end state is always the full text.
- **Idempotent.** Every `update` writes the state straight from the props first and removes the inline styles the
  motion used, so the markup after playing equals the markup after jumping. An interrupted step snaps to its end.
- **Layout.** Long messages wrap inside the box. Text is the body size and `label` the label size, both at least
  `--sd-min-audience-font` (28 px); colors and borders come from theme tokens.

See `example.js` for a slide that uses it.
