import { Injectable, Logger } from "@nestjs/common";
import { FirstPartyPushProvider, FirstPartyPushDeviceTarget, FirstPartyPushProviderResult } from "./first-party-notification.transport";
import { FirstPartyPushMessage } from "@drts/contracts";
import { GoogleCloudTokens, GoogleMetadataTokens, withCloudDeadline } from "../../common/google-cloud/google-cloud-object-client";

@Injectable()
export class FcmFirstPartyPushProvider implements FirstPartyPushProvider {
  private readonly logger = new Logger(FcmFirstPartyPushProvider.name);
  
  constructor(
    private readonly tokens: GoogleCloudTokens = new GoogleMetadataTokens(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return !!process.env.PASSENGER_PUSH_FCM_PROJECT_ID;
  }

  async send(message: FirstPartyPushMessage, target: FirstPartyPushDeviceTarget): Promise<FirstPartyPushProviderResult> {
    const projectId = process.env.PASSENGER_PUSH_FCM_PROJECT_ID;
    if (!projectId) {
      return { kind: "configuration_blocked" };
    }

    const payload = {
      message: {
        token: target.token,
        notification: message.notification,
        data: message.data,
        android: {
          ttl: "86400s",
          collapse_key: (message.data as any).ride_ref || (message.data as any).rideRef,
        },
        apns: {
          headers: {
            "apns-expiration": String(Math.floor(Date.parse((message.data as any).expires_at || (message.data as any).expiresAt) / 1000)),
            "apns-collapse-id": (message.data as any).ride_ref || (message.data as any).rideRef,
          }
        }
      }
    };

    try {
      return await withCloudDeadline(10000, async (signal) => {
        const token = await this.tokens.accessToken(signal);
        
        const res = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal,
          redirect: "error",
        });

        if (res.ok) {
          const body = (await res.json()) as any;
          if (body.name) {
            return { kind: "accepted", messageId: body.name };
          }
          return { kind: "internal_error" };
        }

        const status = res.status;
        if (status === 401 || status === 403) {
          // SD mentions: 403 SENDER_ID_MISMATCH is INVALID_ARGUMENT (invalid token), but generic 403 or THIRD_PARTY_AUTH_ERROR is credential_rejected.
          // Wait, actually 404 UNREGISTERED, 400 INVALID_ARGUMENT, 403 SENDER_ID_MISMATCH -> invalid.
          const errorBody = (await res.json().catch(() => ({}))) as any;
          const errorCode = errorBody.error?.status || "";
          const errorMessage = errorBody.error?.message || "";
          if (errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT" || errorMessage.includes("SENDER_ID_MISMATCH")) {
            return { kind: "invalid" };
          }
          if (status === 401 || errorCode === "THIRD_PARTY_AUTH_ERROR") {
            return { kind: "credential_rejected" };
          }
          return { kind: "credential_rejected" };
        }
        
        if (status === 404) {
          return { kind: "invalid" };
        }
        
        if (status === 429 || status === 500 || status === 503) {
          const retryAfter = res.headers.get("Retry-After");
          let retryAfterSeconds: number | undefined;
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) retryAfterSeconds = parsed;
          }
          if (retryAfterSeconds !== undefined) {
            return { kind: "transient", retryAfterSeconds };
          }
          return { kind: "transient" };
        }
        
        if (status === 400) {
          return { kind: "invalid" };
        }
        
        return { kind: "transient" };
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("timed out")) {
        return { kind: "transient" };
      }
      return { kind: "transient" };
    }
  }
}
