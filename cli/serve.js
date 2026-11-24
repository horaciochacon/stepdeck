// Static file server for decks (spec §3): `Cache-Control: no-store` on every response, so an
// agent never checks a stale module, and explicit MIME types. Dev tooling only.
//
// serve({ root, port = 0, host = "127.0.0.1" }) -> Promise<{ url, port, close(): Promise<void> }>
//   port 0 picks a free port. `url` ends with "/". Requests resolve inside `root`; anything that
//   escapes it is refused (403), by its path or through a symbolic link (the file's real path must be inside the
//   root's; pagesLayout's own link is the one exception). A path with a segment that starts with "." (.git, .env)
//   is 404. A folder asked for without its trailing slash is redirected to it (301), so the relative URLs of its
//   index.html resolve inside it; with the slash it serves its index.html. Missing files are 404. A request whose
//   Host header is not this server's address (127.0.0.1:<port>, localhost:<port>, [::1]:<port>, or <host>:<port>)
//   is refused (403), so a page of another site cannot reach the server under a name of its own (DNS rebinding).
// pagesLayout(repo) -> { dir, cleanup() }
//   A temporary folder with <dir>/stepdeck -> repo, as GitHub Pages serves this project.
import { createServer } from "node:http";
import { createReadStream, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { realpath, stat } from "node:fs/promises";
import { resolve, sep, extname, join } from "node:path";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/** Folders a served root may reach through a symbolic link of its own: root -> [real folder]. Filled by pagesLayout. */
const LINKED = new Map();

/**
 * A temporary folder laid out as GitHub Pages serves this project: <dir>/stepdeck is a symlink to `repo`, so a
 * root-relative URL is a 404 there, as on Pages. Serve `dir`; cleanup() removes it. Used by `npm run site` and the
 * site browser test.
 */
export function pagesLayout(repo) {
  const dir = mkdtempSync(join(tmpdir(), "stepdeck-site-"));
  symlinkSync(repo, join(dir, "stepdeck"), "dir");
  LINKED.set(resolve(dir), [resolve(repo)]);
  return {
    dir,
    cleanup: () => {
      LINKED.delete(resolve(dir));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function serve({ root, port = 0, host = "127.0.0.1" } = {}) {
  const base = resolve(root ?? ".");
  const inside = (file, dir) => file === dir || file.startsWith(dir + sep);
  let roots; // the real folders a file may be in: the root's, and those pagesLayout linked into it
  const realRoots = async () => (roots ??= await Promise.all([base, ...(LINKED.get(base) ?? [])].map((dir) => realpath(dir))));
  let hosts = null; // the Host headers this server answers, known once it listens

  const server = createServer(async (req, res) => {
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
      res.end(body);
    };
    if (!hosts?.has(String(req.headers.host).toLowerCase())) return send(403, "forbidden host");
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "method not allowed");
    let url;
    let pathname;
    try {
      url = new URL(req.url, "http://x");
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(400, "bad request");
    }
    let file = resolve(base, `.${pathname}`);
    if (!inside(file, base)) return send(403, "forbidden");
    if (file.slice(base.length).split(sep).some((segment) => segment.startsWith("."))) return send(404, "not found");
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        // Without the trailing slash the folder's relative URLs would resolve one level up.
        if (!url.pathname.endsWith("/")) return send(301, "moved", { Location: `${url.pathname.replace(/^\/+/, "/")}/${url.search}` });
        file = join(file, "index.html");
        info = await stat(file);
      }
      // A symbolic link must not lead out of the root.
      const real = await realpath(file);
      if (!(await realRoots()).some((dir) => inside(real, dir))) return send(403, "forbidden");
      res.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": "no-store",
      });
      if (req.method === "HEAD") return res.end();
      createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch {
      send(404, "not found");
    }
  });

  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, host, ok);
  });
  const actual = server.address().port;
  // A browser leaves the port out of Host when it is the scheme's default.
  hosts = new Set([host, "127.0.0.1", "localhost", "[::1]"].flatMap((name) => [`${name}:${actual}`, ...(actual === 80 ? [name] : [])]).map((h) => h.toLowerCase()));
  return {
    url: `http://${host}:${actual}/`,
    port: actual,
    close: () =>
      new Promise((ok) => {
        server.closeAllConnections?.();
        server.close(() => ok());
      }),
  };
}
