# list

This page lists every prop and behaviour of the built-in `list` component: numbered, lettered, bulleted or checklist items that you reveal, tick or emphasise one step at a time. It is for anyone who writes slides, by hand or through an agent. Agents get the same facts from [skill/references/components.md](../../../skill/references/components.md) and `node cli/index.js catalog list <deck>`.

Sources: [`components/list/schema.json`](../../../engine/components/list/schema.json), [`components/list/index.js`](../../../engine/components/list/index.js), [`components/list/derive.js`](../../../engine/components/list/derive.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

### Reveal one item per step

The kit example deck shows a lettered list with an accent rule and adds one item per step by advancing `shown` (`examples/kit/slides/criteria.js`):

```js
export default {
  id: "criteria",
  layout: "statement",
  title: "How we check the agent's work",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "letter", rule: true, shown: 1, items: [
        { text: "The numbers match a **hand count** on a sample" },
        { text: "Every step is in a script we can rerun" },
        { text: "Each figure in the report traces back to one file in `data/`, with the code that made it and the date it was run, so that a reviewer can rebuild it alone", sub: "No figure is typed by hand" },
        { text: "A second person reviews the code" },
      ] },
      advance: { prop: "shown", values: [1, 2, 3, 4], start: "a" } },
  ],
  steps: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
};
```

### Tick a checklist

The same deck keeps every item visible and ticks one per step by advancing `done` (`examples/kit/slides/tasks.js`, the list element only):

```js
{ id: "todo", region: "right", type: "list",
  props: { marker: "check", done: 0, items: [
    { id: "check", text: "Check the data", sub: "missing values, duplicates" },
    { id: "fit", text: "Fit the model", sub: "with its 95% interval" },
    { id: "figures", text: "Make the figures", sub: "saved in `figures/`" },
    { id: "summary", text: "Write the summary", sub: "one page, plain words" },
  ] },
  advance: { prop: "done", values: [0, 1, 2, 3, 4], start: "prompt" } },
```

Both slides pass `validate`, `check` and `check --played` when copied into a fresh deck.

The component never reads the step number. Everything it shows comes from its props, so you drive it per step with `advance` (as above) or with `set` on a step:

```js
steps: [
  { id: "intro" },
  { id: "focus", set: { todo: { active: "fit" } } },
],
```

See the [step model](../../guide/step-model.md) for `advance`, `set` and how steps fold.

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `items` | array of `{ id?, text, sub? }`, at least 1 | yes | | snap | The items, in order. `text` is the item; `sub` is an optional second line under it. Both are inline Markdown. `id` names an item for `done` and `active`. |
| `marker` | `number` \| `letter` \| `bullet` \| `check` | yes | | snap | The marker before each item. See [Markers](#markers). |
| `shown` | integer >= 0 | no | all items | fade | Items `0` to `shown - 1` are visible. Hidden items keep their space. A value above the item count shows them all. |
| `done` | integer >= 0, or array of item ids | no | none done | draw | For `marker: "check"`: a number ticks that many items from the top; an array ticks the items with those ids. |
| `active` | integer >= 0 (an index), or string (an id) | no | none | fade | One item is emphasised; the text of every other item turns muted. |
| `rule` | boolean | no | `false` | snap | Draws an accent rule down the left side of the list. |

The schema has `additionalProperties: false` on the props and on each item, so any other key is a `validate` error (`unknown-prop` or `prop-invalid`).

### Item ids

An item's id is its `id` when set, otherwise its index as a string (`"0"`, `"1"`, ...). Ids must be unique across the list, including the generated ones: an item with `id: "1"` collides with the second item if that item has no id.

`done` and `active` look ids up as strings. An integer `active` is always an index, never an id.

### Item text

`text` and `sub` go through the shared inline Markdown renderer: emphasis, `code` and links work; raw HTML is shown as text; link URLs are limited to `http`, `https`, `mailto`, relative paths and `#anchor`. Item text is set in the body size (`--sd-font-size-body`) and `sub` in the note size (`--sd-font-size-note`) in the muted color. Long text wraps inside the item.

## Markers

| `marker` | What each item shows | Notes |
| --- | --- | --- |
| `number` | `1.` `2.` `3.` ... | Latin digits in every deck language. |
| `letter` | `a.` `b.` ... `z.` `aa.` `ab.` ... | Spreadsheet-style after `z`. Always latin letters, also in a Spanish deck. |
| `bullet` | `•` | |
| `check` | A box drawn as an SVG, with a check mark inside when the item is done | The only marker that reads `done`. |

Markers use the muted color. The marker of the `active` item uses the accent color. In a checklist the box frame takes the marker color and the tick is always the accent color.

## What it renders

Inside its element wrapper (`div.sd-el[data-el][data-type="list"]`) the component renders one list. A checklist item looks like this:

```html
<ul class="sd-list" role="list" data-marker="check" data-rule="false" data-active="false">
  <li class="sd-list-item" data-index="0" data-id="check" data-visible="true" data-done="true" data-active="false">
    <span class="sd-list-marker sd-list-box" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect class="sd-list-box-frame" x="2" y="2" width="20" height="20" rx="4"></rect>
        <path class="sd-list-tick" d="M6.5 12.5l4 4 7.5-9"></path>
      </svg>
    </span>
    <div class="sd-list-body">
      <div class="sd-list-text">Check the data</div>
      <div class="sd-list-sub">missing values, duplicates</div>
    </div>
  </li>
</ul>
```

For `number`, `letter` and `bullet` the marker span holds the marker text instead of the SVG. `div.sd-list-sub` is present only when the item has a `sub`.

The state lives in data attributes, which `core/stepdeck.css` styles:

| Attribute | Set from | Effect |
| --- | --- | --- |
| `ul[data-rule="true"]` | `rule` | Left border of 3 x `--sd-rule-width` in `--sd-color-accent`, plus left padding. |
| `ul[data-active="true"]` | some item is active | Turns on dimming of the other items. |
| `li[data-visible="false"]` | `shown` | `visibility: hidden`: the item keeps its space, so nothing reflows between steps. |
| `li[data-done="true"]` | `done` | Shows the tick. |
| `li[data-active="true"]` | `active` | Keeps ink text and an accent marker while the others turn muted. |

Use slide `style` with these classes and attributes to restyle one slide.

## Motion

The engine animates an update only when you move forward by exactly one step, in a live presentation with motion on. Every other move (a jump, a backward move, the first render, capture mode for `shoot` and `check`) renders the target state at once. See [Animation and motion](../../guide/animation-and-motion.md).

**Entrance.** The list builds its own entrance (`"x-enter": "own"`). On the step where the element appears, in its stagger slot, its box stays still and the list plays the build from nothing to the state of that step: every visible item rises in, one after another, and a done tick draws after its row. The items are hidden the moment the list shows. A list that appears with `shown: 3` plays one build of three items. With `enter: "fade"`, `"rise"`, `"wipe"` or `"pop"` the box moves instead and the list shows its state at once; with `enter: "none"` nothing moves.

While the list stays visible, an animated forward step compares each item before and after the update and plays:

| Change | Motion |
| --- | --- |
| An item becomes visible (`shown` grew) | The shared `rise` motion: it fades in while moving up from `--sd-motion-distance` below. Several new items are `--sd-stagger` apart (80 ms in `modern`, 60 ms in `academic-light`, or the step's `transition.stagger`). Items rise in every theme. |
| An item becomes done (`done`, check marker) | Its tick is drawn. If the item also just became visible, the tick stays hidden while the item rises, then draws. |
| A visible item changes emphasis (`active`) | Its text color tweens between ink and muted. |

Each motion lasts the theme's `--sd-duration` (400 ms), or the step's `transition.duration` when set. Going backward, an item unticks or hides with no motion.

No motion plays in these cases:

- **`items` or `marker` changed.** The list is rebuilt from scratch and drawn in its new state directly. This includes any change to an item's `id`, `text` or `sub`.
- **`rule` changed.** It snaps.

After every update the component removes all inline styles the motion used, so a played step and a jumped step end with the same markup. `check --played` verifies this.

## Errors

These come from `deriveList` in `components/list/derive.js`. The component throws them at render time; the element shows the error on the slide and `check` reports it as `render-error`.

| Message | Cause |
| --- | --- |
| ``list needs a non-empty `items` array`` | `items` is missing, not an array, or empty. |
| ``list `marker` must be one of number, letter, bullet, check (got '<m>')`` | `marker` is missing or not one of the four values. |
| ``list item <i> needs a string `text` `` | Item `<i>` (0-based) has no `text` or a non-string `text`. |
| `list has a duplicate item id '<id>'` | Two items share an id, explicit or generated. |
| ``list `done` names an unknown item id '<id>' (ids: ...)`` | An entry in a `done` array matches no item id. |
| ``list `active` names an unknown item id '<id>' (ids: ...)`` | A string `active` matches no item id. |

`validate` catches the first three, plus wrong types, through the schema (`prop-invalid`). It does not resolve ids, so an unknown id in `done` or `active`, or a duplicate id, passes `validate` and shows up only in `check`. For example, on a slide `gotcha` with a one-item checklist `l` (`items: [{ id: "x", text: "a" }]`) whose step `b` sets `done: ["nope"]`, `check` prints:

```text
gotcha/b · render-error · gotcha/l: list `done` names an unknown item id 'nope' (ids: x) vs no errors · fix the error shown on the slide, then run check again
```

The first field is `<slide>/<step id>`, where the problem was found; the text before the message is `<slide>/<element id>`, the element that failed.

Run `check` as well as `validate` before you trust a list. See [Checking a deck](../../guide/checking-a-deck.md).

## Gotchas

**Out-of-range numbers are accepted silently.** Only ids are checked. An integer `active` past the last index emphasises nothing and dims nothing. A `done` count larger than the item count ticks every item. Neither is an error in `validate` or `check`.

**Unknown `done` ids are an error even when the marker is not `check`.** A `done` array is checked against the item ids for every marker, although only `check` draws ticks. With `marker: "bullet"` and `done: ["nope"]` the element fails. A valid `done` (array or number) with another marker has no effect.

**`shown` hides, it does not remove.** Hidden items keep their height, so a list with `shown: 0` still takes its full space in the region. That keeps the layout stable between steps; it also means `check` measures the full list for overlap from the first step.

**An item that appears on the same step as an `active` change does not tween its color.** When an item becomes visible on the same step that `active` moves, it rises in already in its final color; only items that were visible before tween their color.

**Changing an item's text rebuilds the list.** Any change to `items` (even one word in one `sub`) redraws the whole list without motion. Keep `items` fixed across steps and drive the list with `shown`, `done` and `active`.

## See also

- [Components reference](index.md) for the rules every component shares.
- [`chat`](chat.md) and [`terminal`](terminal.md), which also reveal entries one by one with `shown`.
- [skill/references/components.md](../../../skill/references/components.md) for the agent workflow.
