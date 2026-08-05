export const AUTH_ACTOR_TYPES = [
  "system",
  "platform_admin",
  "tenant_admin",
  "ops_user",
  "driver_user",
  "partner_api_key",
  "referral_passenger",
] as const;

export type AuthActorType = (typeof AUTH_ACTOR_TYPES)[number];

export const AUTH_REALMS = [
  "system",
  "platform",
  "tenant",
  "ops",
  "driver",
  "partner",
] as const;

export type AuthRealm = (typeof AUTH_REALMS)[number];

export const AUTH_ROLE_FAMILIES = [
  "platform",
  "tenant",
  "ops",
  "driver",
  "partner",
] as const;

export type AuthRoleFamily = (typeof AUTH_ROLE_FAMILIES)[number];

export const AUTH_MODES = [
  "bootstrap_headers",
  "jwt_bearer",
  "partner_api_key",
  "referral_bearer",
] as const;

import type { IamStepUpProof } from "@drts/contracts";

export type AuthMode = (typeof AUTH_MODES)[number];

export const AUTH_MODE = "bootstrap_headers" as const;

export interface BootstrapRequestIdentity {
  authMode: AuthMode;
  actorType: AuthActorType;
  actorId: string | null;
  principalId?: string | null | undefined;
  membershipId?: string | null | undefined;
  subject?: string | null | undefined;
  realm: AuthRealm;
  tenantId: string | null;
  partnerId?: string | null | undefined;
  partnerProgramId?: string | null | undefined;
  partnerEntrySlug?: string | null | undefined;
  drtsPassengerId?: string | null | undefined;
  sessionId?: string | null | undefined;
  tokenId?: string | null | undefined;
  tokenVersion?: number | null | undefined;
  authTime?: string | number | null | undefined;
  amr?: string[] | undefined;
  acr?: string | null | undefined;
  policyVersion?: string | null | undefined;
  issuer?: string | null | undefined;
  audience?: string[] | null | undefined;
  issuedAt?: string | null | undefined;
  expiresAt?: string | null | undefined;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
  requestId: string | null;
  sid?: string | null | undefined;
  stepUpProof?: IamStepUpProof | null | undefined;
}

export interface AuthBootstrapHeaders {
  authorization?: string;
  "x-drts-authorization"?: string;
  "x-actor-type"?: string;
  "x-actor-id"?: string;
  "x-realm"?: string;
  "x-tenant-id"?: string;
  "x-partner-id"?: string;
  "x-partner-program-id"?: string;
  "x-partner-entry-slug"?: string;
  "x-roles"?: string;
  "x-role-families"?: string;
  "x-scopes"?: string;
  "x-auth-mode"?: string;
  "x-request-id"?: string;
  "x-sid"?: string;
  "x-amr"?: string;
  "x-acr"?: string;
  "x-auth-time"?: string;
  "x-step-up-proof"?: string;
  "x-step-up-reference"?: string;
  [key: string]: string | string[] | undefined;
}

export interface AuthenticatedRequestLike {
  headers: AuthBootstrapHeaders;
  method?: string;
  originalUrl?: string;
  url?: string;
  body?: Record<string, unknown>;
  identity?: BootstrapRequestIdentity;
}
