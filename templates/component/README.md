# __NAME__

A deck component, scaffolded by `stepdeck new-component __NAME__`. It lives in
`components/__NAME__/` and is listed in `components: []` in `deck.js`. Edit all four files:

| File | What it is |
|---|---|
| `schema.json` | The props, as JSON Schema 2020-12. Every prop needs `description`, `examples` and `x-transition` (`tween`, `draw`, `fade` or `snap`: how a change of it animates). The top-level `description` is the catalog entry; its first sentence is the summary. |
| `index.js` | `mount(el, props, ctx)` builds the DOM and returns `{ update(props, info), destroy() }`. |
| `example.js` | A slide that uses the component. |
| `README.md` | This file. |

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `items` | string[] | (required) | snap | The items, in order. |
| `stage` | integer | `0` | fade | Index of the current item; items up to it are marked. `-1` marks none. |

## The contract, in short

- `update` is **idempotent**: it renders exactly the props it is given, from any previous state,
  so a jumped step equals a played one. Keep one `render(props)` that writes the whole state.
- Animate only when `info.animate` is true, and `await` the `ctx.motion` and `ctx.animate` helpers
  with `info.signal`, so an abort snaps to the end state and `STEPDECK.settled()` waits for you.
- Do not fade the element in when it appears (`info.entered`): the engine moves its box. Animate
  changes only, with `ctx.motion.in(node, "fade", ctx.motion.timing(info))` and the other named
  motions (`rise`, `wipe`, `pop`), so the theme sets the timing. To build your own entrance instead, declare
  `"x-enter": "own"` in `schema.json` and play the build when `info.entrance.motion` is `"draw"`,
  writing its start state before the first `await`.
- Read colors and sizes from theme tokens (`var(--sd-color-ink)`, `ctx.tokens`, `ctx.palette()`),
  never literals; text stays at or above `--min-audience-font` (28px).
- Props are JSON only. Bind figures to data files (`{{data/x.json#/n}}`) instead of typing them.
- To reuse a built-in inside this component, `await ctx.mount("text", el, props)`.

Check it: copy `example.js` to `slides/__ID__.js`, add `"__ID__"` to `slides` in `deck.js`,
then run the CLI's `validate` and `check --played` on the deck (`new-component` prints both commands).
