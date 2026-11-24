# chat

`chat` shows an exchange as bubbles, or a single prompt or quote as a bordered card. Messages appear one per step when you drive `shown`, and the newest one can be typed out. This page lists every prop, the markup, the motion and the error messages. It is for anyone writing slides by hand or reviewing what an agent wrote.

Source code (for contributors; deck authors do not need it): [`components/chat/schema.json`](../../../engine/components/chat/schema.json), [`components/chat/index.js`](../../../engine/components/chat/index.js), [`components/chat/derive.js`](../../../engine/components/chat/derive.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

### Reveal an exchange one message per step

From `examples/kit/slides/exchange.js`. `advance` sets `shown` to 1, 2 and 3 on the three steps, and `typing` types each new message as it appears:

```js
export default {
  id: "exchange",
  layout: "full-bleed",
  title: "Asking before acting",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { style: "bubbles", typing: true, shown: 1, messages: [
        { role: "user", label: "You", text: "Can you check whether the effect holds in **new** data?" },
        { role: "agent", label: "Agent", text: "Yes. I propose to hold out a fifth of the data, refit on the rest, and compare the error on both parts, repeated with three different seeds so the result is not luck. Shall I go ahead?" },
        { role: "user", label: "You", text: "Go ahead." },
      ] },
      advance: { prop: "shown", values: [1, 2, 3], start: "ask" } },
  ],
  steps: [{ id: "ask" }, { id: "propose" }, { id: "agree" }],
};
```

The component never reads the step number. It draws whatever `shown` says, so you can also set `shown` with `set` on a step. See the [step model](../../guide/step-model.md).

### Show a prompt as a card

From `examples/kit/slides/tasks.js`, where the card sits in the left half of a `halves` slide. No `shown`, so both messages are visible at every step:

```js
{ id: "prompt", region: "left", type: "chat",
  props: { style: "card", messages: [
    { role: "user", label: "The prompt", text: "Check the survey data, fit the model, make the two figures and write a **one-page** summary." },
    { role: "note", label: "The rule", text: "Work only inside the project folder. Never change `data/raw/`." },
  ] } },
```

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `messages` | `[{ role, label?, text }]`, at least 1 | yes | | snap | The messages, in order. See [Messages](#messages). |
| `style` | `bubbles` \| `card` | no | `bubbles` | snap | Rounded bubbles, or full-width bordered cards with the label on top. |
| `shown` | integer >= 0 | no | all messages | fade | Messages `0` to `shown - 1` are visible. Hidden messages keep their space. A value above the message count shows all of them. |
| `typing` | boolean | no | `false` | draw | Type the newest visible message, character by character, when it appears on a forward step. |

The schema has `additionalProperties: false` on the props and on each message, so any other key is a `validate` error (`unknown-prop`).

### Messages

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `role` | `user` \| `agent` \| `note` | yes | Who speaks. Sets alignment and look; see [Styles](#styles). |
| `label` | string | no | A line above the text, such as a name or `The prompt`. Plain text: it is set with `textContent`, so Markdown and HTML show as typed. |
| `text` | string | yes | The message. Inline Markdown: emphasis, `code` and links. Raw HTML is escaped and shown as text. Only `http:`, `https:`, `mailto:`, `#anchor` and relative link URLs are kept. |

Long text wraps inside its bubble or card (`overflow-wrap: anywhere`).

## Styles

| | `bubbles` | `card` |
| --- | --- | --- |
| Width | At most 80% of the element. | Full width. |
| `user` | Right-aligned, label right-aligned. Accent border; surface tinted 14% with the accent. | Accent border. |
| `agent` | Left-aligned. Rule-colored border on the plain surface. | Accent border. |
| `note` | Left-aligned. Dashed rule-colored border, no fill, muted text. | Rule-colored border. |
| Border and corners | `--sd-rule-width` border, corner radius 1.5 x `--sd-space`. | 2px border, corner radius half of `--sd-grid`, background color fill. |

Messages stack in a column with `--sd-space` between them. Text is `--sd-font-size-body` in ink (40px in academic-light); the label is `--sd-font-size-label` in the muted color (28px in academic-light). `code` in the text uses the mono font at the label size. Both sizes meet the minimum audience font. Colors, sizes and borders come from theme tokens; see [Layouts and themes](../../guide/layouts-and-themes.md).

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="chat"]`) the component renders:

```html
<div class="sd-chat" data-style="bubbles">
  <div class="sd-chat-msg" data-index="0" data-role="user" data-visible="true">
    <div class="sd-chat-label">You</div>
    <div class="sd-chat-text">Can you check whether the effect holds in <strong>new</strong> data?</div>
  </div>
  <div class="sd-chat-msg" data-index="1" data-role="agent" data-visible="false">…</div>
</div>
```

`div.sd-chat-label` is present only when the message has a `label`. A hidden message has `data-visible="false"`, which sets `visibility: hidden`: it stays in the layout, so the element's box has the same size at every step and nothing reflows as messages appear. `dump` on the slide above reports the chat at 1728×509 on all three steps. Use these classes and attributes in slide `style` to restyle one slide.

## Motion

Motion plays only when the engine animates the update: you moved forward exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (`shoot`, and `check` without `--played`) draw the target state at once. `check --played` plays each forward step with motion, typing included, then checks that it ends with the same markup as a jump. See [Animation and motion](../../guide/animation-and-motion.md).

**Entrance.** The chat builds its own entrance (`"x-enter": "own"`). On the step where the element appears, in its stagger slot, its box stays still and every visible message rises in, one after another, then the newest is typed (with `typing`), as below; the messages are hidden the moment the chat shows. With `enter: "fade"`, `"rise"`, `"wipe"` or `"pop"` the box moves instead and the messages show at once, full text; with `enter: "none"` nothing moves. `enter: "draw"` is the same as leaving `enter` unset; with `enter: { motion: "draw", duration: <ms> }` the build's motions last that long instead.

On an animated step while the chat stays visible (and in its entrance):

1. **Rise.** Each message that just became visible plays the shared `rise` motion: it fades from opacity 0 to 1 while it moves up from `--sd-motion-distance` below. With several new messages, each starts `--sd-stagger` after the previous one (80 ms in `modern`, 60 ms in `academic-light`, or the step's `transition.stagger`). Each rise lasts the theme's `--sd-duration` (400 ms), or the step's `transition.duration` when set. The motion name is fixed: messages rise in every theme.
2. **Typing.** When `typing` is `true` and the newest visible message is one of the new ones, its text is typed after it has risen. Typing takes 28 ms per character, at most 1400 ms, whatever the step's `transition.duration`; it is skipped (full text at once) when `transition.duration` is 0. Characters are counted in the rendered text, so Markdown markers such as `**` do not count. The untyped rest of the text is already in place but hidden, so the bubble does not grow while it types. Only the newest message is typed; an older message that appears on the same step only rises.

Nothing animates when the message list itself changes (a different role, label or text, or a different number of messages): the messages are rebuilt and drawn at once. Changing `style` also takes effect at once.

Every update first writes the target state from the props, and when the motion ends (or is interrupted by the next step) the text is restored whole and the inline styles are removed. A played step and a jumped step end with the same markup.

## Errors

At runtime, `derive.js` checks the props and throws these messages. The element shows the error on the canvas and records it as `<slide>/<element>: <message>` (see [An element error fails only that element](index.md#an-element-error-fails-only-that-element)):

| Message | Cause |
| --- | --- |
| ``chat needs a non-empty `messages` array`` | `messages` is missing, not an array, or empty. |
| ``chat `style` must be one of bubbles, card (got '<style>')`` | `style` is another value. |
| ``chat `shown` must be an integer >= 0 (got '<shown>')`` | `shown` is negative, fractional or not a number. |
| ``chat message <i> has role '<role>'; `role` must be one of user, agent, note`` | A message has a missing or unknown `role`. `<i>` counts from 0. |
| ``chat message <i> needs a string `text` `` | A message has no `text`, or it is not a string. |
| ``chat message <i>: `label` must be a string`` | A message has a `label` that is not a string. |

`validate` catches the same mistakes earlier, through the schema, as `prop-invalid`. From a scratch slide with no `steps`, `style: "list"`, `shown: 1.5` and a message with `role: "bot"` (on a slide with steps, the location also names the step: `<slide>/<element>/<step>`):

```text
bad/chat · prop-invalid · messages.0.role = "bot" vs one of "user", "agent", "note" · set messages.0.role to "note" (props of chat)
bad/chat · prop-invalid · style = "list" vs one of "bubbles", "card" · set style to one of "bubbles", "card" (props of chat)
bad/chat · prop-invalid · shown = 1.5 vs must be integer · make shown an integer (props of chat)
```

## Gotchas

- **`label` is plain text, `text` is Markdown.** `**You**` in a label shows the asterisks.
- **Show nothing first with `shown: 0`.** The element keeps its full size with every message hidden. Then step to `1`, `2`, … with `advance`.
- **`typing` only types on a forward step by one.** Presenting backward, jumping, `shoot` and plain `check` show the full text. `check --played` does type on its forward steps.
- **Long messages make tall boxes.** The element is as tall as all its messages, hidden ones included. Run `check` to catch text that leaves its region or the canvas.

## For agents

The agent-facing summary is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog chat` prints the same props from the schema.
