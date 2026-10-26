"use client";

import { use, useState, type CSSProperties } from "react";
import type {
  AgencyInvitationView,
  AgencyMemberView,
  AgencyRoleCode,
  RegulatoryAgencyRecord,
} from "@drts/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  PageHeader,
  Td,
  Tr,
} from "@drts/ui-web";

import {
  formatDateTime,
  useAsyncData,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";

import {
  deactivateMember,
  getAgency,
  inviteMember,
  listInvitations,
  listMembers,
  localInputToIso,
  revokeInvitation,
  setAgencyStatus,
  updateAccessPeriod,
} from "../agency-admin-api";

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

interface AgencyDetail {
  agency: RegulatoryAgencyRecord;
  members: AgencyMemberView[];
  invitations: AgencyInvitationView[];
}

export default function AgencyDetailPage({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = use(params);
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const { data, loading, error, refresh } = useAsyncData<AgencyDetail>(
    async (apiClient) => ({
      agency: await getAgency(apiClient, agencyId),
      members: await listMembers(apiClient, agencyId),
      invitations: await listInvitations(apiClient, agencyId),
    }),
    [agencyId],
  );
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState<AgencyRoleCode>("agency_viewer");
  const [accessValidTo, setAccessValidTo] = useState("");
  const [periodDrafts, setPeriodDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setActionError(
        message === "STEP_UP_REQUIRED" ? t("agencies.stepUpRequired") : message,
      );
    }
  };

  if (loading && !data) {
    return <div style={pageStyle}>{t("agencies.loading")}</div>;
  }
  if (error || !data) {
    return (
      <div style={pageStyle}>
        <p role="alert">{t("agencies.error", { message: error ?? "" })}</p>
      </div>
    );
  }

  const { agency, members, invitations } = data;
  return (
    <div style={pageStyle}>
      <PageHeader
        title={agency.displayName}
        subtitle={agency.agencyCode}
        actions={<a href="/agencies">{t("agencies.detail.back")}</a>}
      />
      <Card>
        <CardBody>
          <Badge variant={agency.status === "active" ? "green" : "red"}>
            {t(`agencies.status.${agency.status}`)}
          </Badge>{" "}
          <button
            type="button"
            onClick={() =>
              run(() =>
                setAgencyStatus(
                  client,
                  agencyId,
                  agency.status === "active" ? "suspended" : "active",
                ),
              )
            }
          >
            {agency.status === "active"
              ? t("agencies.detail.suspend")
              : t("agencies.detail.reactivate")}
          </button>
          <p style={{ marginBottom: 0 }}>{t("agencies.detail.suspendNote")}</p>
        </CardBody>
      </Card>
      {notice ? <p role="status">{notice}</p> : null}
      {actionError ? (
        <p role="alert">{t("agencies.error", { message: actionError })}</p>
      ) : null}
      <Card>
        <CardHeader>{t("agencies.invite.title")}</CardHeader>
        <CardBody>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const validTo = localInputToIso(accessValidTo);
              void run(async () => {
                const issued = await inviteMember(client, agencyId, {
                  email,
                  roleCode,
                  accessValidTo: validTo ?? accessValidTo,
                });
                setEmail("");
                setNotice(
                  issued.deliveryOutcome === "sent"
                    ? t("agencies.invite.delivered")
                    : t("agencies.invite.notDelivered", {
                        outcome: issued.deliveryOutcome,
                      }),
                );
              });
            }}
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "end",
            }}
          >
            <label>
              {t("agencies.invite.email")}
              <br />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label={t("agencies.invite.email")}
              />
            </label>
            <label>
              {t("agencies.invite.role")}
              <br />
              <select
                value={roleCode}
                onChange={(event) =>
                  setRoleCode(event.target.value as AgencyRoleCode)
                }
                aria-label={t("agencies.invite.role")}
              >
                <option value="agency_viewer">
                  {t("agencies.role.agency_viewer")}
                </option>
                <option value="agency_exporter">
                  {t("agencies.role.agency_exporter")}
                </option>
              </select>
            </label>
            <label>
              {t("agencies.invite.validTo")}
              <br />
              <input
                type="datetime-local"
                required
                value={accessValidTo}
                onChange={(event) => setAccessValidTo(event.target.value)}
                aria-label={t("agencies.invite.validTo")}
              />
            </label>
            <button type="submit">{t("agencies.invite.submit")}</button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>{t("agencies.members.title")}</CardHeader>
        <DataTable
          columns={[
            { label: t("agencies.members.email") },
            { label: t("agencies.members.role") },
            { label: t("agencies.members.status") },
            { label: t("agencies.members.validTo") },
            { label: t("agencies.col.actions") },
          ]}
          empty={t("agencies.members.empty")}
        >
          {members.map((member) => (
            <Tr key={member.membershipId}>
              <Td>{member.email ?? t("agencies.notProvided")}</Td>
              <Td>
                {member.roleCode
                  ? t(`agencies.role.${member.roleCode}`)
                  : t("agencies.notProvided")}
              </Td>
              <Td>{member.status}</Td>
              <Td>
                {member.accessValidTo
                  ? formatDateTime(member.accessValidTo)
                  : t("agencies.notProvided")}
              </Td>
              <Td>
                <input
                  type="datetime-local"
                  value={periodDrafts[member.membershipId] ?? ""}
                  onChange={(event) =>
                    setPeriodDrafts((drafts) => ({
                      ...drafts,
                      [member.membershipId]: event.target.value,
                    }))
                  }
                  aria-label={t("agencies.members.extend")}
                />
                <button
                  type="button"
                  disabled={!periodDrafts[member.membershipId]}
                  onClick={() => {
                    const draft = periodDrafts[member.membershipId] ?? "";
                    void run(() =>
                      updateAccessPeriod(
                        client,
                        agencyId,
                        member.membershipId,
                        localInputToIso(draft) ?? draft,
                      ),
                    );
                  }}
                >
                  {t("agencies.members.extend")}
                </button>{" "}
                <button
                  type="button"
                  disabled={member.status === "disabled"}
                  onClick={() =>
                    run(() =>
                      deactivateMember(client, agencyId, member.membershipId),
                    )
                  }
                >
                  {t("agencies.members.deactivate")}
                </button>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
      <Card>
        <CardHeader>{t("agencies.invitations.title")}</CardHeader>
        <DataTable
          columns={[
            { label: t("agencies.invite.email") },
            { label: t("agencies.invite.role") },
            { label: t("agencies.invitations.delivery") },
            { label: t("agencies.invitations.expires") },
            { label: t("agencies.col.status") },
            { label: t("agencies.col.actions") },
          ]}
          empty={t("agencies.invitations.empty")}
        >
          {invitations.map((invitation) => {
            const pending = !invitation.acceptedAt && !invitation.revokedAt;
            return (
              <Tr key={invitation.invitationId}>
                <Td>{invitation.email}</Td>
                <Td>{t(`agencies.role.${invitation.roleCode}`)}</Td>
                <Td mono>{invitation.deliveryStatus}</Td>
                <Td>{formatDateTime(invitation.expiresAt)}</Td>
                <Td>
                  {invitation.acceptedAt
                    ? t("agencies.invitations.accepted")
                    : invitation.revokedAt
                      ? t("agencies.invitations.revoked")
                      : t("agencies.invitations.pending")}
                </Td>
                <Td>
                  {pending ? (
                    <button
                      type="button"
                      onClick={() =>
                        run(() =>
                          revokeInvitation(
                            client,
                            agencyId,
                            invitation.invitationId,
                          ),
                        )
                      }
                    >
                      {t("agencies.invitations.revoke")}
                    </button>
                  ) : null}
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </Card>
    </div>
  );
}
