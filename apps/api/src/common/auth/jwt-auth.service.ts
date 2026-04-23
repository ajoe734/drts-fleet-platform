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
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
}

const DEFAULT_EXPIRES_IN = "8h";
const SERVICE_EXPIRES_IN = "1h";

@Injectable()
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);

  private getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is not set");
    }
    return secret;
  }

  private getIssuer(): string | undefined {
    return process.env.JWT_ISSUER || process.env.OIDC_ISSUER || undefined;
  }

  private getAudience(): string | undefined {
    return process.env.JWT_AUDIENCE || process.env.OIDC_AUDIENCE || undefined;
  }

  private buildJwtOptions(expiresIn?: string): jwt.SignOptions {
    const issuer = this.getIssuer();
    const audience = this.getAudience();
    const options: jwt.SignOptions = {};

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
    const options: jwt.VerifyOptions = {};

    if (issuer) {
      options.issuer = issuer;
    }
    if (audience) {
      options.audience = audience;
    }

    return options;
  }

  sign(
    identity: BootstrapRequestIdentity,
    opts?: { expiresIn?: string },
  ): string {
    const payload: JwtIdentityPayload = {
      sub: identity.actorId,
      actorType: identity.actorType,
      realm: identity.realm,
      tenantId: identity.tenantId,
      roleFamilies: identity.roleFamilies,
      roles: identity.roles,
      scopes: identity.scopes,
    };
    const expiresIn =
      opts?.expiresIn ??
      (identity.actorType === "system"
        ? SERVICE_EXPIRES_IN
        : DEFAULT_EXPIRES_IN);

    return jwt.sign(payload, this.getSecret(), this.buildJwtOptions(expiresIn));
  }

  verify(token: string): JwtIdentityPayload | null {
    try {
      return jwt.verify(
        token,
        this.getSecret(),
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
      roleFamilies: payload.roleFamilies,
      roles: payload.roles,
      scopes: payload.scopes,
      requestId: null,
    };
  }
}
