import type {
  OtpRecord,
  OtpStore,
  OtpTransaction,
} from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.port";

/** Unit persistence boundary only. No PostgreSQL semantics are claimed. */
export class MemoryOtpStore implements OtpStore, OtpTransaction {
  records = new Map<string, OtpRecord>();
  commits = 0;
  private tail: Promise<void> = Promise.resolve();
  async transaction<T>(work: (tx: OtpTransaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone(this.records);
    try {
      const result = await work(this);
      this.commits++;
      return result;
    } catch (error) {
      this.records = snapshot;
      throw error;
    } finally {
      release();
    }
  }
  async now() {
    return new Date();
  }
  async lockRequest() {}
  async rateState(targetHash: string, ipHash: string, since: string) {
    const records = [...this.records.values()].filter(
      (r) => r.createdAt > since,
    );
    const target = records.filter((r) => r.targetHash === targetHash);
    return {
      targetCount: target.length,
      ipCount: records.filter((r) => r.ipHash === ipHash).length,
      resendAfter:
        target
          .map((r) => r.resendAfter)
          .sort()
          .at(-1) ?? null,
    };
  }
  async invalidateTarget(targetHash: string, now: string) {
    for (const record of this.records.values())
      if (
        record.targetHash === targetHash &&
        !record.consumedAt &&
        !record.invalidatedAt
      )
        record.invalidatedAt = now;
  }
  async insert(record: OtpRecord) {
    this.records.set(record.challengeHash, structuredClone(record));
  }
  async lockChallenge(hash: string) {
    return structuredClone(this.records.get(hash) ?? null);
  }
  async save(record: OtpRecord) {
    this.records.set(record.challengeHash, structuredClone(record));
  }
}
