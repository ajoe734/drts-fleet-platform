import { Injectable } from "@nestjs/common";
import type {
  FirstPartyPushProvider,
  FirstPartyPushDeviceTarget,
  FirstPartyPushProviderResult,
} from "./first-party-notification.transport";
import type { FirstPartyPushMessage } from "@drts/contracts";
import type { GoogleCloudTokens } from "../../common/google-cloud/google-cloud-object-client";
import {
  GoogleMetadataTokens,
  withCloudDeadline,
  readCloudBody,
} from "../../common/google-cloud/google-cloud-object-client";

const MAX_RESPONSE_BYTES = 16 * 1024;
const FCM_ERROR_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError";
const BAD_REQUEST_TYPE = "type.googleapis.com/google.rpc.BadRequest";
const SAFE_CODES = new Set([
  "UNREGISTERED",
  "INVALID_ARGUMENT",
  "SENDER_ID_MISMATCH",
  "THIRD_PARTY_AUTH_ERROR",
  "QUOTA_EXCEEDED",
  "UNAVAILABLE",
  "INTERNAL",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "RESOURCE_EXHAUSTED",
]);

@Injectable()
export class FcmFirstPartyPushProvider implements FirstPartyPushProvider {
  // MultiTaxiModule constructs this via a factory: interfaces are not Nest tokens.
  constructor(
    private readonly tokens: GoogleCloudTokens = new GoogleMetadataTokens(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return (
      process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED === "true" &&
      /^[a-zA-Z0-9-]+$/.test(process.env.PASSENGER_PUSH_FCM_PROJECT_ID ?? "")
    );
  }

  async send(
    message: FirstPartyPushMessage,
    target: FirstPartyPushDeviceTarget,
  ): Promise<FirstPartyPushProviderResult> {
    if (!this.isConfigured()) return { kind: "configuration_blocked" };
    const projectId = process.env.PASSENGER_PUSH_FCM_PROJECT_ID!;
    try {
      return await withCloudDeadline(10000, async (signal) => {
        const expiresAt = Date.parse(message.data.expires_at);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
          return { kind: "expired" };
        const token = await this.tokens.accessToken(signal);
        // Metadata lookup consumes the same deadline and TTL budget as FCM IO.
        const ttl = Math.floor((expiresAt - Date.now()) / 1000);
        if (ttl <= 0) return { kind: "expired" };
        const data = message.data;
        const payload = {
          message: {
            token: target.token,
            notification: { title: "乘車通知", body: "請查看最新乘車資訊" },
            data: {
              notification_id: data.notification_id,
              event: data.event,
              ride_ref: data.ride_ref,
              event_sequence: data.event_sequence,
              expires_at: data.expires_at,
            },
            android: { ttl: `${ttl}s`, collapse_key: data.ride_ref },
            apns: {
              headers: {
                "apns-expiration": String(Math.floor(expiresAt / 1000)),
                "apns-collapse-id": data.ride_ref,
              },
            },
          },
        };
        const response = await this.fetchImpl(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal,
            redirect: "error",
          },
        );
        const body = await readCloudBody(response, MAX_RESPONSE_BYTES, signal)
          .then((bytes) => JSON.parse(bytes.toString("utf8")))
          .catch(() => null);
        if (response.status === 200) {
          const name: unknown = body?.name;
          return typeof name === "string" &&
            name.length <= 1024 &&
            !name.includes(target.token) &&
            /^projects\/[A-Za-z0-9-]+\/messages\/[A-Za-z0-9%_:.-]+$/.test(name)
            ? { kind: "accepted", messageId: name }
            : { kind: "internal_error" };
        }
        const error = body?.error;
        const details: any[] = Array.isArray(error?.details)
          ? error.details
          : [];
        const fcmCode = details.find(
          (d) => d?.["@type"] === FCM_ERROR_TYPE,
        )?.errorCode;
        const rawCode = fcmCode ?? error?.status;
        // Never persist provider text, arbitrary error codes, or echoed tokens.
        const errorCode = SAFE_CODES.has(rawCode)
          ? (rawCode as string)
          : `HTTP_${response.status}`;
        const fields = details
          .filter((d) => d?.["@type"] === BAD_REQUEST_TYPE)
          .flatMap((d) =>
            Array.isArray(d.fieldViolations) ? d.fieldViolations : [],
          );
        const payloadError = fields.some((f) => f?.field !== "message.token");
        const tokenError = fields.length > 0 && !payloadError;
        if (
          fcmCode === "UNREGISTERED" ||
          fcmCode === "SENDER_ID_MISMATCH" ||
          (response.status === 404 && error?.status === "UNREGISTERED") ||
          (response.status === 400 &&
            !payloadError &&
            (fcmCode === "INVALID_ARGUMENT" || tokenError))
        ) {
          return { kind: "invalid", errorCode };
        }
        if (
          response.status === 401 ||
          response.status === 403 ||
          fcmCode === "THIRD_PARTY_AUTH_ERROR"
        ) {
          return { kind: "credential_rejected", errorCode };
        }
        if ([400, 404].includes(response.status))
          return { kind: "configuration_blocked", errorCode };
        const header = response.headers.get("Retry-After");
        let retryAfterSeconds: number | undefined;
        if (header) {
          const delay = /^\d+$/.test(header)
            ? Number(header)
            : Math.ceil((Date.parse(header) - Date.now()) / 1000);
          if (Number.isFinite(delay) && delay >= 0) retryAfterSeconds = delay;
        }
        if (response.status === 429)
          retryAfterSeconds = Math.max(60, retryAfterSeconds ?? 0);
        return {
          kind: "transient",
          errorCode,
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        };
      });
    } catch {
      return { kind: "transient", errorCode: "TRANSPORT_ERROR" };
    }
  }
}
