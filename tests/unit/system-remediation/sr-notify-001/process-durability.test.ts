import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, expect, it } from "vitest";

import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";

const apiRequire = createRequire(resolve("apps/api/package.json"));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function worker(directory: string, mode: string) {
  return spawn(
    process.execPath,
    [
      "--import",
      apiRequire.resolve("tsx"),
      resolve(
        "tests/unit/system-remediation/sr-notify-001/durability-worker.ts",
      ),
      directory,
      mode,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function directory() {
  const path = await mkdtemp(`${tmpdir()}/sr-notify-process-`);
  directories.push(path);
  return path;
}

it("should_dedupe_enqueues_from_separate_node_processes", async () => {
  const path = await directory();
  const results = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const child = worker(path, "enqueue");
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.resume();
      const [code] = await once(child, "exit");
      expect(code).toBe(0);
      return JSON.parse(output) as { deliveryId: string };
    }),
  );
  expect(new Set(results.map((result) => result.deliveryId)).size).toBe(1);
  const stored = await new FileMailOutbox(path).transaction((state) =>
    Object.values(state.deliveries),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]?.receipt.status).toBe("queued");
}, 20_000);

it("should_recover_durable_attempt_after_the_worker_is_sigkilled", async () => {
  const path = await directory();
  const child = worker(path, "crash");
  child.stderr.resume();
  const exited = once(child, "exit");
  let deliveryId: string;
  try {
    const message = await new Promise<string>((resolveMessage, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("worker did not claim")),
        10_000,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("\n")) {
          clearTimeout(timer);
          resolveMessage(output);
        }
      });
    });
    deliveryId = (JSON.parse(message) as { claimed: string }).claimed;
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
  const store = new FileMailOutbox(path);
  const before = await store.transaction(
    (state) => state.deliveries[deliveryId],
  );
  expect(before?.receipt.attempts[0]?.outcome).toBe("started");
  const resumed = new NotificationDeliveryService(
    store,
    {
      provider: "controlled-recovery-transport",
      send: async (message) => {
        expect(message.messageId).toBe(before?.message.messageId);
        return {
          provider: "controlled-recovery-transport",
          response: "controlled recovery acknowledgement",
          providerMessageId: null,
          acceptedAt: new Date().toISOString(),
        };
      },
    },
    { now: () => new Date(Date.now() + 10_000) },
  );
  const [receipt] = await resumed.drain();
  expect(receipt?.status).toBe("sent");
  expect(receipt?.attempts.map((attempt) => attempt.outcome)).toEqual([
    "uncertain",
    "sent",
  ]);
  expect(receipt?.attempts[0]?.errorCode).toBe("delivery_outcome_unknown");
}, 20_000);
