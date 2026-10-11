import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { FacebookDataDeletionResponse } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { PassengerAccountStore } from "../account/passenger-account.port";
import { PassengerAccountRepository } from "../account/passenger-account.repository";
import { resolveOAuthProviderConfig } from "./oauth-provider.config";

function invalidRequest(): never {
  throw new ApiRequestError(
    400,
    "invalid_signed_request",
    "Invalid Facebook signed request.",
  );
}
function secret(): string {
  const config = resolveOAuthProviderConfig("facebook");
  if (!config)
    throw new ApiRequestError(
      400,
      "unsupported_provider",
      "Facebook is not configured.",
    );
  return config.clientSecret;
}
function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) invalidRequest();
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) invalidRequest();
  return decoded;
}
export function verifyFacebookSignedRequest(
  raw: unknown,
  appSecret: string,
): string {
  if (typeof raw !== "string" || raw.length > 16_384) invalidRequest();
  const parts = raw.split(".");
  if (parts.length !== 2) invalidRequest();
  const signature = decode(parts[0]!);
  const expected = createHmac("sha256", appSecret).update(parts[1]!).digest();
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    invalidRequest();
  let data: unknown;
  try {
    data = JSON.parse(decode(parts[1]!).toString("utf8"));
  } catch {
    invalidRequest();
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    invalidRequest();
  const payload = data as Record<string, unknown>;
  if (
    payload.algorithm !== "HMAC-SHA256" ||
    typeof payload.user_id !== "string" ||
    !/^[0-9]{1,128}$/.test(payload.user_id)
  )
    invalidRequest();
  return payload.user_id;
}

/** Domain-separated, anonymous signed completion receipt. No in-memory job
 * map or user data. It is issued only after the DB transaction commits. */
function signReceipt(nonce: string, appSecret: string): string {
  return createHmac("sha256", appSecret)
    .update(`facebook-deletion-completed:${nonce}`)
    .digest("hex");
}
function statusOrigin(): string {
  const raw = process.env.FACEBOOK_DATA_DELETION_STATUS_ORIGIN?.trim();
  if (!raw)
    throw new ApiRequestError(
      503,
      "unavailable",
      "Deletion status origin is not configured.",
    );
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("invalid origin");
    return url.origin;
  } catch {
    throw new ApiRequestError(
      503,
      "unavailable",
      "Deletion status origin must be an HTTPS API origin.",
    );
  }
}

@Injectable()
export class FacebookDataDeletionService {
  constructor(
    @Inject(PassengerAccountRepository)
    private readonly accounts: PassengerAccountStore,
  ) {}

  async delete(raw: unknown): Promise<FacebookDataDeletionResponse> {
    const appSecret = secret();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalidRequest();
    const userId = verifyFacebookSignedRequest(
      (raw as Record<string, unknown>).signed_request,
      appSecret,
    );
    const origin = statusOrigin(); // Validate before deleting anything.
    await this.accounts.transaction(async (tx) => {
      // Same lock order as login/link: serialize identity creation and removal.
      await tx.lockIdentity("facebook", userId);
      const initial = await tx.findIdentity("facebook", userId);
      if (!initial) return; // Idempotent, without disclosing account existence.
      const account = await tx.lockAccount(initial.drtsPassengerId);
      const current = await tx.findIdentity("facebook", userId);
      if (!account || current?.identityId !== initial.identityId) return;
      const identities = await tx.listIdentities(account.drtsPassengerId);
      const now = new Date().toISOString();
      // Revoke sessions even if another login remains: FB-origin sessions must
      // not retain authority after provider deletion (session rows lack provider).
      await tx.revokeAll(account.drtsPassengerId, now, "facebook_data_deleted");
      if (identities.length <= 1) {
        await tx.anonymize(account.drtsPassengerId, now);
      } else {
        await tx.removeIdentity(account.drtsPassengerId, initial.identityId);
      }
    });
    const nonce = randomBytes(24).toString("hex");
    const confirmationCode = `${nonce}${signReceipt(nonce, appSecret)}`;
    return {
      url: `${origin}/api/passenger-app/auth/facebook/data-deletion/status/${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  }

  status(code: string): { confirmation_code: string; status: "completed" } {
    const appSecret = secret();
    const notFound = () =>
      new ApiRequestError(404, "not_found", "Deletion confirmation not found.");
    if (!/^[0-9a-f]{112}$/.test(code)) throw notFound();
    const actual = Buffer.from(code.slice(48), "hex");
    const expected = Buffer.from(
      signReceipt(code.slice(0, 48), appSecret),
      "hex",
    );
    if (!timingSafeEqual(actual, expected)) throw notFound();
    return { confirmation_code: code, status: "completed" };
  }
}
