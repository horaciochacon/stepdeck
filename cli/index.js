#!/usr/bin/env node
// stepdeck command line (spec §10). Dev tooling only; nothing here is needed to present.
//
//   stepdeck <command> [deckDir] [--slide id] [--step ref] [--size n] [--theme name] [--json] [--played] [--version]
//   stepdeck new <dir> [--template talk] | new-component <name> [deckDir] | catalog [name] [deckDir]
//   stepdeck boundaries <ISO3> <ADM0-ADM5> [--deck dir] [--out path] [--full] [--precision n]
//   stepdeck serve [deckDir] [--port n]
//
// deckDir defaults to the current directory. Exit codes: 0 no problems, 1 problems found,
// 2 usage error or a run that could not complete (deck not found, browser missing, …).
// Every command accepts --json (machine output on stdout; console.log of a deck module goes to stderr then). An
// option a command does not read is refused (OPTIONS), and --name=value is --name value.
// Only `validate` needs the repo's dependencies (Ajv). It is imported when that command runs, so
// `--help`, `new` and the rest work before `npm install`; without Ajv, validate says to run it (exit 2).
import { join, relative, resolve } from "node:path";
import { catalog, buildCatalog, catalogTarget, formatEntry, isCatalogTarget } from "./catalog.js";
import { newDeck, newComponent, cli, shellPath, shownPath } from "./new.js";
import { boundaries, displayPath } from "./boundaries.js";
import { serve } from "./serve.js";
import { assertDeck, deckTarget } from "./browser.js";
import { REPO, readJSON } from "./engine.js";
import { suggest } from "#engine/core/registry.js";
import { dump, formatDump } from "./dump.js";
import { runCheck } from "./check.js";
import { shoot, SHOT_SIZES } from "./shoot.js";
import { formatProblem, formatProblems } from "./problems.js";

/** cli/validate.js, which needs Ajv; a missing Ajv becomes "run `npm install` in <repo> first". */
async function loadValidate() {
  try {
    return await import("./validate.js");
  } catch (e) {
    if (e?.code === "ERR_MODULE_NOT_FOUND" && /'ajv'|\bajv\//.test(e.message)) {
      throw new Error(`validate needs the repo's dependencies (Ajv): run \`npm install\` in ${REPO} first`, { cause: e });
    }
    throw e;
  }
}

const USAGE = `usage: stepdeck <command> [deckDir] [options]

commands:
  new <dir>             a new deck from a template (--template, default talk), with the engine copied
                        into <dir>/stepdeck/
  new-component <name> [deckDir]
                        components/<name>/ in the deck from the component template; name namespaced
                        (my.thing); added to deck.js components
  catalog [name] [folder]
                        write catalog/ (index.json + <name>.json) for the deck or the engine; with a
                        name, print that entry
  boundaries <ISO3> <ADM0-ADM5>
                        open admin boundaries for a country from geoBoundaries, into the deck's data/
                        (--deck, --out, --full, --precision); needs a network connection
  serve    static server for the deck (no-store caching); prints the URL to present (--port, default 8000)
  validate in Node, no browser: schemas, props at every step, steps, data, paths, lint
  dump     per step: visible elements, boxes, text, resolved props, what changed
  check    in headless Chrome, per step: text outside canvas or region, overlapping text, text under
           the audience minimum, contrast, console/network/render errors, step 0 showing everything
  shoot    a PNG per step in <deck>/shots/<size>/ (default size 960)
  help     this text (also -h, --help)

options (a value is given as --name value or --name=value):
  --slide <id>   one slide: validate, dump, check, shoot
  --step <ref>   one step (id or number; needs --slide): dump, check, shoot
  --size <n>     viewport width in px (height n·9/16); boxes stay in canvas pixels.
                 shoot: 1920|1280|960 (default 960)
  --theme <name> dump, check, shoot: run under another theme (the page's ?theme=), not the deck's own
  --played       check: also arrive at every step forward (animated) and backward, compare with the jump
  --template <t> new: starter template (default talk)
  --deck <dir>   boundaries: the deck folder (default .); the file goes to <dir>/data/<iso3>-adm<n>.geojson
  --out <path>   boundaries: write this file instead; its .source.json goes next to it
  --full         boundaries: the full-resolution geometry, not the simplified one
  --precision <n> boundaries: decimals kept in coordinates, 0 to 10 (default 4)
  --port <n>     serve: port (default 8000; 0 picks a free one)
  --json         machine output on stdout (a run that fails: { "error": "…" })
  --version      print the version
  A command refuses an option it does not use (exit 2).

exit codes:
  0  ran, nothing to fail on      1  ran, problems found (validate: errors; check: any; dump: step errors)
  2  usage error, or a run that could not complete (no deck.js, unknown slide or step, no browser, …)

environment (dump, check, shoot):
  STEPDECK_PLAYWRIGHT  a playwright package folder (default: \`playwright\` as Node resolves it from the
                       stepdeck folder; \`npm run playwright\` there installs it)
  STEPDECK_CHANNEL     the browser channel to launch (default chrome, the system Chrome)
  STEPDECK_WORKERS     pages driven at once (default min(4, half the cores); 1 = one page, in turn)

every command, output and rule: ${join(REPO, "docs", "reference", "cli.md")} and rules.md beside it
`;

class UsageError extends Error {}

const COMMANDS = ["help", "new", "new-component", "catalog", "boundaries", "serve", "validate", "dump", "check", "shoot"];

/** The options each command reads, by their name in parseArgs' result (--json and --help are read by all). */
const OPTIONS = {
  new: ["template"],
  "new-component": [],
  catalog: [],
  boundaries: ["deck", "out", "full", "precision"],
  serve: ["port"],
  validate: ["slide"],
  dump: ["slide", "step", "size", "theme"],
  check: ["slide", "step", "size", "theme", "played"],
  shoot: ["slide", "step", "size", "theme"],
};

/** "dump, check and shoot do" / "serve does": the commands that take `option`. */
function takers(option) {
  const names = Object.keys(OPTIONS).filter((c) => OPTIONS[c].includes(option));
  return names.length === 1 ? `${names[0]} does` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} do`;
}

export function parseArgs(argv) {
  const out = { command: undefined, deckDir: undefined, positionals: [], slide: undefined, step: undefined, size: undefined, template: undefined, theme: undefined, port: undefined, json: false, played: false, deck: undefined, out: undefined, full: false, precision: undefined, version: false, given: [] };
  for (let i = 0; i < argv.length; i++) {
    // --name=value is --name value.
    const eq = argv[i].startsWith("--") ? argv[i].indexOf("=") : -1;
    const a = eq === -1 ? argv[i] : argv[i].slice(0, eq);
    const inline = eq === -1 ? undefined : argv[i].slice(eq + 1);
    const value = () => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value`);
      return v;
    };
    const flag = () => {
      if (inline !== undefined) throw new UsageError(`${a} takes no value`);
      return true;
    };
    if (a.startsWith("--") && a.length > 2) out.given.push(a.slice(2));
    if (a === "--json") out.json = flag();
    else if (a === "--played") out.played = flag();
    else if (a === "--full") out.full = flag();
    else if (a === "--version") out.version = flag();
    else if (a === "--deck") out.deck = value();
    else if (a === "--out") out.out = value();
    else if (a === "--precision") out.precision = Number(value());
    else if (a === "--slide") out.slide = value();
    else if (a === "--step") out.step = value();
    else if (a === "--template") out.template = value();
    else if (a === "--theme") out.theme = value();
    else if (a === "--port") {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 0 || n > 65535) throw new UsageError("--port must be a port number, e.g. 8000");
      out.port = n;
    }
    else if (a === "--size") {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 160) throw new UsageError("--size must be a width in pixels, e.g. 960");
      out.size = n;
    } else if (a === "-h" || a === "--help") out.command = "help";
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${argv[i]}`);
    else if (out.command === undefined) out.command = a;
    else if (out.positionals.length < 2) out.positionals.push(a);
    else throw new UsageError(`unexpected argument ${a}`);
  }
  // Most commands take one positional, the deck folder; new-component and catalog take a name too, and
  // boundaries takes a country and a level (its deck folder is --deck).
  const two = ["new-component", "catalog", "boundaries"].includes(out.command);
  if (!two && out.positionals.length > 1) throw new UsageError(`unexpected argument ${out.positionals[1]}`);
  out.deckDir = out.positionals[0];
  return out;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`stepdeck: ${e.message}\n\n${USAGE}`);
    return 2;
  }
  // Under --json stdout holds the JSON alone: what a deck module logs while it is imported goes to stderr.
  if (args.json) console.log = console.info = console.debug = console.error;
  try {
    return await run(args);
  } catch (e) {
    // A run that could not complete: exit 2, and under --json a machine-readable error on stdout.
    if (args.json) process.stdout.write(`${JSON.stringify({ error: e.message }, null, 2)}\n`);
    else process.stderr.write(`stepdeck: ${e.message}\n`);
    return 2;
  }
}

async function run(args) {
  const deckDir = args.deckDir ?? process.cwd();
  if (args.version && args.command !== "help") {
    process.stdout.write(`${readJSON(join(REPO, "package.json")).version}\n`);
    return 0;
  }
  // An option the command does not read is refused, not ignored: `validate --theme x` would look as if the theme
  // had been checked.
  const reads = OPTIONS[args.command];
  const stray = reads ? args.given.find((name) => !["json", "help", "version", ...reads].includes(name)) : undefined;
  if (stray !== undefined) {
    throw new UsageError(
      args.command === "validate" && stray === "step"
        ? "validate does not take --step: it folds and checks every step of a slide; use --slide <id>"
        : `${args.command} does not take --${stray} (${takers(stray)})`,
    );
  }
  // SIGTERM while a browser runs: leave at once (Playwright closes the browser on exit), with no error printed.
  if (["dump", "check", "shoot"].includes(args.command)) process.once("SIGTERM", () => process.exit(143));
  const emit = (data) => process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  const n = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  switch (args.command) {
    case "help":
      process.stdout.write(USAGE);
      return 0;
    case "new": {
      if (args.deckDir === undefined) throw new UsageError("new needs a folder: stepdeck new <dir>");
      const made = await newDeck(args.deckDir, { template: args.template ?? "talk" });
      if (args.json) emit(made);
      else process.stdout.write(`created ${shownPath(made.dir)} (template ${made.template}; engine copied to stepdeck/)\n\nnext:\n${made.next.map((l) => `  ${l}`).join("\n")}\n`);
      return 0;
    }
    case "new-component": {
      const [name, dir] = args.positionals;
      if (name === undefined) throw new UsageError("new-component needs a name: stepdeck new-component my.thing [deckDir]");
      const made = await newComponent(dir ?? process.cwd(), name);
      if (args.json) emit(made);
      else {
        const rel = shownPath(made.dir);
        process.stdout.write(`created ${rel}/ (${made.files.map((f) => f.slice(made.dir.length + 1)).join(", ")})\n`);
        process.stdout.write(made.deckUpdated ? `added "${made.name}" to components in deck.js\n` : `deck.js not edited: ${made.line}\n`);
        const deck = resolve(dir ?? process.cwd());
        const [from, to] = [join(made.dir, "example.js"), join(deck, "slides", `${made.id}.js`)].map((p) => shellPath(shownPath(p)));
        process.stdout.write(`try it: the example slide's id is "${made.id}", so copy it to slides/${made.id}.js and add "${made.id}" to slides in deck.js, then\n  cp ${from} ${to}\n  ${cli("validate", deck)}\n  ${cli("check", deck)} --played\n`);
      }
      return 0;
    }
    case "catalog": {
      // Positionals: an optional entry name and an optional folder (isCatalogTarget), in any order.
      const dirArg = args.positionals.find(isCatalogTarget);
      const names = args.positionals.filter((p) => p !== dirArg);
      if (names.length > 1) throw new UsageError(`catalog takes one name (got ${names.join(", ")})`);
      const { roots, outDir } = catalogTarget(dirArg ?? process.cwd());
      if (names.length === 1) {
        const { details } = await buildCatalog(roots);
        const d = details.get(names[0]);
        if (!d) {
          const close = suggest(names[0], [...details.keys()]);
          throw new Error(`no catalog entry '${names[0]}'${close ? `; did you mean '${close}'?` : ""} (entries: ${[...details.keys()].join(", ")})`);
        }
        if (args.json) emit(d);
        else process.stdout.write(formatEntry(d));
        return 0;
      }
      const built = await catalog(roots, { outDir });
      if (args.json) emit(built.entries);
      else {
        for (const p of built.problems) process.stdout.write(`warning: ${formatProblem(p)}\n`);
        const count = (kind) => built.entries.filter((e) => e.kind === kind).length;
        process.stdout.write(`catalog: ${n(count("component"), "component")}, ${n(count("layout"), "layout")}, ${n(count("theme"), "theme")} -> ${shownPath(join(built.outDir, "index.json"))}\n`);
      }
      return 0;
    }
    case "boundaries": {
      const [iso3, level] = args.positionals;
      if (iso3 === undefined || level === undefined) throw new UsageError("boundaries needs a country and a level: stepdeck boundaries URY ADM1");
      const made = await boundaries({ iso3, level, deck: args.deck, out: args.out, full: args.full, precision: args.precision });
      if (args.json) emit(made);
      else {
        const count = (k, word) => `${k.toLocaleString("en-US")} ${word}${k === 1 ? "" : "s"}`;
        process.stdout.write(`wrote ${displayPath(made.file)} (${count(made.regions, "region")}, ${count(made.points, "point")}) and ${displayPath(made.sourceFile)}\n`);
        process.stdout.write(`licence: ${made.license}\nsource line: ${made.sourceLine}\n`);
        for (const path of made.replaced) process.stdout.write(`replaced ${displayPath(path)}\n`);
        for (const w of made.warnings) process.stdout.write(`warning: ${w}\n`);
      }
      return 0;
    }
    case "serve": {
      assertDeck(deckDir);
      const target = deckTarget(deckDir);
      const port = args.port ?? 8000;
      const server = await serve({ root: target.root, port }).catch((e) => {
        if (e.code === "EADDRINUSE") throw new Error(`port ${port} is in use; pass --port 0 for a free port, or another --port`, { cause: e });
        throw e;
      });
      const page = relative(target.root, resolve(deckDir)).split("\\").join("/");
      const url = `${server.url}${page ? `${page}/` : ""}`;
      if (args.json) emit({ url, root: target.root, port: server.port });
      else process.stdout.write(`serving ${target.root}\npresent: ${url}\n(Ctrl-C to stop)\n`);
      await new Promise((ok) => {
        process.once("SIGINT", ok);
        process.once("SIGTERM", ok);
      });
      await server.close();
      return 0;
    }
    case "validate": {
      const { runValidate } = await loadValidate();
      const { problems, slides } = await runValidate(deckDir, { slide: args.slide });
      const errors = problems.filter((p) => p.severity !== "warning");
      const warnings = problems.filter((p) => p.severity === "warning");
      if (args.json) emit(problems);
      else {
        const lines = [...errors.map(formatProblem), ...warnings.map((p) => `warning: ${formatProblem(p)}`)];
        if (lines.length) process.stdout.write(`${lines.join("\n")}\n`);
        process.stdout.write(`validate: ${n(slides.length, "slide")}, ${n(errors.length, "error")}, ${n(warnings.length, "warning")}\n`);
      }
      return errors.length ? 1 : 0;
    }
    case "dump": {
      const out = await dump(deckDir, { slide: args.slide, step: args.step, size: args.size, theme: args.theme });
      if (args.json) emit(out);
      else process.stdout.write(formatDump(out));
      return out.some((d) => d.errors.length > 0) ? 1 : 0;
    }
    case "check": {
      const report = await runCheck(deckDir, { slide: args.slide, step: args.step, played: args.played, size: args.size, theme: args.theme });
      const { problems } = report;
      if (args.json) emit(problems);
      else {
        if (problems.length) process.stdout.write(`${formatProblems(problems)}\n`);
        let played = "";
        if (report.played) {
          const counts = Object.values(report.played);
          played = `, ${n(counts.reduce((s, c) => s + c.fromPrev + c.fromNext, 0), "played arrival")} compared`;
        }
        process.stdout.write(`check: ${n(report.slides, "slide")}, ${n(report.steps, "step")}${played}, ${n(problems.length, "problem")}\n`);
      }
      return problems.length ? 1 : 0;
    }
    case "shoot": {
      const size = args.size ?? 960;
      if (!SHOT_SIZES.includes(size)) {
        process.stderr.write(`stepdeck: shoot --size must be ${SHOT_SIZES.join("|")}\n`);
        return 2;
      }
      const paths = await shoot(deckDir, { slide: args.slide, step: args.step, size, theme: args.theme });
      if (args.json) emit(paths);
      else process.stdout.write(`${paths.map((p) => shownPath(p)).join("\n")}\nshoot: ${n(paths.length, "PNG")} at ${size}×${(size * 9) / 16}\n`);
      return 0;
    }
    default: {
      const close = args.command ? suggest(args.command, COMMANDS) : null;
      process.stderr.write(`${args.command ? `stepdeck: unknown command '${args.command}'${close ? `; did you mean '${close}'?` : ""}\n\n` : ""}${USAGE}`);
      return 2;
    }
  }
}

// Exit once stdout has drained, without waiting for what a run left behind (a browser that is slow to close).
main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
  process.stdout.write("", () => process.exit(code));
});
