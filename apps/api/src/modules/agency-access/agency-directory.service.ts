import { createHash, randomBytes, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import {
  AGENCY_ROLE_CODES,
  REGULATORY_AGENCY_STATUSES,
  type AgencyInvitationIssued,
  type AgencyInvitationView,
  type AgencyMemberView,
  type AgencyRoleCode,
  type AuditLogRecord,
  type CanonicalIdentityInvitationRecord,
  type CanonicalIdentityMembershipRecord,
  type CanonicalIdentityPrincipalRecord,
  type CanonicalIdentityRoleBindingRecord,
  type CreateRegulatoryAgencyCommand,
  type InviteAgencyMemberCommand,
  type RegulatoryAgencyRecord,
  type UpdateAgencyAccessPeriodCommand,
  type UpdateRegulatoryAgencyCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { getAgencyRoleScopes } from "../../common/auth/auth.constants";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  IdentityRepository,
  parseAgencyScopeRef,
  type AgencyMembershipSnapshot,
} from "../identity/identity.repository";
import {
  AgencyCodeConflictError,
  AgencyDirectoryRepository,
} from "./agency-directory.repository";
import { AgencyInvitationDeliveryService } from "./agency-invitation-delivery.service";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/;
const AGENCY_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

function badRequest(code: string, message: string): ApiRequestError {
  return new ApiRequestError(HttpStatus.BAD_REQUEST, code, message);
}

function notFound(code: string, message: string): ApiRequestError {
  return new ApiRequestError(HttpStatus.NOT_FOUND, code, message);
}

/** valid_to must be explicit, parseable and in the future (D9: no default/max). */
export function parseAccessValidTo(value: unknown, now = Date.now()): string {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(
      "AGENCY_ACCESS_VALID_TO_REQUIRED",
      "accessValidTo is required.",
    );
  }
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) {
    throw badRequest(
      "AGENCY_ACCESS_VALID_TO_INVALID",
      "accessValidTo must be an ISO-8601 timestamp.",
    );
  }
  if (parsed <= now) {
    throw badRequest(
      "AGENCY_ACCESS_VALID_TO_PAST",
      "accessValidTo must be in the future.",
    );
  }
  return new Date(parsed).toISOString();
}

function currentAccessBinding(
  bindings: CanonicalIdentityRoleBindingRecord[],
): CanonicalIdentityRoleBindingRecord | null {
  return (
    bindings
      .filter((binding) => getAgencyRoleScopes(binding.roleCode))
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )[0] ?? null
  );
}

export function toAgencyMemberView(input: {
  principal: CanonicalIdentityPrincipalRecord | null;
  membership: CanonicalIdentityMembershipRecord;
  roleBindings: CanonicalIdentityRoleBindingRecord[];
}): AgencyMemberView {
  const binding = currentAccessBinding(input.roleBindings);
  return {
    membershipId: input.membership.membershipId,
    principalId: input.membership.principalId,
    agencyId: parseAgencyScopeRef(input.membership.scopeRef) ?? "",
    email: input.principal?.email ?? null,
    displayName: input.principal?.displayName ?? null,
    status: input.membership.status,
    roleCode: binding?.roleCode ?? null,
    accessValidFrom: binding?.validFrom ?? null,
    accessValidTo: binding?.validTo ?? null,
    createdAt: input.membership.createdAt,
    updatedAt: input.membership.updatedAt,
  };
}

export function toAgencyInvitationView(
  invitation: CanonicalIdentityInvitationRecord,
): AgencyInvitationView {
  return {
    invitationId: invitation.invitationId,
    membershipId: invitation.membershipId,
    agencyId: parseAgencyScopeRef(invitation.scopeRef) ?? "",
    email: invitation.email,
    roleCode: invitation.roleCode,
    deliveryStatus: invitation.deliveryStatus,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
  };
}

/**
 * BUREAU-R13 §2.4 platform-admin agency directory. All identity state lives
 * in the canonical iam.identity_* tables via IdentityRepository; the agency
 * master record lives in core.regulatory_agencies.
 */
@Injectable()
export class AgencyDirectoryService {
  constructor(
    private readonly agencyDirectoryRepository: AgencyDirectoryRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly invitationDelivery: AgencyInvitationDeliveryService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  listAgencies(): Promise<RegulatoryAgencyRecord[]> {
    return this.agencyDirectoryRepository.list();
  }

  async getAgency(agencyId: string): Promise<RegulatoryAgencyRecord> {
    const agency = await this.agencyDirectoryRepository.findById(agencyId);
    if (!agency) {
      throw notFound("AGENCY_NOT_FOUND", "Regulatory agency was not found.");
    }
    return agency;
  }

  async createAgency(
    command: CreateRegulatoryAgencyCommand,
    actor: BootstrapRequestIdentity,
    requestId?: string,
  ): Promise<RegulatoryAgencyRecord> {
    const agencyCode =
      typeof command?.agencyCode === "string" ? command.agencyCode.trim() : "";
    const displayName =
      typeof command?.displayName === "string"
        ? command.displayName.trim()
        : "";
    if (!AGENCY_CODE_PATTERN.test(agencyCode)) {
      throw badRequest(
        "AGENCY_CODE_INVALID",
        "agencyCode must be 1-100 letters, digits, '-' or '_'.",
      );
    }
    if (!displayName || displayName.length > 255) {
      throw badRequest(
        "AGENCY_DISPLAY_NAME_INVALID",
        "displayName is required (max 255 characters).",
      );
    }
    const now = new Date().toISOString();
    let created: RegulatoryAgencyRecord;
    try {
      created = await this.agencyDirectoryRepository.create({
        agencyId: `agency_${randomUUID().replace(/-/g, "")}`,
        agencyCode,
        displayName,
        status: "active",
        createdByPrincipalId: actor.principalId ?? actor.actorId ?? null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (error instanceof AgencyCodeConflictError) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "AGENCY_CODE_CONFLICT",
          "An agency with this code already exists.",
        );
      }
      throw error;
    }
    await this.audit(actor, requestId, {
      actionName: "create_regulatory_agency",
      resourceType: "regulatory_agency",
      resourceId: created.agencyId,
      newValuesSummary: {
        agencyCode: created.agencyCode,
        status: created.status,
      },
    });
    return created;
  }

  async updateAgency(
    agencyId: string,
    command: UpdateRegulatoryAgencyCommand,
    actor: BootstrapRequestIdentity,
    requestId?: string,
  ): Promise<RegulatoryAgencyRecord> {
    const before = await this.getAgency(agencyId);
    const changes: UpdateRegulatoryAgencyCommand = {};
    if (command?.displayName !== undefined) {
      const displayName =
        typeof command.displayName === "string"
          ? command.displayName.trim()
          : "";
      if (!displayName || displayName.length > 255) {
        throw badRequest(
          "AGENCY_DISPLAY_NAME_INVALID",
          "displayName is required (max 255 characters).",
        );
      }
      changes.displayName = displayName;
    }
    if (command?.status !== undefined) {
      if (!REGULATORY_AGENCY_STATUSES.includes(command.status)) {
        throw badRequest(
          "AGENCY_STATUS_INVALID",
          "status must be active, suspended or retired.",
        );
      }
      changes.status = command.status;
    }
    const updated = await this.agencyDirectoryRepository.update(
      agencyId,
      changes,
    );
    if (!updated) {
      throw notFound("AGENCY_NOT_FOUND", "Regulatory agency was not found.");
    }
    let revokedSessions = 0;
    if (updated.status !== "active") {
      // Durable-state validation already denies every token of a non-active
      // agency; revoking the session rows makes the logout explicit too.
      revokedSessions = await this.identityRepository.revokeAgencySessions(
        agencyId,
        `agency_${updated.status}`,
        actor.principalId ?? null,
      );
    }
    await this.audit(actor, requestId, {
      actionName: "update_regulatory_agency",
      resourceType: "regulatory_agency",
      resourceId: agencyId,
      oldValuesSummary: {
        status: before.status,
        displayName: before.displayName,
      },
      newValuesSummary: {
        status: updated.status,
        displayName: updated.displayName,
        revokedSessions,
      },
    });
    return updated;
  }

  async listMembers(agencyId: string): Promise<AgencyMemberView[]> {
    await this.getAgency(agencyId);
    return (await this.identityRepository.listAgencyMembers(agencyId)).map(
      toAgencyMemberView,
    );
  }

  async listInvitations(agencyId: string): Promise<AgencyInvitationView[]> {
    await this.getAgency(agencyId);
    return (await this.identityRepository.listAgencyInvitations(agencyId)).map(
      toAgencyInvitationView,
    );
  }

  async inviteMember(
    agencyId: string,
    command: InviteAgencyMemberCommand,
    actor: BootstrapRequestIdentity,
    requestId?: string,
  ): Promise<AgencyInvitationIssued> {
    const agency = await this.getAgency(agencyId);
    if (agency.status !== "active") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "AGENCY_NOT_ACTIVE",
        "Invitations can only be issued for an active agency.",
      );
    }
    const email =
      typeof command?.email === "string"
        ? command.email.trim().toLowerCase()
        : "";
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw badRequest("AGENCY_INVITE_EMAIL_INVALID", "email is invalid.");
    }
    if (!AGENCY_ROLE_CODES.includes(command?.roleCode as AgencyRoleCode)) {
      throw badRequest(
        "AGENCY_ROLE_INVALID",
        "roleCode must be agency_viewer or agency_exporter.",
      );
    }
    const accessValidTo = parseAccessValidTo(command.accessValidTo);
    const rawToken = `ai_${randomBytes(32).toString("base64url")}`;
    const issued = await this.identityRepository.issueAgencyInvitation({
      agencyId,
      email,
      roleCode: command.roleCode,
      accessValidTo,
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
      issuerPrincipalId: actor.principalId ?? actor.actorId ?? null,
    });
    if (!issued) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "AGENCY_MEMBER_ALREADY_ACTIVE",
        "This email already has an active membership in the agency.",
      );
    }
    // Only an acknowledged send is recorded as delivered; anything else
    // stays visibly delivery_failed and can be re-issued.
    const delivery = await this.invitationDelivery.send({
      invitationId: issued.invitation.invitationId,
      agencyId,
      agencyDisplayName: agency.displayName,
      recipientEmail: email,
      expiresAt: issued.invitation.expiresAt,
      accessValidTo,
      rawToken,
    });
    const invitation =
      (await this.identityRepository.setAgencyInvitationDeliveryStatus(
        issued.invitation.invitationId,
        delivery.status === "sent" ? "delivered" : "delivery_failed",
      )) ?? issued.invitation;
    await this.audit(actor, requestId, {
      actionName: "invite_agency_member",
      resourceType: "agency_membership",
      resourceId: issued.membership.membershipId,
      newValuesSummary: {
        agencyId,
        invitationId: invitation.invitationId,
        roleCode: command.roleCode,
        accessValidTo,
        deliveryStatus: invitation.deliveryStatus,
      },
    });
    return {
      invitation: toAgencyInvitationView(invitation),
      member: toAgencyMemberView({
        principal: issued.principal,
        membership: issued.membership,
        roleBindings: [issued.roleBinding],
      }),
      deliveryOutcome: delivery.status,
    };
  }

  async revokeInvitation(
    agencyId: string,
    invitationId: string,
    actor: BootstrapRequestIdentity,
    requestId?: string,
  ): Promise<AgencyInvitationView> {
    await this.getAgency(agencyId);
    const revoked = await this.identityRepository.revokeAgencyInvitation(
      agencyId,
      invitationId,
    );
    if (!revoked) {
      throw notFound(
        "AGENCY_INVITATION_NOT_FOUND",
        "No pending invitation was found for this agency.",
      );
    }
    await this.audit(actor, requestId, {
      actionName: "revoke_agency_invitation",
      resourceType: "agency_invitation",
      resourceId: invitationId,
      newValuesSummary: { agencyId, revokedAt: revoked.revokedAt },
    });
    return toAgencyInvitationView(revoked);
  }

  async deactivateMember(
    agencyId: string,
    membershipId: string,
    actor: BootstrapRequestIdentity,
    requestId?: string,
  ): Promise<AgencyMemberView> {
    await this.getAgency(agencyId);
    const disabled = await this.identityRepository.deactivateAgencyMembership(
      agencyId,
      membershipId,
      actor.principalId ?? null,
    );
    if (!disabled) {
      throw notFound(
        "AGENCY_MEMBER_NOT_FOUND",
        "Agency membership was not found.",
      );
    }
    await this.audit(actor, requestId, {
      actionName: "deactivate_agency_member",
      resourceType: "agency_membership",
      resourceId: membershipId,
      newValuesSummary: { agencyId, status: disabled.status },
    });
    return toAgencyMemberView({
      principal: await this.identityRepository.findPrincipalById(
        disabled.principalId,
      ),
      membership: disabled,
      roleBindings:
        await this.identityRepository.findRoleBindingsByMembershipId(
          membershipId,
        ),
    });
  }

  async updateAccessPeriod(
    agencyId: string,
    membershipId: string,
    command: UpdateAgencyAccessPeriodCommand,
    actor: BootstrapRequestIdentity,
    requestId?: string,
  ): Promise<AgencyMemberView> {
    await this.getAgency(agencyId);
    const accessValidTo = parseAccessValidTo(command?.accessValidTo);
    const bindings = await this.identityRepository.updateAgencyAccessPeriod(
      agencyId,
      membershipId,
      accessValidTo,
    );
    if (!bindings) {
      throw notFound(
        "AGENCY_MEMBER_NOT_FOUND",
        "Agency membership was not found.",
      );
    }
    const membership =
      await this.identityRepository.findMembershipById(membershipId);
    await this.audit(actor, requestId, {
      actionName: "update_agency_access_period",
      resourceType: "agency_membership",
      resourceId: membershipId,
      newValuesSummary: { agencyId, accessValidTo },
    });
    return toAgencyMemberView({
      principal: membership
        ? await this.identityRepository.findPrincipalById(
            membership.principalId,
          )
        : null,
      membership: membership!,
      roleBindings: bindings,
    });
  }

  /**
   * Resolves the live agency, membership and access binding behind one agency
   * request. Used by the portal service on every request, so even a dev
   * bootstrap identity is bound to a real active membership.
   */
  async resolveActiveAccess(input: {
    agencyId: string;
    principalId: string;
    membershipId: string;
  }): Promise<{
    agency: RegulatoryAgencyRecord;
    snapshot: AgencyMembershipSnapshot;
    roleCode: string;
    accessValidTo: string;
  } | null> {
    const agency = await this.agencyDirectoryRepository.findById(
      input.agencyId,
    );
    if (!agency || agency.status !== "active") return null;
    const snapshot =
      await this.identityRepository.findAgencyMembershipForPrincipal(
        input.principalId,
      );
    if (
      !snapshot ||
      snapshot.principal.status !== "active" ||
      snapshot.agencyId !== input.agencyId ||
      snapshot.membership.membershipId !== input.membershipId
    ) {
      return null;
    }
    const now = Date.now();
    const binding = snapshot.roleBindings.find(
      (candidate) =>
        Boolean(getAgencyRoleScopes(candidate.roleCode)) &&
        Boolean(candidate.validTo) &&
        Date.parse(candidate.validFrom) <= now &&
        now < Date.parse(candidate.validTo!),
    );
    if (!binding) return null;
    return {
      agency,
      snapshot,
      roleCode: binding.roleCode,
      accessValidTo: binding.validTo!,
    };
  }

  private async audit(
    actor: BootstrapRequestIdentity,
    requestId: string | undefined,
    input: Pick<
      AuditLogRecord,
      | "actionName"
      | "resourceType"
      | "resourceId"
      | "oldValuesSummary"
      | "newValuesSummary"
    >,
  ) {
    await this.auditNotificationService?.recordAuditLogAsync({
      actorId: actor.actorId,
      actorType:
        actor.actorType === "driver_user"
          ? "system"
          : (actor.actorType as AuditLogRecord["actorType"]),
      tenantId: null,
      moduleName: "agency-access",
      ...input,
      ...(requestId ? { requestId } : {}),
    });
  }
}
