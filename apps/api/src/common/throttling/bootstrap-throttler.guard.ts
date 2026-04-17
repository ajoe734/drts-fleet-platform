import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

function firstHeaderValue(header: unknown): string | null {
  if (typeof header === "string") {
    const value = header.trim();
    return value.length > 0 ? value : null;
  }

  if (Array.isArray(header)) {
    for (const item of header) {
      if (typeof item !== "string") {
        continue;
      }

      const value = item.trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function hashInternalKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

@Injectable()
export class BootstrapThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const identity = req.identity as
      | {
          realm?: string;
          actorType?: string;
          actorId?: string;
          tenantId?: string | null;
        }
      | undefined;

    if (identity?.actorId) {
      return [
        "actor",
        identity.realm ?? "unknown",
        identity.actorType ?? "unknown",
        identity.actorId,
      ].join(":");
    }

    const tenantId = firstHeaderValue(req.headers?.["x-tenant-id"]);
    const internalKey = firstHeaderValue(req.headers?.["x-drts-internal-key"]);
    if (internalKey) {
      return `internal:${tenantId ?? "global"}:${hashInternalKey(internalKey)}`;
    }

    const forwardedFor = firstHeaderValue(req.headers?.["x-forwarded-for"]);
    if (forwardedFor) {
      const clientIp = forwardedFor.split(",")[0]?.trim();
      if (clientIp) {
        return `ip:${clientIp}`;
      }
    }

    if (typeof req.ip === "string" && req.ip.trim().length > 0) {
      return `ip:${req.ip.trim()}`;
    }

    return "ip:unknown";
  }
}
