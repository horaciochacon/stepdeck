// Built-in `big-number`: one large figure with an optional label and 95% interval (spec §8).
//
// `value` is formatted with the d3-format string `format`, localized by the deck language
// (ctx.format), so `es` shows the decimal comma. `ci: [lo, hi]` reads "95% CI lo–hi" (localized with
// ctx.t) using the same format; `prefix` and `suffix` wrap the main figure only.
//
// Idempotent: every update ends by writing the exact formatted value, whether a count-up ran or not.
// The count-up (ctx.animate.tween) lasts 2.25 x --sd-duration (900 ms at 400 ms), or the step's
// transition.duration. It runs in two cases:
// - the entrance: the component owns it (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw"
//   the figure fades in and counts up from 0 (over info.entrance.duration when given) while the box stays still;
//   the 0 is written synchronously, in the same task as the engine shows the element. Any other entrance
//   ("none", or a box motion) shows the value at once;
// - an animated step that changes `value` from a number, while the element stays shown: it counts from the
//   previous value.
// The engine skips updates whose props and visibility did not change, and this component also does nothing for
// an update that changed nothing, so a count-up never re-runs on a no-op step.
// An abort (info.signal) snaps to the final value; no inline opacity is left behind.
import { clearInlineStyle } from "../../core/animate.js";
import { el as make, motion, motionMs } from "../../core/kit.js";

const COUNT_UP = 2.25; // the count-up's length, in --sd-duration

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

/** Validates the props and returns what to draw. Throws readable errors (the element then fails). */
function prepare(props, ctx) {
  if (!isNumber(props.value)) {
    const hint = typeof props.value === "string" ? " (bind it without a format: {{path#/pointer}}, and put the format in `format`)" : "";
    throw new Error(`big-number needs a numeric \`value\`, got ${JSON.stringify(props.value)}${hint}`);
  }
  if (typeof props.format !== "string" || props.format === "") throw new Error("big-number needs a `format` (a d3-format string such as \",.0f\")");
  const fmt = ctx.format(props.format);
  let ci = "";
  if (props.ci != null) {
    if (!Array.isArray(props.ci) || props.ci.length !== 2 || !props.ci.every(isNumber)) {
      throw new Error(`big-number \`ci\` must be [lo, hi] (two numbers), got ${JSON.stringify(props.ci)}`);
    }
    ci = `${ctx.t("ci95")} ${fmt(props.ci[0])}–${fmt(props.ci[1])}`;
  }
  return { fmt, ci, label: props.label == null ? "" : String(props.label), prefix: props.prefix == null ? "" : String(props.prefix), suffix: props.suffix == null ? "" : String(props.suffix) };
}

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const part = (tag, className) => make(doc, tag, className);
    const root = part("div", "sd-big-number");
    const value = part("div", "sd-big-number-value");
    const prefix = part("span", "sd-big-number-prefix");
    const digits = part("span", "sd-big-number-digits");
    const suffix = part("span", "sd-big-number-suffix");
    const label = part("p", "sd-big-number-label");
    const ci = part("p", "sd-big-number-ci");
    value.append(prefix, digits, suffix);
    root.append(value, label, ci);
    el.appendChild(root);

    const setText = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };
    /** Writes everything from the props; the digits only when `withDigits`. Returns the formatter. */
    const render = (props, withDigits) => {
      const d = prepare(props, ctx);
      setText(prefix, d.prefix);
      setText(suffix, d.suffix);
      setText(label, d.label);
      setText(ci, d.ci);
      if (withDigits) setText(digits, d.fmt(props.value));
      root.dataset.value = String(props.value);
      return d.fmt;
    };
    render(props, true);

    return {
      async update(props, info) {
        const prev = info.prev;
        const draw = info.entrance?.motion === "draw" && !info.signal?.aborted;
        // Count from 0 on a drawn entrance, else from the previous value when `value` changed on an animated step
        // while the element stays shown. An element that just appeared without a draw shows its value at once.
        const changedFrom = info.animate && !info.entered && info.changed.includes("value") && isNumber(prev?.value) ? prev.value : null;
        const from = draw ? 0 : changedFrom;
        const countUp = from !== null && from !== props.value;
        const fmt = render(props, !countUp);
        if (countUp) setText(digits, fmt(from)); // the start state, before anything can paint
        if (draw || info.animate) {
          const opts = motion(info, ctx);
          const duration = (draw ? info.entrance.duration : undefined) ?? motionMs(info, ctx, COUNT_UP);
          const fading = draw
            ? [root]
            : info.entered
              ? []
              : [["label", label], ["ci", ci], ["prefix", prefix], ["suffix", suffix], ["format", value]].filter(([key]) => info.changed.includes(key)).map(([, node]) => node);
          // The entrance's fade never outlasts its count.
          const fade = draw ? { ...opts, duration: Math.min(opts.duration ?? duration, duration) } : opts;
          const run = fading.map((node) => ctx.animate.fadeIn(node, fade));
          if (countUp) run.push(ctx.animate.tween(from, props.value, (v) => setText(digits, fmt(v)), { ...opts, duration }));
          await Promise.all(run);
        }
        // Idempotent end state: the exact value and no inline opacity, whether the motion ran, was aborted or never started.
        setText(digits, fmt(props.value));
        clearInlineStyle(root, value, prefix, suffix, label, ci); // a played DOM equals a jumped one
      },
      destroy() {
        root.remove();
      },
    };
  },
};
