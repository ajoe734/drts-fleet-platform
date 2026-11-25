import { generateKeyPairSync, verify } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { main } = createRequire(import.meta.url)(
  "../../../operations/native-signing/apple-signing.cjs",
);

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const PEM = String(privateKey.export({ type: "pkcs8", format: "pem" }));
const BUNDLE = "com.cctechsupport.drts.driver";
const SECRET = "Apple text naming Example Company 00008030-001A2B3C4D5E6F70";

type Call = { method: string; path: string; body?: unknown; token: string };

describe("driver Apple signing", () => {
  let dir = "";
  let calls: Call[] = [];
  let printed: string[] = [];
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "driver-apple-signing-"));
    calls = [];
    printed = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const env = (overrides: Record<string, string> = {}) => ({
    ASC_API_KEY_P8: PEM,
    ASC_KEY_ID: "KEY1234567",
    ASC_ISSUER_ID: "issuer-fixture",
    APPLE_KEY_FILE: path.join(dir, "apple-key.p8"),
    ...overrides,
  });

  function apple({
    capabilities = ["PUSH_NOTIFICATIONS"],
    onPost = (list: string[]) => [...list, "ASSOCIATED_DOMAINS"],
    identifiers = [`${BUNDLE}.other`, BUNDLE],
    refuse = {} as Record<string, [number, unknown]>,
  } = {}) {
    let current = capabilities;
    return async (url: string, init: RequestInit) => {
      const { pathname } = new URL(url);
      const method = String(init.method);
      calls.push({
        method,
        path: pathname,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        token: String(
          (init.headers as Record<string, string>).authorization,
        ).replace("Bearer ", ""),
      });
      const refusal = refuse[`${method} ${pathname}`];
      if (refusal) return Response.json(refusal[1], { status: refusal[0] });
      if (pathname === "/v1/bundleIds")
        return Response.json({
          data: identifiers.map((identifier) => ({
            id: `id-${identifier}`,
            attributes: { identifier, name: SECRET, seedId: SECRET },
          })),
        });
      if (pathname === `/v1/bundleIds/id-${BUNDLE}/bundleIdCapabilities`)
        return Response.json({
          data: current.map((capabilityType) => ({
            id: SECRET,
            attributes: { capabilityType },
          })),
        });
      if (pathname === `/v1/bundleIds/id-${BUNDLE}/profiles`)
        return Response.json({
          data: [
            ["IOS_APP_ADHOC", "ACTIVE"],
            ["IOS_APP_ADHOC", "ACTIVE"],
            ["IOS_APP_STORE", "INVALID"],
            [SECRET, SECRET],
          ].map(([profileType, profileState]) => ({
            attributes: { profileType, profileState, name: SECRET },
          })),
        });
      if (pathname === "/v1/devices")
        return Response.json({
          data: [{ attributes: { udid: SECRET, name: SECRET } }],
          meta: { paging: { total: 3 } },
        });
      if (pathname === "/v1/bundleIdCapabilities" && method === "POST") {
        current = onPost(current);
        return Response.json({ data: { id: "new" } }, { status: 201 });
      }
      return Response.json(
        { errors: [{ code: "NOT_FOUND" }] },
        { status: 404 },
      );
    };
  }
  const run = (
    command: string,
    fetchImpl = apple(),
    overrides: Record<string, string> = {},
  ) =>
    main(command, env(overrides), fetchImpl, (line: string) =>
      printed.push(line),
    );
  const posts = () => calls.filter(({ method }) => method !== "GET");

  it("reads the state without changing it or naming anything", async () => {
    await run("check");
    expect(printed).toEqual([
      `bundle_id=${BUNDLE}`,
      "capabilities=PUSH_NOTIFICATIONS",
      "associated_domains=off",
      "profiles=IOS_APP_ADHOC/ACTIVE:2,IOS_APP_STORE/INVALID:1,UNKNOWN/UNKNOWN:1",
      "enabled_devices=3",
    ]);
    expect(posts()).toEqual([]);
    expect(fs.existsSync(env().APPLE_KEY_FILE)).toBe(false);
    await run("check", apple({ capabilities: ["ASSOCIATED_DOMAINS"] }));
    expect(printed).toContain("associated_domains=on");
  });

  it("turns on that one capability, for that one identifier, and writes the key", async () => {
    await run("ensure");
    expect(printed).toEqual(["associated_domains=turned on"]);
    expect(posts().map(({ path: at, body }) => ({ at, body }))).toEqual([
      {
        at: "/v1/bundleIdCapabilities",
        body: {
          data: {
            type: "bundleIdCapabilities",
            attributes: { capabilityType: "ASSOCIATED_DOMAINS", settings: [] },
            relationships: {
              bundleId: { data: { type: "bundleIds", id: `id-${BUNDLE}` } },
            },
          },
        },
      },
    ]);
    const file = env().APPLE_KEY_FILE;
    expect(fs.readFileSync(file, "utf8")).toBe(PEM);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("changes nothing when the capability is already on", async () => {
    await run("ensure", apple({ capabilities: ["ASSOCIATED_DOMAINS"] }));
    expect(printed).toEqual(["associated_domains=already on"]);
    expect(posts()).toEqual([]);
    expect(fs.readFileSync(env().APPLE_KEY_FILE, "utf8")).toBe(PEM);
  });

  it.each([
    ["stays off", (list: string[]) => list, "still off"],
    [
      "switches another one off",
      () => ["ASSOCIATED_DOMAINS"],
      "went off: PUSH_NOTIFICATIONS",
    ],
  ])("fails when the capability %s", async (_name, onPost, message) => {
    await expect(run("ensure", apple({ onPost }))).rejects.toThrow(message);
    expect(fs.existsSync(env().APPLE_KEY_FILE)).toBe(false);
  });

  it("never registers an identifier", async () => {
    for (const command of ["check", "ensure"])
      await expect(
        run(command, apple({ identifiers: [`${BUNDLE}.other`] })),
      ).rejects.toThrow("is not registered with Apple");
    expect(posts()).toEqual([]);
  });

  it("reports a refusal by its status and code, not by Apple's text", async () => {
    const refusal = (code: string) =>
      run(
        "ensure",
        apple({
          refuse: {
            "POST /v1/bundleIdCapabilities": [
              403,
              { errors: [{ code, title: SECRET, detail: SECRET }] },
            ],
          },
        }),
      );
    await expect(refusal("FORBIDDEN_ERROR")).rejects.toThrow(
      /^Apple refused: turn Associated Domains on, HTTP 403, FORBIDDEN_ERROR\.$/,
    );
    await expect(refusal(SECRET)).rejects.toThrow(/HTTP 403, UNKNOWN\.$/);
    expect(fs.existsSync(env().APPLE_KEY_FILE)).toBe(false);
  });

  it("does not repeat a network error", async () => {
    await expect(
      run("check", async () => {
        throw new Error(SECRET);
      }),
    ).rejects.toThrow(
      /^Apple could not be reached \(find the app identifier\)\.$/,
    );
  });

  it("signs a short-lived token Apple accepts", async () => {
    await run("check");
    const [head, body, signature] = String(calls[0]?.token).split(".");
    const decode = (part = "") =>
      JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    expect(decode(head)).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
      typ: "JWT",
    });
    const claims = decode(body);
    expect(claims.iss).toBe("issuer-fixture");
    expect(claims.aud).toBe("appstoreconnect-v1");
    expect(claims.exp - claims.iat).toBe(600);
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(String(signature), "base64url"),
      ),
    ).toBe(true);
  });

  it("accepts the key in either stored form and refuses an unreadable one", async () => {
    await run("check", apple(), { ASC_API_KEY_P8: PEM.replace(/\n/g, "\\n") });
    await run("check", apple(), {
      ASC_API_KEY_P8: "",
      ASC_API_KEY_P8_BASE64: Buffer.from(PEM).toString("base64"),
    });
    const requests = calls.length;
    for (const key of ["", "-----BEGIN PRIVATE KEY-----\nbroken"])
      await expect(
        run("check", apple(), { ASC_API_KEY_P8: key }),
      ).rejects.toThrow(/^The App Store Connect API key cannot be read\.$/);
    for (const name of ["ASC_KEY_ID", "ASC_ISSUER_ID"])
      await expect(run("check", apple(), { [name]: " " })).rejects.toThrow(
        "is not configured",
      );
    await expect(run("revoke")).rejects.toThrow("Use check or ensure.");
    expect(calls.length).toBe(requests);
  });
});
