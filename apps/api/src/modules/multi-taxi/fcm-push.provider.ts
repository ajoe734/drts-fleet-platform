import { Injectable } from "@nestjs/common";
import type { FirstPartyPushMessage } from "@drts/contracts";
import type {
  FirstPartyPushProvider,
  FirstPartyPushDeviceTarget,
  FirstPartyPushProviderResult,
} from "./first-party-notification.transport";
import type { GoogleCloudTokens } from "../../common/google-cloud/google-cloud-object-client";
import {
  GoogleMetadataTokens,
  readCloudBody,
  withCloudDeadline,
} from "../../common/google-cloud/google-cloud-object-client";

const RESPONSE_LIMIT = 16 * 1024;
const FCM_ERROR = "type.googleapis.com/google.firebase.fcm.v1.FcmError";
const BAD_REQUEST = "type.googleapis.com/google.rpc.BadRequest";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function retryAfterSeconds(
  value: string | null,
  now: number,
): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - now) / 1000))
    : undefined;
}

/** No raw provider text, token, credential or exception is returned or logged. */
@Injectable()
export class FcmFirstPartyPushProvider implements FirstPartyPushProvider {
  constructor(
    private readonly tokens: GoogleCloudTokens = new GoogleMetadataTokens(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  isConfigured(): boolean {
    return (
      process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED === "true" &&
      /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(
        process.env.PASSENGER_PUSH_FCM_PROJECT_ID ?? "",
      )
    );
  }

  async send(
    message: FirstPartyPushMessage,
    target: FirstPartyPushDeviceTarget,
  ): Promise<FirstPartyPushProviderResult> {
    if (!this.isConfigured()) return { kind: "configuration_blocked" };
    const projectId = process.env.PASSENGER_PUSH_FCM_PROJECT_ID!;
    const expiresAt = Date.parse(message.data.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt - this.now() < 1000) {
      return { kind: "internal_error" };
    }
    try {
      return await withCloudDeadline(10_000, async (signal) => {
        const accessToken = await this.tokens.accessToken(signal);
        // Metadata acquisition can consume the remaining TTL. Never send an
        // already-expired message; both platform expiries use this context.
        const ttl = Math.floor((expiresAt - this.now()) / 1000);
        if (ttl < 1) return { kind: "internal_error" };
        const response = await this.fetchImpl(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            redirect: "error",
            signal,
            body: JSON.stringify({
              message: {
                token: target.token,
                notification: message.notification,
                // Rebuild the allowlist even if a runtime caller supplies extra keys.
                data: {
                  notification_id: message.data.notification_id,
                  event: message.data.event,
                  ride_ref: message.data.ride_ref,
                  event_sequence: message.data.event_sequence,
                  expires_at: message.data.expires_at,
                },
                android: {
                  ttl: `${ttl}s`,
                  collapse_key: message.data.ride_ref,
                },
                apns: {
                  headers: {
                    "apns-expiration": String(Math.floor(expiresAt / 1000)),
                    "apns-collapse-id": message.data.ride_ref,
                  },
                },
              },
            }),
          },
        );
        const delay = retryAfterSeconds(
          response.headers.get("Retry-After"),
          this.now(),
        );
        let body: Record<string, unknown> = {};
        try {
          body = record(
            JSON.parse(
              (await readCloudBody(response, RESPONSE_LIMIT, signal)).toString(
                "utf8",
              ),
            ),
          );
        } catch {
          // readCloudBody cancels/releases the stream on every path. Non-JSON
          // transient/credential responses retain their safe HTTP classification.
          if (response.ok) return { kind: "internal_error" };
        }
        if (response.ok) {
          const name = body.name;
          const prefix = `projects/${projectId}/messages/`;
          if (
            typeof name !== "string" ||
            !name.startsWith(prefix) ||
            !/^[A-Za-z0-9_%:.-]+$/.test(name.slice(prefix.length)) ||
            (target.token.length > 0 && name.includes(target.token)) ||
            (accessToken.length > 0 && name.includes(accessToken))
          ) {
            return { kind: "internal_error" };
          }
          return { kind: "accepted", messageId: name };
        }
        const error = record(body.error);
        const details = Array.isArray(error.details)
          ? error.details.map(record)
          : [];
        const codes = details
          .filter((d) => d["@type"] === FCM_ERROR)
          .map((d) => d.errorCode);
        const tokenViolation = details.some(
          (d) =>
            d["@type"] === BAD_REQUEST &&
            Array.isArray(d.fieldViolations) &&
            d.fieldViolations.some((v) => record(v).field === "message.token"),
        );
        const payloadViolation = details.some(
          (d) => d["@type"] === BAD_REQUEST && Array.isArray(d.fieldViolations) &&
            d.fieldViolations.some((v) => typeof record(v).field === "string" && record(v).field !== "message.token"),
        );
        // Credential failure takes precedence; never revoke tokens on APNs/auth
        // or a generic payload BadRequest. Only typed token errors are invalid.
        if (
          response.status === 401 ||
          codes.includes("THIRD_PARTY_AUTH_ERROR")
        ) {
          return { kind: "credential_rejected" };
        }
        if (
          (response.status === 404 && codes.includes("UNREGISTERED")) ||
          (response.status === 403 && codes.includes("SENDER_ID_MISMATCH")) ||
          (response.status === 400 && !payloadViolation &&
            (codes.includes("INVALID_ARGUMENT") || tokenViolation))
        ) {
          return { kind: "invalid" };
        }
        if (response.status === 403) return { kind: "credential_rejected" };
        if ([429, 500, 503].includes(response.status)) {
          return delay === undefined
            ? { kind: "transient" }
            : { kind: "transient", retryAfterSeconds: delay };
        }
        if ([400, 404].includes(response.status))
          return { kind: "internal_error" };
        return { kind: "transient" };
      });
    } catch {
      return { kind: "transient" };
    }
  }
}
