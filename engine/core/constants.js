// Engine-wide constants shared by the runtime and the CLI. No imports, no DOM: Node loads it too.

/** The slide canvas, in canvas pixels (spec §6.1). */
export const CANVAS = { w: 1920, h: 1080 };
/** The theme a deck uses when deck.js names none. */
export const DEFAULT_THEME = "modern";
/** A theme name: a folder of the engine's themes/, lowercase letters, digits and hyphens (never a path). */
export const THEME_NAME = /^[a-z0-9][a-z0-9-]*$/;
/** The layout a slide uses when it names none. */
export const DEFAULT_LAYOUT = "full-bleed";

/**
 * Published styling hooks (default-theme spec §5.2, §10.1). Core emits `sd-<hook>` classes: `title` on the
 * reserved title element, the others on the regions a layout schema maps to them (`hooks`) and on their
 * element wrappers. Themes (theme.css) style these classes; layouts never do. `kicker`, `lede` and `accent` are
 * published here and emitted by core inside the title region (`lede` on the box of the reserved `lede` element).
 */
export const HOOKS = ["title", "kicker", "lede", "accent", "subtitle", "meta", "statement"];
/**
 * The hooks a layout may map a region to (layout schema `hooks`). title, kicker, lede and accent are core's own:
 * core puts them on the title element, the kicker, the lede and the accent phrase, never on a region.
 */
export const REGION_HOOKS = ["subtitle", "meta", "statement"];
/** Layout kinds (layout schema `kind`, default "content"); core sets it as `data-kind` on the canvas. */
export const LAYOUT_KINDS = ["content", "cover"];
/**
 * Cascade layers, lowest priority first: core structure and hook defaults, layout placement, the theme's
 * theme.css, sd-deck (declared and empty, reserved for per-deck overrides), then a slide's own `style`. Every stylesheet the engine writes starts with LAYER_ORDER, so the
 * order holds whichever sheet the browser sees first. Reveal's own sheets stay unlayered.
 */
export const LAYERS = ["sd-core", "sd-layout", "sd-theme", "sd-deck", "sd-slide"];
export const LAYER_ORDER = `@layer ${LAYERS.join(", ")};`;
/** `css` wrapped in the named cascade layer, prefixed with LAYER_ORDER. */
export const inLayer = (layer, css) => `${LAYER_ORDER}\n@layer ${layer} {\n${css}\n}\n`;
