// Colour helpers the layer kinds and the stage share: `blend`, two colours mixed, `roleColor`, the colour of a theme
// role, and `compactTint`, the tint a compact map lights a highlighted region's land with.
import { d3 } from "../../core/d3.js";

const COLOR = "--sd-color-";
/** The theme colour role a mask or a layer of points takes when the layer names none. */
export const DEFAULT_ROLE = "accent";
/** The share of the accent in a compact map's tint, in %, when the theme has no `--sd-compact-tint`. */
const TINT = 20;

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

/**
 * The tint of a compact map's lit land: the accent mixed into the background by `--sd-compact-tint` (20% when the theme
 * has none), in RGB, as `rgb(...)`; null when the theme lacks either colour.
 * @param {{ tokens?: Record<string, string> }} ctx
 * @returns {string | null}
 */
export function compactTint(ctx) {
  const [background, accent] = [roleColor("background", ctx), roleColor("accent", ctx)];
  if (!d3.color(background ?? "") || !d3.color(accent ?? "")) return null;
  const share = parseFloat(ctx.tokens?.["--sd-compact-tint"]);
  return d3.interpolateRgb(background, accent)((Number.isFinite(share) ? share : TINT) / 100);
}
