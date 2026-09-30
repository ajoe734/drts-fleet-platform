import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { join } from "node:path";

/** External partner boundary only. Never creates or changes DRTS tables. */
export interface ReceiverScope {
  tenantId: string;
  secret: string;
  secretVersion: number;
  entries: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface InboxRecord {
  tenantId: string;
  entrySlug: string;
  notificationId: string;
  deliveryId: string;
  payloadHash: string;
  receiptId: string;
  committedAt: string;
  // A binding test must never schedule a native notification.
  nativeDelivery: "pending" | "not_applicable";
}

export interface ReceiverReply {
  status: number;
  body: string;
}

/**
 * A single hosted receiver owns this directory. Serialized requests and one
 * atomic, fsynced document commit the dedupe key AND pending native delivery.
 * Reopening the receiver rereads that durable record, never an in-memory map.
 * This models partner acceptance, not APNs/FCM delivery or device receipt.
 */
export class ControlledReceiver {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly scopes: readonly ReceiverScope[],
  ) {}

  handle(
    headers: IncomingHttpHeaders,
    rawBody: Buffer,
  ): Promise<ReceiverReply> {
    const work = this.tail.then(() => this.accept(headers, rawBody));
    this.tail = work.catch(() => undefined);
    return work;
  }

  async records(): Promise<InboxRecord[]> {
    await this.tail;
    return this.readInbox();
  }

  private async readInbox(): Promise<InboxRecord[]> {
    try {
      return JSON.parse(
        await readFile(join(this.directory, "inbox.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async commit(records: InboxRecord[]) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const staging = join(this.directory, `inbox-${randomUUID()}.tmp`);
    const file = await open(staging, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(records));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(staging, join(this.directory, "inbox.json"));
    const directory = await open(this.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async accept(
    headers: IncomingHttpHeaders,
    rawBody: Buffer,
  ): Promise<ReceiverReply> {
    const refuse = (status: number): ReceiverReply => ({ status, body: "{}" });
    const scope = this.scopes.find(
      (s) => s.tenantId === headers["x-drts-tenant-id"],
    );
    const signature = headers["x-drts-webhook-signature"];
    if (!scope || typeof signature !== "string") return refuse(401);
    const parts = /^v=(\d+);t=([^;]+);sig=([a-f0-9]{64})$/.exec(signature);
    if (!parts || Number(parts[1]) !== scope.secretVersion) return refuse(401);
    const timestamp = Date.parse(parts[2]!);
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() - timestamp) > 300_000
    )
      return refuse(401);
    const expected = createHmac("sha256", scope.secret)
      .update(`${parts[2]}.`)
      .update(rawBody)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(parts[3]!, "hex")))
      return refuse(401);

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return refuse(422);
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tenant_id !== scope.tenantId ||
      payload.event !== headers["x-drts-event-type"] ||
      payload.delivery_id !== headers["x-drts-webhook-delivery-id"]
    )
      return refuse(403);
    // Existing endpoint-governance test is status-only, outside partner ack v1.
    if (payload.event === "tenant.webhook.test")
      return { status: 204, body: "" };
    const data = payload.data;
    const test = payload.event === "passenger.notification.test.v1";
    if (
      !data ||
      data.schema_version !== "1.0" ||
      typeof data.notification_id !== "string" ||
      !data.notification_id ||
      typeof payload.delivery_id !== "string" ||
      !payload.delivery_id ||
      ![
        "passenger.notification.test.v1",
        "passenger.assignment_disclosure_ready.v1",
        "passenger.assignment_replaced.v1",
        "passenger.eta_changed.v1",
        "passenger.driver_arrived.v1",
        "passenger.receipt_ready.v1",
      ].includes(payload.event)
    )
      return refuse(422);
    const recipients = scope.entries.get(data.partner_entry_slug);
    if (!recipients) return refuse(403);
    if (!test && !recipients.has(data.recipient?.partner_user_ref))
      return refuse(422);

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    try {
      const records = await this.readInbox();
      let record = records.find(
        (r) =>
          r.tenantId === scope.tenantId &&
          r.entrySlug === data.partner_entry_slug &&
          r.notificationId === data.notification_id,
      );
      const duplicate = record !== undefined;
      if (record && record.payloadHash !== payloadHash) return refuse(409);
      if (!record) {
        record = {
          tenantId: scope.tenantId,
          entrySlug: data.partner_entry_slug,
          notificationId: data.notification_id,
          deliveryId: payload.delivery_id,
          payloadHash,
          receiptId: `controlled-${randomUUID()}`,
          committedAt: new Date().toISOString(),
          nativeDelivery: test ? "not_applicable" : "pending",
        };
        await this.commit([...records, record]);
      }
      return {
        status: 202,
        body: JSON.stringify({
          schema_version: "1.0",
          notification_id: record.notificationId,
          delivery_id: record.deliveryId,
          partner_entry_slug: record.entrySlug,
          receipt_id: record.receiptId,
          status: duplicate ? "duplicate" : "accepted",
        }),
      };
    } catch {
      // Includes fsync/read/rename failure: acceptance must never precede durability.
      return refuse(503);
    }
  }
}
