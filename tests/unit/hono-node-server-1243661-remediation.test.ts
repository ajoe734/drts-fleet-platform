import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Duplex } from "node:stream";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Follow the installed API -> OpenClaw -> MCP SDK dependency edges. A safe
// root-level copy must not hide the vulnerable transitive adapter.
const apiRequire = createRequire(
  resolve(__dirname, "../../apps/api/package.json"),
);
const openclawRequire = createRequire(apiRequire.resolve("openclaw"));
const sdkEntry = openclawRequire.resolve(
  "@modelcontextprotocol/sdk/server/streamableHttp.js",
);
const sdkRequire = createRequire(sdkEntry);
const { Hono } = sdkRequire("hono");
const { serveStatic } = sdkRequire("@hono/node-server/serve-static");

describe("GHSA-rmxm-3fg6-px4f: real node-server static middleware", () => {
  let directory: string;
  let app: InstanceType<typeof Hono>;
  let authChecks: number;
  const protectedMarker = "synthetic protected file: hono-1243661";

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "drts-hono-1243661-"));
    const files = {
      "static/public.txt": "public asset",
      "static/admin/secret.txt": protectedMarker,
      "static/hello world.txt": "space asset",
      "static/炎.txt": "unicode asset",
      "static/100%.txt": "literal percent asset",
    };
    for (const [file, body] of Object.entries(files)) {
      const target = join(directory, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
    app = new Hono();
    authChecks = 0;
    app.use("/static/admin/*", async (c: any, next: () => Promise<void>) => {
      authChecks++;
      if (c.req.header("authorization") !== "Bearer synthetic-fixture") {
        return c.text("Unauthorized", 401);
      }
      await next();
    });
    // Default options are the security boundary; do not opt into percent paths
    // or replace the real router/decoder/static implementation with mocks.
    app.use("/static/*", serveStatic({ root: directory }));
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it.each([
    ["/static/public.txt", "public asset"],
    ["/static/hello%20world.txt", "space asset"],
    ["/static/%E7%82%8E.txt", "unicode asset"],
  ])("serves legitimate public path %s", async (url, body) => {
    const response = await app.request(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
  });

  it.each(["/static/admin/secret.txt", "/static/%61dmin/secret.txt"])(
    "enforces authentication on %s and allows the authorized request",
    async (url) => {
      const previousChecks = authChecks;
      const denied = await app.request(url);
      expect(denied.status).toBe(401);
      expect(await denied.text()).toBe("Unauthorized");
      const allowed = await app.request(url, {
        headers: { authorization: "Bearer synthetic-fixture" },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.text()).toBe(protectedMarker);
      expect(authChecks - previousChecks).toBe(2);
    },
  );

  it("refuses a crafted second decode before it can bypass prefix authentication", async () => {
    const previousChecks = authChecks;
    const response = await app.request("/static/%%36%31dmin/secret.txt");
    const body = await response.text();
    // The router does not select /admin's auth middleware for this malformed
    // encoding. The adapter itself must refuse to reinterpret it as /admin.
    expect(authChecks).toBe(previousChecks);
    expect(body).not.toContain(protectedMarker);
    expect(response.status).toBe(404);
  });

  it("rejects remaining percent paths with the patched default", async () => {
    const response = await app.request("/static/100%25.txt");
    expect(await response.text()).not.toBe("literal percent asset");
    expect(response.status).toBe(404);
  });
});

// Only the network boundary is synthetic. Actual Node request/response objects
// and an in-memory Duplex carry bytes through MCP's getRequestListener adapter.
// No HTTP server, listen call, external fetch, or product runtime is involved.
function memoryFetch(transport: any): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    request.headers.set("host", new URL(request.url).host);
    const bytes: Buffer[] = [];
    const wire = new Duplex({
      read() {},
      write(chunk, _encoding, callback) {
        bytes.push(Buffer.from(chunk));
        callback();
      },
    });
    const incoming = new IncomingMessage(wire as Socket);
    incoming.method = request.method;
    incoming.url = new URL(request.url).pathname;
    incoming.headers = Object.fromEntries(request.headers);
    incoming.rawHeaders = [...request.headers].flat();
    incoming.httpVersion = "1.1";
    incoming.httpVersionMajor = 1;
    incoming.httpVersionMinor = 1;
    incoming.push(Buffer.from(await request.text()));
    incoming.push(null);
    // The HTTP parser normally marks the complete message. Without this,
    // IncomingMessage's auto-destroy would close the synthetic response wire.
    incoming.complete = true;
    const outgoing = new ServerResponse(incoming);
    outgoing.useChunkedEncodingByDefault = false;
    outgoing.assignSocket(wire as Socket);
    const finished = once(outgoing, "finish");
    try {
      // Do not supply parsedBody: also exercise real body conversion/parsing.
      await transport.handleRequest(incoming, outgoing);
      await finished;
      const raw = Buffer.concat(bytes);
      const headerEnd = raw.indexOf("\r\n\r\n");
      const body = raw.subarray(headerEnd + 4);
      const headers = new Headers();
      for (const line of raw
        .subarray(0, headerEnd)
        .toString()
        .split("\r\n")
        .slice(1)) {
        const colon = line.indexOf(":");
        headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
      }
      return new Response(body.length ? body : null, {
        status: outgoing.statusCode,
        headers,
      });
    } finally {
      outgoing.detachSocket(wire as Socket);
      incoming.destroy();
      wire.destroy();
    }
  };
}

describe.each(["cjs", "esm"])("OpenClaw's MCP dependency (%s)", (format) => {
  it("initializes, lists and calls a tool through the real Node HTTP adapter", async () => {
    const load = (module: string) =>
      format === "cjs"
        ? Promise.resolve(
            openclawRequire(`@modelcontextprotocol/sdk/${module}.js`),
          )
        : import(
            pathToFileURL(resolve(dirname(sdkEntry), `../../esm/${module}.js`))
              .href
          );
    const [
      { Client },
      { StreamableHTTPClientTransport },
      { McpServer },
      { StreamableHTTPServerTransport },
    ] = await Promise.all([
      load("client/index"),
      load("client/streamableHttp"),
      load("server/mcp"),
      load("server/streamableHttp"),
    ]);
    const originalRequest = globalThis.Request;
    const originalResponse = globalThis.Response;
    const server = new McpServer({
      name: "synthetic-regression",
      version: "1",
    });
    server.registerTool(
      "public_fixture",
      { description: "Synthetic read-only tool" },
      async () => ({
        content: [{ type: "text", text: "synthetic tool result" }],
      }),
    );
    const serverTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => "synthetic-session",
      enableJsonResponse: true,
    });
    const client = new Client({
      name: "synthetic-openclaw-client",
      version: "1",
    });
    const clientTransport = new StreamableHTTPClientTransport(
      new URL("http://synthetic.invalid/mcp"),
      { fetch: memoryFetch(serverTransport) },
    );
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(clientTransport.sessionId).toBe("synthetic-session");
      const wrongSession = await memoryFetch(serverTransport)(
        "http://synthetic.invalid/mcp",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-session-id": "another-synthetic-session",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 42,
            method: "tools/list",
          }),
        },
      );
      expect(wrongSession.status).toBe(404);
      expect(await wrongSession.json()).toMatchObject({
        error: { message: "Session not found" },
      });
      expect(await client.listTools()).toMatchObject({
        tools: [{ name: "public_fixture" }],
      });
      expect(
        await client.callTool({ name: "public_fixture", arguments: {} }),
      ).toMatchObject({
        content: [{ type: "text", text: "synthetic tool result" }],
      });
      // MCP explicitly sets overrideGlobalObjects:false in getRequestListener.
      expect(globalThis.Request).toBe(originalRequest);
      expect(globalThis.Response).toBe(originalResponse);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
