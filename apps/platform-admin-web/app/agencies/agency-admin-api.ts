import type { ApiClient } from "@drts/api-client";
import type {
  AgencyAccessLogRecord,
  AgencyInvitationIssued,
  AgencyInvitationView,
  AgencyMemberView,
  AgencyPage,
  InviteAgencyMemberCommand,
  RegulatoryAgencyRecord,
  RegulatoryAgencyStatus,
  StepUpProof,
} from "@drts/contracts";

/** BUREAU-R13 platform-admin agency directory calls (platform realm only). */
const BASE = "/api/platform-admin/agencies";

/**
 * Invitation, deactivation and access-period changes are step-up gated
 * (step-up.policy.ts). The proof is requested for the exact method/path.
 */
async function postWithStepUp<T>(
  client: Pick<ApiClient, "post">,
  path: string,
  body: unknown,
): Promise<T> {
  const proof = await client.post<StepUpProof>("/api/identity/step-up-proofs", {
    body: { method: "POST", path },
  });
  if (proof.required && !proof.stepUpReference) {
    throw new Error("STEP_UP_REQUIRED");
  }
  return client.post<T>(path, {
    body,
    ...(proof.stepUpReference
      ? { headers: { "x-drts-step-up-reference": proof.stepUpReference } }
      : {}),
  });
}

export function listAgencies(client: ApiClient) {
  return client.getList<RegulatoryAgencyRecord>(BASE);
}

export function createAgency(
  client: ApiClient,
  command: { agencyCode: string; displayName: string },
) {
  return client.post<RegulatoryAgencyRecord>(BASE, {
    body: command,
    idempotencyKey:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`,
  });
}

export function getAgency(client: ApiClient, agencyId: string) {
  return client.get<RegulatoryAgencyRecord>(
    `${BASE}/${encodeURIComponent(agencyId)}`,
  );
}

export function setAgencyStatus(
  client: ApiClient,
  agencyId: string,
  status: RegulatoryAgencyStatus,
) {
  return client.patch<RegulatoryAgencyRecord>(
    `${BASE}/${encodeURIComponent(agencyId)}`,
    { body: { status } },
  );
}

export function listMembers(client: ApiClient, agencyId: string) {
  return client.getList<AgencyMemberView>(
    `${BASE}/${encodeURIComponent(agencyId)}/members`,
  );
}

export function listInvitations(client: ApiClient, agencyId: string) {
  return client.getList<AgencyInvitationView>(
    `${BASE}/${encodeURIComponent(agencyId)}/invitations`,
  );
}

export function inviteMember(
  client: ApiClient,
  agencyId: string,
  command: InviteAgencyMemberCommand,
) {
  return postWithStepUp<AgencyInvitationIssued>(
    client,
    `${BASE}/${encodeURIComponent(agencyId)}/invitations`,
    command,
  );
}

export function revokeInvitation(
  client: ApiClient,
  agencyId: string,
  invitationId: string,
) {
  return client.post<AgencyInvitationView>(
    `${BASE}/${encodeURIComponent(agencyId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
    { body: {} },
  );
}

export function deactivateMember(
  client: ApiClient,
  agencyId: string,
  membershipId: string,
) {
  return postWithStepUp<AgencyMemberView>(
    client,
    `${BASE}/${encodeURIComponent(agencyId)}/members/${encodeURIComponent(membershipId)}/deactivate`,
    {},
  );
}

export function updateAccessPeriod(
  client: ApiClient,
  agencyId: string,
  membershipId: string,
  accessValidTo: string,
) {
  return postWithStepUp<AgencyMemberView>(
    client,
    `${BASE}/${encodeURIComponent(agencyId)}/members/${encodeURIComponent(membershipId)}/access-period`,
    { accessValidTo },
  );
}

export function listAccessLogs(
  client: ApiClient,
  query: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  return client.get<AgencyPage<AgencyAccessLogRecord>>(
    `/api/platform-admin/agency-access-logs${suffix ? `?${suffix}` : ""}`,
  );
}

/** datetime-local input value (local time) to an ISO timestamp. */
export function localInputToIso(value: string): string | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
