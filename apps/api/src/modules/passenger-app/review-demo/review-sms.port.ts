import { Injectable } from "@nestjs/common";
import type { SmsPort } from "../otp/sms.port";

/** Simulated SMS inbox. Only the external delivery is replaced: the random
 * proof, hashed challenge, limits, expiry and account/session writer stay real.
 * Request and inbox collection occur in one HTTP call on the same replica.
 */
@Injectable()
export class ReviewSmsPort implements SmsPort {
  private readonly inbox = new Map<
    string,
    { code: string; expiresAt: string }
  >();

  availability() {
    return "available" as const;
  }

  async sendOtp(target: string, code: string, expiresAt: string) {
    if (!/^\+8869000000[0-9]{2}$/.test(target))
      return { status: "failed" as const };
    for (const [key, entry] of this.inbox)
      if (Date.parse(entry.expiresAt) <= Date.now()) this.inbox.delete(key);
    this.inbox.set(target, { code, expiresAt });
    return { status: "sent" as const };
  }

  collect(target: string) {
    const entry = this.inbox.get(target);
    this.inbox.delete(target);
    if (!entry || Date.parse(entry.expiresAt) <= Date.now())
      throw new Error("review_sms_not_delivered");
    return entry.code;
  }
}
