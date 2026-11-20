// Browser harness for the CLI and the browser tests. Dev tooling only.
//
// Playwright resolution (ruling R1): the module named by env STEPDECK_PLAYWRIGHT, else
// require("playwright"). Chromium is launched with channel STEPDECK_CHANNEL (default "chrome",
// the system Chrome).
//
// withPage({ root, size, url, timeout = PAGE_TIMEOUT_MS, waitFor = waitForDeck }, async (page, ctx) => …)
//   Serves `root` (cli/serve.js), launches Chromium with a viewport of `size` (default 1920×1080;
//   a number n means n × round(n·9/16)), opens `url` (relative to root) if given, and waits for
//   it with waitFor(page, { timeout, errors }). The default waits for the deck: STEPDECK.ready,
//   document.fonts.ready, STEPDECK.settled() (waitForDeck: on timeout the error names the page URL and
//   its slide and step); a page that is not a deck (the docs site) passes its own. ctx.open waits the
//   same way. Then runs fn(page, ctx):
//     ctx.base     server URL (ends with "/")
//     ctx.requests every request URL the page made, live array
//     ctx.errors   console errors ("console: …") and page errors ("pageerror: …"), live array
//     ctx.failed   failed requests, live array: "<status> <url>" for HTTP status >= 400,
//                  "failed <url> (<reason>)" when the request never completed, or
//                  "remote <url> (blocked: …)" for a request to another origin; same-origin URLs
//                  as paths from the served root
//     ctx.open(u)  navigate to another url (relative to root), wait for the deck again, then quiet()
//     ctx.quiet()  wait two frames and for the requests in flight to end (at most 2 s), so a
//                  failed request lands in ctx.failed before the page state is measured
//   The browser and the server are always closed afterwards. Returns fn's result.
//   Offline guarantee (spec §3): every request whose origin is not the local server's is aborted
//   before it leaves the browser, and recorded in ctx.failed (so `check` reports network-error).
//
// deckTarget(deckDir) -> { root, url({ slide, step, capture, query }) }
//   Where to serve a deck from and how to address the bare shell for it. A deck with a copied
//   engine (deckDir/stepdeck/core/render.html) is served from deckDir. A deck without one must be
//   inside this engine repo (examples, fixtures) and is served from the repo root; anything else
//   throws, so no folder above the deck is ever served (ruling R15).
import { createRequire } from "node:module";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { serve } from "./serve.js";
import { CANVAS } from "../core/constants.js";
import { ENGINE, hasEngineCopy } from "./engine.js";

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const target = process.env.STEPDECK_PLAYWRIGHT;
  try {
    return require(target || "playwright");
  } catch (error) {
    throw new Error(
      `Playwright not found${target ? ` at STEPDECK_PLAYWRIGHT=${target}` : ""}. ` +
        `Install it (npm i -D playwright) or set STEPDECK_PLAYWRIGHT to a playwright package directory.`,
      { cause: error },
    );
  }
}

export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  return chromium.launch({ channel: process.env.STEPDECK_CHANNEL ?? "chrome" });
}

export function viewportOf(size) {
  if (typeof size === "number") return { width: size, height: Math.round((size * 9) / 16) };
  return { width: size?.width ?? CANVAS.w, height: size?.height ?? CANVAS.h };
}

// How long a page may take to boot and settle. Well above the runtime's per-call watchdog
// (SETTLE_TIMEOUT_MS, 10 s, core/controller.js), so a component that never settles is reported as
// that element's error instead of ending the run with a timeout.
export const PAGE_TIMEOUT_MS = 30_000;
// How long open() waits, after the deck settled, for requests still in flight (long-lived ones
// such as a stalled media stream must not stall a run).
const QUIET_TIMEOUT_MS = 2_000;

/** "<url> (slide 'x', step 'y')": the slide and step from the query (bare shell) or the `#/x/y` hash. */
export function describePageUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return String(url);
  }
  let slide = u.searchParams.get("slide");
  let step = u.searchParams.get("step");
  const hash = /^#\/([^/]+)(?:\/([^/]*))?/.exec(u.hash);
  if (hash) {
    slide = decodeURIComponent(hash[1]);
    step = hash[2] ? decodeURIComponent(hash[2]) : "0";
  }
  if (slide === null) return url;
  return `${url} (slide '${slide}', step '${step ?? "0"}')`;
}

/**
 * Settles with `promise`, or rejects with "Timeout <ms>ms exceeded <what>" after `ms`. The promise
 * left behind is never reported as unhandled (the browser closes under it).
 */
export function withTimeout(promise, ms, what) {
  let timer;
  promise.catch(() => {});
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout ${ms}ms exceeded ${what}`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Waits until the page's deck has booted and settled. Throws a readable error naming the URL on timeout. */
export async function waitForDeck(page, { timeout = PAGE_TIMEOUT_MS, errors = [] } = {}) {
  const start = Date.now();
  try {
    await page.waitForFunction(() => window.STEPDECK && window.STEPDECK.ready, null, { timeout });
    const settled = page.evaluate(async () => {
      await window.STEPDECK.ready;
      await document.fonts.ready;
      await window.STEPDECK.settled();
    });
    await withTimeout(settled, Math.max(1, timeout - (Date.now() - start)), "waiting for STEPDECK.settled()");
  } catch (error) {
    const detail = errors.length ? `\n  ${errors.join("\n  ")}` : "";
    throw new Error(`deck did not become ready at ${describePageUrl(page.url())}: ${error.message.split("\n")[0]}${detail}`, { cause: error });
  }
}

export async function withPage({ root, size, url, timeout = PAGE_TIMEOUT_MS, waitFor = waitForDeck } = {}, fn) {
  const server = await serve({ root: root ?? ENGINE, port: 0 });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: viewportOf(size) });
    const errors = [];
    const requests = [];
    const failed = [];
    const inflight = new Set();
    page.on("request", (req) => {
      requests.push(req.url());
      inflight.add(req);
    });
    page.on("requestfinished", (req) => inflight.delete(req));
    // Same-origin URLs are shown from the served root ("/deck/data/x.csv"), so lines are stable.
    const shown = (u) => (u.startsWith(server.url) ? `/${u.slice(server.url.length)}` : u);
    page.on("response", (res) => {
      if (res.status() >= 400) failed.push(`${res.status()} ${shown(res.url())}`);
    });
    // Spec §3: no remote requests at presentation time. Anything not served by the local server is
    // aborted here, never sent, and reported once (its requestfailed event is not counted again).
    const local = new URL(server.url).origin;
    const blocked = new WeakSet(); // per request: the same URL on a later page load is reported again
    await page.route("**/*", (route) => {
      const req = route.request();
      const u = req.url();
      let origin = null;
      try {
        origin = new URL(u).origin;
      } catch {
        // unparsable: treated as remote
      }
      if (origin === local) return route.continue();
      blocked.add(req);
      failed.push(`remote ${u} (blocked: only same-origin requests are allowed, spec §3)`);
      return route.abort("blockedbyclient");
    });
    page.on("requestfailed", (req) => {
      inflight.delete(req);
      if (blocked.has(req)) return;
      failed.push(`failed ${shown(req.url())} (${req.failure()?.errorText ?? "unknown"})`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    const open = async (target) => {
      const response = await page.goto(new URL(target, server.url).href, { timeout });
      if (!response?.ok()) throw new Error(`cannot open ${target}: HTTP ${response?.status()}`);
      await waitFor(page, { timeout, errors });
      await quiet();
    };
    // After settled(): let two frames pass (style and paint start their requests, e.g. a CSS
    // background) and every request in flight end, so its failure is counted for this page state.
    const quiet = async () => {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const until = Date.now() + QUIET_TIMEOUT_MS;
      while (inflight.size > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
    };
    if (url) await open(url);
    return await fn(page, { base: server.url, errors, requests, failed, open, quiet });
  } finally {
    await browser?.close().catch(() => {});
    await server.close();
  }
}

const toUrlPath = (p) => p.split(sep).join("/");


export function deckTarget(deckDir) {
  const deck = resolve(deckDir);
  const copied = resolve(deck, "stepdeck");
  const hasCopy = hasEngineCopy(deck);
  if (!hasCopy) {
    // Ruling R15: never serve a folder above the deck, except this engine repo's own root.
    const rel = relative(ENGINE, deck);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`deck at ${deck} has no engine copy; run \`stepdeck new\` or copy the engine to ${copied}/`);
    }
  }
  const engine = hasCopy ? copied : ENGINE;
  const root = hasCopy ? deck : ENGINE;
  const render = toUrlPath(relative(root, resolve(engine, "core", "render.html")));
  const deckParam = `${toUrlPath(relative(resolve(engine, "core"), deck)) || "."}/`;
  return {
    root,
    url({ slide, step, capture = false, query = {} } = {}) {
      const q = new URLSearchParams({ deck: deckParam });
      if (slide !== undefined) q.set("slide", slide);
      if (step !== undefined) q.set("step", String(step));
      for (const [k, v] of Object.entries(query)) q.set(k, v);
      let s = `${render}?${q}`;
      if (capture) s += "&capture";
      return s;
    },
  };
}
