// timeline: the stops and which of them the fill has reached, as a pure function of the props (no DOM).
//
// stopStates(stops, progress) -> [{ id, label, sub, at, reached }]
//   id       the stop's id; defaults to its index as a string
//   at       its place on the track, 0..1; defaults to i / (n - 1), so stops are evenly spaced
//   reached  progress >= at (with a tiny tolerance for float noise)
// Anything that would draw a blank or misleading track throws an error naming it: fewer than two stops, a
// progress outside 0..1, duplicate ids, an `at` outside 0..1 or not increasing.

const EPS = 1e-9;

/** Whether the fill has reached a stop at `at`: progress >= at, with a tiny tolerance for float noise. */
export const reachedAt = (progress, at) => progress >= at - EPS;

export function stopStates(stops, progress) {
  if (!Array.isArray(stops) || stops.length < 2) throw new Error(`timeline needs at least 2 stops (got ${Array.isArray(stops) ? stops.length : "none"})`);
  if (typeof progress !== "number" || !(progress >= 0 && progress <= 1)) throw new Error(`timeline \`progress\` must be a number from 0 to 1 (got '${progress}')`);
  const n = stops.length;
  const seen = new Set();
  let previous = -Infinity;
  return stops.map((stop, i) => {
    if (typeof stop?.label !== "string") throw new Error(`timeline stop ${i} needs a string \`label\``);
    const id = stop.id === undefined ? String(i) : stop.id;
    if (typeof id !== "string") throw new Error(`timeline stop ${i}: \`id\` must be a string`);
    if (seen.has(id)) throw new Error(`timeline has a duplicate stop id '${id}'`);
    seen.add(id);
    const at = stop.at === undefined ? i / (n - 1) : stop.at;
    if (typeof at !== "number" || !(at >= 0 && at <= 1)) throw new Error(`timeline stop '${id}': \`at\` must be a number between 0 and 1 (got '${at}')`);
    if (!(at > previous)) throw new Error(`timeline stop '${id}': \`at\` must increase from one stop to the next`);
    previous = at;
    return { id, label: stop.label, sub: stop.sub, at, reached: reachedAt(progress, at) };
  });
}
