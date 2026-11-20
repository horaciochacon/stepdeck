// Built-in `terminal`: a terminal window with a typed command, an activity log, a task list and
// a file list, driven by props only (spec §6.2: "a component never reads the slide's step number").
//
// Everything on screen is a pure function of (script, shown):
//   - the log shows the newest min(shown, N) events, N being how many lines fit the log box
//     (measured in canvas pixels at every update); older events leave the DOM;
//   - task statuses and the file list are derived from events 0..shown-1;
//   - the command line appears once shown > 0.
// Every update ends by writing that state directly (renderStatic), so the DOM after settled() is the
// same whether a state was jumped to or played. With info.animate and shown increasing, the component
// first types the command (when `typing` and the session just started, at a constant speed per character)
// and then fades the new lines in (ctx.motion.in "fade", staggered by --sd-stagger, with the theme's
// timing), through helpers bound to info.signal, so an aborted step snaps to its end.
//
// The terminal owns its entrance (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" it
// plays the same build from an empty terminal (shown 0) to this step's state, while its box stays still: the
// command is typed (when `typing`), then the lines fade in. The command and the lines' start state is written
// before the first await, in the same task as the engine shows the element, so nothing paints built first. An
// element that appears with a new `script` is emptied before that script loads, so the old one never shows.
// Any other update of a freshly shown element (an entrance of "none", or a box that moves instead) snaps to
// the end state.
// Sizes come from theme tokens via CSS (core/stepdeck.css), colors too; no color is set here.
import { checkScript, clampShown, deriveTasks, deriveFiles, windowOf, lineText } from "./derive.js";
import { clearInlineStyle, typeCount, typingMs } from "../../core/animate.js";
import { el as element, canAnimate, motion } from "../../core/kit.js";

const MARKERS = { result: "out" }; // a line's marker is its event type, except these
const TASK_MARKERS = { pending: "[ ]", active: "[~]", done: "[x]" };

async function loadScript(props, ctx) {
  if (typeof props.script !== "string" || props.script === "") throw new Error("terminal needs a `script` path");
  const script = await ctx.data(props.script);
  return checkScript(script, props.script); // shared cached value: read-only (R14)
}

export default {
  async mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const make = (tag, cls, parent, text) => element(doc, tag, cls, parent, text);
    const label = (key, fallback) => ctx.t?.(key) ?? fallback;

    const root = make("div", "sd-terminal", el);
    const bar = make("div", "sd-terminal-bar", root);
    const title = make("span", "sd-terminal-title", bar);
    const body = make("div", "sd-terminal-body", root);
    const main = make("div", "sd-terminal-main", body);
    const commandLine = make("div", "sd-terminal-commandline", main);
    make("span", "sd-terminal-prompt", commandLine, "$");
    const command = make("span", "sd-terminal-command", commandLine);
    const log = make("div", "sd-terminal-log", main);
    const side = make("aside", "sd-terminal-side", body);
    make("h3", "sd-terminal-heading", side, label("tasks", "Tasks"));
    const taskList = make("ul", "sd-terminal-tasks", side);
    make("h3", "sd-terminal-heading", side, label("files", "Files"));
    const fileList = make("ul", "sd-terminal-files", side);

    let lastShown = 0; // `shown` of the last fully applied state
    let scriptPath = props.script;
    let script = await loadScript(props, ctx); // fail early: the controller shows the error

    /** How many lines fit the log box, in canvas pixels (the shell may scale the canvas); cached per box size. */
    let fit = null; // { key, n } for the last measured log box
    function capacity() {
      const rootRect = root.getBoundingClientRect();
      const scale = root.offsetWidth > 0 && rootRect.width > 0 ? rootRect.width / root.offsetWidth : 1;
      const boxH = log.getBoundingClientRect().height / scale;
      const key = `${scale}|${boxH}`;
      if (fit?.key === key) return fit.n;
      const probe = buildLine({ type: "note" }, "M", -1);
      log.appendChild(probe);
      const lineH = probe.getBoundingClientRect().height / scale;
      probe.remove();
      fit = { key, n: lineH > 0 ? Math.max(0, Math.floor(boxH / lineH + 1e-3)) : 0 };
      return fit.n;
    }

    function buildLine(event, text, i) {
      const line = make("div", "sd-terminal-line");
      line.dataset.type = event.type;
      line.dataset.i = String(i);
      if (event.lang) line.dataset.lang = String(event.lang);
      make("span", "sd-terminal-marker", line, MARKERS[event.type] ?? event.type);
      make("span", "sd-terminal-text", line, text);
      return line;
    }

    /** An empty terminal: nothing of any script (the start of an element that appears with a new script). */
    function blank() {
      title.textContent = "";
      command.textContent = "";
      log.replaceChildren();
      taskList.replaceChildren();
      fileList.replaceChildren();
    }

    /** Writes the state for `shown` exactly: the end state of every update, animated or not. */
    function renderStatic(shown) {
      title.textContent = script.title ?? "";
      command.textContent = shown > 0 ? (script.command ?? "") : "";
      const n = capacity();
      root.dataset.shown = String(shown);
      root.dataset.capacity = String(n);
      log.replaceChildren(...windowOf(script, shown, n).map(({ i, event }) => buildLine(event, lineText(script, event), i)));
      taskList.replaceChildren(
        ...deriveTasks(script, shown).map((t, k) => {
          const li = make("li", "sd-terminal-task");
          li.dataset.task = String(k);
          li.dataset.status = t.status;
          make("span", "sd-terminal-task-mark", li, TASK_MARKERS[t.status]);
          make("span", "sd-terminal-task-text", li, t.text);
          return li;
        }),
      );
      fileList.replaceChildren(
        ...deriveFiles(script, shown).map((f) => {
          const li = make("li", "sd-terminal-file");
          li.dataset.status = f.status;
          make("span", "sd-terminal-file-path", li, f.path);
          make("span", "sd-terminal-file-status", li, f.status);
          return li;
        }),
      );
    }

    lastShown = clampShown(props.shown, script.events.length);
    renderStatic(lastShown);

    return {
      async update(props, info = {}) {
        // The script is read again only when its path changes, so a usual update reaches the DOM before any await.
        if (props.script !== scriptPath) {
          // An element that appears with a new script (drawn, moved by its box or not at all) shows nothing of the
          // old one while the new one loads: it is emptied now, in the same task as the engine shows it, and
          // renderStatic fills it once the script is there. No inline style, so a failed load leaves none.
          if (info.entered) blank();
          script = await loadScript(props, ctx);
          scriptPath = props.script;
        }
        // Read after the script's load: a step aborted while it loaded snaps.
        const draw = info.entrance?.motion === "draw" && !info.signal?.aborted;
        // An element that just appeared without a drawn entrance (none, or its box moves) snaps.
        const animate = draw || (canAnimate(info) && !info.entered);
        const shown = clampShown(props.shown, script.events.length);
        // A drawn entrance builds from an empty terminal.
        const before = draw ? 0 : lastShown;
        renderStatic(shown);
        lastShown = shown;
        if (!animate || shown <= before) return;

        const opts = motion(info, ctx);
        if (draw && info.entrance.duration !== undefined) opts.duration = info.entrance.duration;
        const fresh = [...log.children].filter((l) => Number(l.dataset.i) >= before);
        // The start state, written now: nothing of a new line paints before its slot.
        for (const l of fresh) l.style.opacity = "0";
        const full = script.command ?? "";
        const typed = props.typing === true && before === 0 && full !== "";
        if (typed) command.textContent = "";
        try {
          if (typed) {
            await typeCount(ctx.animate, full.length, (n) => (command.textContent = full.slice(0, n)), { duration: opts.duration > 0 ? typingMs(full.length) : 0, signal: opts.signal });
          }
          await ctx.animate.stagger(fresh, async (l, _i, o) => {
            // Hand the start state to the motion in one synchronous block: it saves the (now empty) inline
            // style, writes opacity 0 again, and puts the saved state back at the end.
            l.style.opacity = "";
            await ctx.motion.in(l, "fade", { ...opts, signal: o.signal });
          }, opts);
        } finally {
          command.textContent = shown > 0 ? full : "";
          clearInlineStyle(...fresh);
        }
      },
      destroy() {
        root.remove();
      },
    };
  },
};
