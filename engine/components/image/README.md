# image

A local image with required alt text, an optional caption and a fit mode: the figure on a cover, or a picture
anywhere on a slide. The image has finished loading before its step settles.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `src` | string | (required) | fade | Path to the image file, relative to the deck root (like a data path). Remote URLs, paths that leave the deck and paths containing `%` are not allowed. |
| `alt` | string | (required) | snap | Alt text describing the picture. Required; it cannot be empty or only spaces. |
| `fit` | `"contain"` \| `"cover"` | `"contain"` | snap | `contain` shows the whole image inside the box; `cover` fills the box and crops the overflow. |
| `caption` | string | none | fade | A caption under the image, inline Markdown (emphasis, code, links; raw HTML is shown as text). |

Behaviour:
- **Driven by props only.** The component never reads the slide's step. Change `src`, `fit` or `caption` per step
  with `set` on a step.
- **Path.** `src` resolves against the deck root exactly like a data path (the engine's `ctx.assetUrl`). The
  validator checks that the file exists, in that exact case, and that no remote URL is used.
- **Loading.** `update` waits for `img.decode()`, so `settled()` (and a screenshot) covers the load. A file that is
  missing or is not a decodable image is an element error naming the path; sibling elements carry on.
- **Motion** (forward by exactly one step only; any other move renders directly): a new `src` fades in once it has
  loaded, a changed `caption` fades in, and an element that becomes visible fades in. `fit` switches without motion.
  Going backward renders directly. Every `update` writes the state first and removes the inline styles the motion
  used, so the markup after playing equals the markup after jumping.
- **Layout.** In a region the element takes the room it is given; the picture fills the width and the height the
  caption leaves, so a long caption makes the picture shorter, never overflow. The caption is the note size (at least
  `--sd-min-audience-font`) in the muted colour and wraps inside the box. With no caption there is no caption element.
- **Alt text.** It becomes the `alt` attribute of the `<img>`. Describe what the picture shows, not its file name.
- **Errors.** A missing or blank `src` or `alt`, a `fit` other than `contain` or `cover`, a `src` outside the deck,
  and a file that fails to load each raise an element error naming the problem.

See `example.js` for a slide that uses it.
