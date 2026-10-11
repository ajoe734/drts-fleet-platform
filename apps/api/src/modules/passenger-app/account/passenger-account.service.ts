import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthProvider,
  PassengerLoginIdentity,
  RefreshSessionResponse,
  UpdatePassengerMeCommand,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type {
  PassengerRequestIdentity,
  RequestIdentity,
} from "../../../common/auth/auth.types";
import { PassengerJwtService } from "../../../common/auth/passenger-jwt.service";
import { PassengerAccountRepository } from "./passenger-account.repository";
import type {
  AccountRecord,
  PassengerAccountStore,
  PassengerAccountTransaction,
  SessionRecord,
} from "./passenger-account.port";

export interface VerifiedPassengerAttributes {
  displayName?: string;
  verifiedPhone?: string;
  verifiedEmail?: string;
}
const PROVIDERS = new Set<AuthProvider>([
  "phone",
  "email",
  "google",
  "facebook",
  "line",
]);
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const PHONE = /^\+?[0-9]{8,15}$/;
function hasControlCharacters(value: string) {
  return [...value].some((char) => char.charCodeAt(0) < 32);
}
function unauthorized(): never {
  throw new ApiRequestError(
    401,
    "unauthorized",
    "An active passenger session is required.",
  );
}
function invalidGrant(): never {
  throw new ApiRequestError(
    401,
    "invalid_grant",
    "Refresh credential is invalid or expired.",
  );
}
function validation(): never {
  throw new ApiRequestError(
    400,
    "validation_error",
    "Invalid passenger account fields.",
  );
}
function identityKey(provider: AuthProvider, subject: string) {
  if (
    !PROVIDERS.has(provider) ||
    typeof subject !== "string" ||
    !subject.length ||
    subject.length > 512 ||
    hasControlCharacters(subject)
  )
    validation();
  if (provider === "phone" && !PHONE.test(subject)) validation();
  if (
    provider === "email" &&
    (subject.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(subject))
  )
    validation();
  // Identity subject canonicalization belongs to the verified OTP/OAuth adapter.
}
function attributes(a: VerifiedPassengerAttributes) {
  if (
    !a ||
    typeof a !== "object" ||
    Array.isArray(a) ||
    Object.keys(a).some(
      (k) => !["displayName", "verifiedPhone", "verifiedEmail"].includes(k),
    )
  )
    validation();
  if (
    a.displayName !== undefined &&
    (typeof a.displayName !== "string" ||
      !a.displayName.trim() ||
      a.displayName.length > 100 ||
      hasControlCharacters(a.displayName))
  )
    validation();
  if (
    a.verifiedPhone !== undefined &&
    (typeof a.verifiedPhone !== "string" || !PHONE.test(a.verifiedPhone))
  )
    validation();
  if (
    a.verifiedEmail !== undefined &&
    (typeof a.verifiedEmail !== "string" ||
      a.verifiedEmail.length > 320 ||
      hasControlCharacters(a.verifiedEmail) ||
      !/^[^\s@]+@[^\s@]+$/.test(a.verifiedEmail))
  )
    validation();
}
function hashRefresh(token: unknown): string {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    invalidGrant();
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class PassengerAccountService {
  constructor(
    @Inject(PassengerAccountRepository)
    private readonly store: PassengerAccountStore,
    private readonly jwt: PassengerJwtService,
  ) {}

  /** Internal only. Callers must verify the provider proof before supplying attributes. */
  async findOrCreateByIdentity(
    provider: AuthProvider,
    subject: string,
    verifiedAttributes: VerifiedPassengerAttributes = {},
  ): Promise<AccountRecord> {
    identityKey(provider, subject);
    attributes(verifiedAttributes);
    return this.store.transaction(async (tx) => {
      await tx.lockIdentity(provider, subject);
      const existing = await tx.findIdentity(provider, subject);
      if (existing) {
        const a = await tx.lockAccount(existing.drtsPassengerId);
        const currentIdentity = await tx.findIdentity(provider, subject);
        // Unlink/delete may commit while this login waits for the account lock.
        if (currentIdentity?.identityId === existing.identityId) {
          if (!a || a.status !== "active") unauthorized();
          return a;
        }
      }
      const a: AccountRecord = {
        drtsPassengerId: `drts_passenger_${randomUUID()}`,
        contactPhoneVerified: false,
        contactConsent: false,
        status: "active",
        createdAt: new Date().toISOString(),
        ...verifiedAttributes,
      };
      if (provider === "phone") a.verifiedPhone = subject;
      if (provider === "email") a.verifiedEmail = subject;
      await tx.insertAccount(a);
      await tx.insertIdentity({
        identityId: randomUUID(),
        drtsPassengerId: a.drtsPassengerId,
        provider,
        subject,
      });
      return a;
    });
  }
  private async current(
    tx: PassengerAccountTransaction,
    identity: RequestIdentity | null,
  ): Promise<AccountRecord> {
    if (
      !identity ||
      identity.authMode !== "jwt_bearer" ||
      identity.realm !== "passenger" ||
      identity.actorType !== "first_party_passenger" ||
      !identity.drtsPassengerId ||
      identity.actorId !== identity.drtsPassengerId ||
      identity.subject !== identity.drtsPassengerId ||
      !identity.sessionId ||
      !identity.expiresAt ||
      !Number.isFinite(Date.parse(identity.expiresAt)) ||
      Date.parse(identity.expiresAt) <= Date.now()
    )
      unauthorized();
    const a = await tx.lockAccount(identity.drtsPassengerId);
    if (
      !a ||
      a.status !== "active" ||
      !(await tx.findLiveFamily(
        a.drtsPassengerId,
        identity.sessionId,
        new Date().toISOString(),
      ))
    )
      unauthorized();
    return a;
  }
  async authenticateAccessToken(
    token: string,
  ): Promise<PassengerRequestIdentity | null> {
    const identity = this.jwt.verify(token);
    if (!identity) return null;
    // DB/config failures propagate as availability failures, never an in-memory fallback.
    return this.store.transaction(async (tx) => {
      const a = await tx.lockAccount(identity.drtsPassengerId);
      return a?.status === "active" &&
        (await tx.findLiveFamily(
          a.drtsPassengerId,
          identity.sessionId,
          new Date().toISOString(),
        ))
        ? identity
        : null;
    });
  }
  async getMe(identity: RequestIdentity | null) {
    return this.store.transaction(async (tx) => ({
      account: await this.current(tx, identity),
    }));
  }
  async updateMe(
    identity: RequestIdentity | null,
    command: UpdatePassengerMeCommand,
  ) {
    if (!command || typeof command !== "object" || Array.isArray(command))
      validation();
    const allowed = [
      "displayName",
      "contactPhone",
      "termsVersion",
      "privacyVersion",
      "feeAcknowledgementVersion",
      "contactConsent",
    ];
    if (Object.keys(command).some((k) => !allowed.includes(k))) validation();
    for (const key of [
      "displayName",
      "termsVersion",
      "privacyVersion",
      "feeAcknowledgementVersion",
    ] as const) {
      const v = command[key];
      if (
        v !== undefined &&
        (typeof v !== "string" ||
          !v.trim() ||
          v.length > 100 ||
          hasControlCharacters(v))
      )
        validation();
    }
    if (
      command.contactPhone !== undefined &&
      (typeof command.contactPhone !== "string" ||
        !PHONE.test(command.contactPhone))
    )
      validation();
    if (
      command.contactConsent !== undefined &&
      typeof command.contactConsent !== "boolean"
    )
      validation();
    return this.store.transaction(async (tx) => {
      const a = await this.current(tx, identity);
      if (
        command.contactPhone !== undefined &&
        command.contactPhone !== a.contactPhone
      )
        a.contactPhoneVerified = false;
      const next = { ...a, ...command };
      await tx.saveAccount(next);
      return { account: next };
    });
  }
  async listIdentities(identity: RequestIdentity | null) {
    return this.store.transaction(async (tx) => ({
      identities: await tx
        .listIdentities((await this.current(tx, identity)).drtsPassengerId)
        .then((list) => list.map((i) => ({ ...i, subject: "[linked]" }))),
    }));
  }
  /** Called only after a session-bound contact-phone OTP proof has been consumed. */
  async verifyContactPhone(identity: RequestIdentity | null, phone: string) {
    if (typeof phone !== "string" || !PHONE.test(phone)) validation();
    return this.store.transaction(async (tx) => {
      const a = await this.current(tx, identity);
      a.contactPhone = phone;
      a.contactPhoneVerified = true;
      await tx.saveAccount(a);
      return { account: a };
    });
  }
  async linkIdentity(
    identity: RequestIdentity | null,
    provider: AuthProvider,
    subject: string,
    verifiedAttributes: VerifiedPassengerAttributes = {},
  ): Promise<PassengerLoginIdentity> {
    identityKey(provider, subject);
    attributes(verifiedAttributes);
    return this.store.transaction(async (tx) => {
      await tx.lockIdentity(provider, subject);
      const a = await this.current(tx, identity);
      const existing = await tx.findIdentity(provider, subject);
      if (existing) {
        if (existing.drtsPassengerId !== a.drtsPassengerId)
          throw new ApiRequestError(
            409,
            "conflict",
            "This login identity is already linked.",
          );
        return existing;
      }
      const linked = {
        identityId: randomUUID(),
        drtsPassengerId: a.drtsPassengerId,
        provider,
        subject,
      };
      await tx.insertIdentity(linked);
      // Verified attributes only come from internal proof-verifying adapters, never PATCH.
      if (verifiedAttributes.verifiedPhone || provider === "phone")
        a.verifiedPhone = verifiedAttributes.verifiedPhone ?? subject;
      if (verifiedAttributes.verifiedEmail || provider === "email")
        a.verifiedEmail = verifiedAttributes.verifiedEmail ?? subject;
      await tx.saveAccount(a);
      return linked;
    });
  }
  async unlinkIdentity(identity: RequestIdentity | null, identityId: string) {
    return this.store.transaction(async (tx) => {
      const a = await this.current(tx, identity);
      const list = await tx.listIdentities(a.drtsPassengerId);
      const target = list.find((i) => i.identityId === identityId);
      if (!target)
        throw new ApiRequestError(
          404,
          "not_found",
          "Login identity not found.",
        );
      if (list.length <= 1)
        throw new ApiRequestError(
          409,
          "last_identity_error",
          "At least one login identity must remain.",
        );
      await tx.removeIdentity(a.drtsPassengerId, identityId);
      if (target.provider === "phone" && a.verifiedPhone === target.subject)
        delete a.verifiedPhone;
      if (target.provider === "email" && a.verifiedEmail === target.subject)
        delete a.verifiedEmail;
      await tx.saveAccount(a);
      return { success: true };
    });
  }
  private async issue(
    tx: PassengerAccountTransaction,
    id: string,
    deviceUa: string | null,
    family: string = randomUUID(),
    expiresAt = new Date(Date.now() + REFRESH_MS).toISOString(),
  ): Promise<RefreshSessionResponse> {
    const refreshToken = randomBytes(32).toString("base64url");
    // Sign before committing any credential state; configuration failure rolls back.
    const accessToken = this.jwt.sign(id, family);
    const s: SessionRecord = {
      sessionId: randomUUID(),
      drtsPassengerId: id,
      refreshTokenFamily: family,
      refreshTokenHash: hashRefresh(refreshToken),
      deviceUa,
      createdAt: new Date().toISOString(),
      expiresAt,
      consumedAt: null,
      revokedAt: null,
    };
    await tx.insertSession(s);
    return { accessToken, refreshToken };
  }
  async issueSession(
    drtsPassengerId: string,
    deviceUa = "",
    verifiedIdentity?: Pick<PassengerLoginIdentity, "provider" | "subject">,
  ): Promise<RefreshSessionResponse> {
    // Internal proof-verifying callers may bind issuance to the identity they resolved.
    if (verifiedIdentity)
      identityKey(verifiedIdentity.provider, verifiedIdentity.subject);
    return this.store.transaction(async (tx) => {
      // Match login/link/deletion lock order; retain both locks through insertion.
      if (verifiedIdentity)
        await tx.lockIdentity(
          verifiedIdentity.provider,
          verifiedIdentity.subject,
        );
      const a = await tx.lockAccount(drtsPassengerId);
      if (!a || a.status !== "active") unauthorized();
      if (verifiedIdentity) {
        // Unlink/delete can commit while waiting for the account lock. Re-read
        // afterward, also rejecting a subject recreated on a different account.
        const current = await tx.findIdentity(
          verifiedIdentity.provider,
          verifiedIdentity.subject,
        );
        if (current?.drtsPassengerId !== drtsPassengerId) unauthorized();
      }
      return this.issue(tx, drtsPassengerId, deviceUa.slice(0, 512));
    });
  }
  async refresh(refreshToken: unknown): Promise<RefreshSessionResponse> {
    const hash = hashRefresh(refreshToken);
    const result = await this.store.transaction(async (tx) => {
      const initial = await tx.findSessionByHash(hash);
      if (!initial) return null;
      const a = await tx.lockAccount(initial.drtsPassengerId);
      // Re-read after the account lock: concurrent refresh requests must see consumption.
      const s = await tx.findSessionByHash(hash);
      if (!a || a.status !== "active" || !s) return null;
      const now = new Date().toISOString();
      if (s.consumedAt) {
        await tx.revokeFamily(
          a.drtsPassengerId,
          s.refreshTokenFamily,
          now,
          "refresh_reuse",
        );
        return null; // Commit revocation; throwing inside the transaction would roll it back.
      }
      if (s.revokedAt || Date.parse(s.expiresAt) <= Date.now()) return null;
      await tx.consumeSession(s.sessionId, now);
      return this.issue(
        tx,
        a.drtsPassengerId,
        s.deviceUa,
        s.refreshTokenFamily,
        s.expiresAt,
      );
    });
    if (!result) invalidGrant();
    return result;
  }
  async logout(refreshToken: unknown) {
    const hash = hashRefresh(refreshToken);
    await this.store.transaction(async (tx) => {
      const s = await tx.findSessionByHash(hash);
      if (!s) return;
      await tx.lockAccount(s.drtsPassengerId);
      await tx.revokeFamily(
        s.drtsPassengerId,
        s.refreshTokenFamily,
        new Date().toISOString(),
        "logout",
      );
    });
    return { success: true };
  }
  async logoutAll(identity: RequestIdentity | null) {
    return this.store.transaction(async (tx) => {
      const a = await this.current(tx, identity);
      await tx.revokeAll(
        a.drtsPassengerId,
        new Date().toISOString(),
        "logout_all",
      );
      return { success: true };
    });
  }
  async deleteAccount(identity: RequestIdentity | null) {
    return this.store.transaction(async (tx) => {
      const a = await this.current(tx, identity);
      const now = new Date().toISOString();
      // PAYMENT-CORE adds the pending-payment check here inside this transaction.
      await tx.revokeAll(a.drtsPassengerId, now, "account_deleted");
      await tx.anonymize(a.drtsPassengerId, now);
      return { success: true };
    });
  }
}
