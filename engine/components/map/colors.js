// Colour helpers the layer kinds share: `blend`, two colours mixed, and `roleColor`, the colour of a theme role.
import { d3 } from "../../core/d3.js";

const COLOR = "--sd-color-";
/** The theme colour role a mask or a layer of points takes when the layer names none. */
export const DEFAULT_ROLE = "accent";

/** The names of the theme's colour roles (`accent`, `alert`, …) in `ctx.tokens`. */
export const roleNames = (ctx) => Object.keys(ctx.tokens ?? {}).filter((name) => name.startsWith(COLOR)).map((name) => name.slice(COLOR.length));

/** The colour of theme role `role`, resolved; `undefined` for a name the theme has no colour for. */
export const roleColor = (role, ctx) => ctx.tokens?.[`${COLOR}${role}`]?.trim() || undefined;

const mixes = new Map();
/** `a` blended toward `b` by `t` in RGB (d3.interpolateRgb), with `a` and `b` themselves at the ends. */
export function blend(a, b, t) {
  if (t >= 1 || a === b) return b;
  if (t <= 0) return a;
  const key = `${a}|${b}`;
  if (!mixes.has(key)) mixes.set(key, d3.interpolateRgb(a, b));
  return mixes.get(key)(t);
}
