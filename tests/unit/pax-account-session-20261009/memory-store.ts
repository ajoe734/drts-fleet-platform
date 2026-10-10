import type { AuthProvider, PassengerLoginIdentity } from "@drts/contracts";
import type {
  AccountRecord,
  PassengerAccountStore,
  PassengerAccountTransaction,
  SessionRecord,
} from "../../../apps/api/src/modules/passenger-app/account/passenger-account.port";

/** Unit-only persistence boundary. No SQL/PG claims; production service and JWT logic are real. */
export class MemoryPassengerStore
  implements PassengerAccountStore, PassengerAccountTransaction
{
  accounts = new Map<string, AccountRecord>();
  logins = new Map<string, PassengerLoginIdentity>();
  sessions = new Map<string, SessionRecord>();
  commits = 0;
  rollbacks = 0;
  private tail: Promise<void> = Promise.resolve();
  async transaction<T>(
    work: (tx: PassengerAccountTransaction) => Promise<T>,
  ): Promise<T> {
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    const snapshot = structuredClone([
      this.accounts,
      this.logins,
      this.sessions,
    ]);
    try {
      const r = await work(this);
      this.commits++;
      return r;
    } catch (error) {
      [this.accounts, this.logins, this.sessions] = snapshot as [
        Map<string, AccountRecord>,
        Map<string, PassengerLoginIdentity>,
        Map<string, SessionRecord>,
      ];
      this.rollbacks++;
      throw error;
    } finally {
      release();
    }
  }
  async lockIdentity() {}
  async findIdentity(provider: AuthProvider, subject: string) {
    return structuredClone(
      [...this.logins.values()].find(
        (i) => i.provider === provider && i.subject === subject,
      ) ?? null,
    );
  }
  async lockAccount(id: string) {
    return structuredClone(this.accounts.get(id) ?? null);
  }
  async insertAccount(a: AccountRecord) {
    this.accounts.set(a.drtsPassengerId, structuredClone(a));
  }
  async saveAccount(a: AccountRecord) {
    this.accounts.set(a.drtsPassengerId, structuredClone(a));
  }
  async listIdentities(id: string) {
    return structuredClone(
      [...this.logins.values()].filter((i) => i.drtsPassengerId === id),
    );
  }
  async insertIdentity(i: PassengerLoginIdentity) {
    if (await this.findIdentity(i.provider, i.subject))
      throw new Error("duplicate identity");
    this.logins.set(i.identityId, structuredClone(i));
  }
  async removeIdentity(id: string, identityId: string) {
    if (this.logins.get(identityId)?.drtsPassengerId === id)
      this.logins.delete(identityId);
  }
  async findSessionByHash(hash: string) {
    return structuredClone(
      [...this.sessions.values()].find((s) => s.refreshTokenHash === hash) ??
        null,
    );
  }
  async findLiveFamily(id: string, family: string, now: string) {
    return structuredClone(
      [...this.sessions.values()].find(
        (s) =>
          s.drtsPassengerId === id &&
          s.refreshTokenFamily === family &&
          !s.consumedAt &&
          !s.revokedAt &&
          Date.parse(s.expiresAt) > Date.parse(now),
      ) ?? null,
    );
  }
  async insertSession(s: SessionRecord) {
    this.sessions.set(s.sessionId, structuredClone(s));
  }
  async consumeSession(id: string, now: string) {
    this.sessions.get(id)!.consumedAt = now;
  }
  async revokeFamily(id: string, family: string, now: string) {
    for (const s of this.sessions.values())
      if (
        s.drtsPassengerId === id &&
        s.refreshTokenFamily === family &&
        !s.revokedAt
      )
        s.revokedAt = now;
  }
  async revokeAll(id: string, now: string) {
    for (const s of this.sessions.values())
      if (s.drtsPassengerId === id && !s.revokedAt) s.revokedAt = now;
  }
  async anonymize(id: string, now: string) {
    const a = this.accounts.get(id)!;
    for (const key of [
      "displayName",
      "contactPhone",
      "verifiedPhone",
      "verifiedEmail",
    ] as const)
      delete a[key];
    a.status = "deleted";
    a.deletedAt = now;
    a.contactPhoneVerified = false;
    a.contactConsent = false;
    for (const [key, i] of this.logins)
      if (i.drtsPassengerId === id) this.logins.delete(key);
    for (const s of this.sessions.values())
      if (s.drtsPassengerId === id) s.deviceUa = null;
  }
}
