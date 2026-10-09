import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { SigningKeyRing } from "./signing-key-ring";
import type { PassengerRequestIdentity } from "./auth.types";

export const PASSENGER_JWT_ISSUER = "drts:passenger";
export const PASSENGER_JWT_AUDIENCE = "drts:passenger-api";
export const PASSENGER_ACCESS_SECONDS = 15 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Separate issuer/audience and exact claims keep passenger tokens outside legacy IAM. */
@Injectable()
export class PassengerJwtService {
  sign(drtsPassengerId: string, family: string): string {
    const key = new SigningKeyRing().getActiveSigningKey();
    return jwt.sign(
      {
        realm: "passenger",
        actorType: "first_party_passenger",
        drtsPassengerId,
        sid: family,
      },
      key.signKey,
      {
        subject: drtsPassengerId,
        issuer: PASSENGER_JWT_ISSUER,
        audience: PASSENGER_JWT_AUDIENCE,
        expiresIn: PASSENGER_ACCESS_SECONDS,
        jwtid: randomUUID(),
        algorithm: key.algorithm,
        keyid: key.kid,
      },
    );
  }
  verify(token: string): PassengerRequestIdentity | null {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || !decoded.header.kid) return null;
      const key = new SigningKeyRing().resolveVerifyKey(
        decoded.header.kid,
        decoded.header.alg,
      );
      const p = jwt.verify(token, key.verifyKey, {
        algorithms: [key.algorithm],
        issuer: PASSENGER_JWT_ISSUER,
        audience: PASSENGER_JWT_AUDIENCE,
      });
      if (
        typeof p === "string" ||
        p.realm !== "passenger" ||
        p.actorType !== "first_party_passenger" ||
        typeof p.sub !== "string" ||
        p.drtsPassengerId !== p.sub ||
        !p.sub.startsWith("drts_passenger_") ||
        !UUID.test(p.sub.slice("drts_passenger_".length)) ||
        typeof p.sid !== "string" ||
        !UUID.test(p.sid) ||
        typeof p.jti !== "string" ||
        typeof p.iat !== "number" ||
        typeof p.exp !== "number" ||
        p.exp - p.iat !== PASSENGER_ACCESS_SECONDS ||
        p.iat > Math.floor(Date.now() / 1000) ||
        p.aud !== PASSENGER_JWT_AUDIENCE ||
        p.tenantId != null ||
        p.partnerId != null ||
        p.roles !== undefined ||
        p.scopes !== undefined ||
        p.controlPlaneProxy !== undefined
      )
        return null;
      return {
        authMode: "jwt_bearer",
        actorType: "first_party_passenger",
        realm: "passenger",
        actorId: p.sub,
        drtsPassengerId: p.sub,
        subject: p.sub,
        sessionId: p.sid,
        tokenId: p.jti,
        tenantId: null,
        roleFamilies: [],
        roles: [],
        scopes: [],
        requestId: null,
        issuer: PASSENGER_JWT_ISSUER,
        audience: [PASSENGER_JWT_AUDIENCE],
        issuedAt: new Date(p.iat * 1000).toISOString(),
        expiresAt: new Date(p.exp * 1000).toISOString(),
      };
    } catch {
      return null;
    } // Never log token contents or provider errors containing credentials.
  }
}
