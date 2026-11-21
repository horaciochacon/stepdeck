// The motion half of the chart building blocks: a morph over the theme's timing, the owned-entrance
// decision, and the start state of a line that draws in. Used by chart.line and chart.bar, and by custom
// components as `ctx.chart` (core/chart.js). Timing is the theme's (`--sd-duration`, `--sd-easing`) and the
// step's `transition`; the abort signal of the step goes to every tween, so an abort snaps to the end.
import { motion, motionMs } from "./kit.js";

/**
 * Plays `frame(t)` for t from 0 to 1 (`ctx.animate.tween`) over `duration`, else the step's transition, else
 * `factor` x `--sd-duration`, with the theme's easing, and resolves when it ends or the step is aborted. The
 * caller writes the end state itself afterwards.
 * @param {object} info the update's info (`signal`, `transition`)
 * @param {object} ctx
 * @param {(t: number) => void} frame
 * @param {{ factor?: number, duration?: number }} [options]
 * @returns {Promise<void>}
 */
export function morph(info, ctx, frame, { factor = 2, duration } = {}) {
  return ctx.animate.tween(0, 1, frame, {
    duration: duration ?? motionMs(info, ctx, factor),
    signal: info.signal,
    ease: motion(info, ctx).ease,
  });
}

/**
 * What a chart with an owned entrance (`"x-enter": "own"`) needs from `info`: `draw` is true for a "draw"
 * entrance on a step that is not aborted; `duration` is the entrance's own, else the step's transition,
 * else `factor` x `--sd-duration`; `ease` and `signal` go to the draw helpers.
 * @param {object} info
 * @param {object} ctx
 * @param {{ factor?: number }} [options]
 * @returns {{ draw: boolean, duration: number, ease: (t: number) => number, signal: AbortSignal | undefined }}
 */
export function entrance(info, ctx, { factor = 2 } = {}) {
  return {
    draw: info.entrance?.motion === "draw" && !info.signal?.aborted,
    duration: info.entrance?.duration ?? motionMs(info, ctx, factor),
    ease: motion(info, ctx).ease,
    signal: info.signal,
  };
}

/** Hides an SVG path along its length (the start of ctx.animate.drawPath); a path with no length is left as is. */
export function undraw(path) {
  const length = typeof path.getTotalLength === "function" ? Number(path.getTotalLength()) || 0 : 0;
  if (!(length > 0)) return;
  path.style.strokeDasharray = `${length} ${length}`;
  path.style.strokeDashoffset = String(length);
}
