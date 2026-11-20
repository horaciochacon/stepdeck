# image

`image` shows one local picture with required alt text, an optional caption and a fit mode. Use it for the figure on a cover or for a picture anywhere on a slide. This page lists every prop, the markup, how the picture fills its region, when it moves, and the errors it raises. It is for anyone writing slides by hand or reviewing what an agent wrote.

Sources: [`components/image/schema.json`](../../../components/image/schema.json), [`components/image/index.js`](../../../components/image/index.js), [`core/data.js`](../../../core/data.js), [`core/stepdeck.css`](../../../core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

The cover of the kit example (`examples/kit/slides/cover.js`) puts an image in the `figure` region of the `title` layout:

```js
{ id: "figure", region: "figure", type: "image",
  props: { src: "assets/cover.svg", alt: "A chat prompt and an agent's reply above a bar chart whose bars get shorter" } },
```

The file lives at `examples/kit/assets/cover.svg`, inside the deck folder. `src` is a path relative to the deck root, the same as a data path.

A picture that gains a caption and then changes. This slide was checked with `validate`, `dump` and `check --played`. Put it in a deck whose `assets/` folder holds `cover.svg` and a second picture, `cover-b.svg` (copy `examples/kit/assets/cover.svg` to make one); without `cover-b.svg`, `validate` reports `file-missing` and the `swap` step fails to load:

```js
export default {
  id: "pic",
  layout: "halves",
  title: "A picture that changes",
  elements: [
    { id: "photo", region: "left", type: "image",
      props: { src: "assets/cover.svg", alt: "A chat prompt above a bar chart", fit: "cover" } },
    { id: "text", region: "right", type: "text", props: { text: "Read the picture from left to right." } },
  ],
  steps: [
    { id: "start" },
    { id: "captioned", set: { photo: { caption: "Synthetic figure, made for *this* deck" } } },
    { id: "swap", set: { photo: { src: "assets/cover-b.svg", fit: "contain" } } },
  ],
};
```

At `captioned` the caption fades in under the picture. At `swap` the new file fades in once it has loaded, and the fit switches to `contain` at once.

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `src` | string, not empty | yes | | fade | Path to the image file, relative to the deck root. Remote URLs, paths that leave the deck and paths containing `%` are errors. |
| `alt` | string with at least one non-space character | yes | | snap | Alt text: what the picture shows, for people who cannot see it. It becomes the `alt` attribute of the `<img>`. |
| `fit` | `contain` \| `cover` | no | `contain` | snap | `contain` shows the whole picture inside the box. `cover` fills the box and crops what overflows. |
| `caption` | string, inline Markdown | no | none | fade | A caption under the picture, in the note size and the muted color. |

The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`). The Transition column is the schema's `x-transition` annotation, which feeds the catalog; the actual motion is described in [Motion](#motion).

Notes on each prop:

- **`src`** follows the data-path rules in `core/data.js` (`ctx.assetUrl`). It must not start with `/`, hold a backslash, start with a scheme such as `https:`, contain `%`, or have a `..` segment. Any extension is accepted at runtime; the browser decides whether it can decode the file.
- **`alt`** should describe the content, not the file name. A blank or spaces-only value is an error.
- **`caption`** is rendered with the engine's inline Markdown: emphasis, code and links work. Raw HTML is shown as text, and only `http:`, `https:`, `mailto:`, relative and `#anchor` links survive. Set it to `null` in a step's `set` to remove it; the `<figcaption>` is then removed too. A non-string value is converted with `String()`.

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="image"]`) the component renders:

```html
<figure class="sd-image" data-fit="cover">
  <img class="sd-image-img" src="…/assets/cover.svg" alt="A chat prompt above a bar chart">
  <figcaption class="sd-image-caption">Synthetic figure, made for <em>this</em> deck</figcaption>
</figure>
```

- `data-fit` holds the current `fit`. `src` on the `<img>` is the resolved URL, not the deck-relative path you wrote.
- The `<figcaption>` exists only while there is a caption. With no caption there is no caption element.
- Nothing is drawn at mount. The component builds an empty `<figure>` and `<img>` and sets `src`, `alt` and the caption on the engine's first update, for the step being shown. This avoids starting a load for the step-0 `src` that a later step would replace.
- Each update waits for `img.decode()` before it settles, so `STEPDECK.settled()`, `dump`, `check` and `shoot` all see the picture loaded.

`dump` prints the caption as the element's text. Use slide `style` with these classes to restyle one slide.

## Size and layout

`core/stepdeck.css` gives `image` a fill rule that does not depend on the layout:

| Part | Style |
| --- | --- |
| Element in a region | `flex: 1 1 0; min-height: 0`, a column flex. It takes the room the region leaves after its other elements. |
| Figure (`.sd-image`) | Column flex with a gap of `--sd-space` between picture and caption. |
| Picture (`.sd-image-img`) | Full width, `flex: 1 1 0`, `object-fit` from `fit`. |
| Caption (`.sd-image-caption`) | `--sd-font-size-note`, `--sd-line-height`, `--sd-color-muted`; wraps anywhere. Code is in `--sd-font-mono`, strong text in `--sd-font-weight-strong`, links in `--sd-color-accent`. |

So an image fills any region of any layout, alone or next to other elements. This is unlike `chart.line` and `chart.bar`, which fill only in layouts that give an only child the full region (see [Layouts](../layouts.md)). A long caption makes the picture shorter; the picture never overflows the box. In the example above, the image in a `halves` half measures 852×790 canvas pixels. The fill rule does not apply to a collapsed or failed element.

## Motion

The engine animates an update only when you move forward exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (`shoot`, `check`) draw the target state at once. See [Animation and motion](../../guide/animation-and-motion.md).

When the update animates, the motion starts after the new picture has decoded:

| What happened | What moves |
| --- | --- |
| The element just became visible | The whole figure fades in. |
| `src` changed (element already visible) | The picture fades in. |
| `caption` changed to a non-empty value (element already visible) | The caption fades in. |
| `caption` removed | The caption disappears at once. |
| `alt` or `fit` changed | Nothing moves; the new value applies at once. |

- Fades last the step's `transition.duration` when set, else 400 ms (the engine's default fade length). They do not follow the theme's `--sd-duration` token.
- If you move on before a fade ends, it stops and the final state is shown.
- Every update writes the target state first and removes the inline styles the motion used, so the markup after a played step equals the markup after a jump. `check --played` on the example slide reports no problems.

## Supported files

At runtime, any file the browser can decode works. `validate` checks that a file exists (rule `file-missing`) and has the right case (rule `path-case`) only when the path ends in one of these extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif` (plus the data, video and audio extensions it also checks), uses only letters, digits, `_`, `-`, `.` and `/`, and does not start with `.` (so `./assets/a.png` and `assets/my pic.png` are not checked). Use plain names such as `assets/my-pic.png` with one of these extensions so that a typo is caught before you open the browser.

Paths are case-sensitive once a deck is published. On a case-insensitive disk (the macOS default) `assets/Cover.svg` loads `assets/cover.svg` in the browser, but `validate` still reports it:

```text
bad/case · path-case · src = assets/Cover.svg vs on disk: assets/cover.svg · set src to "assets/cover.svg" (or rename the file); paths are case-sensitive once published
```

## Errors

The component checks its props on every update. A failed check makes the element show the message on the slide and stop updating; sibling elements carry on. `dump` lists it under `error:` and `check` reports it as `render-error`. The messages:

| Cause | Message |
| --- | --- |
| `src` missing, not a string or empty | ``image needs a `src`: a path to an image file in the deck`` |
| `alt` missing, not a string or blank | ``image needs non-empty `alt` text describing the picture`` |
| `fit` not `contain` or `cover` | ``image `fit` must be one of 'contain', 'cover', got <json>`` |
| `src` breaks a path rule | ``image `src` '<src>': <path message>`` |
| The file is missing or cannot be decoded | `image '<src>' could not be loaded: the file is missing or is not a decodable image (<url>)` |
| The engine passes no `ctx.assetUrl` to the component | ``image: this engine has no ctx.assetUrl to resolve `src` `` |

The path message comes from `core/data.js`: `data path must be relative to the deck root: <src>` for a leading `/`, a backslash, a scheme or a `..` segment, and `data path may not contain '%': <src>`. As `dump` prints them:

```text
error: bad/outside: image `src` '../cover.svg': data path must be relative to the deck root: ../cover.svg
error: bad/remote: image `src` 'https://example.com/a.png': data path must be relative to the deck root: https://example.com/a.png
error: bad/pct: image `src` 'assets/a%20b.png': data path may not contain '%': assets/a%20b.png
error: bad/blank: image needs non-empty `alt` text describing the picture
error: bad/fit: image `fit` must be one of 'contain', 'cover', got "fill"
error: bad/missing: image 'assets/nope.png' could not be loaded: the file is missing or is not a decodable image (http://127.0.0.1:62668/assets/nope.png)
error: bad/broken: image 'assets/broken.png' could not be loaded: the file is missing or is not a decodable image (http://127.0.0.1:62668/assets/broken.png)
```

A missing file also produces a `console: Failed to load resource … 404` line in `dump`, and `check` reports the 404 as `network-error`.

`validate` catches some of these earlier:

```text
bad/remote · remote-url · src has https://example.com/a.png vs relative, same-origin paths only · copy the resource into the deck (e.g. assets/) and use a relative path, or drop the link from src
bad/missing · file-missing · src = assets/nope.png vs a file in the deck · create assets/nope.png in the deck (generate data with a script under data/), or fix the path in src
bad/blank · prop-invalid · alt = "  " vs must match pattern "\S" · change alt so it is match pattern "\S" (props of image)
bad/fit · prop-invalid · fit = "fill" vs one of "contain", "cover" · set fit to one of "contain", "cover" (props of image)
```

`validate` does not catch a `..` path, a `%` in the path, or a file that exists but is not a decodable image (here `assets/broken.png` held plain text). These fail only in the browser, so run `dump` or `check` after `validate`. Every rule is listed in the [CLI reference](../cli.md).

`image` is not a figure for the `figure-source` rule, so a slide with only an image does not need a source line.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog image` prints the same props from the schema.
