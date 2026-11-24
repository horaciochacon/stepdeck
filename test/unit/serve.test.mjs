// cli/serve.js without a browser: a folder without its trailing slash, files a served root must not give out
// (dotfiles, what a symbolic link leads to outside it), the Host header, and the MIME types.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIME, pagesLayout, serve } from "../../cli/serve.js";

/** One raw request (no URL normalization, any Host header) -> { status, headers, body }. */
function get(server, path, headers = {}) {
  return new Promise((ok, fail) => {
    const req = request({ host: "127.0.0.1", port: server.port, path, method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => ok({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", fail);
    req.end();
  });
}

/** A served temporary root: { root, outside } hold files; fn(server, dirs). Both folders are removed afterwards. */
async function served(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-serve-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-outside-")));
  mkdirSync(join(root, "deck", "data"), { recursive: true });
  writeFileSync(join(root, "deck", "index.html"), "<p>deck</p>");
  writeFileSync(join(root, "deck", "data", "a.csv"), "x\n1\n");
  const server = await serve({ root, port: 0 });
  try {
    return await fn(server, { root, outside });
  } finally {
    await server.close();
    for (const dir of [root, outside]) rmSync(dir, { recursive: true, force: true });
  }
}

test("serve: a folder without its trailing slash is redirected to it, so its relative URLs stay inside it", async () => {
  await served(async (server) => {
    const bare = await get(server, "/deck");
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.location, "/deck/");
    assert.equal(bare.headers["cache-control"], "no-store");
    assert.equal((await get(server, "/deck?slide=a")).headers.location, "/deck/?slide=a", "the query is kept");
    const slash = await get(server, "/deck/");
    assert.equal(slash.status, 200);
    assert.equal(slash.body, "<p>deck</p>");
    assert.equal((await get(server, "/deck/data")).status, 301, "a folder with no index.html too");
    assert.equal((await get(server, "/deck/data/")).status, 404);
    // fetch follows the redirect: the page a person opens is the folder's.
    const followed = await fetch(new URL("deck", server.url));
    assert.equal(followed.url, `${server.url}deck/`);
  });
});

test("serve: a path segment that starts with a dot is not served", async () => {
  await served(async (server, { root }) => {
    mkdirSync(join(root, "deck", ".git"));
    writeFileSync(join(root, "deck", ".git", "config"), "secret");
    writeFileSync(join(root, "deck", ".env"), "KEY=1");
    for (const path of ["/deck/.git/config", "/deck/.env", "/deck/.git/", "/deck/%2egit/config"]) {
      const r = await get(server, path);
      assert.equal(r.status, 404, path);
      assert.equal(r.body, "not found");
    }
    assert.equal((await get(server, "/deck/data/a.csv")).status, 200);
  });
});

test("serve: a symbolic link that leads out of the root is refused; one that stays inside is served", async () => {
  await served(async (server, { root, outside }) => {
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(join(outside, "secret.txt"), join(root, "deck", "leak.txt"));
    symlinkSync(outside, join(root, "deck", "out"), "dir");
    symlinkSync(join(root, "deck", "data"), join(root, "deck", "alias"), "dir");
    assert.equal((await get(server, "/deck/leak.txt")).status, 403);
    assert.equal((await get(server, "/deck/out/secret.txt")).status, 403);
    const inside = await get(server, "/deck/alias/a.csv");
    assert.equal(inside.status, 200);
    assert.equal(inside.body, "x\n1\n");
  });
});

test("serve: the link pagesLayout makes is the one link out of a root that is served", async () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-repo-")));
  writeFileSync(join(repo, "index.html"), "<p>site</p>");
  const site = pagesLayout(repo);
  const server = await serve({ root: site.dir, port: 0 });
  try {
    const page = await get(server, "/stepdeck/");
    assert.equal(page.status, 200);
    assert.equal(page.body, "<p>site</p>");
    assert.equal((await get(server, "/index.html")).status, 404, "nothing at the root, as on GitHub Pages");
  } finally {
    await server.close();
    site.cleanup();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("serve: only requests addressed to the server itself are answered (Host header)", async () => {
  await served(async (server) => {
    for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`, `[::1]:${server.port}`, `LOCALHOST:${server.port}`]) {
      assert.equal((await get(server, "/deck/", { Host: host })).status, 200, host);
    }
    for (const host of ["evil.example", `evil.example:${server.port}`, "127.0.0.1:1", "127.0.0.1"]) {
      const r = await get(server, "/deck/", { Host: host });
      assert.equal(r.status, 403, host);
      assert.equal(r.body, "forbidden host");
      assert.equal(r.headers["cache-control"], "no-store");
    }
  });
});

test("serve: media and font types", async () => {
  const types = { ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".webm": "video/webm", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
  for (const [ext, type] of Object.entries(types)) assert.equal(MIME[ext], type, ext);
  await served(async (server, { root }) => {
    writeFileSync(join(root, "deck", "clip.WEBM"), "x");
    writeFileSync(join(root, "deck", "blob.bin"), "x");
    assert.equal((await get(server, "/deck/clip.WEBM")).headers["content-type"], "video/webm");
    assert.equal((await get(server, "/deck/blob.bin")).headers["content-type"], "application/octet-stream");
  });
});
