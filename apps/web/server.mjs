// Static server for the built web app (Railway). Replaces `serve -s`:
// - prerendered marketing pages (dist/<path>.html) are served at their clean URL, so search engines
//   get real HTML; app routes get the plain app shell (dist/app.html), so no landing text flashes;
// - hashed assets are cached for a year, pages are revalidated, text responses are gzipped.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createGzip } from "node:zlib";

const ROOT = resolve(process.env.DIST_DIR ?? "dist");
const PORT = Number(process.env.PORT ?? 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp4": "video/mp4",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const COMPRESS = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".xml", ".txt", ".csv", ".svg"]);

function file(path) {
  const full = normalize(join(ROOT, path));
  if (!full.startsWith(ROOT)) return null;
  try {
    return statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

function resolveRequest(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/") return file("index.html");
  return file(clean) ?? file(`${clean}.html`) ?? (extname(clean) ? null : file("app.html"));
}

createServer((req, res) => {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const path = resolveRequest(pathname);
  if (!path) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const ext = extname(path);
  const headers = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  if (ext === ".xlsx" || ext === ".csv") headers["Content-Disposition"] = `attachment; filename="${path.split("/").pop()}"`;
  const gzip = COMPRESS.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
  if (gzip) headers["Content-Encoding"] = "gzip";
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(path);
  (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`web on :${PORT} from ${ROOT}`));

if (!existsSync(join(ROOT, "app.html"))) console.warn("dist/app.html is missing: app routes will 404");
