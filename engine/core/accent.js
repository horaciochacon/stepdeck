// Accent phrase in titles: `*phrase*` marks the phrase the theme colours
// (<em class="sd-accent">). Pure string functions, no DOM: used by the text component, the shells, dump and validate.
//
//   parseAccent(s)   -> Array<{ text, accent }>   consecutive parts never share the same `accent`; no empty parts
//   stripAccent(s)   -> string                    the plain text: what the title reads without its marks
//   escapeAccent(s)  -> string                    s written so that parseAccent reads it back as plain text
//   accentMarks(s)   -> { stars, empty }          unescaped `*` count, and whether s has an empty phrase `**` (validate)
//
// Syntax: `*` opens and closes a phrase. `\*` is a literal asterisk and `\\` a literal backslash; any other
// backslash is kept as written. An unmatched `*` (an odd one out at the end) stays a literal `*` in plain text, and so
// does an empty phrase `**`.

/** Splits a title into plain and accent parts. */
export function parseAccent(s) {
  const str = s == null ? "" : String(s);
  const done = []; // parts closed so far
  let buf = "";
  let open = null; // the plain text before the `*` that opened the current phrase (null: not in a phrase)
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "\\" && (str[i + 1] === "*" || str[i + 1] === "\\")) {
      buf += str[++i];
    } else if (ch === "*") {
      if (open === null) {
        open = buf;
        buf = "";
      } else if (buf === "") {
        // An empty phrase `**` (markdown bold habit, or two literal asterisks) is not an accent: it stays as written.
        buf = `${open}**`;
        open = null;
      } else {
        push(done, open, false);
        push(done, buf, true);
        open = null;
        buf = "";
      }
    } else {
      buf += ch;
    }
  }
  // An unmatched `*`: the text before it, the `*` itself and the rest are plain.
  if (open !== null) buf = `${open}*${buf}`;
  push(done, buf, false);
  return done;
}

function push(parts, text, accent) {
  if (text === "") return;
  const last = parts[parts.length - 1];
  if (last && last.accent === accent) last.text += text;
  else parts.push({ text, accent });
}

/** The title as plain text: the phrase marks removed, escapes resolved. */
export function stripAccent(s) {
  return parseAccent(s).map((p) => p.text).join("");
}

/** Escapes `\` and `*` so the result parses back as one plain part (used for values from data bindings). */
export function escapeAccent(s) {
  return String(s).replace(/[\\*]/g, "\\$&");
}

/** Counts the unescaped `*` in s, and tells whether s has an empty phrase `**` (a `*` closing right after its opener). */
export function accentMarks(s) {
  const str = String(s);
  let stars = 0;
  let empty = false;
  let open = -1; // index just after the `*` that opened the current phrase, or -1
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\" && (str[i + 1] === "*" || str[i + 1] === "\\")) {
      i++;
    } else if (str[i] === "*") {
      stars++;
      if (open === -1) {
        open = i + 1;
      } else {
        if (open === i) empty = true; // parseAccent keeps it as a literal `**`
        open = -1;
      }
    }
  }
  return { stars, empty };
}
