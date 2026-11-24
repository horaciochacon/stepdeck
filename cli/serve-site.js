// Preview the GitHub Pages site locally, exactly as Pages serves it: the repository under /stepdeck/
// (pagesLayout in cli/serve.js), with no-store caching, so a reload shows the files as they are on disk.
// Usage: npm run site [-- <port>]   (default port 8000; 0 picks a free one). Ctrl-C stops it.
// A port that is not a number or is in use: one line on stderr, exit code 2, no temporary folder left.
import { pagesLayout, serve } from "./serve.js";
import { REPO } from "./engine.js";

const fail = (message) => {
  process.stderr.write(`stepdeck: ${message}\n`);
  process.exit(2);
};
const arg = process.argv[2] ?? "8000";
const port = /^\d+$/.test(arg) ? Number(arg) : NaN;
if (!(port <= 65535)) fail(`'${arg}' is not a port (use a number from 0 to 65535, as in \`npm run site -- 8001\`)`);
const site = pagesLayout(REPO);
let server;
try {
  server = await serve({ root: site.dir, port });
} catch (e) {
  site.cleanup();
  fail(e.code === "EADDRINUSE" ? `port ${port} is in use; try \`npm run site -- ${port + 1}\`` : `cannot serve the site on port ${port}: ${e.message}`);
}
console.log(`stepdeck site: ${server.url}stepdeck/`);

const stop = async () => {
  await server.close();
  site.cleanup();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
