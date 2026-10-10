import type { RequestOtpCommand } from "@drts/contracts";

export interface OtpRecord {
  otpId: string;
  challengeHash: string;
  targetHash: string;
  provider: RequestOtpCommand["provider"];
  purpose: RequestOtpCommand["purpose"];
  codeHash: string;
  ipHash: string;
  drtsPassengerId: string | null;
  sessionFamily: string | null;
  createdAt: string;
  expiresAt: string;
  resendAfter: string;
  attempts: number;
  consumedAt: string | null;
  invalidatedAt: string | null;
}

export interface OtpTransaction {
  now(): Promise<Date>;
  lockRequest(targetHash: string, ipHash: string): Promise<void>;
  rateState(
    targetHash: string,
    ipHash: string,
    since: string,
  ): Promise<{
    targetCount: number;
    ipCount: number;
    resendAfter: string | null;
  }>;
  invalidateTarget(targetHash: string, now: string): Promise<void>;
  insert(record: OtpRecord): Promise<void>;
  lockChallenge(hash: string): Promise<OtpRecord | null>;
  save(record: OtpRecord): Promise<void>;
}

export interface OtpStore {
  transaction<T>(work: (tx: OtpTransaction) => Promise<T>): Promise<T>;
}
