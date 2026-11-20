// Element entrance and exit: which system plays, and when. Pure functions; the slide controller uses them.
//
// An element's `enter`/`exit` is a motion name or `{ motion, delay?, duration? }` (ms).
//
// Exactly one system plays an entrance. A component that declares `"x-enter": "own"` in its schema.json
// builds itself (it gets `info.entrance`); otherwise the element's box moves:
//
//   element                               box               own
//   not owned, enter unset                theme's enter     null
//   not owned, enter is a name            that name         null
//   owned, enter unset or "draw"          null              "draw"
//   owned, enter fade/rise/wipe/pop       that name         "none"   (the content snaps)
//   enter "none"                          null              "none" when owned, else null

export const DEFAULT_ENTER = "fade";
export const DEFAULT_EXIT = "fade";

const finite = (n) => typeof n === "number" && Number.isFinite(n);

/** `{ name, delay, duration }` from a motion name or the object form; delay defaults to 0. */
export function motionParts(value) {
  if (value !== null && typeof value === "object") {
    return { name: value.motion, delay: finite(value.delay) ? value.delay : 0, duration: finite(value.duration) ? value.duration : undefined };
  }
  return { name: typeof value === "string" ? value : undefined, delay: 0, duration: undefined };
}

/**
 * resolveEntrance(enter, { owns, themeEnter }) -> { box, own, delay, duration }
 *   box   the motion name the element's box plays, or null
 *   own   "draw" | "none" for a component that owns its entrance, else null
 */
export function resolveEntrance(enter, { owns = false, themeEnter = DEFAULT_ENTER } = {}) {
  const { name, delay, duration } = motionParts(enter);
  const result = (box, own) => ({ box, own, delay, duration });
  if (name === "none") return result(null, owns ? "none" : null);
  if (owns) return name === undefined || name === "draw" ? result(null, "draw") : result(name, "none");
  const box = name ?? themeEnter ?? DEFAULT_ENTER;
  return result(box === "none" ? null : box, null);
}

/** The out motion an exiting element plays, or null when it snaps (a collapsing element, or "none"). */
export function resolveExit(exit, collapse) {
  if (collapse === true) return null;
  const { name } = motionParts(exit);
  if (name === "none") return null;
  return name ?? DEFAULT_EXIT;
}

/** Hold per entering id: the i-th id waits i × stagger plus its own delay (ms). */
export function slotDelays(ids, stagger, own = {}) {
  return Object.fromEntries(ids.map((id, i) => [id, i * stagger + (own?.[id] ?? 0)]));
}
