import * as jwt from "jsonwebtoken";

export type SigningKeyStatus = "active" | "previous" | "retired";

export interface SigningKeyRecord {
  kid: string;
  status: SigningKeyStatus;
  algorithm: jwt.Algorithm;
  publicKey: string;
  privateKey?: string | undefined;
  createdAt?: string | undefined;
  retiredAt?: string | undefined;
}

export interface ResolvedVerifyKey {
  kid: string;
  algorithm: jwt.Algorithm;
  verifyKey: string;
  status: SigningKeyStatus;
}

export interface ActiveSigningKey {
  kid: string;
  algorithm: jwt.Algorithm;
  signKey: string;
  publicKey: string;
}

export class JwtKeyRetiredError extends Error {
  public readonly code = "JWT_KEY_RETIRED";
  constructor(public readonly kid: string) {
    super(`Signing key '${kid}' has been retired`);
    this.name = "JwtKeyRetiredError";
  }
}

export class JwtUnknownKeyError extends Error {
  public readonly code = "JWT_UNKNOWN_KEY";
  constructor(public readonly kid: string) {
    super(`Unknown signing key identifier '${kid}'`);
    this.name = "JwtUnknownKeyError";
  }
}

export class JwtKeyAlgorithmMismatchError extends Error {
  public readonly code = "JWT_KEY_ALGORITHM_MISMATCH";
  constructor(
    public readonly kid: string,
    public readonly expectedAlg: string,
    public readonly actualAlg: string,
  ) {
    super(
      `Signing key '${kid}' algorithm mismatch: expected ${expectedAlg}, got ${actualAlg}`,
    );
    this.name = "JwtKeyAlgorithmMismatchError";
  }
}

const HMAC_ALGORITHMS = new Set<string>(["HS256", "HS384", "HS512"]);
const ASYMMETRIC_ALGORITHMS = new Set<string>([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
]);

export function isHmacAlgorithm(alg: string): boolean {
  return HMAC_ALGORITHMS.has(alg.toUpperCase());
}

export function isAsymmetricAlgorithm(alg: string): boolean {
  return ASYMMETRIC_ALGORITHMS.has(alg.toUpperCase());
}

export class SigningKeyRing {
  private readonly keys = new Map<string, SigningKeyRecord>();
  private readonly retiredKids = new Set<string>();
  private activeKid: string | null = null;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.loadFromEnv(env);
  }

  private loadFromEnv(env: Record<string, string | undefined>): void {
    this.keys.clear();
    this.retiredKids.clear();
    this.activeKid = null;

    // Parse explicit retired kids list
    if (env.JWT_RETIRED_KIDS) {
      const retiredList = env.JWT_RETIRED_KIDS.split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      for (const kid of retiredList) {
        this.retiredKids.add(kid);
      }
    }

    // 1. If JWT_KEY_RING_JSON is provided, parse key ring array
    if (env.JWT_KEY_RING_JSON && env.JWT_KEY_RING_JSON.trim().length > 0) {
      try {
        const parsed = JSON.parse(env.JWT_KEY_RING_JSON) as SigningKeyRecord[];
        if (Array.isArray(parsed)) {
          for (const key of parsed) {
            if (!key.kid || !key.status || !key.algorithm) {
              continue;
            }
            const record: SigningKeyRecord = {
              kid: key.kid.trim(),
              status: key.status,
              algorithm: key.algorithm,
              publicKey: (key.publicKey || key.privateKey || "").trim(),
              privateKey: key.privateKey ? key.privateKey.trim() : undefined,
              createdAt: key.createdAt,
              retiredAt: key.retiredAt,
            };

            if (record.status === "retired") {
              this.retiredKids.add(record.kid);
            }
            this.keys.set(record.kid, record);

            if (record.status === "active" && !this.activeKid) {
              this.activeKid = record.kid;
            }
          }
        }
      } catch {
        // Fallback to legacy single-key env vars if JSON parsing fails
      }
    }

    // 2. If no active key was loaded from JSON, synthesize from legacy env vars
    if (!this.activeKid) {
      const privateKey = env.JWT_PRIVATE_KEY?.trim();
      const publicKey = env.JWT_PUBLIC_KEY?.trim();
      const secret = env.JWT_SECRET?.trim();
      const currentKid = env.JWT_KID_CURRENT?.trim() || "key-current";

      const isAsymmetric = Boolean(privateKey || publicKey);
      const rawAlgo = env.JWT_ALGORITHMS || env.JWT_ALGORITHM;
      const defaultAlgo: jwt.Algorithm = isAsymmetric ? "RS256" : "HS256";
      const algorithm = (
        rawAlgo
          ? rawAlgo.split(",")[0]?.trim().toUpperCase() || defaultAlgo
          : defaultAlgo
      ) as jwt.Algorithm;

      if (isAsymmetric && (privateKey || publicKey)) {
        const activeRecord: SigningKeyRecord = {
          kid: currentKid,
          status: "active",
          algorithm,
          publicKey: (publicKey || privateKey)!,
          privateKey,
        };
        this.keys.set(currentKid, activeRecord);
        this.activeKid = currentKid;
      } else if (secret) {
        const activeRecord: SigningKeyRecord = {
          kid: currentKid,
          status: "active",
          algorithm,
          publicKey: secret,
          privateKey: secret,
        };
        this.keys.set(currentKid, activeRecord);
        this.activeKid = currentKid;
      }
    }

    // 3. Synthesize legacy previous key if provided
    const previousKid = env.JWT_KID_PREVIOUS?.trim() || "key-previous";
    const previousPublicKey =
      env.JWT_PREVIOUS_PUBLIC_KEY?.trim() || env.JWT_PREVIOUS_SECRET?.trim();
    if (previousPublicKey && !this.keys.has(previousKid)) {
      const rawAlgo = env.JWT_ALGORITHMS || env.JWT_ALGORITHM;
      const defaultAlgo: jwt.Algorithm = env.JWT_PREVIOUS_PUBLIC_KEY
        ? "RS256"
        : "HS256";
      const algorithm = (
        rawAlgo
          ? rawAlgo.split(",")[0]?.trim().toUpperCase() || defaultAlgo
          : defaultAlgo
      ) as jwt.Algorithm;

      this.keys.set(previousKid, {
        kid: previousKid,
        status: "previous",
        algorithm,
        publicKey: previousPublicKey,
      });
    }
  }

  public isAsymmetricConfigured(): boolean {
    if (this.activeKid) {
      const record = this.keys.get(this.activeKid);
      if (record) {
        return isAsymmetricAlgorithm(record.algorithm);
      }
    }
    for (const record of this.keys.values()) {
      if (
        record.status !== "retired" &&
        isAsymmetricAlgorithm(record.algorithm)
      ) {
        return true;
      }
    }
    return false;
  }

  public getActiveSigningKey(): ActiveSigningKey {
    if (!this.activeKid) {
      throw new Error("No active signing key is configured in key ring.");
    }
    const record = this.keys.get(this.activeKid);
    if (!record || record.status !== "active") {
      throw new Error(
        `Active key '${this.activeKid}' is not active or missing.`,
      );
    }

    const signKey = record.privateKey || record.publicKey;
    if (!signKey) {
      throw new Error(
        `Active key '${this.activeKid}' lacks signing key material.`,
      );
    }

    return {
      kid: record.kid,
      algorithm: record.algorithm,
      signKey,
      publicKey: record.publicKey,
    };
  }

  public resolveVerifyKey(kid?: string, tokenAlg?: string): ResolvedVerifyKey {
    // If kid is explicitly specified
    if (kid && kid.trim().length > 0) {
      const normalizedKid = kid.trim();

      if (this.retiredKids.has(normalizedKid)) {
        throw new JwtKeyRetiredError(normalizedKid);
      }

      const record = this.keys.get(normalizedKid);
      if (!record) {
        throw new JwtUnknownKeyError(normalizedKid);
      }

      if (record.status === "retired") {
        throw new JwtKeyRetiredError(normalizedKid);
      }

      if (
        tokenAlg &&
        record.algorithm.toUpperCase() !== tokenAlg.toUpperCase()
      ) {
        throw new JwtKeyAlgorithmMismatchError(
          normalizedKid,
          record.algorithm,
          tokenAlg,
        );
      }

      return {
        kid: record.kid,
        algorithm: record.algorithm,
        verifyKey: record.publicKey,
        status: record.status,
      };
    }

    // If kid is omitted, fall back to active key if available
    if (this.activeKid) {
      const record = this.keys.get(this.activeKid);
      if (record && record.status === "active") {
        if (
          tokenAlg &&
          record.algorithm.toUpperCase() !== tokenAlg.toUpperCase()
        ) {
          throw new JwtKeyAlgorithmMismatchError(
            record.kid,
            record.algorithm,
            tokenAlg,
          );
        }

        return {
          kid: record.kid,
          algorithm: record.algorithm,
          verifyKey: record.publicKey,
          status: record.status,
        };
      }
    }

    throw new JwtUnknownKeyError("unspecified");
  }

  public getKeyRingSummary(): Array<{
    kid: string;
    status: SigningKeyStatus;
    algorithm: jwt.Algorithm;
    hasPrivateKey: boolean;
    hasPublicKey: boolean;
    createdAt?: string | undefined;
    retiredAt?: string | undefined;
  }> {
    const summary: Array<{
      kid: string;
      status: SigningKeyStatus;
      algorithm: jwt.Algorithm;
      hasPrivateKey: boolean;
      hasPublicKey: boolean;
      createdAt?: string | undefined;
      retiredAt?: string | undefined;
    }> = [];

    for (const [kid, record] of this.keys.entries()) {
      summary.push({
        kid,
        status: record.status,
        algorithm: record.algorithm,
        hasPrivateKey: Boolean(record.privateKey),
        hasPublicKey: Boolean(record.publicKey),
        createdAt: record.createdAt,
        retiredAt: record.retiredAt,
      });
    }

    for (const retiredKid of this.retiredKids) {
      if (!this.keys.has(retiredKid)) {
        summary.push({
          kid: retiredKid,
          status: "retired",
          algorithm: "RS256",
          hasPrivateKey: false,
          hasPublicKey: false,
        });
      }
    }

    return summary;
  }
}
