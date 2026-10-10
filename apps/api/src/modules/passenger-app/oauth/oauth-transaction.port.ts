export type OAuthProvider = "google" | "facebook" | "line";
export type OAuthTransactionPurpose = "login" | "link";

export interface OAuthTransactionRecord {
  transactionId: string;
  provider: OAuthProvider;
  purpose: OAuthTransactionPurpose;
  stateHash: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  drtsPassengerId: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface OAuthTransactionStore {
  insert(record: OAuthTransactionRecord): Promise<void>;
  /** Atomically marks the row consumed and returns it; returns null if the
   * transaction id is unknown, already consumed, or past its expiry so the
   * callback can never be replayed. */
  claim(
    transactionId: string,
    now: string,
  ): Promise<OAuthTransactionRecord | null>;
}
