import type {
  AuthProvider,
  PassengerAccount,
  PassengerLoginIdentity,
} from "@drts/contracts";

export interface AccountRecord extends PassengerAccount {
  contactConsent: boolean;
}

export interface SessionRecord {
  sessionId: string;
  drtsPassengerId: string;
  refreshTokenFamily: string;
  refreshTokenHash: string;
  deviceUa: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

/** Methods run inside one transaction; account row locks serialize all account mutations. */
export interface PassengerAccountTransaction {
  lockIdentity(provider: AuthProvider, subject: string): Promise<void>;
  findIdentity(
    provider: AuthProvider,
    subject: string,
  ): Promise<PassengerLoginIdentity | null>;
  lockAccount(id: string): Promise<AccountRecord | null>;
  insertAccount(account: AccountRecord): Promise<void>;
  saveAccount(account: AccountRecord): Promise<void>;
  listIdentities(id: string): Promise<PassengerLoginIdentity[]>;
  insertIdentity(identity: PassengerLoginIdentity): Promise<void>;
  removeIdentity(id: string, identityId: string): Promise<void>;
  findSessionByHash(hash: string): Promise<SessionRecord | null>;
  findLiveFamily(
    id: string,
    family: string,
    now: string,
  ): Promise<SessionRecord | null>;
  insertSession(session: SessionRecord): Promise<void>;
  consumeSession(sessionId: string, now: string): Promise<void>;
  revokeFamily(
    id: string,
    family: string,
    now: string,
    reason: string,
  ): Promise<void>;
  revokeAll(id: string, now: string, reason: string): Promise<void>;
  anonymize(id: string, now: string): Promise<void>;
}

export interface PassengerAccountStore {
  transaction<T>(
    work: (tx: PassengerAccountTransaction) => Promise<T>,
  ): Promise<T>;
}
