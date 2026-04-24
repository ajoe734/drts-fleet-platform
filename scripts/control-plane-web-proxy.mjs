import { spawn } from "node:child_process";
import http from "node:http";
import { Readable } from "node:stream";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const RUN_APP_HOST_SUFFIX = ".a.run.app";
const REQUEST_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
]);

const [, , childEntry, internalPortArg] = process.argv;

if (!childEntry || !internalPortArg) {
  console.error(
    "usage: node scripts/control-plane-web-proxy.mjs <next-entry> <internal-port>",
  );
  process.exit(1);
}

const publicPort = Number(process.env.PORT || 3000);
const internalPort = Number(internalPortArg);

function resolveTargetOrigin() {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function isRunAppTarget(targetUrl) {
  return targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX);
}

function buildTargetUrl(requestUrl) {
  const proxyPath = requestUrl.pathname.replace(/^\/control-plane-proxy\//, "");
  const targetPath =
    proxyPath === "health" ? "health" : ["api", proxyPath].join("/");
  const targetUrl = new URL(targetPath, `${resolveTargetOrigin()}/`);
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function copyRequestHeaders(req, targetUrl, { forwardAuthorization }) {
  const headers = new Headers();

  for (const [key, rawValue] of Object.entries(req.headers)) {
    if (rawValue == null) {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (REQUEST_HEADER_BLOCKLIST.has(normalizedKey)) {
      continue;
    }

    if (normalizedKey === "authorization" && !forwardAuthorization) {
      continue;
    }

    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    headers.set(key, value);
  }

  if (!forwardAuthorization) {
    headers.delete("authorization");
  }

  return headers;
}

async function mintMetadataIdentityToken(targetUrl) {
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", targetUrl.origin);
  metadataUrl.searchParams.set("format", "full");

  try {
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: {
        "Metadata-Flavor": "Google",
      },
    });

    if (!response.ok) {
      console.error("[control-plane-proxy] metadata token request failed", {
        audience: targetUrl.origin,
        status: response.status,
      });
      return null;
    }

    return response.text();
  } catch (error) {
    console.error("[control-plane-proxy] metadata token request errored", {
      audience: targetUrl.origin,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function applyUpstreamAuth(headers, req, targetUrl) {
  if (!isRunAppTarget(targetUrl)) {
    const authorization = req.headers.authorization;
    if (authorization) {
      headers.set("authorization", authorization);
    }
    return;
  }

  const metadataToken = await mintMetadataIdentityToken(targetUrl);
  if (metadataToken) {
    headers.set("x-serverless-authorization", `Bearer ${metadataToken}`);
    return;
  }

  if (req.headers.authorization) {
    headers.set("x-serverless-authorization", req.headers.authorization);
  }
}

function writeResponse(res, upstream) {
  for (const [key, value] of upstream.headers.entries()) {
    if (REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      continue;
    }
    res.setHeader(key, value);
  }

  res.statusCode = upstream.status;

  if (!upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

async function forwardProxyRequest(req, res, requestUrl) {
  const method = (req.method || "GET").toUpperCase();
  const targetUrl = buildTargetUrl(requestUrl);
  const headers = copyRequestHeaders(req, targetUrl, {
    forwardAuthorization: !isRunAppTarget(targetUrl),
  });
  await applyUpstreamAuth(headers, req, targetUrl);
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await readRequestBody(req);

  console.info("[control-plane-proxy] forwarding request", {
    method,
    path: requestUrl.pathname,
    target: targetUrl.toString(),
  });

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
    duplex: body ? "half" : undefined,
  });

  console.info("[control-plane-proxy] upstream response", {
    status: upstream.status,
    target: targetUrl.toString(),
  });

  writeResponse(res, upstream);
}

async function forwardNextRequest(req, res, requestUrl) {
  const method = (req.method || "GET").toUpperCase();
  const targetUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    `http://127.0.0.1:${internalPort}`,
  );
  const headers = copyRequestHeaders(req, targetUrl, {
    forwardAuthorization: true,
  });
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await readRequestBody(req);

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
    duplex: body ? "half" : undefined,
  });

  writeResponse(res, upstream);
}

const child = spawn(process.execPath, [childEntry], {
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: String(internalPort),
  },
  stdio: "inherit",
});

function shutdown(signal) {
  child.kill(signal);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  console.info("[control-plane-proxy] inbound request", {
    host: req.headers.host || "localhost",
    path: requestUrl.pathname,
  });

  try {
    if (requestUrl.pathname.startsWith("/control-plane-proxy/")) {
      await forwardProxyRequest(req, res, requestUrl);
      return;
    }

    await forwardNextRequest(req, res, requestUrl);
  } catch (error) {
    console.error("[control-plane-proxy] request failed", {
      path: requestUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    });

    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }

    res.end(
      JSON.stringify({
        error: {
          code: "CONTROL_PLANE_PROXY_ERROR",
          message: "Control-plane proxy request failed.",
        },
      }),
    );
  }
});

server.listen(publicPort, "0.0.0.0", () => {
  console.info("[control-plane-proxy] proxy server ready", {
    childEntry,
    internalPort,
    publicPort,
  });
});
