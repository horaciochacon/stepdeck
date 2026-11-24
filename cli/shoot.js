// `stepdeck shoot` (spec §3, §10): one PNG per step, to look at what the audience will see.
//
// shoot(deckDir, { slide?, step?, size = 960, theme? }) -> Promise<string[]>   absolute paths, in deck order
//   step (id or index, needs slide): only that step's PNG.
//   Writes <deck>/shots/<size>/<slide>-<nn>-<stepId>.png, nn the step index zero-padded to two
//   digits (more when a slide has 100 steps or more). The two ids go through fileName, so an id holding `/` or
//   `..` cannot write outside that folder (a step id "a/b" is written as "a_b"). The viewport is size × size·9/16, so the
//   canvas fills it exactly; 960 is the default because the audience of a video call sees the deck
//   at roughly that size (spec §3). Each step is a fresh load of the bare shell in capture mode,
//   shot after fonts and settled(). One browser for the whole run (its pages shoot side by side: withDeck's
//   worker pool, env STEPDECK_WORKERS). Existing files are overwritten;
//   nothing else in shots/ is touched. shots/ is git-ignored. theme: shoot under another shipped theme
//   (?theme=); the files go to the same folder, so a second theme overwrites the first.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { withDeck, slidePlan, assertStepScope } from "./dump.js";

export const SHOT_SIZES = [1920, 1280, 960];

/**
 * A slide or step id as part of a PNG's name: every run of characters other than letters, digits, `.`, `_` and `-`
 * becomes one `_`, and a name of dots only becomes `_`, so no id can name a folder or leave shots/<size>/.
 */
export const fileName = (id) => {
  const name = String(id).replace(/[^A-Za-z0-9._-]+/g, "_");
  return /^\.*$/.test(name) ? "_" : name;
};

export async function shoot(deckDir, { slide, step, size = 960, theme } = {}) {
  assertStepScope({ slide, step });
  if (!SHOT_SIZES.includes(size)) throw new Error(`shoot --size must be one of ${SHOT_SIZES.join("|")} (got ${size})`);
  const dir = resolve(deckDir, "shots", String(size));
  return withDeck(deckDir, { size, slide, theme }, async (session) => {
    const plan = slidePlan(session, slide, step); // an unknown --step fails before any file is written
    mkdirSync(dir, { recursive: true }); // only once the deck has loaded
    const jobs = plan.flatMap(({ id, ids, only }) => {
      const width = Math.max(2, String(ids.length - 1).length);
      return ids
        .map((stepId, k) => ({ id, k, file: resolve(dir, `${fileName(id)}-${String(k).padStart(width, "0")}-${fileName(stepId)}.png`) }))
        .filter(({ k }) => only === null || k === only);
    });
    return session.each(jobs, async (page, { id, k, file }) => {
      await page.open(id, k, { capture: true });
      await page.page.screenshot({ path: file });
      return file;
    });
  });
}
