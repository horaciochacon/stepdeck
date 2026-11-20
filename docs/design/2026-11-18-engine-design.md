# stepdeck: design

*An agent-ready system for dynamic, step-by-step HTML presentations.*
Status: approved by Horacio (2026-11-18) · 2026-11-18 · working name `stepdeck` (rename freely).
Revised after a builder check and an independent design review; calls made by the session are marked **[call]**.
**Amended after M0 (2026-11-18):** the M0 spike changed or sharpened parts of the contract (§5, §6.2, §6.3, §6.6, §9, §10). Amended passages are marked **[M0]**; `docs/design/m0-findings.md` lists every change with its reason, and `types/stepdeck.d.ts` encodes the result.
**Amended after M1 (2026-11-18):** the final M1 review recorded where M1 behaves short of, or more precisely than, the text (§6.1, §6.3, §9, §10). Those passages are marked **[M1]**; `docs/design/m0-findings.md` section D lists them.

## 1. Intent

Horacio built several data-heavy HTML decks with coding agents. Each time, the engine, the pieces and the rules were rebuilt for that deck and mixed up with its content. He wants this turned into a **general, reusable presentation engine**. Its first user is Horacio, but it is open for anyone. It must be specified, modular, extensible and documented so that a **future agent can create a new deck easily and freely**, with any kind of chart or animation, using themes, palettes and predefined layouts. Generality and extensibility are the top priority.

An earlier private deck engine is **inspiration, not a template**. What it proved, and this design keeps:

- a slide is a sequence of steps, and "go to step k" leaves the complete state of step k;
- content comes from data files;
- a token-based design system;
- a presenter view;
- an automatic per-slide check plus screenshots;
- one author per slide, working in parallel.

What it taught, and this design fixes:

- slides were mostly bespoke code, each carrying its own CSS;
- steps were positional, so inserting one shifted every number;
- the hide semantics were ambiguous;
- reveal's PDF output was unusable;
- whole-deck test runs saturated the machine.

## 2. Goals, non-goals, anti-goals

**Goals**
1. An agent can produce a correct, good-looking multi-step deck mostly by writing declarative slide specs, reading only the skill and the catalog.
2. Any chart or animation can be added as a component without touching the core, and custom components can reuse built-in ones.
3. Themes, palettes and layouts can be swapped per deck; layouts can also be swapped per slide.
4. Navigation is deterministic: forward, back, jump to any slide or step, presenter view, PDF and screenshots all show the same state for the same step.
5. Published on GitHub with a documentation site and a live gallery, MIT licensed.

**Non-goals**
- Porting any earlier talk's content.
- A narrative or method skill (how to plan a talk). Horacio chose the engine only.
- A visual editor, collaboration, hosting.
- PowerPoint or Keynote export.
- Non-Chromium presenting.

**Anti-goals** (failure even if it technically works)
- A DSL so rigid that most real slides fall back to custom code.
- Agents having to read engine source to do ordinary things.
- A build toolchain or framework (React, Vue) required to write or show a deck.
- Template-generic or salesy defaults. The default look is restrained and academic.

## 3. Constraints

- **No build step for decks.** Decks are static files (ES modules, JSON, CSS). They need an HTTP server: browsers block module imports from `file://`. `stepdeck serve` sends `Cache-Control: no-store` and correct MIME types, so agents never check stale modules. GitHub Pages works as-is, with `.nojekyll`.
- **Self-contained at presentation time.** The engine is **copied into the deck** (`stepdeck/` folder) and referenced through one import map in `index.html` **[call]**. No CDN at runtime, all paths relative and same-origin, fonts vendored as woff2. A live talk must work offline.
- **Dev tooling** (CLI) uses Node ≥ 20 and Playwright as a normal devDependency, plus a small PDF-merge library. None of it is needed to *present*.
- **Vendored runtime libraries, permissive licenses only.** reveal.js (MIT), d3 (ISC), a Markdown parser and a code highlighter (MIT or BSD) **[call: builder picks the specific ones]**. Later, loaded only by the components that use them: KaTeX (MIT; fonts OFL), Vega/Vega-Lite (BSD-3). Each keeps its LICENSE file. `THIRD_PARTY_NOTICES.md` collects sub-notices: ColorBrewer, d3-ease, d3-geo (ISC, with GeographicLib MIT), Delaunator and internmap (ISC), and the copy of marked bundled in the reveal notes plugin (MIT). Palette citations: Okabe and Ito (2008); viridis (CC0). Natural Earth 110m (public domain) for map fixtures.
- **Privacy.** Nothing from earlier private talks goes in: no real agent sessions, no local machine paths, no talk geodata, no review documents. All fixtures are synthetic or public domain. Engine pieces are **rewritten**, not copied.
- **Language.** Code, API, docs and skill in English, plus `README.es.md`. Slide content can be in any language. Engine strings and number formatting follow the deck's `lang` (`en`, `es` built in; Spanish uses the decimal comma).
- **Zoom-aware defaults.** The audience sees the deck at roughly 1000–1300 px and a low frame rate. Hence short, discrete transitions; a minimum audience font size set by the theme (default 28 px on the 1920×1080 canvas); and `shoot --size 960` in the default workflow.

## 4. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| 1 | Build on Slidev (Vue + Markdown) | Mature presenter mode, export and themes. But it needs a build toolchain and Vue, every rich piece becomes a Vue component, and the click model is theirs. It becomes "a Slidev theme" | Rejected |
| 2 | Generalize the current code-first engine | Fastest and fully flexible. But every slide is hand-written code, agents repeat boilerplate, and there is nothing a tool can validate | Rejected |
| 3 | **Declarative core + code escape hatch** | Slides are data (layout + elements + steps), validated by schema; anything else is a custom component with the same contract. More design work up front, and the spec must stay small | **Chosen by Horacio** |

Also ruled out: Markdown slide tools (Marp, Quarto's reveal output), which can't do data-driven stepwise graphics; and video engines (Motion Canvas, Manim), which produce recordings, not live decks.

## 5. Repository and deck layout

```
stepdeck/
  core/            fold engine, lifecycle, shells (reveal, bare), registries, i18n, data loader
  components/      <name>/  index.js · schema.json · example.js · README.md
  layouts/         <name>/  layout.css · schema.json · example.js · README.md
  themes/          <name>/  tokens.css · palettes.json · fonts/ · README.md
  vendor/          third-party libraries with LICENSE files
  cli/             stepdeck new | serve | validate | check | shoot | dump | pdf | catalog | new-component
  types/           stepdeck.d.ts (contract and ctx, for editors and agents)
  skill/           SKILL.md + references
  site/            docs site and live gallery (GitHub Pages)
  templates/       starter decks
  test/            core unit tests; gallery decks are the integration tests
```

A user's deck **[call: one file per slide, so parallel agents never edit the same file]**:

```
my-talk/
  index.html          boilerplate: import map + loads stepdeck/core
  deck.js             deck settings + ordered list of slide ids
  slides/<id>.js      one slide spec per file
  components/<name>/  optional custom components (same folder shape as built-ins)
  data/               JSON / CSV / GeoJSON, ideally generated by code
  assets/             images, video, fonts
  stepdeck/           the copied engine
```

**Static specs [call]:** `deck.js` and `slides/*.js` must be importable in plain Node: no DOM, no fetch, no top-level await. Synchronous code is allowed, e.g. building elements in a loop from an imported constant. Data-driven content goes through data bindings (§6.6), not through code at load time. This is what lets `validate` run fast, without a browser.

**Component resolution [call]:** the deck's `components/` is looked up first, then the built-ins. A custom name that collides with a built-in is an error unless it uses a namespace (`my.chart`). Schemas live in `schema.json`, never inline, so the catalog is built without executing component code.
**[M0]** Nothing scans folders: built-ins are listed in `components/index.json`, and deck components in an optional `components: ["my.chart", …]` array in `deck.js` (folders `components/<name>/`, the name including any dots).

## 6. The slide spec

```js
// deck.js
export default {
  title: "Dose and response",
  lang: "en",
  theme: "academic-light",
  palette: "okabe-ito",           // optional; must belong to the theme's validated set
  sections: true,                 // "Section · n" footer ([M1] accepted but inert until M2)
  components: ["response-story"], // [M0] deck components, in components/<name>/
  slides: ["title", "trend", "terminal", "story", "closing"],
};
```

### 6.1 Slides, regions, elements

Each slide picks a **layout**. A layout defines named **regions** (`title`, `main`, `notes`, `footer`…). A region holds one or more **elements**, stacked in a vertical flow in the order listed, unless the element has a `box`.

An element has:
- `id`;
- `type`: a text type (`text`, `markdown`) or a component (`chart.line`, `terminal`…);
- `props` (JSON only, no functions);
- optionally, one of:
  - `region`;
  - `box: {x, y, w, h}` in canvas pixels, to float anywhere: insets, callouts, overlays;
  - `enter` / `exit`: `fade` | `rise` | `wipe` | `draw` | `none`;
  - `collapse: true`.

**[M1]** `enter`/`exit` on elements, slide `section` and deck `sections` are accepted (schemas and `validate`) but inert in M1: they change nothing on screen. Their implementation is M2.

Slide-level options:
- `title` is sugar for an element with the reserved id `title`, so a title can change per step.
- `style` is scoped CSS, automatically prefixed by the slide id, for the small bespoke touches every real slide needs.
- `regions` can override region sizes, using the layout's documented grid variables.

### 6.2 The step model (exact semantics)

- `steps` is an array of step entries. The slide has `steps.length` states, numbered 0…n−1. A slide with no `steps` has one state. Steps can carry an `id` (`{ id: "annotate", … }`). Anywhere a step is referenced, use its id or its number. **Use ids**, so inserting a step never shifts references.
- Each step entry is a **patch**. Operations:
  - `set`: an [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) merge patch per element. Objects merge, arrays and scalars replace, `null` deletes.
  - `replace`: the element's props, wholesale.
  - `show` / `hide`: element ids.
  - `only`: like `set`, but transient. It applies at this step and is **not folded** into later steps, e.g. a highlight that lasts one step.
  - `notes`: speaker notes for this step.
  - `transition`: `{ stagger, duration }`, passed to the components that change.
- **State at step k** = the initial element definitions, folded with the patches of steps 0…k, plus step k's own `only`. The engine computes this, so jumping straight to any step needs no replay.
- **Visibility:**
  - Every element is visible from step 0 unless it says otherwise.
  - Sugar: `from: <step>` (visible from that step on) and `at: [<step>…]` (visible only at those steps). Sugar expands to `show`/`hide` patches at the start of the fold. Explicit patches apply after it, so explicit wins.
  - **[M0]** Sugar emits a `show`/`hide` only at the steps where it changes the element's visibility. Because steps fold, an explicit `show`/`hide` lasts past its own step until the sugar next changes that element. For a one-step change use `at`.
  - Hidden elements **keep their space** by default (`visibility: hidden`), so nothing on screen moves when something appears. `collapse: true` opts into reflow.
- **Elements with an internal sequence** (terminal, chat, list, code, diagram, timeline) are driven by **props only**. A component never reads the slide's step number. The `advance` sugar avoids writing dozens of patches:

  ```js
  { id: "t", type: "terminal", props: { script: "data/session.json" },
    advance: { prop: "shown", values: [0, 4, 9, 14, 20], start: "run" } }
  // expands to: at step "run" shown=0, next step 4, … ; last value holds afterwards
  ```

  This keeps one source of truth: the slide's step count is `steps.length`, and `validate` checks that every `advance` fits inside it. Two sequenced elements on one slide each get their own `advance`, aligned by step ids.

#### Example: a chart that builds up over five steps

```js
// slides/trend.js
export default {
  id: "trend", section: "Results", layout: "figure-notes",
  title: "Response rises with dose",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/dose-response.csv", x: "dose_mg", y: "responders", series: "regimen",
               series_shown: ["single"],
               axes: { x: "Dose (mg)", y: "Participants responding" },
               format: { y: ",.0f" } } },
    { id: "n1", region: "notes", type: "text", from: "annotate",
      props: { text: "Above 250 mg the curve steepens." } },
    { id: "big", region: "notes", type: "big-number", from: "total",
      props: { value: "{{data/summary.json#/responders}}", format: ",.0f", label: "participants responding" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "base" },
    { id: "regimens", set: { chart: { series_shown: ["single", "combined"] } } },
    { id: "annotate", set: { chart: { annotate: [{ x: 250, label: "250 mg" }] } } },
    { id: "focus", only: { chart: { highlight: "combined" } }, notes: "Pause here." },
    { id: "total", set: { chart: { y: "rate", axes: { y: "Responders per 1,000" } } } },
  ],
  seconds: 90,
};
```

#### Escape hatch: a custom component

```js
// components/response-story/index.js   (schema in components/response-story/schema.json)
export default {
  async mount(el, props, ctx) {                       // [M0] mount may be async; ctx.mount returns a promise
    const svg = ctx.d3.select(el).append("svg");
    const inset = await ctx.mount("map", el.appendChild(document.createElement("div")), { /* built-in reused */ });
    return {
      async update(props, info) {
        /* render state from props; idempotent */
        await inset.update({ /* the inset's props for this state */ }, info);   // passes animate + signal on
      },
      anchor(ref) { /* return canvas box for a mark/callout pointing at part `ref` */ },
      pause() {}, destroy() { svg.remove(); },
    };
  },
};
```

Being "renderers of props" applies to custom components too. A slide drives a custom component by patching its props, typically a `stage` prop with `advance`.

### 6.3 Component contract and lifecycle

| Member | Req. | Meaning |
|---|---|---|
| `schema.json` | yes | JSON Schema of props. Every field has `description` and `examples`. Each prop declares `x-transition`: `tween` \| `draw` \| `fade` \| `snap`, so the catalog tells agents what animates |
| `mount(el, props, ctx)` | yes | build DOM inside `el`, return an instance **or a promise of one [M0]**. `ctx.size` gives the laid-out size |
| `instance.update(props, info)` | yes | render the given state. **Idempotent**, and correct for any state reached in any order. Returns a promise that resolves when the state is final |
| `instance.anchor(ref)` | no | canvas box of a named part, for `mark`/`callout` elements |
| `instance.pause()` | no | slide left: stop media and timers |
| `instance.destroy()` | no | teardown |

`info` carries:
- `prev` (the previous props) and `changed` (the keys that changed);
- `entered` (true if the element just became visible);
- `step` (the step id, for logging only) and `prevStep` (**[M0]** the index when a step has no id);
- `animate` and `signal` (an AbortSignal);
- `transition`.

**Engine guarantees:**
- **[M0]** Every element (hidden ones too) mounts with its step-0 resolved props. The first `update` after mount is a full render: `prev: null`, `changed` = all keys, `entered` = visible, `animate: false`.
- `update` is skipped when the resolved props and visibility didn't change, so a count-up never re-runs on a no-op step.
- `animate` is true only when moving **forward by exactly one step**, outside capture mode and the presenter's preview frames, and when motion is enabled.
- Calls are never concurrent **for one component instance [M0]**. On rapid navigation the engine aborts the in-flight update through `signal`; the animation helpers snap to their end state, and only the latest step is applied. Within one step, the slide's elements update in parallel under one shared `signal`, so a `stagger` across elements and simultaneous motion work. **[M1]** Each element receives its own `signal`, linked to the step's: superseding the step aborts all of them, and the watchdog below aborts only its element's.
- **[M0]** An element whose component fails (unknown or colliding name, binding error, `mount` or `update` throwing or rejecting, unknown region) shows its error in its own box, stays visible, and gets no further updates; the rest of the slide carries on. Errors read `slide/element: message`.
- **[M1]** Watchdog: a `mount` or `update` call that has not settled after 10 s (well above the longest built-in motion; configurable in the controller) fails its element with `slide/element: did not settle within 10s`, aborts that element's `signal`, and the slide goes on. In the reveal shell a neighbour's prefetch never holds up navigation to the slide asked for.
- Mounting happens on approach (the current slide ±1), while the slide is laid out, so components can measure. `pause` runs on leave; `destroy` runs only on teardown.
- `STEPDECK.settled()` resolves when every visible component has finished. The CLI waits on it.

`ctx` provides:
- `d3` and `ctx.mount(type, el, props)` (use built-in components inside a custom one). **[M0]** It returns `Promise<handle>`, `handle = { instance, update(props, info), pause(), destroy() }`: `update` resolves the child's bindings and passes the parent's `info` (`animate`, `signal`, …) on with the child's own `prev`/`changed`; children pause and are destroyed with their parent; `destroy()` is idempotent, so a child can be swapped;
- `tokens` (resolved theme values; **[M0]** keyed by full custom-property name, e.g. `tokens["--sd-color-accent"]`) and `palette(kind)` (**[M0]** `{ name, kind, colors, names, roles }`, `names` in the deck language);
- `data(path, { types })`: cached, relative to the deck root. **[M0]** Declared `types` always win; an undeclared CSV column becomes a number only when every value is a plain decimal with no leading zero, so the code `080101` stays a string. The value is shared by every element: treat it as read-only;
- `assetUrl(path)`: **[M1]** the location of a deck file (an image, say) for the browser to fetch, with the same path rules as `data` (relative, inside the deck, no `%`); nothing is read;
- `format(spec)` (d3-format, using the deck's locale) and `t(key)` (i18n);
- `capture`;
- `size`: **[M0]** `{ w, h }` of `el` in canvas pixels (unaffected by the shell's scaling), measured at mount;
- `animate`: `fadeIn`, `reveal`, `drawPath`, `tween` (numbers only), `stagger`, all abort-aware. **[M0]** Each takes `{ duration, signal }` and returns a promise that resolves at the end state, also when aborted or with `duration <= 0`; it rejects only when the caller's own callback or element throws, which then fails that element. Components `await` them inside `update`.

There is no access to reveal: the shell is hidden behind an interface.

**Morph [call]:** a morph is the component's own keyed data join animating from `prev` to `props`. `tween` is only for numbers. A morph is not a generic engine feature.

### 6.4 Text and marks

- `text` and `markdown` elements accept inline step-free formatting.
- Color words in text use `{{color:accent}}`, which resolves to the palette's name for that color in the deck's language, so text never names a color the theme doesn't show.
- `mark` / `callout` elements point at `{ element, ref }`. Their position comes from that component's `anchor()`.

### 6.5 The catalog

`stepdeck catalog` reads every `schema.json` (built-in plus the deck's own) and writes:
- `catalog/index.json`: name, one-line purpose, and the props that animate, per component, layout and theme;
- `catalog/<name>.json`: the full detail.

`stepdeck catalog <name>` prints one entry. The skill tells agents to read the index first, then only what they need, and never the source. The docs reference pages are generated from the same files.

### 6.6 Data bindings

Any string prop can be `{{path#/json/pointer | format}}`. **[M0]** A prop that is exactly one binding with no format gets the raw value (number, array, object); with a format, or inside text, the result is a string. A binding cannot pass CSV `types`, so prefer JSON for bound figures. The engine resolves it from the data file; `validate` checks that the file, the pointer and the format exist. With `chart`-style props (`data`, `x`, `y`…), `validate` loads the file and checks that the named columns exist. **No figure is ever typed by hand**: this is how the rule is enforced.

## 7. Themes, palettes, layouts

**Themes** are CSS custom-property token files plus vendored woff2 fonts. They define:
- color roles: background, surface, ink, muted, accent, alert, rule;
- the type scale, the spacing grid and canvas margins;
- motion durations and easing;
- `--min-audience-font`, which the checker enforces.

**Palettes** (`palettes.json`) come in three kinds: categorical, sequential and diverging. Each color has a name per language, for `{{color:…}}`. The palette validator requires at least 3:1 contrast for marks against the theme background, plus a color-vision-deficiency check. Raw Okabe-Ito fails 3:1 on white (yellow, orange, sky blue), so light themes ship a darkened Okabe-Ito variant. Components never hard-code colors, and `validate` rejects hex colors in props.

**Layouts** are CSS grid templates with named regions, a schema listing them, and documented grid variables for inline overrides. Canvas: 1920×1080 (16:9 only in v1).

## 8. Components and animation: full set and staging

The **full target set** keeps Horacio's priority: any chart, any animation.

| Family | Components |
|---|---|
| Text | `text`, `markdown`, `list`, `math` (KaTeX), `mark` / `callout` |
| Charts | `chart.line` (incl. area, intervals), `chart.bar`, `chart.points` (estimates with CIs), `chart.scatter`, `chart.small-multiples`, `chart.vega` (any Vega-Lite spec) |
| Maps | `map`: GeoJSON choropleth, points, raster image overlay, zoom to a feature, legend, source line, for any boundaries |
| Data | `table` (row highlight or expand), `big-number` (count-up, with CI) |
| Agent / code | `code` (highlighted lines), `terminal` (typed command, activity log, tasks, files, multi-agent variant), `chat` |
| Media | `image`, `video` (props `segment: [t0, t1]`; a jump seeks and waits; muted in preview frames), `document` (excerpt with highlights) |
| Diagrams | `diagram` (nodes and edges appearing by step), `timeline` |

There is no separate `chart.d3` component. Writing a custom component *is* the generic d3 path, with `new-component` scaffolding it.

**Staging [call, following the review]:**

| Milestone | Contents | Exit test |
|---|---|---|
| **M0 · spike** | Fold engine + bare shell; contract frozen against three hard cases: a line-chart morph, a terminal with `advance`, a custom component that reuses a built-in | the three cases pass `check --played` |
| **M1 · usable core** | reveal shell + bare shell, lifecycle, data bindings; `text`, `markdown`, `chart.line`, `big-number`, `terminal`; layouts `title`, `figure-notes`, `full-bleed`; theme `academic-light`; `validate`, `check`, `shoot`, `dump`, `serve`, `new`; skill v1 | a fresh agent, reading only the skill and catalog, rebuilds three given slides |
| **M2 · talk-ready** | `pdf`, per-step notes, `chart.bar`, `chart.points`, `table`, `code`, `chat`, `image`, `list`, `mark`; `academic-dark`; palette validator; one template | a complete sample talk |
| **M3 · breadth** | `map`, `diagram`, `video`, `document`, `chart.scatter`, `small-multiples`, `math`, `timeline`, `chart.vega`; more layouts and themes | gallery covers every component |
| **M4 · publish** | docs site, gallery, CI, README(s), release | Horacio's go-ahead to push |

## 9. Runtime, shells, navigation

- **Shell interface** (`goto(slide, step)`, `onChange`, `scale`). There are two implementations:
  - **reveal shell**, for presenting. It uses reveal.js for keyboard, scaling, presenter view (notes, timer, next) and overview. It loads only `reveal.css`, no reveal theme. Steps map to engine-generated fragments, as in the old engine. Preview frames in the presenter view run with no animation and muted media. The overview is best-effort: unmounted slides show their title only.
  - **bare shell** (`render.html?slide=id&step=s&capture`), which mounts one slide at one step with no reveal. All CLI commands use it.
- **[M0]** In every shell, a step change on the slide already shown goes straight to that slide's controller, so it can abort a running animation; only slide changes are queued, in order.
- **[M0]** Bare shell URL: `core/render.html?deck=<deck dir, relative>&slide=<id>&step=<id|n>`, plus the query flags below. `deck` must be same-origin with the page; any other origin is refused with an on-canvas error and never imported.
- **URLs:** the engine owns the hash format `#/<slide-id>/<step-id-or-number>`, with step 0 as the first state. Agents never build reveal URLs; the CLI takes `--slide` and `--step`.
- Query flags: `?capture` (no animation), `?theme=`, `?lang=`, `?motion=full`. The last overrides the OS reduced-motion setting for a live talk, and the presenter view shows a motion indicator. **[M1]** The indicator is a "motion off" badge inside the presenter view's preview frames (current and next), shown when reduced motion is on without `?motion=full`; the audience window shows none.
- `window.STEPDECK` exposes `ready`, slide ids, step ids, errors and `settled()`. A slide that fails shows its error on that slide only.
  **[M0]** Exactly: `ready` (never rejects), `slides`, `steps` (`{ slide: [step id, or index as a string] }`), `errors` (boot errors plus the shown slide's, `slide: msg` / `slide/element: msg`), `settled()`, `goTo(slide, step)` (never rejects), `state()` (`{ slide, step, stepId, title, notes, transition, elements }` with resolved props) and `flags` (`{ slide, step, capture, motion, animate, lang, theme }`).
- **PDF is not reveal's print.** Reveal clones fragments and never applies engine state. `stepdeck pdf` visits every slide and step in the bare shell and merges the pages.

## 10. Agent tooling

**CLI.** Every command is scoped by `--slide` / `--step` where that makes sense, so parallel agents never run the whole deck.

| Command | Does |
|---|---|
| `new <dir> [--template]`, `new-component <name>` | scaffold |
| `serve` | static server, no-store caching |
| `validate` | in Node, no browser: deck and slide schemas; resolved props validated **at every step**; `additionalProperties: false` with did-you-mean; step refs, `advance` and `from`/`at` in range; unique ids; data files, columns, pointers and formats exist; exact-case paths; no remote URLs; no hex colors; a source on every figure; steps that change nothing |
| `check` | headless Chromium, bare shell, after `document.fonts.ready` and `settled()`: text outside canvas or region, overlapping text, audience text under the theme minimum, contrast, console/network errors, step 0 already showing everything. `--played` also arrives at each step animated (forward) and backward and compares with the jumped state through `dump` equality, which tests idempotency. **[M0]** Compared per element: visibility, text, box rounded to 1 px; a jump is a fresh page load; one `played-mismatch` per element at its first differing step; animation off aborts the run |
| `shoot [--size 1920\|1280\|960]` | PNG per step |
| `dump` | text listing per step: visible elements, resolved props, text content, boxes, what changed since the previous step. Serves agents without vision and gives cheap diffs. **[M0]** Boxes in canvas pixels; `changed` = ids whose resolved props or visibility differ (all ids at step 0); `--json` gives `{ slide, step, stepId, elements: [{ id, type, visible, text, box, props }], changed, errors }` per step. **[M1]** The text listing omits resolved props (they are in `--json` only) |
| `pdf` | one page per step, or per slide with `--final-steps` |
| `catalog [name]` | regenerate or print the catalog |

Error format: one line per problem, `slide/element/step · rule · measured vs limit · suggested fix`, with `--json`. **[M0]** `step` is the step id; missing parts are left out. Exit codes: 0 clean, 1 problems, 2 usage error or a run that could not complete.

**Skill** (`skill/SKILL.md`, installable as a Claude Code plugin, readable by any agent). It covers:
- the workflow: catalog index → slide spec → `validate` → `check` → `shoot`/`dump` → look → fix;
- the step model and visibility rules;
- `advance`, bindings and marks;
- when to write a custom component, and how;
- adding themes, palettes and layouts;
- what each check failure means;
- a cookbook of common slides.

It is about using the engine, not about how to design a talk.

## 11. Documentation and publishing

- `README.md` and `README.es.md`: what it is, a short animated demo, quick start.
- Docs site on GitHub Pages (`site/`, no framework):
  - **Gallery:** every component, layout and theme running live, next to its spec;
  - **Guide:** getting started, step model, components, themes, layouts, CLI, skill;
  - **Reference:** generated from the catalog;
  - **Templates**, shown live.
- Gallery decks are the integration tests. CI (GitHub Actions) runs `validate` and `check --played` on all of them.
- Nothing is pushed or published without Horacio's go-ahead.

## 12. What Horacio decided

- Engine only. No narrative or method skill.
- Approach 3: declarative core with a code escape hatch.
- Everything in English, plus a Spanish README.
- A separate repository, beautifully documented and published on GitHub.
- Must generalize to any chart and animation, with themes, palettes and predefined layouts. This is the top priority.
- Approved the final doc (2026-11-18).
- Approved the shape: working name, MIT, Pages gallery, contract, registries, component families, CLI.

## 13. Left to the builder

- `core/` module boundaries; the specific Markdown parser, code highlighter and PDF-merge library.
- Exact token names, palette values and the visual design of the themes (restrained, professional).
- Diagram auto-layout.
- Whether to also publish to npm (the deck still copies the engine).
