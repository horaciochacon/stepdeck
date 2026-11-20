// The files that ship: what git tracks, minus the private docs/superpowers/ folder (the public export
// leaves it out).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The repository root, with a trailing separator. */
export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Tracked paths (relative to ROOT) matching the git pathspecs, if any, outside docs/superpowers/. */
export function publicFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "-z", ...pathspecs], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((f) => f && !f.startsWith("docs/superpowers/"));
}
