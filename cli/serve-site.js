// Preview the GitHub Pages site locally, exactly as Pages serves it: the repository under /stepdeck/
// (pagesLayout in cli/serve.js), with no-store caching, so a reload shows the files as they are on disk.
// Usage: npm run site [-- <port>]   (default port 8000; 0 picks a free one). Ctrl-C stops it.
import { pagesLayout, serve } from "./serve.js";
import { REPO } from "./engine.js";

const port = Number(process.argv[2] ?? 8000);
const site = pagesLayout(REPO);
const server = await serve({ root: site.dir, port });
console.log(`stepdeck site: ${server.url}stepdeck/`);

const stop = async () => {
  await server.close();
  site.cleanup();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
