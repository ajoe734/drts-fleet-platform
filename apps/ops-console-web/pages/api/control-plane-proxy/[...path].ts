import type { NextApiRequest, NextApiResponse } from "next";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const HOP_BY_HOP_HEADERS = new Set([
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

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

function resolveTargetOrigin() {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function buildTargetUrl(req: NextApiRequest) {
  const path = req.query.path;
  const pathSegments = Array.isArray(path) ? path : [path].filter(Boolean);
  const targetPath = pathSegments.join("/");
  const targetUrl = new URL(targetPath, `${resolveTargetOrigin()}/`);
  const query = new URLSearchParams();

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === "path") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
      return;
    }
    if (value !== undefined) {
      query.append(key, value);
    }
  });

  targetUrl.search = query.toString();

  return targetUrl;
}

function copyRequestHeaders(req: NextApiRequest) {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
      return;
    }

    headers.set(key, value);
  });

  return headers;
}

function copyResponseHeaders(upstream: Response, res: NextApiResponse) {
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }
    res.setHeader(key, value);
  });
}

async function readRequestBody(req: NextApiRequest) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const method = (req.method || "GET").toUpperCase();
  const targetUrl = buildTargetUrl(req);
  const headers = copyRequestHeaders(req);
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    const body = await readRequestBody(req);
    init.body = body;
    init.duplex = "half";
  }

  const upstream = await fetch(targetUrl, init);
  copyResponseHeaders(upstream, res);
  res.status(upstream.status);

  if (method === "HEAD" || upstream.body === null) {
    res.end();
    return;
  }

  const payload = Buffer.from(await upstream.arrayBuffer());
  res.send(payload);
}
