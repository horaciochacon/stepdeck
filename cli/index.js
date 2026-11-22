#!/usr/bin/env node
// stepdeck command line (spec §10). Dev tooling only; nothing here is needed to present.
//
//   stepdeck <command> [deckDir] [--slide id] [--step ref] [--size n] [--theme name] [--json] [--played]
//   stepdeck new <dir> [--template talk] | new-component <name> [deckDir] | catalog [name] [deckDir]
//   stepdeck boundaries <ISO3> <ADM0-ADM5> [--deck dir] [--out path] [--full] [--precision n]
//   stepdeck serve [deckDir] [--port n]
//
// deckDir defaults to the current directory. Exit codes: 0 no problems, 1 problems found,
// 2 usage error or a run that could not complete (deck not found, browser missing, …).
// Every command accepts --json (machine output on stdout).
// Only `validate` needs the repo's dependencies (Ajv). It is imported when that command runs, so
// `--help`, `new` and the rest work before `npm install`; without Ajv, validate says to run it (exit 2).
import { relative, resolve } from "node:path";
import { catalog, buildCatalog, catalogTarget, formatEntry, isCatalogTarget } from "./catalog.js";
import { newDeck, newComponent, cli } from "./new.js";
import { boundaries, displayPath } from "./boundaries.js";
import { serve } from "./serve.js";
import { deckTarget } from "./browser.js";
import { REPO } from "./engine.js";
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
  new-component <name>  components/<name>/ in the deck from the component template; name namespaced
                        (my.thing); added to deck.js components
  catalog [name]        write catalog/ (index.json + <name>.json) for the deck or the engine; with a
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

options:
  --slide <id>   one slide
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
  --json         machine output
`;

class UsageError extends Error {}

export function parseArgs(argv) {
  const out = { command: undefined, deckDir: undefined, positionals: [], slide: undefined, step: undefined, size: undefined, template: undefined, theme: undefined, port: undefined, json: false, played: false, deck: undefined, out: undefined, full: false, precision: undefined };
  const value = (i, name) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new UsageError(`${name} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--played") out.played = true;
    else if (a === "--full") out.full = true;
    else if (a === "--deck") out.deck = value(i++, a);
    else if (a === "--out") out.out = value(i++, a);
    else if (a === "--precision") out.precision = Number(value(i++, a));
    else if (a === "--slide") out.slide = value(i++, a);
    else if (a === "--step") out.step = value(i++, a);
    else if (a === "--template") out.template = value(i++, a);
    else if (a === "--theme") out.theme = value(i++, a);
    else if (a === "--port") {
      const n = Number(value(i++, a));
      if (!Number.isInteger(n) || n < 0 || n > 65535) throw new UsageError("--port must be a port number, e.g. 8000");
      out.port = n;
    }
    else if (a === "--size") {
      const n = Number(value(i++, a));
      if (!Number.isInteger(n) || n < 160) throw new UsageError("--size must be a width in pixels, e.g. 960");
      out.size = n;
    } else if (a === "-h" || a === "--help") out.command = "help";
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
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
  // --step scopes the per-step commands only; anywhere else it would be silently ignored.
  if (args.step !== undefined && !["dump", "check", "shoot", "help", undefined].includes(args.command)) {
    throw new UsageError(
      args.command === "validate"
        ? "validate does not take --step: it folds and checks every step of a slide; use --slide <id>"
        : `${args.command} does not take --step (dump, check and shoot do)`,
    );
  }
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
      else process.stdout.write(`created ${relative(process.cwd(), made.dir) || "."} (template ${made.template}; engine copied to stepdeck/)\n\nnext:\n${made.next.map((l) => `  ${l}`).join("\n")}\n`);
      return 0;
    }
    case "new-component": {
      const [name, dir] = args.positionals;
      if (name === undefined) throw new UsageError("new-component needs a name: stepdeck new-component my.thing [deckDir]");
      const made = await newComponent(dir ?? process.cwd(), name);
      if (args.json) emit(made);
      else {
        const rel = relative(process.cwd(), made.dir);
        process.stdout.write(`created ${rel}/ (${made.files.map((f) => f.slice(made.dir.length + 1)).join(", ")})\n`);
        process.stdout.write(made.deckUpdated ? `added "${made.name}" to components in deck.js\n` : `deck.js not edited: ${made.line}\n`);
        const deck = resolve(dir ?? process.cwd());
        process.stdout.write(`try it: copy ${rel}/example.js to slides/, add its id to slides in deck.js, then\n  ${cli("validate", deck)}\n  ${cli("check", deck)} --played\n`);
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
        process.stdout.write(`catalog: ${n(count("component"), "component")}, ${n(count("layout"), "layout")}, ${n(count("theme"), "theme")} -> ${relative(process.cwd(), built.outDir) || "."}/index.json\n`);
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
      const target = deckTarget(deckDir);
      const server = await serve({ root: target.root, port: args.port ?? 8000 });
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
          played = `, ${counts.reduce((s, c) => s + c.fromPrev + c.fromNext, 0)} played arrivals compared`;
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
      else process.stdout.write(`${paths.map((p) => relative(process.cwd(), p)).join("\n")}\nshoot: ${n(paths.length, "PNG")} at ${size}×${(size * 9) / 16}\n`);
      return 0;
    }
    default:
      process.stderr.write(`${args.command ? `stepdeck: unknown command '${args.command}'\n\n` : ""}${USAGE}`);
      return 2;
  }
}

main(process.argv.slice(2)).then((code) => (process.exitCode = code));
