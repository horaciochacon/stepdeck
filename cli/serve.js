// Static file server for decks (spec §3): `Cache-Control: no-store` on every response, so an
// agent never checks a stale module, and explicit MIME types. Dev tooling only.
//
// serve({ root, port = 0, host = "127.0.0.1" }) -> Promise<{ url, port, close(): Promise<void> }>
//   port 0 picks a free port. `url` ends with "/". Requests resolve inside `root`; anything that
//   escapes it is refused (403). Directories serve their index.html. Missing files are 404.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
};

export async function serve({ root, port = 0, host = "127.0.0.1" } = {}) {
  const base = resolve(root ?? ".");

  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(body);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "method not allowed");
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      return send(400, "bad request");
    }
    let file = resolve(base, `.${pathname}`);
    if (file !== base && !file.startsWith(base + sep)) return send(403, "forbidden");
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, "index.html");
        info = await stat(file);
      }
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
