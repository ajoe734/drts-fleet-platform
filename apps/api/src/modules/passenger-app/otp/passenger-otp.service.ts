import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthProvidersResponse,
  RequestOtpCommand,
  RequestOtpResponse,
  VerifyOtpCommand,
  VerifyOtpResponse,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerAccountService } from "../account/passenger-account.service";
import { NotificationDeliveryService } from "../../notification-delivery/notification-delivery.service";
import { PassengerOtpRepository } from "./passenger-otp.repository";
import type { OtpRecord, OtpStore } from "./passenger-otp.port";
import { SMS_PORT, type SmsPort } from "./sms.port";

export const OTP_OPTIONS = Symbol("PASSENGER_OTP_OPTIONS");
export const OTP_MAIL_DELIVERY = Symbol("PASSENGER_OTP_MAIL_DELIVERY");
export interface OtpOptions {
  pepper: string;
  fromEmail: string;
  ipHourlyLimit: number;
  trustedProxyHops: number;
}
export function otpOptionsFromEnv(env: NodeJS.ProcessEnv): OtpOptions {
  const ipHourlyLimit = Number(env.PASSENGER_OTP_IP_HOURLY_LIMIT ?? 20);
  const trustedProxyHops = Number(env.PASSENGER_OTP_TRUSTED_PROXY_HOPS ?? 0);
  if (
    !Number.isSafeInteger(ipHourlyLimit) ||
    ipHourlyLimit < 1 ||
    ipHourlyLimit > 1000 ||
    !Number.isSafeInteger(trustedProxyHops) ||
    trustedProxyHops < 0 ||
    trustedProxyHops > 10
  )
    throw new Error("passenger_otp_invalid_options");
  return {
    pepper: env.PASSENGER_OTP_PEPPER ?? "",
    fromEmail:
      env.NOTIFICATION_FROM_EMAIL?.trim() ||
      env.REMOTE_SMTP_FROM_EMAIL?.trim() ||
      "",
    ipHourlyLimit,
    trustedProxyHops,
  };
}
function validation(): never {
  throw new ApiRequestError(400, "validation_error", "Invalid OTP command.");
}
function invalidCode(): never {
  throw new ApiRequestError(400, "invalid_code", "驗證碼無效或已失效。");
}
function notConfigured(): never {
  throw new ApiRequestError(503, "not_configured", "未設定驗證碼服務。");
}
function unavailable(): never {
  throw new ApiRequestError(503, "unavailable", "驗證碼服務暫時無法使用。");
}
export function canonicalOtpTarget(
  provider: RequestOtpCommand["provider"],
  target: unknown,
): string {
  if (typeof target !== "string") validation();
  const normalized = target.trim();
  if (provider === "email") {
    if (
      normalized.length > 254 ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(
        normalized,
      )
    )
      validation();
    return normalized.toLowerCase();
  }
  if (provider !== "phone") validation();
  const phone = /^09[0-9]{8}$/.test(normalized)
    ? `+886${normalized.slice(1)}`
    : /^8869[0-9]{8}$/.test(normalized)
      ? `+${normalized}`
      : normalized;
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) validation();
  return phone;
}
function fields(
  command: unknown,
  allowed: string[],
): asserts command is Record<string, unknown> {
  if (
    !command ||
    typeof command !== "object" ||
    Array.isArray(command) ||
    Object.keys(command).some((key) => !allowed.includes(key))
  )
    validation();
}

@Injectable()
export class PassengerOtpService {
  constructor(
    @Inject(PassengerOtpRepository) private readonly store: OtpStore,
    private readonly accounts: PassengerAccountService,
    @Inject(OTP_MAIL_DELIVERY)
    private readonly delivery: NotificationDeliveryService | null,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
    @Inject(OTP_OPTIONS) private readonly options: OtpOptions,
  ) {}
  providers(): AuthProvidersResponse {
    if (this.options.pepper.length < 32) return { providers: [] };
    return {
      providers: [
        ...(this.delivery?.availability() === "available" &&
        this.options.fromEmail
          ? ["email" as const]
          : []),
        ...(this.sms.availability() === "available" ? ["phone" as const] : []),
      ],
    };
  }
  private digest(...values: string[]) {
    return createHmac("sha256", this.options.pepper)
      .update(JSON.stringify(values))
      .digest("hex");
  }
  private codeDigest(
    r: Pick<
      OtpRecord,
      | "challengeHash"
      | "targetHash"
      | "provider"
      | "purpose"
      | "drtsPassengerId"
      | "sessionFamily"
    >,
    code: string,
  ) {
    return this.digest(
      "code",
      r.challengeHash,
      r.targetHash,
      r.provider,
      r.purpose,
      r.drtsPassengerId ?? "",
      r.sessionFamily ?? "",
      code,
    );
  }
  private async binding(identity: RequestIdentity | null) {
    const { account } = await this.accounts.getMe(identity);
    return {
      drtsPassengerId: account.drtsPassengerId,
      sessionFamily: identity!.sessionId!,
    };
  }
  async request(
    command: RequestOtpCommand,
    identity: RequestIdentity | null,
    ip: string,
  ): Promise<RequestOtpResponse> {
    fields(command, ["provider", "purpose", "target"]);
    const target = canonicalOtpTarget(command.provider, command.target);
    if (
      !["login", "link", "verify_contact_phone"].includes(command.purpose) ||
      (command.purpose === "verify_contact_phone" &&
        command.provider !== "phone")
    )
      validation();
    const binding =
      command.purpose === "login"
        ? { drtsPassengerId: null, sessionFamily: null }
        : await this.binding(identity);
    if (!this.providers().providers.includes(command.provider)) notConfigured();
    // IP is supplied only by the controller's trusted-hop resolver, never by a command field.
    if (!ip || ip.length > 128) validation();
    const challenge = randomBytes(32).toString("base64url");
    const code = randomInt(1_000_000).toString().padStart(6, "0");
    const targetHash = this.digest("target", command.provider, target);
    const ipHash = this.digest("ip", ip);
    const r = await this.store.transaction(async (tx) => {
      await tx.lockRequest(targetHash, ipHash);
      const now = await tx.now();
      const rate = await tx.rateState(
        targetHash,
        ipHash,
        new Date(now.getTime() - 3_600_000).toISOString(),
      );
      if (
        rate.targetCount >= 5 ||
        rate.ipCount >= this.options.ipHourlyLimit ||
        (rate.resendAfter && Date.parse(rate.resendAfter) > now.getTime())
      )
        throw new ApiRequestError(429, "too_many_requests", "請稍後再試。");
      const record: OtpRecord = {
        otpId: randomUUID(),
        challengeHash: this.digest("challenge", challenge),
        targetHash,
        provider: command.provider,
        purpose: command.purpose,
        ipHash,
        ...binding,
        codeHash: "",
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 300_000).toISOString(),
        resendAfter: new Date(now.getTime() + 60_000).toISOString(),
        attempts: 0,
        consumedAt: null,
        invalidatedAt: null,
      };
      record.codeHash = this.codeDigest(record, code);
      await tx.invalidateTarget(targetHash, now.toISOString());
      await tx.insert(record);
      return record;
    });
    let sent = false;
    try {
      if (command.provider === "email") {
        const receipt = await this.delivery!.sendPlatformMail({
          recipientEmail: target,
          fromEmail: this.options.fromEmail,
          subject: "智行叫車驗證碼",
          body: `驗證碼：${code}\n有效時間：5 分鐘（至 ${r.expiresAt}）。`,
        });
        sent = receipt.status === "sent";
      } else {
        sent =
          (await this.sms.sendOtp(target, code, r.expiresAt)).status === "sent";
      }
    } catch {
      /* Never let a provider exception echo OTP content. */
    }
    if (!sent) {
      await this.store.transaction(async (tx) => {
        const current = await tx.lockChallenge(r.challengeHash);
        if (current) {
          current.invalidatedAt = (await tx.now()).toISOString();
          await tx.save(current);
        }
      });
      unavailable();
    }
    // Same shape/message for existing, absent and suspended accounts. No identity lookup on request.
    return {
      success: true,
      challenge,
      message: "若可接收驗證碼，請於 5 分鐘內完成驗證。",
    };
  }
  async verify(
    command: VerifyOtpCommand,
    identity: RequestIdentity | null,
    deviceUa = "",
  ): Promise<VerifyOtpResponse> {
    fields(command, ["provider", "target", "code", "challenge"]);
    const target = canonicalOtpTarget(command.provider, command.target);
    if (
      typeof command.challenge !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(command.challenge) ||
      typeof command.code !== "string" ||
      command.code.length > 64
    )
      invalidCode();
    if (this.options.pepper.length < 32) notConfigured();
    // Resolve account authority before acquiring the OTP connection: never nest
    // account transactions inside OTP transactions (including with a pool of one).
    const currentBinding = identity ? await this.binding(identity) : null;
    const r = await this.store.transaction(async (tx) => {
      const stored = await tx.lockChallenge(
        this.digest("challenge", command.challenge),
      );
      const now = await tx.now();
      const fallback = {
        challengeHash: "",
        targetHash: "",
        provider: command.provider,
        purpose: "login" as const,
        drtsPassengerId: null,
        sessionFamily: null,
      };
      // Both real and missing challenges use fixed 32-byte digests and timingSafeEqual.
      const codeMatches = timingSafeEqual(
        Buffer.from(stored?.codeHash ?? "0".repeat(64), "hex"),
        Buffer.from(this.codeDigest(stored ?? fallback, command.code), "hex"),
      );
      const targetMatches = timingSafeEqual(
        Buffer.from(stored?.targetHash ?? "0".repeat(64), "hex"),
        Buffer.from(this.digest("target", command.provider, target), "hex"),
      );
      if (
        !stored ||
        stored.consumedAt ||
        stored.invalidatedAt ||
        stored.attempts >= 5 ||
        Date.parse(stored.expiresAt) <= now.getTime()
      )
        return null;
      if (stored.purpose !== "login") {
        if (
          !currentBinding ||
          currentBinding.drtsPassengerId !== stored.drtsPassengerId ||
          currentBinding.sessionFamily !== stored.sessionFamily
        )
          return null;
      }
      if (
        !/^[0-9]{6}$/.test(command.code) ||
        !codeMatches ||
        !targetMatches ||
        command.provider !== stored.provider
      ) {
        stored.attempts++;
        if (stored.attempts === 5) stored.invalidatedAt = now.toISOString();
        await tx.save(stored);
        return null; // Commit the failure counter before returning the generic error.
      }
      stored.consumedAt = now.toISOString();
      await tx.save(stored);
      return stored;
    });
    if (!r) invalidCode();
    // Proof consumption commits first; account mutations recheck live session authority.
    // Downstream failure burns the proof rather than allowing replay. No external IO under row locks.
    if (r.purpose === "login") {
      const account = await this.accounts.findOrCreateByIdentity(
        r.provider,
        target,
      );
      return {
        result: "logged_in",
        ...(await this.accounts.issueSession(
          account.drtsPassengerId,
          deviceUa,
        )),
      };
    }
    if (r.purpose === "link") {
      await this.accounts.linkIdentity(identity, r.provider, target);
      return { result: "linked" };
    }
    await this.accounts.verifyContactPhone(identity, target);
    return { result: "verified_contact_phone" };
  }
}
