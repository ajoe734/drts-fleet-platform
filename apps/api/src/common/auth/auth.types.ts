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
  principalId?: string | null;
  membershipId?: string | null;
  subject?: string | null;
  realm: AuthRealm;
  tenantId: string | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  partnerEntrySlug?: string | null;
  drtsPassengerId?: string | null;
  sessionId?: string | null;
  tokenId?: string | null;
  tokenVersion?: number | null;
  authTime?: string | number | null;
  amr?: string[];
  acr?: string | null;
  policyVersion?: string | null;
  issuer?: string | null;
  audience?: string[] | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
  requestId: string | null;
  sid?: string | null;
  stepUpProof?: IamStepUpProof | null;
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
