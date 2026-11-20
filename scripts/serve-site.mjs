// Preview the GitHub Pages site locally, exactly as Pages serves it: the repository under /stepdeck/.
// Usage: npm run site [-- <port>]   (default port 8000; 0 picks a free one). Ctrl-C stops it.
// A temporary folder holds one symlink, stepdeck -> this repository, so a root-relative URL fails here as it
// would on Pages (test/browser/site.test.mjs uses the same layout). cli/serve.js sends Cache-Control:
// no-store, so a reload always shows the files as they are on disk.
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../cli/serve.js";
import { ENGINE } from "../cli/engine.js";

const port = Number(process.argv[2] ?? 8000);
const dir = mkdtempSync(join(tmpdir(), "stepdeck-site-"));
symlinkSync(ENGINE, join(dir, "stepdeck"), "dir");
const server = await serve({ root: dir, port });
console.log(`stepdeck site: ${server.url}stepdeck/`);

const stop = async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
