export const SMS_PORT = Symbol("PASSENGER_SMS_PORT");

export interface SmsPort {
  availability(): "available" | "not_configured";
  sendOtp(
    target: string,
    code: string,
    expiresAt: string,
  ): Promise<{
    status: "sent" | "not_configured" | "failed";
  }>;
}

/** A provider adapter must explicitly replace this port; credentials alone cannot enable it. */
export class UnconfiguredSmsPort implements SmsPort {
  availability(): "not_configured" {
    return "not_configured";
  }
  async sendOtp(): Promise<{ status: "not_configured" }> {
    return { status: "not_configured" };
  }
}
