"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import {
  AFFILIATION_TYPES,
  createDriverAffiliation,
  createRevenueShareRule,
  deactivateFleetStaffMember,
  EMPTY_AFFILIATION_FORM,
  EMPTY_RULE_FORM,
  FLEET_STAFF_ROLE_CODES,
  formatMoneyMinor,
  getFleetPartner,
  inviteFleetStaff,
  listFleetPartnerDrivers,
  listFleetHumanRoles,
  listFleetStaffInvitations,
  manageFleetHumanRole,
  revokeFleetStaffInvitation,
  type FleetHumanRoleRecord,
  type FleetStaffInvitationView,
  type InviteFleetStaffCommand,
  type ManageFleetHumanRoleCommand,
  listFleetStatements,
  listRevenueShareRules,
  PARTNERSHIP_TYPES,
  RULE_APPLIES_TO_VALUES,
  RULE_FORMULAS,
  toFleetPartnerFormState,
  updateFleetPartner,
  type DriverFleetAffiliationRecord,
  type FleetAffiliationFormState,
  type FleetPartnerFormState,
  type FleetPartnerRecord,
  type FleetPartnerRevenueShareRuleRecord,
  type FleetPartnerStatementRecord,
  type FleetRuleFormState,
} from "../fleet-partner-shared";

type InvitationTableRow = FleetStaffInvitationView & Record<string, unknown>;
type MemberTableRow = FleetHumanRoleRecord & Record<string, unknown>;

type DriverTableRow = DriverFleetAffiliationRecord & Record<string, unknown>;
type RuleTableRow = FleetPartnerRevenueShareRuleRecord &
  Record<string, unknown>;
type StatementTableRow = FleetPartnerStatementRecord & Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

function statusTone(active: boolean): CanvasTone {
  return active ? "success" : "warn";
}

function payoutTone(status?: string): CanvasTone {
  switch (status) {
    case "paid":
    case "reconciled":
      return "success";
    case "pending":
    case "pending_approval":
      return "warn";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function invitationStatus(
  invitation: FleetStaffInvitationView,
): "invited" | "accepted" | "revoked" {
  if (invitation.revokedAt) return "revoked";
  if (invitation.acceptedAt) return "accepted";
  return "invited";
}

function invitationStatusTone(
  status: ReturnType<typeof invitationStatus>,
): CanvasTone {
  if (status === "accepted") return "success";
  if (status === "invited") return "warn";
  return "neutral";
}

function memberStatusTone(status: string): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "neutral";
}

function memberStatusLabel(status: string, t: (key: string) => string) {
  if (status === "active") return t("fleetPartners.status.active");
  if (status === "disabled") return t("fleetPartners.humanRoles.disabled");
  return t(`fleetPartners.invitations.status.${status}`);
}

function partnershipTypeKey(value: string) {
  return `fleetPartners.partnershipType.${value}`;
}

function affiliationTypeKey(value: string) {
  return `fleetPartners.affiliationType.${value}`;
}

function appliesToKey(value: string) {
  return `fleetPartners.rule.appliesTo.${value}`;
}

function formulaKey(value: string) {
  return `fleetPartners.rule.formula.${value}`;
}

function payoutStatusKey(value?: string) {
  return value ? `fleetPartners.statements.status.${value}` : "common.noValues";
}

export default function FleetPartnerDetailPage() {
  const params = useParams<{ fleetPartnerId: string }>();
  const fleetPartnerId = String(params?.fleetPartnerId ?? "");
  const client = usePlatformAdminClient();
  const { t, locale } = useTranslation();

  const [partner, setPartner] = useState<FleetPartnerRecord | null>(null);
  const [partnerForm, setPartnerForm] = useState<FleetPartnerFormState | null>(
    null,
  );
  const [drivers, setDrivers] = useState<DriverFleetAffiliationRecord[]>([]);
  const [rules, setRules] = useState<FleetPartnerRevenueShareRuleRecord[]>([]);
  const [statements, setStatements] = useState<FleetPartnerStatementRecord[]>(
    [],
  );
  const [affiliationForm, setAffiliationForm] =
    useState<FleetAffiliationFormState>(EMPTY_AFFILIATION_FORM);
  const [ruleForm, setRuleForm] = useState<FleetRuleFormState>(EMPTY_RULE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingAffiliation, setCreatingAffiliation] = useState(false);
  const [creatingRule, setCreatingRule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [humanEntrySlug, setHumanEntrySlug] = useState("");
  const [humanSubject, setHumanSubject] = useState("");
  const [humanRole, setHumanRole] =
    useState<ManageFleetHumanRoleCommand["roleCode"]>("fleet_partner_ops");
  const [humanEnabled, setHumanEnabled] = useState(true);
  const [humanValidTo, setHumanValidTo] = useState("");
  const [humanRoles, setHumanRoles] = useState<FleetHumanRoleRecord[]>([]);
  const [humanSaving, setHumanSaving] = useState(false);
  const [humanAck, setHumanAck] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<FleetStaffInvitationView[]>(
    [],
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] =
    useState<InviteFleetStaffCommand["roleCode"]>("fleet_partner_ops");
  const [inviteValidTo, setInviteValidTo] = useState("");
  const [issuingInvitation, setIssuingInvitation] = useState(false);
  const [invitationBusyId, setInvitationBusyId] = useState<string | null>(null);
  const [disablingMembershipId, setDisablingMembershipId] = useState<
    string | null
  >(null);
  const [invitationAck, setInvitationAck] = useState<string | null>(null);
  // A read started before a write (or an entry/partner switch) cannot replace
  // the write's verified readback with older data while leaving its ACK visible.
  const humanRequestVersion = useRef(0);
  useEffect(
    () => () => {
      humanRequestVersion.current++;
    },
    [client, fleetPartnerId],
  );

  const loadDetail = async () => {
    if (!fleetPartnerId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [partnerRecord, driverRecords, ruleRecords, statementRecords] =
        await Promise.all([
          getFleetPartner(client, fleetPartnerId),
          listFleetPartnerDrivers(client, fleetPartnerId),
          listRevenueShareRules(client, fleetPartnerId),
          listFleetStatements(client, fleetPartnerId),
        ]);
      setPartner(partnerRecord);
      setPartnerForm(toFleetPartnerFormState(partnerRecord));
      setDrivers(driverRecords);
      setRules(ruleRecords);
      setStatements(statementRecords);
    } catch (loadError: any) {
      setError(loadError?.message ?? t("common.unknown"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [client, fleetPartnerId]);

  const handleSavePartner = async () => {
    if (!partnerForm) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateFleetPartner(
        client,
        fleetPartnerId,
        partnerForm,
      );
      setPartner(updated);
      setPartnerForm(toFleetPartnerFormState(updated));
    } catch (saveError: any) {
      setError(saveError?.message ?? t("common.unknown"));
    } finally {
      setSaving(false);
    }
  };

  const handleReadHumanRoles = async () => {
    const version = ++humanRequestVersion.current;
    const entrySlug = humanEntrySlug.trim();
    setHumanAck(null);
    setInvitationAck(null);
    setError(null);
    try {
      const [roles, invites] = await Promise.all([
        listFleetHumanRoles(client, fleetPartnerId, entrySlug),
        listFleetStaffInvitations(client, fleetPartnerId, entrySlug),
      ]);
      if (version === humanRequestVersion.current) {
        setHumanRoles(roles);
        setInvitations(invites);
      }
    } catch (readError: any) {
      if (version === humanRequestVersion.current)
        setError(readError?.message ?? t("common.unknown"));
    }
  };

  const handleIssueInvitation = async () => {
    const entrySlug = humanEntrySlug.trim();
    setIssuingInvitation(true);
    setInvitationAck(null);
    setError(null);
    try {
      const issued = await inviteFleetStaff(client, fleetPartnerId, {
        entrySlug,
        email: inviteEmail.trim(),
        roleCode: inviteRole,
        validTo: inviteValidTo ? new Date(inviteValidTo).toISOString() : null,
      });
      setInvitations((current) => [issued.invitation, ...current]);
      setInviteEmail("");
      setInviteValidTo("");
      setInvitationAck(
        issued.deliveryOutcome === "sent"
          ? t("fleetPartners.invitations.sent", {
              email: issued.invitation.email,
            })
          : t("fleetPartners.invitations.notDelivered", {
              email: issued.invitation.email,
            }),
      );
    } catch (issueError: any) {
      setError(issueError?.message ?? t("common.unknown"));
    } finally {
      setIssuingInvitation(false);
    }
  };

  const handleRevokeInvitation = async (
    invitation: FleetStaffInvitationView,
  ) => {
    const entrySlug = humanEntrySlug.trim();
    setInvitationBusyId(invitation.invitationId);
    setInvitationAck(null);
    setError(null);
    try {
      const revoked = await revokeFleetStaffInvitation(
        client,
        fleetPartnerId,
        entrySlug,
        invitation.invitationId,
      );
      setInvitations((current) =>
        current.map((row) =>
          row.invitationId === revoked.invitationId ? revoked : row,
        ),
      );
    } catch (revokeError: any) {
      setError(revokeError?.message ?? t("common.unknown"));
    } finally {
      setInvitationBusyId(null);
    }
  };

  /** Resend = revoke the old token (if not already revoked), then re-issue
   * the same email/role, preserving the existing member's validTo. If the
   * revoke succeeds but the re-issue fails, the list keeps showing the
   * revoked row and the error, never a false "sent" acknowledgement. */
  const handleResendInvitation = async (
    invitation: FleetStaffInvitationView,
  ) => {
    const entrySlug = humanEntrySlug.trim();
    setInvitationBusyId(invitation.invitationId);
    setInvitationAck(null);
    setError(null);
    try {
      let current = invitation;
      if (!current.revokedAt) {
        current = await revokeFleetStaffInvitation(
          client,
          fleetPartnerId,
          entrySlug,
          invitation.invitationId,
        );
        setInvitations((rows) =>
          rows.map((row) =>
            row.invitationId === current.invitationId ? current : row,
          ),
        );
      }
      const existingMember = humanRoles.find(
        (role) => role.membershipId === invitation.membershipId,
      );
      const issued = await inviteFleetStaff(client, fleetPartnerId, {
        entrySlug,
        email: invitation.email,
        roleCode: invitation.roleCode as InviteFleetStaffCommand["roleCode"],
        validTo: existingMember?.validTo ?? null,
      });
      setInvitations((rows) => [issued.invitation, ...rows]);
      setInvitationAck(
        issued.deliveryOutcome === "sent"
          ? t("fleetPartners.invitations.sent", {
              email: issued.invitation.email,
            })
          : t("fleetPartners.invitations.notDelivered", {
              email: issued.invitation.email,
            }),
      );
    } catch (resendError: any) {
      setError(resendError?.message ?? t("common.unknown"));
    } finally {
      setInvitationBusyId(null);
    }
  };

  const handleDisableMember = async (row: FleetHumanRoleRecord) => {
    const entrySlug = humanEntrySlug.trim();
    setDisablingMembershipId(row.membershipId);
    setInvitationAck(null);
    setError(null);
    try {
      const disabled = await deactivateFleetStaffMember(
        client,
        fleetPartnerId,
        entrySlug,
        row.membershipId,
      );
      setHumanRoles((current) =>
        current.map((entry) =>
          entry.membershipId === disabled.membershipId
            ? { ...entry, status: disabled.status }
            : entry,
        ),
      );
      setInvitationAck(
        t("fleetPartners.invitations.memberDisabled", {
          principal: disabled.principalId,
        }),
      );
    } catch (disableError: any) {
      setError(disableError?.message ?? t("common.unknown"));
    } finally {
      setDisablingMembershipId(null);
    }
  };

  const handleManageHumanRole = async () => {
    const version = ++humanRequestVersion.current;
    const entrySlug = humanEntrySlug.trim();
    setHumanSaving(true);
    setHumanAck(null);
    setError(null);
    try {
      const ack = await manageFleetHumanRole(client, fleetPartnerId, {
        entrySlug,
        partnerUserRef: humanSubject.trim(),
        roleCode: humanRole,
        enabled: humanEnabled,
        validTo: humanValidTo ? new Date(humanValidTo).toISOString() : null,
      });
      if (version !== humanRequestVersion.current) return;
      const readback = await listFleetHumanRoles(
        client,
        fleetPartnerId,
        entrySlug,
      );
      if (version !== humanRequestVersion.current) return;
      setHumanRoles(readback);
      if (
        !readback.some(
          (row) =>
            row.membershipId === ack.membershipId &&
            row.roleCode === ack.roleCode &&
            row.status === ack.status &&
            row.validTo === ack.validTo,
        )
      ) {
        throw new Error(t("fleetPartners.humanRoles.readbackMismatch"));
      }
      setHumanAck(
        t("fleetPartners.humanRoles.confirmed", {
          role: ack.roleCode,
          status: ack.status,
          principal: ack.principalId,
        }),
      );
    } catch (saveError: any) {
      if (version === humanRequestVersion.current)
        setError(saveError?.message ?? t("common.unknown"));
    } finally {
      setHumanSaving(false);
    }
  };

  const handleCreateAffiliation = async () => {
    setCreatingAffiliation(true);
    setError(null);
    try {
      const created = await createDriverAffiliation(
        client,
        fleetPartnerId,
        affiliationForm,
      );
      setDrivers((current) => [created, ...current]);
      setAffiliationForm(EMPTY_AFFILIATION_FORM);
    } catch (createError: any) {
      setError(createError?.message ?? t("common.unknown"));
    } finally {
      setCreatingAffiliation(false);
    }
  };

  const handleCreateRule = async () => {
    setCreatingRule(true);
    setError(null);
    try {
      const created = await createRevenueShareRule(
        client,
        fleetPartnerId,
        ruleForm,
      );
      setRules((current) => [created, ...current]);
      setRuleForm(EMPTY_RULE_FORM);
    } catch (createError: any) {
      setError(createError?.message ?? t("common.unknown"));
    } finally {
      setCreatingRule(false);
    }
  };

  const driverColumns: CanvasTableColumn<DriverTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.drivers.col.driverId"),
        r: (row: DriverTableRow) => row.driverId,
      },
      {
        h: t("fleetPartners.drivers.col.affiliationType"),
        r: (row: DriverTableRow) => t(affiliationTypeKey(row.affiliationType)),
      },
      {
        h: t("fleetPartners.drivers.col.effectiveFrom"),
        r: (row: DriverTableRow) => row.effectiveFrom || t("common.noValues"),
      },
      {
        h: t("fleetPartners.drivers.col.effectiveUntil"),
        r: (row: DriverTableRow) =>
          row.effectiveUntil || t("fleetPartners.openEnded"),
      },
    ],
    [t],
  );

  const ruleColumns: CanvasTableColumn<RuleTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.rules.col.ruleId"),
        r: (row: RuleTableRow) => row.ruleId,
      },
      {
        h: t("fleetPartners.rules.col.scope"),
        r: (row: RuleTableRow) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{t(appliesToKey(row.appliesTo))}</span>
            <span style={mutedTextStyle}>
              {row.serviceProduct ||
                row.tenantServiceProgramId ||
                row.sourcePlatform ||
                row.driverGroup ||
                t("fleetPartners.rules.allScope")}
            </span>
          </div>
        ),
      },
      {
        h: t("fleetPartners.rules.col.formula"),
        r: (row: RuleTableRow) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{t(formulaKey(row.formula))}</span>
            <span style={mutedTextStyle}>
              {row.rateBps !== undefined
                ? `${row.rateBps} bps`
                : row.fixedAmountMinor !== undefined
                  ? formatMoneyMinor(locale, row.fixedAmountMinor)
                  : t("common.noValues")}
            </span>
          </div>
        ),
      },
      {
        h: t("fleetPartners.rules.col.effective"),
        r: (row: RuleTableRow) =>
          `${row.effectiveFrom || t("common.noValues")} → ${row.effectiveUntil || t("fleetPartners.openEnded")}`,
      },
    ],
    [locale, t],
  );

  const statementColumns: CanvasTableColumn<StatementTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.statements.col.statementId"),
        r: (row: StatementTableRow) => row.statementId,
      },
      {
        h: t("fleetPartners.statements.col.period"),
        r: (row: StatementTableRow) => row.periodMonth,
      },
      {
        h: t("fleetPartners.statements.col.gross"),
        r: (row: StatementTableRow) =>
          formatMoneyMinor(locale, row.grossAmountMinor, row.currency),
      },
      {
        h: t("fleetPartners.statements.col.share"),
        r: (row: StatementTableRow) =>
          formatMoneyMinor(locale, row.partnerShareMinor, row.currency),
      },
      {
        h: t("fleetPartners.statements.col.status"),
        r: (row: StatementTableRow) => (
          <CanvasPill tone={payoutTone(row.payoutStatus)} dot>
            {t(payoutStatusKey(row.payoutStatus))}
          </CanvasPill>
        ),
      },
    ],
    [locale, t],
  );

  const invitationColumns: CanvasTableColumn<InvitationTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.invitations.col.email"),
        r: (row: InvitationTableRow) => row.email,
      },
      {
        h: t("fleetPartners.invitations.col.role"),
        r: (row: InvitationTableRow) => row.roleCode,
      },
      {
        h: t("fleetPartners.invitations.col.status"),
        r: (row: InvitationTableRow) => {
          const status = invitationStatus(row);
          return (
            <CanvasPill tone={invitationStatusTone(status)} dot>
              {t(`fleetPartners.invitations.status.${status}`)}
            </CanvasPill>
          );
        },
      },
      {
        h: t("fleetPartners.invitations.col.expiresAt"),
        r: (row: InvitationTableRow) =>
          row.expiresAt ? formatDateTime(row.expiresAt) : t("common.noValues"),
      },
      {
        h: t("common.actions"),
        r: (row: InvitationTableRow) => {
          const status = invitationStatus(row);
          const busy = invitationBusyId === row.invitationId;
          return (
            <div style={{ display: "flex", gap: 6 }}>
              {status === "invited" ? (
                <CanvasBtn
                  disabled={busy}
                  onClick={() => void handleRevokeInvitation(row)}
                >
                  {busy
                    ? t("common.saving")
                    : t("fleetPartners.invitations.revoke")}
                </CanvasBtn>
              ) : null}
              {status !== "accepted" ? (
                <CanvasBtn
                  disabled={busy}
                  onClick={() => void handleResendInvitation(row)}
                >
                  {busy
                    ? t("common.saving")
                    : t("fleetPartners.invitations.resend")}
                </CanvasBtn>
              ) : null}
            </div>
          );
        },
      },
    ],
    [invitationBusyId, t],
  );

  const activeMembers = useMemo(
    () => humanRoles.filter((row) => row.status !== "invited"),
    [humanRoles],
  );

  const memberColumns: CanvasTableColumn<MemberTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.invitations.membersCol.principal"),
        r: (row: MemberTableRow) => row.principalId,
      },
      {
        h: t("fleetPartners.invitations.membersCol.role"),
        r: (row: MemberTableRow) => row.roleCode,
      },
      {
        h: t("fleetPartners.invitations.membersCol.status"),
        r: (row: MemberTableRow) => (
          <CanvasPill tone={memberStatusTone(row.status)} dot>
            {memberStatusLabel(row.status, t)}
          </CanvasPill>
        ),
      },
      {
        h: t("fleetPartners.invitations.membersCol.validTo"),
        r: (row: MemberTableRow) =>
          row.validTo
            ? t("fleetPartners.humanRoles.until", { date: row.validTo })
            : t("fleetPartners.openEnded"),
      },
      {
        h: t("common.actions"),
        r: (row: MemberTableRow) =>
          row.status === "active" ? (
            <CanvasBtn
              disabled={disablingMembershipId === row.membershipId}
              onClick={() => void handleDisableMember(row)}
            >
              {disablingMembershipId === row.membershipId
                ? t("common.saving")
                : t("fleetPartners.invitations.disableAction")}
            </CanvasBtn>
          ) : null,
      },
    ],
    [disablingMembershipId, t],
  );

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        title={
          partner ? (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              <span>{partner.displayName || partner.legalName}</span>
              <CanvasPill tone={statusTone(partner.active)} dot>
                {partner.active
                  ? t("fleetPartners.status.active")
                  : t("fleetPartners.status.inactive")}
              </CanvasPill>
            </span>
          ) : (
            t("fleetPartners.detail.title")
          )
        }
        subtitle={t("fleetPartners.detail.subtitle", { id: fleetPartnerId })}
        actions={
          <>
            <Link href="/fleet-partners" style={{ textDecoration: "none" }}>
              <CanvasBtn>{t("fleetPartners.backToList")}</CanvasBtn>
            </Link>
            <CanvasBtn onClick={() => void loadDetail()}>
              {t("common.refresh")}
            </CanvasBtn>
            <CanvasBtn
              variant="primary"
              disabled={saving || !partnerForm}
              onClick={() => void handleSavePartner()}
            >
              {saving ? t("common.saving") : t("fleetPartners.savePartner")}
            </CanvasBtn>
          </>
        }
      />

      {error ? (
        <CanvasBanner
          tone="danger"
          title={t("fleetPartners.loadErrorTitle")}
          body={error}
        />
      ) : null}

      {loading || !partner || !partnerForm ? (
        <CanvasCard>{t("fleetPartners.detail.loading")}</CanvasCard>
      ) : (
        <>
          <CanvasCard
            title={t("fleetPartners.humanRoles.title")}
            subtitle={t("fleetPartners.humanRoles.subtitle")}
          >
            <div style={formGridStyle}>
              <CanvasField label={t("fleetPartners.humanRoles.entrySlug")}>
                <input
                  aria-label={t("fleetPartners.humanRoles.entrySlug")}
                  style={inputStyle()}
                  value={humanEntrySlug}
                  onChange={(event) => {
                    humanRequestVersion.current++;
                    setHumanEntrySlug(event.target.value);
                    setHumanRoles([]);
                    setHumanAck(null);
                  }}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.humanRoles.subject")}>
                <input
                  aria-label={t("fleetPartners.humanRoles.subject")}
                  style={inputStyle()}
                  value={humanSubject}
                  onChange={(event) => setHumanSubject(event.target.value)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.humanRoles.role")}>
                <select
                  aria-label={t("fleetPartners.humanRoles.role")}
                  style={inputStyle()}
                  value={humanRole}
                  onChange={(event) =>
                    setHumanRole(
                      event.target
                        .value as ManageFleetHumanRoleCommand["roleCode"],
                    )
                  }
                >
                  <option value="fleet_partner_admin">
                    {t("fleetPartners.humanRoles.admin")}
                  </option>
                  <option value="fleet_partner_ops">
                    {t("fleetPartners.humanRoles.ops")}
                  </option>
                  <option value="fleet_partner_finance">
                    {t("fleetPartners.humanRoles.finance")}
                  </option>
                </select>
              </CanvasField>
              <CanvasField label={t("fleetPartners.humanRoles.expiry")}>
                <input
                  aria-label={t("fleetPartners.humanRoles.expiry")}
                  type="datetime-local"
                  style={inputStyle()}
                  value={humanValidTo}
                  onChange={(event) => setHumanValidTo(event.target.value)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.humanRoles.state")}>
                <select
                  aria-label={t("fleetPartners.humanRoles.state")}
                  style={inputStyle()}
                  value={humanEnabled ? "active" : "disabled"}
                  onChange={(event) =>
                    setHumanEnabled(event.target.value === "active")
                  }
                >
                  <option value="active">
                    {t("fleetPartners.status.active")}
                  </option>
                  <option value="disabled">
                    {t("fleetPartners.humanRoles.disabled")}
                  </option>
                </select>
              </CanvasField>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <CanvasBtn
                disabled={!humanEntrySlug || humanSaving}
                onClick={() => void handleReadHumanRoles()}
              >
                {t("fleetPartners.humanRoles.read")}
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                disabled={!humanEntrySlug || !humanSubject || humanSaving}
                onClick={() => void handleManageHumanRole()}
              >
                {humanSaving
                  ? t("common.saving")
                  : t("fleetPartners.humanRoles.save")}
              </CanvasBtn>
            </div>
            {humanAck ? <p role="status">{humanAck}</p> : null}
            <ul>
              {humanRoles.map((row) => (
                <li key={row.membershipId}>
                  {row.principalId}: {row.roleCode} / {row.status}
                  {row.validTo
                    ? t("fleetPartners.humanRoles.until", { date: row.validTo })
                    : ""}
                </li>
              ))}
            </ul>
          </CanvasCard>

          <CanvasCard
            title={t("fleetPartners.invitations.title")}
            subtitle={t("fleetPartners.invitations.subtitle")}
          >
            <div style={formGridStyle}>
              <CanvasField label={t("fleetPartners.invitations.form.email")}>
                <input
                  aria-label={t("fleetPartners.invitations.form.email")}
                  type="email"
                  style={inputStyle()}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.invitations.form.role")}>
                <select
                  aria-label={t("fleetPartners.invitations.form.role")}
                  style={inputStyle()}
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(
                      event.target.value as InviteFleetStaffCommand["roleCode"],
                    )
                  }
                >
                  {FLEET_STAFF_ROLE_CODES.map((value) => (
                    <option key={value} value={value}>
                      {t(
                        `fleetPartners.humanRoles.${value.replace("fleet_partner_", "")}`,
                      )}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField label={t("fleetPartners.invitations.form.validTo")}>
                <input
                  aria-label={t("fleetPartners.invitations.form.validTo")}
                  type="datetime-local"
                  style={inputStyle()}
                  value={inviteValidTo}
                  onChange={(event) => setInviteValidTo(event.target.value)}
                />
              </CanvasField>
            </div>
            <div style={actionRowStyle}>
              <CanvasBtn
                variant="primary"
                disabled={!humanEntrySlug || !inviteEmail || issuingInvitation}
                onClick={() => void handleIssueInvitation()}
              >
                {issuingInvitation
                  ? t("common.creating")
                  : t("fleetPartners.invitations.issue")}
              </CanvasBtn>
            </div>
            {invitationAck ? <p role="status">{invitationAck}</p> : null}
            <div style={{ marginTop: 16 }}>
              {invitations.length === 0 ? (
                <div>{t("fleetPartners.invitations.empty")}</div>
              ) : (
                <CanvasTable
                  columns={invitationColumns}
                  rows={invitations as InvitationTableRow[]}
                />
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              {activeMembers.length === 0 ? (
                <div>{t("fleetPartners.invitations.membersEmpty")}</div>
              ) : (
                <CanvasTable
                  columns={memberColumns}
                  rows={activeMembers as MemberTableRow[]}
                />
              )}
            </div>
          </CanvasCard>

          <div style={heroStyle}>
            <CanvasCard
              title={t("fleetPartners.partnerProfileTitle")}
              subtitle={t("fleetPartners.partnerProfileSubtitle")}
            >
              <div style={formGridStyle}>
                <CanvasField label={t("fleetPartners.form.legalName")}>
                  <input
                    value={partnerForm.legalName}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, legalName: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.displayName")}>
                  <input
                    value={partnerForm.displayName}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, displayName: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField
                  label={t("fleetPartners.form.businessRegistrationNo")}
                >
                  <input
                    value={partnerForm.businessRegistrationNo}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? {
                              ...current,
                              businessRegistrationNo: event.target.value,
                            }
                          : current,
                      )
                    }
                    style={inputStyle(true)}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.contactName")}>
                  <input
                    value={partnerForm.contactName}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, contactName: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.contactPhone")}>
                  <input
                    value={partnerForm.contactPhone}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, contactPhone: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle(true)}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.partnershipType")}>
                  <select
                    value={partnerForm.partnershipType}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? {
                              ...current,
                              partnershipType: event.target
                                .value as FleetPartnerRecord["partnershipType"],
                            }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  >
                    {PARTNERSHIP_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {t(partnershipTypeKey(value))}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.active")}>
                  <select
                    value={String(partnerForm.active)}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? {
                              ...current,
                              active: event.target.value === "true",
                            }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  >
                    <option value="true">{t("common.yes")}</option>
                    <option value="false">{t("common.no")}</option>
                  </select>
                </CanvasField>
              </div>
            </CanvasCard>

            <CanvasCard
              title={t("fleetPartners.snapshotTitle")}
              subtitle={t("fleetPartners.snapshotSubtitle")}
            >
              <CanvasDL
                cols={1}
                items={[
                  {
                    k: t("fleetPartners.snapshot.partnerId"),
                    v: partner.fleetPartnerId,
                    mono: true,
                  },
                  {
                    k: t("fleetPartners.snapshot.status"),
                    v: partner.active
                      ? t("fleetPartners.status.active")
                      : t("fleetPartners.status.inactive"),
                  },
                  {
                    k: t("fleetPartners.snapshot.createdAt"),
                    v: partner.createdAt
                      ? formatDateTime(partner.createdAt)
                      : t("common.noValues"),
                  },
                  {
                    k: t("fleetPartners.snapshot.updatedAt"),
                    v: partner.updatedAt
                      ? formatDateTime(partner.updatedAt)
                      : t("common.noValues"),
                  },
                  {
                    k: t("fleetPartners.snapshot.affiliations"),
                    v: String(drivers.length),
                    mono: true,
                  },
                  {
                    k: t("fleetPartners.snapshot.rules"),
                    v: String(rules.length),
                    mono: true,
                  },
                  {
                    k: t("fleetPartners.snapshot.statements"),
                    v: String(statements.length),
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </div>

          <CanvasCard
            title={t("fleetPartners.drivers.title")}
            subtitle={t("fleetPartners.drivers.subtitle")}
          >
            <div style={formGridStyle}>
              <CanvasField label={t("fleetPartners.drivers.form.driverId")}>
                <input
                  value={affiliationForm.driverId}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      driverId: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.drivers.form.affiliationType")}
              >
                <select
                  value={affiliationForm.affiliationType}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      affiliationType: event.target
                        .value as DriverFleetAffiliationRecord["affiliationType"],
                    }))
                  }
                  style={inputStyle()}
                >
                  {AFFILIATION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(affiliationTypeKey(value))}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.drivers.form.effectiveFrom")}
              >
                <input
                  type="date"
                  value={affiliationForm.effectiveFrom}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.drivers.form.effectiveUntil")}
              >
                <input
                  type="date"
                  value={affiliationForm.effectiveUntil}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      effectiveUntil: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
            </div>
            <div style={actionRowStyle}>
              <CanvasBtn
                variant="primary"
                disabled={creatingAffiliation}
                onClick={() => void handleCreateAffiliation()}
              >
                {creatingAffiliation
                  ? t("common.creating")
                  : t("fleetPartners.drivers.createAction")}
              </CanvasBtn>
            </div>
            <div style={{ marginTop: 16 }}>
              {drivers.length === 0 ? (
                <div>{t("fleetPartners.drivers.empty")}</div>
              ) : (
                <CanvasTable
                  columns={driverColumns}
                  rows={drivers as DriverTableRow[]}
                />
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            title={t("fleetPartners.rules.title")}
            subtitle={t("fleetPartners.rules.subtitle")}
          >
            <div style={formGridStyle}>
              <CanvasField label={t("fleetPartners.rules.form.appliesTo")}>
                <select
                  value={ruleForm.appliesTo}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      appliesTo: event.target
                        .value as FleetPartnerRevenueShareRuleRecord["appliesTo"],
                    }))
                  }
                  style={inputStyle()}
                >
                  {RULE_APPLIES_TO_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {t(appliesToKey(value))}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.formula")}>
                <select
                  value={ruleForm.formula}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      formula: event.target
                        .value as FleetPartnerRevenueShareRuleRecord["formula"],
                    }))
                  }
                  style={inputStyle()}
                >
                  {RULE_FORMULAS.map((value) => (
                    <option key={value} value={value}>
                      {t(formulaKey(value))}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.serviceProduct")}>
                <input
                  value={ruleForm.serviceProduct}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      serviceProduct: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.rules.form.tenantServiceProgramId")}
              >
                <input
                  value={ruleForm.tenantServiceProgramId}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      tenantServiceProgramId: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.sourcePlatform")}>
                <input
                  value={ruleForm.sourcePlatform}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      sourcePlatform: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.driverGroup")}>
                <input
                  value={ruleForm.driverGroup}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      driverGroup: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.rateBps")}>
                <input
                  value={ruleForm.rateBps}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      rateBps: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.rules.form.fixedAmountMinor")}
              >
                <input
                  value={ruleForm.fixedAmountMinor}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      fixedAmountMinor: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.effectiveFrom")}>
                <input
                  type="date"
                  value={ruleForm.effectiveFrom}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.effectiveUntil")}>
                <input
                  type="date"
                  value={ruleForm.effectiveUntil}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      effectiveUntil: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
            </div>
            <div style={actionRowStyle}>
              <CanvasBtn
                variant="primary"
                disabled={creatingRule}
                onClick={() => void handleCreateRule()}
              >
                {creatingRule
                  ? t("common.creating")
                  : t("fleetPartners.rules.createAction")}
              </CanvasBtn>
            </div>
            <div style={{ marginTop: 16 }}>
              {rules.length === 0 ? (
                <div>{t("fleetPartners.rules.empty")}</div>
              ) : (
                <CanvasTable
                  columns={ruleColumns}
                  rows={rules as RuleTableRow[]}
                />
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            title={t("fleetPartners.statements.title")}
            subtitle={t("fleetPartners.statements.subtitle")}
          >
            {statements.length === 0 ? (
              <div>{t("fleetPartners.statements.empty")}</div>
            ) : (
              <CanvasTable
                columns={statementColumns}
                rows={statements as StatementTableRow[]}
              />
            )}
          </CanvasCard>
        </>
      )}
    </div>
  );
}

const mutedTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 16,
};

function inputStyle(mono = false): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 34,
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    padding: "8px 10px",
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
    fontSize: 12.5,
    background: theme.bgRaised,
    color: theme.text,
  };
}
