import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
const { ExpressAdapter } = apiRequire("@nestjs/platform-express");
const completionPath =
  "/api/driver/tasks/00000000-0000-4000-8000-000000000001/complete";
const smallImage =
  "apps/driver-app/android/app/src/main/res/drawable-mdpi/splashscreen_logo.png";
const images = [
  "docs/04-uat/dev-environment-loop-20260617/screenshots/01-driver-cockpit-dev.png",
  "docs/04-uat/dev-environment-loop-20260617/screenshots/02-driver-jobs-dev.png",
  "docs/04-uat/dev-environment-loop-20260617/screenshots/03-ops-console-dispatch-dev.png",
  "docs/04-uat/driver-app-verification-20260615/screens/r3-trip-on-trip.png",
  "docs/04-uat/driver-app-verification-20260615/screens/r3-location-permission.png",
];
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

function parsedPhotoHashes(body: unknown) {
  if (body === null || typeof body !== "object" || !("proof" in body))
    return [];
  const proof = body.proof;
  if (
    proof === null ||
    typeof proof !== "object" ||
    !("photos" in proof) ||
    !Array.isArray(proof.photos)
  )
    return [];
  return proof.photos.map((photo: unknown) =>
    typeof photo === "string" ? hash(Buffer.from(photo, "base64")) : null,
  );
}

async function parseOrdinaryRequest(
  imagePaths: string[],
  method = "POST",
  url = completionPath,
) {
  const photos = imagePaths.map((relative) =>
    readFileSync(path.join(root, relative)),
  );
  for (const photo of photos) {
    expect(photo.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(photo.length).toBeLessThanOrEqual(600 * 1024);
  }
  const command = {
    completedAt: "2026-10-29T15:00:00.000Z",
    actualDistanceKm: 2.4,
    actualDurationSec: 360,
    proof: { photos: photos.map((photo) => photo.toString("base64")) },
  };
  const bytes = Buffer.from(JSON.stringify(command));
  const adapter = new ExpressAdapter();
  const middlewarePath = path.join(
    root,
    "apps/api/src/common/driver-completion-json.middleware.ts",
  );
  // The accepted predecessor has no registration/helper. Keep that actual
  // normal stack runnable for the same behavioral RED, without a fake export.
  if (existsSync(middlewarePath)) {
    const middleware = await import(middlewarePath);
    middleware.registerDriverCompletionJsonMiddleware(adapter);
  }
  adapter.registerParserMiddleware("/api", false);
  const layers = adapter.getInstance().router.stack;
  let hasOriginalJSONParser = false;
  let hasOriginalURLEncodedParser = false;
  for (const layer of layers) {
    if (layer.handle.name === "jsonParser") hasOriginalJSONParser = true;
    if (layer.handle.name === "urlencodedParser")
      hasOriginalURLEncodedParser = true;
  }
  expect(hasOriginalJSONParser).toBe(true);
  expect(hasOriginalURLEncodedParser).toBe(true);

  const request: Readable & {
    method: string;
    url: string;
    originalUrl: string;
    path: string;
    headers: Record<string, string>;
    complete: boolean;
    socket: PassThrough;
    body?: unknown;
  } = Object.assign(Readable.from([bytes], { objectMode: false }), {
    method,
    url,
    originalUrl: url,
    path: new URL(url, "https://driver.invalid").pathname,
    complete: false,
    socket: new PassThrough(),
    headers: {
      "content-type": "application/json",
      "content-length": String(bytes.length),
    },
  });
  // Real IncomingMessage marks completion when its readable body ends. This
  // in-memory transport port keeps that lifecycle so later default parsers skip
  // a body already consumed by the scoped parser, without any actual socket.
  request.once("end", () => {
    request.complete = true;
  });
  const responsePort = { statusCode: 200 };
  let error: unknown = null;
  for (const layer of layers) {
    error = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Parser next callback was not observed")),
        1000,
      );
      try {
        layer.handle(request, responsePort, (failure?: unknown) => {
          clearTimeout(timer);
          resolve(failure ?? null);
        });
      } catch (failure) {
        clearTimeout(timer);
        reject(failure);
      }
    });
    if (error) break;
  }
  return {
    error,
    controllerDispatchPortCalls: error ? 0 : 1,
    originalPhotoHashes: photos.map(hash),
    parsedPhotoHashes: parsedPhotoHashes(request.body),
    JSONBytes: bytes.length,
  };
}

describe("ordinary Driver completion JSON photo transport", () => {
  it("keeps the existing small-image completion bytes", async () => {
    const result = await parseOrdinaryRequest([smallImage]);
    expect(result.error).toBeNull();
    expect(result.controllerDispatchPortCalls).toBe(1);
    expect(result.parsedPhotoHashes).toEqual(result.originalPhotoHashes);
  });

  it("accepts a legal existing larger image, including the original trailing slash and query", async () => {
    const result = await parseOrdinaryRequest(
      [images[0]!],
      "POST",
      `${completionPath}/?source=proof-control`,
    );
    expect(result.JSONBytes).toBeGreaterThan(100 * 1024);
    expect(result.error).toBeNull();
    expect(result.controllerDispatchPortCalls).toBe(1);
    expect(result.parsedPhotoHashes).toEqual(result.originalPhotoHashes);
  });

  it("accepts the original maximum of five real existing image fixtures unchanged", async () => {
    const result = await parseOrdinaryRequest(images);
    expect(result.JSONBytes).toBeGreaterThan(100 * 1024);
    expect(result.error).toBeNull();
    expect(result.controllerDispatchPortCalls).toBe(1);
    expect(result.parsedPhotoHashes).toEqual(result.originalPhotoHashes);
    expect(result.parsedPhotoHashes).toHaveLength(5);
  });

  it("keeps the original JSON limit for another POST path", async () => {
    const result = await parseOrdinaryRequest(
      [images[0]!],
      "POST",
      "/api/orders/unrelated",
    );
    expect(result.error).toMatchObject({
      status: 413,
      type: "entity.too.large",
      limit: 100 * 1024,
    });
    expect(result.controllerDispatchPortCalls).toBe(0);
  });

  it("keeps the original JSON limit for the same path with another method", async () => {
    const result = await parseOrdinaryRequest([images[0]!], "PATCH");
    expect(result.error).toMatchObject({
      status: 413,
      type: "entity.too.large",
      limit: 100 * 1024,
    });
    expect(result.controllerDispatchPortCalls).toBe(0);
  });

  it("keeps the original JSON limit for an extra child path", async () => {
    const result = await parseOrdinaryRequest(
      [images[0]!],
      "POST",
      `${completionPath}/extra`,
    );
    expect(result.error).toMatchObject({
      status: 413,
      type: "entity.too.large",
      limit: 100 * 1024,
    });
    expect(result.controllerDispatchPortCalls).toBe(0);
  });
});
