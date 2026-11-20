// list: everything shown is a pure function of the props (no DOM, no step number).
//
// deriveList(props) -> { items: [{ id, index, text, sub, marker, visible, done, active }] }
//   id       the item's id, or String(index) when it has none
//   marker   "1." / "a." / "•" by `marker`; "" for "check" (the component draws a box instead). Digits and
//            letters are always latin, whatever the deck language
//   visible  index < (shown ?? items.length): hidden items keep their space, they are not removed
//   done     for "check" only: `done` is a count from the top, or a list of ids; false for other markers
//   active   `active` is an item index or an id
// An unknown id in `done` or `active` throws an error naming it, so the slide shows it instead of a blank list.

export const MARKERS = ["number", "letter", "bullet", "check"];

/** 0 -> "a", 25 -> "z", 26 -> "aa", 27 -> "ab" (spreadsheet-style, latin only). */
function letters(index) {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function markerOf(marker, index) {
  switch (marker) {
    case "number":
      return `${index + 1}.`;
    case "letter":
      return `${letters(index)}.`;
    case "bullet":
      return "•";
    default:
      return "";
  }
}

export function deriveList(props) {
  const { items, marker } = props ?? {};
  if (!Array.isArray(items) || items.length === 0) throw new Error("list needs a non-empty `items` array");
  if (!MARKERS.includes(marker)) throw new Error(`list \`marker\` must be one of ${MARKERS.join(", ")} (got '${marker}')`);

  const ids = items.map((item, i) => {
    if (typeof item?.text !== "string") throw new Error(`list item ${i} needs a string \`text\``);
    return item.id === undefined ? String(i) : String(item.id);
  });
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`list has a duplicate item id '${id}'`);
    seen.add(id);
  }

  const shown = props.shown ?? items.length;

  if (Array.isArray(props.done)) {
    for (const id of props.done) if (!seen.has(String(id))) throw new Error(`list \`done\` names an unknown item id '${id}' (ids: ${ids.join(", ")})`);
  }
  let done = () => false;
  if (marker === "check" && props.done !== undefined) {
    if (Array.isArray(props.done)) {
      const set = new Set(props.done.map(String));
      done = (i) => set.has(ids[i]);
    } else {
      const count = Number(props.done);
      done = (i) => i < count;
    }
  }

  let active = () => false;
  if (props.active !== undefined && props.active !== null) {
    if (typeof props.active === "number") active = (i) => i === props.active;
    else {
      const id = String(props.active);
      if (!seen.has(id)) throw new Error(`list \`active\` names an unknown item id '${id}' (ids: ${ids.join(", ")})`);
      active = (i) => ids[i] === id;
    }
  }

  return {
    items: items.map((item, i) => ({
      id: ids[i],
      index: i,
      text: item.text,
      sub: item.sub,
      marker: markerOf(marker, i),
      visible: i < shown,
      done: done(i),
      active: active(i),
    })),
  };
}
