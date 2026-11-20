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
// first types the command (when `typing` and the session just started) and staggers in the new
// lines, through ctx.animate helpers bound to info.signal, so an aborted step snaps to its end.
// Sizes come from theme tokens via CSS (core/stepdeck.css), colors too; no color is set here.
import { checkScript, clampShown, deriveTasks, deriveFiles, windowOf, lineText } from "./derive.js";
import { clearInlineStyle, typeCount, typingMs } from "../../core/animate.js";
import { el as element, motionMs } from "../../core/kit.js";

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
        script = await loadScript(props, ctx);
        const shown = clampShown(props.shown, script.events.length);
        const before = lastShown;
        renderStatic(shown);
        if (info.animate && shown > before && !info.signal?.aborted) {
          const signal = info.signal;
          const duration = motionMs(info, ctx);
          const fresh = [...log.children].filter((l) => Number(l.dataset.i) >= before);
          for (const l of fresh) l.style.opacity = "0";
          if (props.typing && before === 0 && script.command) {
            const full = script.command;
            command.textContent = "";
            await typeCount(ctx.animate, full.length, (n) => (command.textContent = full.slice(0, n)), { duration: typingMs(full.length), signal });
          }
          await ctx.animate.stagger(fresh, (l, _i, o) => ctx.animate.fadeIn(l, o), { duration, signal });
          clearInlineStyle(...fresh); // what fadeIn left behind
        }
        lastShown = shown;
      },
      destroy() {
        root.remove();
      },
    };
  },
};
