# M0 findings: where the component contract changed

*Milestone M0 (spike) review gate, 2026-11-18. Input to M1.*

M0 froze the contract of spec §6.3 against three hard cases, all in `examples/spike`:
- a line-chart morph: `trend`, using `chart.line`;
- a terminal driven by `advance`: `terminal`;
- a custom component that reuses a built-in: `story`, using `demo.story` plus `ctx.mount("text")`.

`stepdeck check examples/spike --played` passes on all of them:
- 4 slides and 17 steps;
- 26 arrivals compared with the jumped state;
- 0 problems.

This document lists every place where building them changed the contract of §6.3, or of the related §5, §6.2, §6.6, §9 and §10, or made it more precise. Each entry says whether the spec text was **amended** (marked **[M0]** in `2026-11-18-engine-design.md`) or only **made precise** here. `types/stepdeck.d.ts` encodes the final contract.

## A. Contract changes (spec amended)

### A1. `ctx.mount` returns a promise, and `mount` may be async
- **Before:** the §6.2 escape-hatch example called `ctx.mount("map", el, props)` without awaiting it, from a synchronous `mount`.
- **Now:** `ctx.mount(type, el, props)` returns `Promise<ChildHandle>`. Loading the component module and resolving bindings are both asynchronous, so it cannot be synchronous.
- **Component `mount`:** may return the instance or a promise of it; the engine awaits it. A custom component that composes built-ins is therefore `async mount(...)`.
- **`ChildHandle`:** `{ instance, update(props, info), pause(), destroy() }`.
  - `handle.update` resolves bindings in the child's props. It passes the parent's `info` through (`animate`, `signal`, `entered`, `step`, `transition`), with `prev` and `changed` replaced by the child's own.
  - `handle.update` never skips a no-op update; skipping is the parent's choice.
  - Children are paused and destroyed together with their parent.
  - `handle.destroy()` is idempotent, and it removes the child from its parent so the child can be swapped.
  - A child that throws rejects the promise the parent awaits. Unless the parent catches it, the parent element fails.
- **Evidence:** `core/controller.js` (`#mountChild`); `examples/spike/components/demo.story/index.js` awaits the strip and the nested text together in one `Promise.all`.

### A2. Animation helpers: settle on abort, reject only on the caller's own error
- **Before:** §6.3 said the helpers are "abort-aware" and "snap to their end state".
- **Now, helpers:**
  - `fadeIn`, `reveal`, `drawPath`, `tween` and `stagger` take `{ duration, signal }` and return a promise. The default duration is 400 ms.
  - If the signal is already aborted, aborts mid-flight, or `duration <= 0`, the helper jumps to its end state and **resolves**.
  - The helper **rejects** only when the caller's own code throws, for example a `tween` `onValue`, a `stagger` `fn`, or a broken element. The animation stops at once and the rejection becomes that element's error.
- **Now, components:** a component must `await` the helpers inside `update`. Otherwise `settled()` does not wait for them, and a throw is lost.
- **Why:** an early version let a throwing `onValue` hang the promise. That hung the element's `update`, then every later `goTo`, then `settled()`.

### A3. Concurrency is per component instance
- **Before:** "Calls are never concurrent."
- **Now, across `goTo`s:** a component instance never has two `update` calls in flight. A new `goTo` aborts the in-flight one through `signal`, waits for it to settle, then applies only the latest target. Intermediate targets are dropped.
- **Now, within one `goTo`:** the elements of the slide update **in parallel**, sharing one `signal`. Running them in series would make a step last the sum of all the durations, and would break `transition.stagger`.

### A4. Same-slide navigation goes straight to the controller (ruling R18)
- **Before:** the spec did not say how the shell queues navigations.
- **Now:** in every shell, a step change on the slide already shown is handed straight to that slide's controller, so it can abort the running animation. Only slide changes are queued, in order.
- **Why:** the first bare shell chained every `goTo`. As a result, a second step change waited for the whole morph to finish (about 680 ms), and abort never ran. Task 5's interrupt test found this.

### A5. `ctx.size` is in canvas pixels, measured at mount
- **Now:**
  - `ctx.size` is `{ w, h }` in canvas pixels (1920×1080 space), from `offsetWidth`/`offsetHeight`. It is not affected by the shell's scaling.
  - It is measured once, when the element mounts, and is not updated.
  - Components that need the size at update time read their element's `offsetWidth`/`offsetHeight` themselves (`chart.line` does).
- **Why:** `getBoundingClientRect` returns scaled pixels under the shell's `transform: scale()`.

### A6. Failed elements show their error in place
- **Before:** §9 said "a slide that fails shows its error on that slide only".
- **Now:** a single **element** can also fail, without failing its slide. The causes are:
  - an unknown component or a name collision;
  - a binding error, at any step;
  - `mount` or `update` throwing, either synchronously or as a rejection;
  - an unknown region.
- **What happens:**
  - The element's box shows the message and stays visible whatever the step says.
  - The element gets no further `update` calls.
  - The error is recorded once, as `"<slide>/<element>: <message>"`.
  - The other elements carry on.
- **Slide-level errors** (`"<slide>: <message>"`) cover the canvas. Examples: a patch naming an unknown element, an unknown layout, a slide file that fails to import.

### A7. Deck components are declared in `deck.js` (ruling R17)
- **Before:** §5 said that "the deck's `components/` is looked up first".
- **Now:** the registry never scans folders.
  - Built-ins are listed in `components/index.json`. A unit test keeps the list in step with the component folders.
  - Deck components are listed in an optional `components: [...]` array in `deck.js`. This keeps `deck.js` importable in Node with no fetch, and gives no 404 noise in the browser.
  - Lookup order and the collision rule are unchanged.
- **Detail:** a collision is detected when the colliding name is **requested**. `validate` (M1) must compare `deck.components` with the built-in list up front.

### A8. CSV typing: declared `types` win, and undeclared columns are guessed conservatively
- **Before:** §6.3 said "typed by a declared `types` map, with no guessing".
- **Now:**
  - The call is `ctx.data(path, { types })`, with `types` mapping a column to `"string"`, `"number"` or `"date"` (ISO 8601).
  - A declared type always wins. A declared column whose cell does not parse throws.
  - An **undeclared** column becomes `number` only when every non-empty cell matches `-?\d+(\.\d+)?` **with no leading zero**. Otherwise it stays a string.
  - So the code `080101` still stays a string, as the spec promised. Charts get numbers without the deck having to declare every column.
  - Empty cells are `null` in number and date columns, and `""` in string columns.

### A9. Data from the loader is shared and read-only (ruling R14)
- **Now:** `ctx.data(path)` and bindings return one cached value per path (per path plus `types` for CSV), shared by every element and slide. Components must treat it as read-only: copy before sorting or mutating.
- **Note:** it is not frozen today. Freezing it is an M1 option.

### A10. Explicit `show`/`hide` persist until the sugar changes again
- **Before:** §6.2 said: "Sugar expands to `show`/`hide` patches at the start of the fold. Explicit patches apply after it, so explicit wins."
- **Now, precisely:**
  - `from`/`at` emit a show or hide only at the steps where they change the element's visibility.
  - An explicit `hide` therefore lasts past its own step, until the element's sugar next changes visibility. An explicit `show` does the same.
  - Steps fold, so this is the fold semantic, not a special case. For a change that lasts one step, use `at` (visibility) or `only` (props).

### A11. `STEPDECK` and the bare shell URL
- **Before:** §9 listed `ready`, slide ids, step ids, errors and `settled()`.
- **Now:** `window.STEPDECK` is:
  - `ready`: `Promise<void>`. It never rejects.
  - `slides`: `string[]`.
  - `steps`: `Record<slide, string[]>`. Each entry is the step id, or its index as a string when the step has none; a slide with no steps has `["0"]`.
  - `errors`: a getter returning boot errors plus the errors of the slide on screen.
  - `settled()`: never rejects.
  - `goTo(slide, step)`: never rejects; failures go to `errors`.
  - `state()`: `{ slide, step, stepId, title, notes, transition, elements }`, with resolved props. This is what `dump` reads.
  - `flags`: `{ slide, step, capture, motion, animate, lang, theme }`.
- **Bare shell URL:** `core/render.html?deck=<deck dir, relative>&slide=&step=&capture&motion=full&lang=&theme=`. A numeric `step` is an index.
  - **`?deck=` must be same-origin** with the page. Another origin is refused with an on-canvas error and never imported.

### A12. `check --played` and `dump`, precisely
- **`dump` per step:**
  - per element: `{ id, type, visible, text, box, props }`;
  - plus `changed` and `errors`.
- **Field definitions:**
  - `visible` is measured on the page.
  - `text` is the element's text nodes joined by single spaces.
  - `box` is in canvas pixels, rounded to 1 px.
  - `props` are the resolved props.
  - `changed` lists the ids whose resolved props or visibility differ from the previous step. At step 0 it lists every id.
- **Jumps:** each dumped step is a fresh page load: mount, then one update, with no history.
- **`--played` compares three states of step k:**
  - the jump to k;
  - the state after an animated arrival from k−1;
  - the state after an arrival from k+1.
- **What is compared:** visibility, text and box. Props are the same by construction.
- **How:** one page load per step, with `motion=full` and no capture. The arrivals are a goTo to k+1, then back to k.
  - If the page reports that animation is off, the run aborts, so the animated path cannot quietly become a jump.
- **What is reported:**
  - `played-mismatch`: one per slide and element, at the first step that differs, with a count of the other differing arrivals.
  - `render-error`: any page error during the run, because the comparison is not trustworthy then.
- **Gap:** `--played` does not compare inline styles or attributes, so an animation residue such as a leftover `opacity: 0.4` with unchanged text and box passes it. The component tests (`chart-line`, `terminal`, `custom`) compare DOM snapshots for that. Components must leave no inline animation residue, whether the animation finished or was aborted.

## B. Made precise (spec text still holds; detail recorded here and in the types)

### B1. Mounting
- Every element mounts with its **step-0** resolved props, hidden ones too, whatever step is shown first.
- Mounting applies no visibility and does not count as a state.

### B2. The first `update`
- It comes from the first `goTo` after mount, and is a full render:
  - `prev: null`;
  - `changed`: all keys;
  - `entered`: whether the element is visible;
  - `animate: false`;
  - `prevStep: null`.
- After that, `update` runs when the resolved props (deep compare) or the visibility changed.
- `changed` lists the top-level keys that differ, added and removed keys included.

### B3. `info.step` and `info.prevStep`
- They are step ids, or the step's index when it has no id.
- `info.transition` is the step's `transition`.

### B4. `ctx` members
- `ctx` is `{ d3, data, format, t, capture, animate, tokens, palette, size, mount }`.
- `tokens` maps every custom property declared in the theme's `tokens.css`, using full names such as `tokens["--sd-color-accent"]`, to its computed value.
- `palette(kind = "categorical")` returns `{ name, kind, colors: string[], names: string[], roles: Record<role, color> }`, or `null`.
  - `names` are localized to the deck language.
  - The deck's `palette` is used when its kind matches; otherwise the theme's default for that kind.

### B5. Bindings
- A string that is exactly one binding with no format (`"{{data/s.json#/n}}"`) resolves to the **raw value**: a number, array, object or null.
- With a format, or embedded in text, the result is a string.
- `{{color:…}}` is left for the text components.
- **Limitation:** a binding cannot pass CSV `types`, so a binding into a CSV uses the conservative guessing of A8. Point bindings at JSON, or declare types in a component prop such as `chart.line`'s `types`.

### B6. Regions and title
- The default region is `main`.
- An element naming a region its layout lacks is still rendered, and is reported as an element error (A6).
- The slide `title` string becomes the element `title` (type `text`, region `title`).

### B7. `anchor(ref)`
- It returns a box in canvas pixels, computed through the offset chain up to `.sd-canvas`, so it is not affected by the shell's scale.
- It returns `null` for an unknown ref.

### B8. Error lines
- The CLI formats every problem as `slide/element/step · rule · measured vs limit · fix`.
- `step` is the step id.
- Missing parts are left out: `slide/step`, `slide`, or `deck`.
- The shared formatter is `cli/problems.js`.

## C. Open items carried into M1 (not contract changes)

1. `validate` must detect deck components that collide with built-ins up front (A7). It must also detect structural patch errors, which today only throw when a slide is folded to that step.
2. A component whose `update` ignores `signal` and never settles hangs `settled()`. Consider a dev-time timeout warning. **[M1]** Resolved by a watchdog (D1).
3. `ctx.mount` has no guard against self-recursion. Consider a depth limit.
4. Bindings with CSV `types` (B5); deep-freezing loaded data (A9).
5. `--played` might later also compare a light DOM digest (inline styles), to close the gap noted in A12.

## D. Recorded after M1 (final review, 2026-11-18)

Marked **[M1]** in the spec. D1 changes behaviour; D2 to D5 record where M1 stops short of the text, with no feature added.

### D1. Watchdog on `mount` and `update` [M1]
- **Before:** a component whose `mount` or `update` never settled froze its slide. In the reveal shell, the neighbour prefetch chained into the promise `show` awaited, so the whole talk froze: reveal and the hash moved on, `STEPDECK.state()` did not, later slides stayed placeholders, `errors` stayed empty and `settled()` never resolved.
- **Now:** every `mount` and `update` call has a watchdog of 10 s (`SETTLE_TIMEOUT_MS`, option `settleTimeout` of the controller), well above the longest built-in motion. On timeout the element fails with `slide/element: did not settle within 10s` and its `signal` is aborted. The slide goes on. A late mount is destroyed at once.
- Each element's `info.signal` is now its own, linked to the step's: superseding the step aborts all of them, and the watchdog aborts one.
- The reveal shell's neighbour prefetch is tracked by `idle()` (so `settled()` waits for it) but never awaited by `show`.
- The CLI page timeout is 30 s, above the watchdog, so `check` reports such an element as `render-error` instead of aborting. A page that still does not settle names its URL, slide and step.

### D2. `enter`/`exit`, `section`/`sections` are inert [M1]
- The schemas and `validate` accept them, so decks written against the spec stay valid.
- M1 does nothing with them on screen. The implementation is M2.

### D3. `dump` text listing [M1]
- The text listing shows visibility, id, type, box and text per element, the errors, and `changed`.
- Resolved props are in `--json` only.

### D4. Motion indicator [M1]
- The indicator is a "motion off" badge inside the presenter view's preview frames, shown when reduced motion is on without `?motion=full`.
- The audience window shows none.

### D5. Offline guarantee in the gates [M1]
- `check` (every browser command) aborts any request whose origin is not the local server's and reports it as `network-error` (`remote <url> (blocked: …)`).
- `validate` scans `slide.style` for remote and protocol-relative URLs (`remote-url`) and rejects `@import` there (`style-import`), which `CSSStyleSheet.replaceSync` drops silently.
