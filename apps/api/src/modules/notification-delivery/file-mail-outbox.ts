import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type { MailOutbox, OutboxState } from "./notification-delivery.types";

/**
 * A private durable spool for a single host / shared local POSIX volume.
 * All writers must use this repository. Linux flock supplies crash-released
 * process locks; atomic rename + file and directory fsync commit each change.
 * No in-memory fallback, implicit temp directory, NFS or multi-host guarantee.
 */
export class FileMailOutbox implements MailOutbox {
  constructor(
    private readonly directory: string,
    private readonly lockTimeoutMs = 5_000,
  ) {
    if (!isAbsolute(directory)) {
      throw new Error("notification_outbox_requires_absolute_directory");
    }
    if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1) {
      throw new Error("notification_outbox_invalid_lock_timeout");
    }
  }

  async transaction<T>(operation: (state: OutboxState) => T): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const release = await this.acquireLock();
    try {
      const path = join(this.directory, "outbox.json");
      let state: OutboxState;
      try {
        state = JSON.parse(await readFile(path, "utf8")) as OutboxState;
        this.validate(state);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new Error("notification_outbox_corrupt_or_unreadable", {
            cause: error,
          });
        }
        state = { version: 1, deliveries: {} };
      }
      const before = JSON.stringify(state);
      const result = operation(state);
      // Async callbacks would release the lock before their changes finish.
      if (result instanceof Promise) {
        throw new Error("notification_outbox_requires_synchronous_transaction");
      }
      this.validate(state);
      const after = JSON.stringify(state);
      if (before !== after) await this.commit(path, after);
      return structuredClone(result);
    } finally {
      await release();
    }
  }

  private validate(state: OutboxState) {
    if (
      !state ||
      state.version !== 1 ||
      !state.deliveries ||
      typeof state.deliveries !== "object" ||
      Array.isArray(state.deliveries)
    ) {
      throw new Error("notification_outbox_invalid_format");
    }
    for (const [id, delivery] of Object.entries(state.deliveries)) {
      const receipt = delivery?.receipt;
      if (
        !receipt ||
        receipt.deliveryId !== id ||
        delivery.message?.deliveryId !== id ||
        typeof delivery.payloadHash !== "string" ||
        !["queued", "sent", "failed"].includes(receipt.status) ||
        !Array.isArray(receipt.attempts) ||
        (receipt.status === "sent" &&
          (!receipt.sentAt ||
            !receipt.attempts.some(
              (attempt) =>
                attempt.outcome === "sent" && attempt.acknowledgement?.response,
            )))
      ) {
        throw new Error("notification_outbox_invalid_record");
      }
    }
  }

  private async commit(path: string, content: string) {
    const temporary = join(this.directory, `.outbox-${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(content, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
      const directory = await open(this.directory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  private acquireLock(): Promise<() => Promise<void>> {
    // No shell, user interpolation, PID files or stale-lock deletion races.
    // The helper exits on stdin EOF, including when the parent crashes.
    const child = spawn(
      "flock",
      [
        "--exclusive",
        "--timeout",
        String(this.lockTimeoutMs / 1_000),
        join(this.directory, "outbox.lock"),
        process.execPath,
        "-e",
        'process.stdout.write("locked\\n"); process.stdin.resume();',
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const closed = new Promise<void>((resolve) => child.once("close", resolve));
    return new Promise((resolve, reject) => {
      let acquired = false;
      const deadline = setTimeout(() => {
        child.stdin.end();
        child.kill();
        reject(new Error("notification_outbox_lock_timeout"));
      }, this.lockTimeoutMs + 1_000);
      child.once("error", () => {
        clearTimeout(deadline);
        reject(new Error("notification_outbox_lock_unavailable"));
      });
      child.once("close", () => {
        clearTimeout(deadline);
        if (!acquired)
          reject(new Error("notification_outbox_lock_unavailable"));
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (!acquired && output === "locked\n") {
          acquired = true;
          clearTimeout(deadline);
          resolve(async () => {
            child.stdin.end();
            await closed;
          });
        }
      });
      // Do not surface path / runtime stderr in receipts or product logs.
      child.stderr.resume();
      child.stdin.on("error", () => undefined);
    });
  }
}
