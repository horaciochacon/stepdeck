# Adding a check or validate rule

This page is for contributors who add a rule to `stepdeck validate` (Node, no browser) or `stepdeck check` (Chrome). It covers which command a rule belongs to, the problem object and how to word it, where to hook the rule into `cli/validate.js` or `cli/check.js`, the fixture and test every rule needs, and the docs to update.

The worked examples are rules that already exist, `style-import` for validate and `font-too-small` and `text-overlap` for check. Copy their shape. For the full list of rules and what each one measures, see [Rules](../reference/rules.md).

## Decide where the rule goes

| The rule needs | Put it in | Examples |
| --- | --- | --- |
| Facts you can read from the spec files: the deck, slide and component schemas, ids, step references, or files on disk | `validate` (`cli/validate.js`) | `duplicate-id`, `step-ref`, `unknown-region`, `path-case`, `component-schema` |
| Facts from the folded state at a step: the resolved props of each element, its bindings, data files, CSV headers | `validate`, per step | `props-not-object`, `hex-color`, `binding-pointer`, `missing-column`, `prop-invalid` |
| Anything you have to measure on a rendered page: text boxes, font sizes, colors, overlap, page errors | `check` (`cli/check.js`) | `text-overlap`, `font-too-small`, `contrast`, `network-error` |
| A comparison between playing to a step and jumping to it | `check --played` | `played-mismatch` |

Prefer `validate` when it can answer the question. It runs in plain Node with no browser (`validate examples/kit` takes a fraction of a second), and its folded state covers every element at every step, hidden ones included. Use `check` only for facts that exist after layout: text geometry, computed styles, and what the page logged or requested.

A rule that belongs to one component's props, such as `diagram-id` and `diagram-overlap`, can live in the component as a pure function that `validate` calls. See [A component's own rules](#a-components-own-rules).

## The problem object

Every rule reports through `problem()` in `cli/problems.js`:

```js
problem({ slide = null, element = null, step = null, rule, measured = "", limit = "", fix = "" })
// -> { slide, element, step, rule, measured, limit, fix }
```

`measured`, `limit` and `fix` are coerced to strings. `formatProblem(p)` prints one line:

```
<slide/element/step or "deck"> · <rule> · <measured> vs <limit> · <fix>
```

The location parts that are `null` are left out. These two lines are real output from existing fixtures:

```
$ node cli/index.js validate test/fixtures/validate/style-import
s · style-import · style has @import "extra.css"; vs no @import in slide.style (the runtime ignores it) · copy the rules into style itself (slide.style is scoped CSS, parsed without @import)
validate: 1 slide, 1 error, 0 warnings

$ node cli/index.js check test/fixtures/check/font-too-small
s/small/0 · font-too-small · 20px "Too small for the audience." vs 28px (--min-audience-font) · use a larger font size; only sources (role: "source") and the footer may go smaller
check: 1 slide, 1 step, 1 problem
```

The two commands label steps differently. Keep this in mind when you write the test:
- **`validate`** uses `stepLabel(spec, i)`: the step's `id`, else its index as a string. A slide with no `steps` gives `null`, so the line above has no step part.
- **`check`** uses the ids from `STEPDECK.steps`. A slide with no steps has one step, `"0"`, so the line reads `s/small/0`.

### Naming

- **`rule`** is a short kebab-case name for what is wrong, not for the check: `duplicate-id`, `text-overlap`, `missing-column`. Look at the existing names in [Rules](../reference/rules.md) and reuse their words (`unknown-*`, `*-missing`, `*-invalid`).
- A rule name is part of the public interface. Agents match on it in `--json` output, and the skill documents it. Do not rename an existing rule.

### Wording measured, limit and fix

The line reads as a sentence: *measured* vs *limit*, then the fix. Write each part so that it is still useful on its own.

| Field | What to write | Examples from the code |
| --- | --- | --- |
| `measured` | What was found, naming the value or the number. Quote ids and values. | `` `region '${region}'` ``, `` `${count} values from step '…'` ``, `` `overlaps '${id}' by ${w}×${h} px` `` |
| `limit` | What was expected, or the list of allowed values. | `` `regions of ${layout}: ${regions.join(", ")}` ``, `"unique per slide"`, `` `${OVERLAP_PX} px` `` |
| `fix` | One edit, in the imperative, that makes the problem go away. Name the file or key to change. Add a did-you-mean when there is a known list. | `` close ? `set region: "${close}"` : `set region to one of ${quote(regions)}, or give the element a box` `` |

Conventions the existing rules follow:
- **Did-you-mean.** `validate.js` has `didYouMean(name, known)`, which wraps `suggest` from `core/registry.js`. Use it whenever the value should be one of a known list, and fall back to listing the options when there is no close match.
- **Where to edit.** The fix names the file to edit. Deck rules whose fix is a key in deck.js (deck schema errors, `unknown-theme`, `unknown-palette`) end with `in deck.js`; theme problems name `` themes/${theme}/tokens.css `` or `` themes/${theme}/palettes.json ``; component problems name `` components/${name}/ ``; `layout-schema` names the layout file. Slide schema problems end with `` in slides/${slide}.js ``; prop problems end with `(props of <type>)`.
- **Numbers.** Put the measured number in `measured` and the threshold in `limit`, with their units (`20px` vs `28px`, `1.92:1` vs `4.5:1`), so the test can match on them.

### Severity

Only `validate` has a severity. Its `add(p, severity = "error")` stores the problem with `severity: "error"` or `"warning"`. Errors exit 1; warnings print as `warning: <line>` and exit 0. Today the only warning is `noop-step`:

```js
add({ slide, step, rule: "noop-step", measured: "…", limit: "…", fix: "…" }, "warning");
```

Make a new rule an error unless the deck is still correct and the problem is only a smell. Per-step element rules go through `report(key, p)`, which always calls `add(p)`, so they are always errors.

`check` problems carry no severity. Any problem makes `check` exit 1.

## Add a validate rule

`validate` runs its checks in a fixed order. The header comment of `cli/validate.js` lists them; add your rule to that comment too.

| Level | Where in `cli/validate.js` | What you have there | Existing rules there |
| --- | --- | --- | --- |
| Deck | `runValidate`, before the `// ---------------- slides ----------------` loop | `deck` (the imported `deck.js`), `engine` (the engine folder), the theme folder and its `tokens.css`, the component registry and `validatorFor(name)` | `unknown-theme`, `theme-background`, `component-collision`, `layout-schema` |
| Slide | `validateSlide(spec, env)`, after the slide schema check | `spec` (the slide file's default export), `defs` (elements with a string `id` and `type`), `steps`, `all = initialElements(spec)` (the title sugar included), the layout's `regions` | `duplicate-id`, `step-id-numeric`, `remote-url` and `style-import` on `slide.style`, `unknown-layout`, `step-ref`, `advance-overflow` |
| Per step | `checkElement(id, el, k, step)`, inside `validateSlide` | `el.props` folded with `stateAt(spec, k)`, `typeOf.get(id)`, `env.load` (the data loader), `env.exact` (exact-case path lookup) | `props-not-object`, `hex-color`, `binding-*`, `file-missing`, `missing-column`, `prop-invalid`, `diagram-*` |
| Lint | The end of `validateSlide` | `all`, the slide's `regions` | `figure-source` |

The header comment's `lint` entry also lists the `noop-step` warning ("a step whose state equals the previous step's"), but its code runs in the fold loop of `validateSlide`, not at the end. A new lint rule goes at the end of `validateSlide` and in that `lint` entry.

### Deck and slide rules: call add()

A deck or slide rule calls `add()` directly. This is `style-import`, the whole rule:

```js
const CSS_IMPORT = /@import\s+[^;]*;?/gi;
// …
if (typeof spec.style === "string") {
  for (const [m] of spec.style.matchAll(CSS_IMPORT)) {
    add({ slide, rule: "style-import", measured: `style has ${m.trim()}`, limit: "no @import in slide.style (the runtime ignores it)", fix: "copy the rules into style itself (slide.style is scoped CSS, parsed without @import)" });
  }
}
```

Patterns that keep these rules consistent:
- **Regexes and lists as constants.** Put them at the top of the file next to `REMOTE`, `HEX`, `FILE_REF` and `FIGURE`.
- **Exact case.** Look up files with `env.exact(root, rel)` (or `exact` in `runValidate`), not `existsSync`. It returns `{ ok }`, `{ missing }` or `{ actual }`, and `{ actual }` is reported as `path-case`.
- **Guard clauses.** `validateSlide` returns early when the elements are malformed (no string `id` or `type`) or `steps` is not an array of objects; the schema has already reported those. Your rule can assume `defs`, `steps` and `all` are well formed.

### Per-step rules: call report() from checkElement

Per-step rules see each element's props after folding. `validateSlide` folds the slide with `stateAt` at every step and calls `checkElement` for each element whose props changed. Report through `report(key, p)`, which drops a key it has already seen:

```js
const hex = HEX.exec(s)?.[1];
if (hex) {
  report(`${id}|hex|${path}|${s}`, { slide, element: id, step, rule: "hex-color", measured: `${path} has ${hex}`, limit: "no hex colors in props", fix: `remove ${hex} from ${path}; colors come from the theme palette (use {{color:accent}} words in text)` });
}
```

Two things decide what a per-step rule may depend on:
- **The key carries no step.** A problem is reported once per element and offending value, at the first step where it appears. Build the key from the element id, a rule tag and the value (`` `${id}|hex|${path}|${s}` ``), so that a different bad value at a later step gets its own line.
- **Unchanged props are not checked again.** The `checked` map skips an element whose props equal the props it had at the last step it was checked. A per-step rule must therefore depend only on that element's own props and type, not on `k`, on other elements or on visibility. A rule that compares steps, like `noop-step`, belongs in the fold loop itself, not in `checkElement`.

Per-step checks do not always run:
- A bad `from`, `at` or `advance.start` (`step-ref`) skips folding for the whole slide.
- A `set`, `replace`, `show` or `hide` that names an unknown element stops folding at that step (`firstBad`). A bad `only` skips its own step.
- A rule that needs the component's schema to pass, like `diagram-id`, runs only after `validate(resolved)` succeeds, on props with bindings resolved.

If your rule hides others in this way, add it to the "What a failure hides" table in [Rules](../reference/rules.md#what-a-failure-hides).

### A component's own rules

A rule about one component's props can live in that component's folder as a pure function, with no DOM, so that the component and `validate` share it. `components/diagram/place.js` exports `diagramProblems(props, { gap, pad })`, which returns items of this shape:

```js
{ rule: "diagram-id", id, message: `${where} names an unknown id '${id}'`, limit, fix: `fix '${id}' in ${where}, or add a node, group or edge with that id` }
```

`checkElement` maps each item to a problem with `componentProblem(where, item)` from `cli/problems.js`, which puts `message` into `measured`:

```js
if (validate(resolved)) {
  if (type === "diagram") {
    for (const item of diagramProblems(resolved, env.spacing)) report(`${id}|${item.rule}|${item.message}`, componentProblem({ slide, element: id, step }, item));
  }
  return;
}
```

The diagram component also calls `diagramProblems` at run time and throws its first `diagram-id` item (`diagram: <message> (<limit>)`), so a deck that skips `validate` still sees an unknown id as an error on the slide. `diagram-overlap` is reported only by `validate`. Follow the same pattern for a new component: one pure `*Problems(props)` function, called from `checkElement` behind a type check, and listed in the component's README.

## Add a check rule

`cli/check.js` measures in the page and decides in Node. Its header comment lists every rule; add yours there too.

| Kind of rule | Where | Existing rules |
| --- | --- | --- |
| Per element, from the text layout of one step | `layoutFindings(layout)` | `text-outside-canvas`, `text-outside-region`, `text-overlap`, `font-too-small`, `contrast` |
| From what the page logged, requested or reported | `classifyErrors(m)` and `ERROR_FIX` | `render-error`, `console-error`, `network-error` |
| Per slide, from two or more steps | `layoutPass`, after the step loop | `step0-shows-all` |
| From played versus jumped arrivals | `playedPass` | `played-mismatch` |

### The layout measurement pass

For each slide and step, `layoutPass` opens a fresh page in the bare shell in capture mode, waits for fonts and `STEPDECK.settled()`, and takes two measurements:

```js
await session.open(id, k, { capture: true });
const m = await session.measure();                                                   // dump's measurement plus errors
const layout = await session.page.evaluate(textLayoutInPage, [CANVAS_W, BARE_CANVAS]); // text geometry
```

`textLayoutInPage` runs inside the page through `page.evaluate`, so it cannot use imports or anything at module scope; it gets its inputs only through the argument array. It returns `{ minFont, canvas, elements }`, where each element is `{ id, region, box, regionRect, items }` and each text item is `{ text, rects, slack, fontSize, source, fg, bg }`, all in canvas pixels. If your rule needs a value the page does not report yet, add it to the items or elements there.

`textLayoutInPage` collects text nodes only, and `layoutFindings` skips every element with no visible text (`if (el.items.length === 0) continue;`). A rule about element geometry rather than text, for example the box of an image or of a chart before its labels render, would never see those elements there. Read `m.elements` from `session.measure()` instead, inside `layoutPass`: it is dump's measurement, one `{ id, type, visible, ghost?, text, box, props }` per element (`ghost` only while the element's placeholder is on screen), with `box` in canvas pixels rounded to 1 px and `0,0,0,0` for a collapsed element (`measureInPage` in `cli/dump.js`). `layoutPass` already reads it for `props.role`.

`layoutFindings(layout)` is the pure part, and it runs in Node. A rule pushes a finding, with no slide or step; `layoutPass` adds those:

```js
const exempt = el.region === "footer";
const small = el.items.filter((it) => !exempt && !el.source && !it.source && it.fontSize < minFont - 0.01);
if (small.length) {
  const worst = small.reduce((a, b) => (b.fontSize < a.fontSize ? b : a));
  out.push({
    element: el.id,
    rule: "font-too-small",
    measured: `${px(worst.fontSize)} "${worst.text}"`,
    limit: `${px(minFont)} (--min-audience-font)`,
    fix: "use a larger font size; only sources (role: \"source\") and the footer may go smaller",
  });
}
```

Push at most one finding per element and rule: the worst case (the smallest font, the lowest contrast, the largest overlap) or the union of the offending rects (`text-outside-canvas`), not one per text item.

Before `layoutFindings` runs, `layoutPass` drops elements that `STEPDECK.errors` already names, so a failed element is reported once, as `render-error`, and is not also measured.

### Deduplication

`layoutPass` passes every finding through `tally()`, keyed on slide, element, rule and the finding's optional `key`:

```js
tally(found, `${id}\n${f.element}\n${f.rule}\n${f.key ?? ""}`, () => ({ slide: id, step: ids[k], ...f }));
```

The first step keeps the finding, and later steps only count. A finding that persists ends with `(+N more steps)`. A rule about a pair of elements sets `key` to the other element's id, as `text-overlap` does (`key: els[i].id`), so each pair gets its own line.

Page-error rules are deduplicated differently: `errorCollector` keeps one problem per slide, step, rule and message line, with `limit: "no errors"` and the fix from `ERROR_FIX[rule]`. A new page-error rule needs a branch in `classifyErrors` and an entry in `ERROR_FIX`.

### Thresholds are named constants

Every number a rule compares against is a named constant at the top of `cli/check.js`:

```js
const OVERLAP_PX = 4;
const EDGE_PX = 1;
const MIN_CONTRAST = 4.5;
```

Add yours there, use it in `limit` (`` `${OVERLAP_PX} px` ``, `` `${MIN_CONTRAST}:1` ``) so the line shows the threshold, and give it in the rule's row in [Rules](../reference/rules.md). A threshold that the theme should control is read from a token in the page instead, as `minFont` is: `--sd-min-audience-font`, then `--min-audience-font`, then 28.

### Slide-level rules

A rule that compares steps runs after the step loop in `layoutPass`, as `step0-shows-all` does. It needs both ends of the slide, so it is skipped when `--step` limits the run (`only !== null`):

```js
if (only === null && ids.length > 1 && sameContent(first, last)) {
  step0.push(problem({ slide: id, step: ids[0], rule: "step0-shows-all", measured: "…", limit: "…", fix: "…" }));
}
```

Problems come out in a fixed order: page errors, layout rules, slide-level rules, then `played-mismatch`. Keep a new rule in the group it belongs to.

## Test the rule

Every rule gets a fixture deck that produces exactly that one problem. How the suites run, and the full fixture conventions, are in [Testing](testing.md).

### validate: a fixture and a test in validate.test.mjs

1. Add a folder `test/fixtures/validate/<case>/` with a `deck.js` and `slides/s.js`. The case name describes the mistake and may differ from the rule name (`figure-without-source` produces `figure-source`). This is the whole `style-import` fixture:

   ```js
   // deck.js
   // Fixture (R6): slide.style with an @import, which the runtime would drop silently (I2).
   export default {
     title: "validate fixture",
     lang: "en",
     theme: "academic-light",
     slides: ["s"],
   };
   ```

   ```js
   // slides/s.js
   // slide.style with a local @import: CSSStyleSheet.replaceSync ignores it, so it must not pass validate.
   export default {
     id: "s", title: "Style import",
     style: `@import "extra.css";
       h2 { letter-spacing: 0.02em; }`,
     elements: [{ id: "lead", type: "text", props: { text: "Styled slide." } }],
   };
   ```

2. Add a test to `test/unit/validate.test.mjs`. Use the file's helpers: `fixture(name)`, `rules(problems)` (the sorted rule names), `only(problems, rule)` (asserts there is exactly one) and `show(problems)` (the lines, as the assertion message). Assert the rule list, then the location, then the numbers or names in `measured` and `fix`:

   ```js
   test("@import in slide.style is rejected (replaceSync drops it)", async () => {
     const p = only(await validate(fixture("style-import")), "style-import");
     assert.equal(p.element, null);
     assert.match(p.measured, /^style has @import "extra\.css"/);
     assert.match(p.fix, /copy the rules into style/);
   });
   ```

   Most tests assert the whole list with `assert.deepEqual(rules(problems), ["<rule>"], show(problems))`, which also catches a fixture that trips a second rule by accident. For a warning, also assert `severity` and that `errors(problems)` is empty, as the `noop-step` test does.

3. Run it:

   ```sh
   node --test test/unit/validate.test.mjs
   ```

### check: a fixture and an entry in the cases map

1. Add a folder `test/fixtures/check/<rule>/`, usually named after the rule (see the `rule` override in step 2), with a `deck.js` and `slides/s.js`. Fixture decks inside the repository use the repository engine, so they need no `index.html` and no engine copy. Put one passing element next to the failing one, so the fixture also shows what does not trip the rule. This is the `font-too-small` fixture. Its `deck.js` has the same keys as the validate one; only the comment and the title differ:

   ```js
   // deck.js
   // Fixture (R6): a deck that must fail `stepdeck check` with exactly one rule, font-too-small.
   export default {
     title: "check fixture: font-too-small",
     lang: "en",
     theme: "academic-light",
     slides: ["s"],
   };
   ```

   Its slide keeps a source line and a footer line at the same small size, because both are exempt:

   ```js
   // slides/s.js
   // One body paragraph styled below the 28 px audience minimum. The source line and the footer text
   // are just as small but exempt (the footer frame), so they must not be reported.
   export default {
     id: "s",
     layout: "figure-notes",
     style: ".sd-text { font-size: 20px; }",
     elements: [
       { id: "small", region: "main", type: "text", props: { text: "Too small for the audience." } },
       { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic." } },
       { id: "foot", region: "footer", type: "text", props: { text: "Footer line." } },
     ],
   };
   ```

2. Add an entry to the `cases` map in `test/browser/check.test.mjs`, from the folder name to where the one problem must point:

   ```js
   "font-too-small": { element: "small", step: "0" },
   ```

   Use `element: null` for a slide- or step-level problem. If the folder is not named after its rule, add `rule`, as `"remote-style": { element: null, step: "0", rule: "network-error" }` does. The loop then asserts one rule, exactly one problem, slide `s`, that element and step, and non-empty `measured`, `limit` and `fix`.

3. If the line carries a number, add a match on it next to the existing `"check: measured values name the numbers"` test (`assert.match(small.measured, /20px/)`).

4. Run the file with its concurrency flag:

   ```sh
   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/check.test.mjs
   ```

A rule that only fires with `--played` needs a deck under `test/fixtures/decks/`, like `test/fixtures/decks/played-mismatch/`, and its own test.

### Keep the baselines clean

A new rule must not fire on the two example decks. `validate.test.mjs` requires `examples/spike` to validate with no errors and no warnings; `check.test.mjs` requires it to pass `check` and `check --played`; `test/browser/kit.test.mjs` requires the same of `examples/kit`. Run them by hand first:

```sh
node cli/index.js validate examples/spike
node cli/index.js validate examples/kit
node cli/index.js check examples/spike --played
node cli/index.js check examples/kit --played
```

If a new rule fires on an example, either the example has a real problem (fix the example) or the rule is too strict (fix the rule). Do not exempt the example.

## Update the docs

A rule is not done until these agree with the code:

| File | What to add |
| --- | --- |
| [docs/reference/rules.md](../reference/rules.md) | This page owns the rule list. Add a row to the right table (validate deck, slide, per-step or lint; check layout, page errors or played), with what it measures, its limit or threshold, and the usual fix. Update the Deduplication table and "What a failure hides" if the rule changes either, the "Rule fixtures" table with the fixture folder, and "Differences from the skill's checks.md" if the skill does not list it yet. If the rule closes an item in "Known gaps", remove or reword that bullet. If the rule was in the "These rules have no fixture folder" sentence, take it out. |
| [skill/references/checks.md](../../skill/references/checks.md) | The agent's version: one row with what the rule means and how to fix it, in the table for its family. Agents are told not to read engine code, so this row is all they get. If the rule closes an item in "Known limits (they will bite)", remove or reword it there too. |
| The component's `README.md` | For a component-owned rule, the errors list (as `components/diagram/README.md` lists `diagram-id` and `diagram-overlap`). |
| [Troubleshooting](../troubleshooting.md) | If the rule catches a mistake that authors often make, or one whose fix is not obvious from the line. |
| The header comment of `cli/validate.js` or `cli/check.js` | The rule, in the list of checks. |

For the wording and naming conventions shared across the code and the docs, see [Conventions](conventions.md).

## See also

- [Rules](../reference/rules.md): every rule, its severity, limit and fix.
- [Testing](testing.md): the suites, the fixture folders and the browser helpers.
- [Checking a deck](../guide/checking-a-deck.md): how authors use `validate` and `check`.
- [CLI](../reference/cli.md): flags and exit codes.
- [Architecture](../concepts/architecture.md): where the fold, the controller and the CLI fit.
