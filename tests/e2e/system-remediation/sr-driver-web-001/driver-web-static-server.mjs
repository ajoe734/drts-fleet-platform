// SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911: minimal static file server for
// apps/driver-app's `expo export -p web` output.
//
// Plain Node ESM (`.mjs`) on purpose, not TypeScript: `tsx` is only a
// devDependency of apps/api, not the workspace root, so `pnpm exec tsx` run
// from the repo root (as this workflow's steps are) resolves to nothing.
// Node runs `.mjs` directly with no transpile step, so this avoids adding a
// root-level tsx dependency just to start a throwaway CI static server.
//
// Two things a generic static server (`npx serve`, `python -m http.server`)
// does not do out of the box, both required for this app to actually work:
//
// 1. expo-router ~6 defaults to SPA output (no `web.output: "static"` in
//    apps/driver-app/app.json, confirmed by reading
//    @expo/cli's exportApp.js: `useServerRendering` is only true when
//    `exp.web.output` is "static"/"server"). `expo export -p web` therefore
//    emits a single `index.html`; every other path (`/onboarding`, `/sos`,
//    ...) must fall back to it so expo-router's client-side router can take
//    over, or a dumb static server 404s on every deep link.
// 2. expo-sqlite's web runtime (`expo-sqlite/web/WorkerChannel.ts`) opens a
//    Web Worker that allocates `SharedArrayBuffer`s for its lock/result
//    channel. Chromium only exposes `SharedArrayBuffer` on cross-origin
//    isolated pages, which requires the server to send
//    `Cross-Origin-Opener-Policy: same-origin` and
//    `Cross-Origin-Embedder-Policy: require-corp` on every response — absent
//    those headers `initializeDriverLocationOfflineQueue()` (called
//    unconditionally from `app/_layout.tsx` on mount) throws, and since it is
//    invoked with a bare `void` (no `.catch`), that surfaces as an unhandled
//    promise rejection in the browser.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DIST_ROOT = resolve(__dirname, "../../../../apps/driver-app/dist");
const PORT = Number.parseInt(
  process.env.DRIVER_WEB_STATIC_PORT ?? "3101",
  10,
);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

if (!existsSync(DIST_ROOT)) {
  console.error(
    `Driver web static server: export output not found at ${DIST_ROOT}. Run "expo export -p web" in apps/driver-app first.`,
  );
  process.exit(1);
}

function resolveRequestedFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(join(DIST_ROOT, decoded));

  if (candidate !== DIST_ROOT && !candidate.startsWith(DIST_ROOT + "/")) {
    // Path escaped the export root (e.g. `..` traversal); refuse it instead
    // of falling back to index.html, which would silently mask the attempt.
    return "";
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return join(DIST_ROOT, "index.html");
}

const server = createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const filePath = resolveRequestedFile(requestUrl.pathname);

  if (!filePath) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  res.setHeader(
    "Content-Type",
    MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
  );

  createReadStream(filePath)
    .on("error", () => {
      res.statusCode = 404;
      res.end("Not found");
    })
    .pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Driver web static server listening on http://127.0.0.1:${PORT} (root: ${DIST_ROOT})`,
  );
});
