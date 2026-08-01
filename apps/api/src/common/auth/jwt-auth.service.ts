import type { IdentityContext } from "@drts/contracts";
import { Injectable, Logger } from "@nestjs/common";
import * as jwt from "jsonwebtoken";

import type {
  AuthActorType,
  AuthRealm,
  AuthRoleFamily,
  BootstrapRequestIdentity,
} from "./auth.types";

export interface JwtIdentityPayload {
  sub: string | null;
  actorType: AuthActorType;
  realm: AuthRealm;
  tenantId: string | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  partnerEntrySlug?: string | null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
  drtsPassengerId?: string | null;
  driverBindingId?: string | null;
  driverDeviceId?: string | null;
}

type JwtExpiresIn = Extract<NonNullable<jwt.SignOptions["expiresIn"]>, string>;

type JwtSignIdentityBase =
  | Pick<
      BootstrapRequestIdentity,
      | "authMode"
      | "actorType"
      | "actorId"
      | "realm"
      | "tenantId"
      | "partnerId"
      | "partnerProgramId"
      | "partnerEntrySlug"
      | "roleFamilies"
      | "roles"
      | "scopes"
      | "requestId"
    >
  | IdentityContext;

type JwtSignIdentity = JwtSignIdentityBase & {
  drtsPassengerId?: string | null;
  driverBindingId?: string | null;
  driverDeviceId?: string | null;
};

const DEFAULT_EXPIRES_IN: JwtExpiresIn = "8h";
const SERVICE_EXPIRES_IN: JwtExpiresIn = "1h";

@Injectable()
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);

  private getSignKey(): string {
    const privateKey = process.env.JWT_PRIVATE_KEY;
    if (privateKey && privateKey.trim().length > 0) {
      return privateKey.trim();
    }
    const secret = process.env.JWT_SECRET;
    if (secret && secret.trim().length > 0) {
      return secret.trim();
    }
    throw new Error(
      "JWT key material environment variable is not set (neither JWT_PRIVATE_KEY nor JWT_SECRET)",
    );
  }

  private getVerifyKey(): string {
    const publicKey = process.env.JWT_PUBLIC_KEY;
    if (publicKey && publicKey.trim().length > 0) {
      return publicKey.trim();
    }
    const privateKey = process.env.JWT_PRIVATE_KEY;
    if (privateKey && privateKey.trim().length > 0) {
      return privateKey.trim();
    }
    const secret = process.env.JWT_SECRET;
    if (secret && secret.trim().length > 0) {
      return secret.trim();
    }
    throw new Error(
      "JWT key material environment variable is not set (neither JWT_PUBLIC_KEY, JWT_PRIVATE_KEY, nor JWT_SECRET)",
    );
  }

  private isAsymmetricKeyConfigured(): boolean {
    return Boolean(
      (process.env.JWT_PRIVATE_KEY && process.env.JWT_PRIVATE_KEY.trim().length > 0) ||
        (process.env.JWT_PUBLIC_KEY && process.env.JWT_PUBLIC_KEY.trim().length > 0),
    );
  }

  private getIssuer(): string | undefined {
    return process.env.JWT_ISSUER || process.env.OIDC_ISSUER || undefined;
  }

  private getAudience(): string | undefined {
    return process.env.JWT_AUDIENCE || process.env.OIDC_AUDIENCE || undefined;
  }

  private getAlgorithms(): jwt.Algorithm[] | undefined {
    const raw = process.env.JWT_ALGORITHMS || process.env.JWT_ALGORITHM;
    if (!raw) return undefined;
    const algos = raw
      .split(/[;,]/)
      .map((a) => a.trim().toUpperCase())
      .filter((a) => a.length > 0);
    return algos.length > 0 ? (algos as jwt.Algorithm[]) : undefined;
  }

  private buildJwtOptions(expiresIn?: JwtExpiresIn): jwt.SignOptions {
    const issuer = this.getIssuer();
    const audience = this.getAudience();
    const algos = this.getAlgorithms();
    const defaultAlgorithm = this.isAsymmetricKeyConfigured() ? "RS256" : "HS256";
    const options: jwt.SignOptions = {
      algorithm: (algos?.[0] as jwt.Algorithm) || defaultAlgorithm,
    };

    if (expiresIn) {
      options.expiresIn = expiresIn;
    }
    if (issuer) {
      options.issuer = issuer;
    }
    if (audience) {
      options.audience = audience;
    }

    return options;
  }

  private buildJwtVerifyOptions(): jwt.VerifyOptions {
    const issuer = this.getIssuer();
    const audience = this.getAudience();
    const algos = this.getAlgorithms();
    const defaultAlgorithm = this.isAsymmetricKeyConfigured() ? "RS256" : "HS256";
    const options: jwt.VerifyOptions = {
      algorithms: algos || [defaultAlgorithm as jwt.Algorithm],
    };

    if (issuer) {
      options.issuer = issuer;
    }
    if (audience) {
      options.audience = audience;
    }

    return options;
  }

  sign(identity: JwtSignIdentity, opts?: { expiresIn?: JwtExpiresIn }): string {
    const payload: JwtIdentityPayload = {
      sub: identity.actorId,
      actorType: identity.actorType,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      partnerProgramId: identity.partnerProgramId ?? null,
      partnerEntrySlug: identity.partnerEntrySlug ?? null,
      roleFamilies: identity.roleFamilies,
      roles: identity.roles,
      scopes: identity.scopes,
      drtsPassengerId: identity.drtsPassengerId ?? null,
      driverBindingId: identity.driverBindingId ?? null,
      driverDeviceId: identity.driverDeviceId ?? null,
    };
    const expiresIn =
      opts?.expiresIn ??
      (identity.actorType === "system"
        ? SERVICE_EXPIRES_IN
        : DEFAULT_EXPIRES_IN);

    return jwt.sign(
      payload,
      this.getSignKey(),
      this.buildJwtOptions(expiresIn),
    );
  }

  verify(token: string): JwtIdentityPayload | null {
    try {
      return jwt.verify(
        token,
        this.getVerifyKey(),
        this.buildJwtVerifyOptions(),
      ) as JwtIdentityPayload;
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      return null;
    }
  }

  toRequestIdentity(payload: JwtIdentityPayload): BootstrapRequestIdentity {
    return {
      authMode: "jwt_bearer",
      actorType: payload.actorType,
      actorId: payload.sub,
      realm: payload.realm,
      tenantId: payload.tenantId,
      partnerId: payload.partnerId ?? null,
      partnerProgramId: payload.partnerProgramId ?? null,
      partnerEntrySlug: payload.partnerEntrySlug ?? null,
      roleFamilies: payload.roleFamilies,
      roles: payload.roles,
      scopes: payload.scopes,
      requestId: null,
    };
  }
}
