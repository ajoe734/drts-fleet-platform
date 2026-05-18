import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  FilterPill,
  FilterPillRow,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
  type DetailListItem,
} from "./index";

const canvasPartnersSrc = "/drts-design-canvas/Platform%20Admin.html#partners";
const canvasPartnerDetailSrc =
  "/drts-design-canvas/Platform%20Admin.html#partner-detail";

const shellSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [
      { href: "/", label: "Home" },
      {
        href: "/health",
        label: "Health & Alerts",
        badge: "2",
        badgeTone: "warning",
      },
    ],
  },
  {
    key: "tenant-governance",
    title: "Tenant Governance",
    items: [
      { href: "/tenants", label: "Tenants" },
      {
        href: "/partners",
        label: "Partners",
        badge: "2",
        badgeTone: "warning",
      },
      { href: "/users", label: "Users" },
    ],
  },
  {
    key: "fleet-compliance",
    title: "Fleet & Compliance",
    items: [
      { href: "/fleet", label: "Fleet & Devices" },
      { href: "/switchboard", label: "Switchboard" },
    ],
  },
  {
    key: "pricing-settlement",
    title: "Pricing & Settlement",
    items: [
      { href: "/pricing", label: "Pricing" },
      { href: "/payments", label: "Payments", badge: "3", badgeTone: "danger" },
    ],
  },
  {
    key: "platform-layer",
    title: "Platform Layer",
    items: [
      { href: "/notices", label: "Notices" },
      { href: "/audit", label: "Audit Trail" },
      { href: "/feature-flags", label: "Feature Flags" },
      { href: "/adapter-registry", label: "Adapter Registry" },
    ],
  },
];

const pageStackStyle = {
  maxWidth: "1160px",
  margin: "0 auto",
  display: "grid",
  gap: "20px",
};

const comparisonGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
  gap: "16px",
  alignItems: "start" as const,
  overflowX: "auto" as const,
};

const watchlistGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const watchlistCardStyle = {
  display: "grid",
  gap: "10px",
  padding: "14px 16px",
  borderRadius: "16px",
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
};

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 1fr)",
  gap: "16px",
  alignItems: "start" as const,
};

const anchorSectionStyle = {
  display: "grid",
  gap: "12px",
};

const statusSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const buttonGroupStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap" as const,
};

function actionButtonStyle(
  tone: "primary" | "secondary",
): Record<string, string | number> {
  if (tone === "primary") {
    return {
      border: "1px solid #0f6d8a",
      background: "#0f6d8a",
      color: "#ffffff",
      borderRadius: "999px",
      padding: "10px 14px",
      fontSize: "13px",
      fontWeight: 700,
      cursor: "pointer",
    };
  }

  return {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: "999px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  };
}

type StoryPartnerEntry = {
  entrySlug: string;
  displayName: string;
  partnerCode: string;
  tenantId: string;
  programId: string;
  programCode: string;
  businessDispatchSubtype: string;
  authMode: string;
  eligibilityMode: string;
  status: "active" | "inactive" | "revoked";
  statusTone: "success" | "warning" | "danger";
  themeAccent: string;
  entryHost: string;
  entryPath: string;
  updatedAt: string;
  supportEmail: string;
  supportPhone: string;
  auditSource: string;
  contractId: string;
  adapterCode: string;
  adapterVersion: string;
  adapterKind: string;
  fallbackQueue: string;
  fallbackFields: string;
  activeFlag: boolean;
  readinessMissing: number;
};

const partnerEntries: StoryPartnerEntry[] = [
  {
    entrySlug: "ctbc-elite",
    displayName: "CTBC World Elite",
    partnerCode: "CTBC",
    tenantId: "tenant-ctbc-001",
    programId: "world_elite",
    programCode: "WE",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    status: "active",
    statusTone: "success",
    themeAccent: "#0f6d8a",
    entryHost: "entry.ctbc.drts.io",
    entryPath: "/elite",
    updatedAt: "2026-05-10 20:35",
    supportEmail: "elite-card@ctbcbank.com",
    supportPhone: "+886 2 2718 8800",
    auditSource: "platform_admin.seed",
    contractId: "elig_ctbc_world_elite_v3",
    adapterCode: "bank-card-inline",
    adapterVersion: "2026.05.01",
    adapterKind: "inline_verifier",
    fallbackQueue: "ops_partner_review",
    fallbackFields: "cardLast4, memberId, traceId",
    activeFlag: true,
    readinessMissing: 0,
  },
  {
    entrySlug: "grand-hotel-prestige",
    displayName: "Grand Hotel Prestige",
    partnerCode: "GHTL",
    tenantId: "tenant-grand-014",
    programId: "vip_stay",
    programCode: "VIP",
    businessDispatchSubtype: "hotel_concierge",
    authMode: "partner_api_key",
    eligibilityMode: "none",
    status: "inactive",
    statusTone: "warning",
    themeAccent: "#7c3aed",
    entryHost: "arrival.ghprestige.com",
    entryPath: "/vip-arrival",
    updatedAt: "2026-05-10 18:12",
    supportEmail: "hospitality-ops@ghprestige.com",
    supportPhone: "+886 2 2321 6610",
    auditSource: "partner_import.seed",
    contractId: "elig_grand_hotel_v1",
    adapterCode: "manual_review",
    adapterVersion: "2026.04.18",
    adapterKind: "manual_queue",
    fallbackQueue: "ops_hotel_priority",
    fallbackFields: "guestName, confirmationCode",
    activeFlag: false,
    readinessMissing: 2,
  },
  {
    entrySlug: "acme-enterprise-mobility",
    displayName: "Acme Enterprise Mobility",
    partnerCode: "ACME",
    tenantId: "tenant-acme-020",
    programId: "corp_mobility",
    programCode: "CORP",
    businessDispatchSubtype: "enterprise_commute",
    authMode: "partner_portal_bearer",
    eligibilityMode: "reference_token",
    status: "revoked",
    statusTone: "danger",
    themeAccent: "#ea580c",
    entryHost: "mobility.acme.example",
    entryPath: "/travel",
    updatedAt: "2026-05-09 14:04",
    supportEmail: "mobility-help@acme.example",
    supportPhone: "+1 415 555 0192",
    auditSource: "platform_revoke.flow",
    contractId: "elig_acme_reference_v2",
    adapterCode: "reference-token",
    adapterVersion: "2026.03.11",
    adapterKind: "token_verifier",
    fallbackQueue: "ops_enterprise_fallback",
    fallbackFields: "employeeId, benefitRef, traceId",
    activeFlag: false,
    readinessMissing: 1,
  },
];

const detailEntry = partnerEntries[0]!;

const readinessItems = [
  {
    id: "audit",
    label: "Audit source",
    value: detailEntry.auditSource,
    ready: true,
  },
  {
    id: "auth",
    label: "Auth mode",
    value: detailEntry.authMode,
    ready: true,
  },
  {
    id: "eligibility",
    label: "Eligibility mode",
    value: detailEntry.eligibilityMode,
    ready: true,
  },
  {
    id: "contract",
    label: "Eligibility contract",
    value: detailEntry.contractId,
    ready: true,
  },
  {
    id: "branding",
    label: "Branding package",
    value: `${detailEntry.displayName} · ${detailEntry.themeAccent}`,
    ready: true,
  },
  {
    id: "support",
    label: "Support metadata",
    value: detailEntry.supportEmail,
    ready: true,
  },
  {
    id: "routing",
    label: "Entry routing",
    value: `https://${detailEntry.entryHost}${detailEntry.entryPath}`,
    ready: true,
  },
  {
    id: "credentials",
    label: "Credential coverage",
    value: "2 active",
    ready: true,
  },
];

const credentialRows = [
  {
    keyId: "cred_ctbc_01",
    maskedValue: "ctbc_live_...aE32",
    createdAt: "2026-04-12 10:03",
    lastUsedAt: "2026-05-10 18:24",
    source: "issue_partner_ingress_credential",
    revokedAt: null,
  },
  {
    keyId: "cred_ctbc_02",
    maskedValue: "ctbc_live_...K1yQ",
    createdAt: "2026-03-01 09:22",
    lastUsedAt: "2026-05-10 16:10",
    source: "rotate_partner_ingress_credential",
    revokedAt: null,
  },
  {
    keyId: "cred_ctbc_legacy",
    maskedValue: "ctbc_live_...8B2k",
    createdAt: "2026-02-10 12:40",
    lastUsedAt: "2026-04-28 07:51",
    source: "legacy_seed",
    revokedAt: "2026-05-01 00:00",
  },
];

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "12px", alignContent: "start" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

function PlatformPartnersShell({
  breadcrumb,
  children,
}: {
  breadcrumb: { label: string }[];
  children: ReactNode;
}) {
  return (
    <ManagementShell
      sidebar={{
        brand: "DRTS Fleet",
        brandSub: "Platform Admin",
        brandIcon: (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            PA
          </span>
        ),
        sections: shellSections,
        currentPath: "/partners",
      }}
      topbar={{
        breadcrumb,
        envLabel: "production",
        envTone: "platform",
      }}
    >
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

function partnerStatusTone(
  entry: StoryPartnerEntry,
): "success" | "warning" | "danger" {
  return entry.statusTone;
}

function readinessLabel(entry: StoryPartnerEntry) {
  return entry.readinessMissing === 0
    ? "ready"
    : `${entry.readinessMissing} gap(s)`;
}

function readinessTone(
  entry: StoryPartnerEntry,
): "success" | "warning" | "danger" {
  return entry.readinessMissing === 0 ? "success" : "warning";
}

function PartnersListBuiltView() {
  const counts = {
    all: partnerEntries.length,
    active: partnerEntries.filter((entry) => entry.status === "active").length,
    inactive: partnerEntries.filter((entry) => entry.status === "inactive")
      .length,
    revoked: partnerEntries.filter((entry) => entry.status === "revoked")
      .length,
    attention: partnerEntries.filter((entry) => entry.readinessMissing > 0)
      .length,
  };
  const readinessWatchlist = partnerEntries.filter(
    (entry) => entry.readinessMissing > 0 || entry.status !== "active",
  );

  return (
    <PlatformPartnersShell
      breadcrumb={[{ label: "Platform Admin" }, { label: "Partners" }]}
    >
      <PageHeader
        eyebrow="Partner Governance"
        title="Partner entry"
        subtitle="Govern bank, hotel, and enterprise-facing entry programs, readiness, and ingress controls."
        actions={
          <div style={buttonGroupStyle}>
            <button type="button" style={actionButtonStyle("secondary")}>
              Refresh
            </button>
            <button type="button" style={actionButtonStyle("primary")}>
              Create entry
            </button>
          </div>
        }
      />

      <KpiRow minWidth="220px">
        <KpiCard
          label="Active entries"
          value={counts.active}
          detail={`${counts.all} total · ${counts.inactive} inactive`}
          tone="platform"
        />
        <KpiCard
          label="Needs attention"
          value={counts.attention}
          detail="Branding, routing, support, or audit metadata is incomplete"
          tone="warning"
        />
        <KpiCard
          label="Revoked entries"
          value={counts.revoked}
          detail="Revoked entries stay visible for audit lineage"
          tone="danger"
        />
      </KpiRow>

      <WorkflowPanel
        title="Readiness watchlist"
        description="Keep partner entries with readiness gaps, inactive posture, or revocation risk in a single governance lane before opening the detail route."
        tone="platform"
        meta={
          <FilterPillRow>
            <FilterPill
              label="All entries"
              count={counts.all}
              tone="neutral"
              active
            />
            <FilterPill label="active" count={counts.active} tone="success" />
            <FilterPill
              label="inactive"
              count={counts.inactive}
              tone="warning"
            />
            <FilterPill
              label="attention"
              count={counts.attention}
              tone="warning"
            />
            <FilterPill label="revoked" count={counts.revoked} tone="danger" />
          </FilterPillRow>
        }
      >
        <div style={watchlistGridStyle}>
          {readinessWatchlist.map((entry) => (
            <div key={entry.entrySlug} style={watchlistCardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: entry.themeAccent,
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {entry.partnerCode.slice(0, 2)}
                  </span>
                  <DataCellStack
                    primary={<strong>{entry.displayName}</strong>}
                    secondary={`/${entry.entrySlug}`}
                    tertiary={`${entry.partnerCode} · ${entry.programId}`}
                  />
                </div>
                <StatusChip
                  label={entry.status}
                  tone={partnerStatusTone(entry)}
                />
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <StatusChip label={entry.authMode} tone="info" />
                <StatusChip label={entry.eligibilityMode} tone="neutral" />
                <StatusChip
                  label={readinessLabel(entry)}
                  tone={readinessTone(entry)}
                />
              </div>
              <div style={{ color: "#64748b", fontSize: "12.5px" }}>
                Updated: {entry.updatedAt}
              </div>
            </div>
          ))}
        </div>
      </WorkflowPanel>

      <CalloutBanner
        tone="warning"
        title="Promotion readiness is incomplete"
        description="2 partner entries still have readiness gaps and should not be promoted blindly."
      />

      <DataViewCard
        title="Entry roster"
        subtitle="Platform-owned roster for routing, auth, eligibility, readiness, and lifecycle controls."
        tone="platform"
        summary="Use the detail route to issue credentials, edit routing, and keep promotion authority explicit."
      >
        <DataTable
          minWidth={1020}
          columns={[
            { label: "Entry", width: "240px" },
            { label: "Tenant / program", width: "200px" },
            { label: "Auth + eligibility", width: "180px" },
            { label: "Status", width: "120px" },
            { label: "Readiness", width: "120px" },
            { label: "Updated", width: "150px" },
            { label: "Actions", width: "140px" },
          ]}
        >
          {partnerEntries.map((entry) => (
            <Tr key={entry.entrySlug}>
              <Td>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: entry.themeAccent,
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {entry.partnerCode.slice(0, 2)}
                  </span>
                  <DataCellStack
                    primary={<strong>{entry.displayName}</strong>}
                    secondary={`/${entry.entrySlug}`}
                    tertiary={entry.entryHost}
                  />
                </div>
              </Td>
              <Td>
                <DataCellStack
                  primary={`${entry.tenantId}`}
                  secondary={entry.programId}
                  tertiary={entry.programCode}
                />
              </Td>
              <Td>
                <DataCellStack
                  primary={entry.authMode}
                  secondary={entry.eligibilityMode}
                  tertiary={entry.businessDispatchSubtype}
                />
              </Td>
              <Td>
                <StatusChip
                  label={entry.status}
                  tone={partnerStatusTone(entry)}
                />
              </Td>
              <Td>
                <StatusChip
                  label={readinessLabel(entry)}
                  tone={readinessTone(entry)}
                />
              </Td>
              <Td>{entry.updatedAt}</Td>
              <Td>
                <StatusChip label="Open detail" tone="platform" />
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </PlatformPartnersShell>
  );
}

function PartnerDetailBuiltView() {
  const activeCredentialCount = credentialRows.filter(
    (credential) => !credential.revokedAt,
  ).length;
  const readinessReadyCount = readinessItems.filter(
    (item) => item.ready,
  ).length;
  const readinessMissingCount = readinessItems.length - readinessReadyCount;
  const readinessComplete = readinessMissingCount === 0;
  const readinessFilterCountProps =
    readinessMissingCount > 0 ? { count: readinessMissingCount } : {};
  const credentialPreviewUrl = `https://${detailEntry.entryHost}${detailEntry.entryPath}`;

  const detailItems: DetailListItem[] = [
    {
      id: "tenant",
      label: "Tenant",
      value: detailEntry.tenantId,
    },
    {
      id: "partner",
      label: "Partner / program",
      value: `${detailEntry.partnerCode} · ${detailEntry.programId}`,
      hint: detailEntry.programCode,
    },
    {
      id: "subtype",
      label: "Dispatch subtype",
      value: detailEntry.businessDispatchSubtype,
    },
    {
      id: "entry-host",
      label: "Entry host",
      value: detailEntry.entryHost,
    },
    {
      id: "entry-path",
      label: "Entry path",
      value: detailEntry.entryPath,
    },
    {
      id: "audit-source",
      label: "Audit source",
      value: detailEntry.auditSource,
    },
    {
      id: "eligibility-contract",
      label: "Eligibility contract",
      value: detailEntry.contractId,
      hint: `${detailEntry.adapterCode} · ${detailEntry.adapterVersion}`,
      columnSpan: 2,
    },
  ];

  const snapshotItems: DetailListItem[] = [
    {
      id: "updated-at",
      label: "Last updated",
      value: detailEntry.updatedAt,
    },
    {
      id: "credential-coverage",
      label: "Credential coverage",
      value: `${activeCredentialCount} active`,
      hint: `${credentialRows.length} issued total`,
    },
    {
      id: "support-contact",
      label: "Support contact",
      value: detailEntry.supportEmail,
      hint: detailEntry.supportPhone,
    },
    {
      id: "entry-route",
      label: "Entry route",
      value: credentialPreviewUrl,
    },
  ];

  const authItems: DetailListItem[] = [
    {
      id: "auth-mode",
      label: "Auth mode",
      value: detailEntry.authMode,
      hint: "Platform-managed ingress secrets gate partner traffic.",
    },
    {
      id: "dispatch-subtype",
      label: "Dispatch subtype",
      value: detailEntry.businessDispatchSubtype,
    },
    {
      id: "rollout-flag",
      label: "Rollout flag",
      value: detailEntry.activeFlag ? "active" : "inactive",
      hint: "Keep lifecycle status and rollout flag aligned.",
    },
    {
      id: "credential-coverage",
      label: "Credential coverage",
      value: `${activeCredentialCount} active`,
      tone: "success",
    },
  ];

  const eligibilityItems: DetailListItem[] = [
    {
      id: "eligibility-mode",
      label: "Eligibility mode",
      value: detailEntry.eligibilityMode,
      hint: "Eligibility remains a platform-governed pre-dispatch gate.",
    },
    {
      id: "contract-id",
      label: "Contract ID",
      value: detailEntry.contractId,
      hint: `${detailEntry.adapterCode} · ${detailEntry.adapterVersion}`,
    },
    {
      id: "adapter-kind",
      label: "Adapter posture",
      value: detailEntry.adapterKind,
      hint: "Inline verifier remains attached to the contract snapshot.",
    },
    {
      id: "fallback",
      label: "Manual fallback",
      value: "Ops queue required",
      hint: `${detailEntry.fallbackQueue} · ${detailEntry.fallbackFields}`,
    },
  ];

  const routingItems: DetailListItem[] = [
    {
      id: "route-host",
      label: "Entry host",
      value: detailEntry.entryHost,
    },
    {
      id: "route-path",
      label: "Entry path",
      value: detailEntry.entryPath,
    },
    {
      id: "display-name",
      label: "Display name",
      value: detailEntry.displayName,
    },
    {
      id: "theme-accent",
      label: "Theme accent",
      value: detailEntry.themeAccent,
      hint: "Branding metadata remains platform-governed.",
    },
    {
      id: "support-email",
      label: "Support email",
      value: detailEntry.supportEmail,
    },
    {
      id: "support-phone",
      label: "Support phone",
      value: detailEntry.supportPhone,
    },
  ];

  const auditItems: DetailListItem[] = [
    {
      id: "created-by",
      label: "Created by",
      value: "ivy.chen@drts.io",
      hint: "2026-03-01 09:22",
    },
    {
      id: "updated-by",
      label: "Updated by",
      value: "kai.liu@drts.io",
      hint: detailEntry.updatedAt,
    },
    {
      id: "request-id",
      label: "Request ID",
      value: "req_partner_1032",
    },
    {
      id: "revoked-at",
      label: "Revoked at",
      value: "-",
    },
    {
      id: "revoke-reason",
      label: "Revoke reason",
      value: "-",
    },
    {
      id: "audit-source",
      label: "Audit source",
      value: detailEntry.auditSource,
    },
  ];

  return (
    <PlatformPartnersShell
      breadcrumb={[
        { label: "Platform Admin" },
        { label: "Partners" },
        { label: detailEntry.displayName },
      ]}
    >
      <PageHeader
        eyebrow="Partner entry detail"
        title={detailEntry.displayName}
        subtitle={`/${detailEntry.entrySlug} · ${detailEntry.partnerCode} · ${detailEntry.programId}`}
        meta={[
          {
            label: "Status",
            value: detailEntry.status,
            tone: partnerStatusTone(detailEntry),
          },
          {
            label: "Auth",
            value: detailEntry.authMode,
            tone: "info",
          },
          {
            label: "Eligibility",
            value: detailEntry.eligibilityMode,
            tone: "info",
          },
        ]}
        actions={
          <div style={buttonGroupStyle}>
            <button type="button" style={actionButtonStyle("secondary")}>
              Back to entries
            </button>
            <button type="button" style={actionButtonStyle("secondary")}>
              Refresh
            </button>
          </div>
        }
      />

      <KpiRow minWidth="220px">
        <KpiCard
          label="Lifecycle"
          value={detailEntry.status}
          detail={detailEntry.activeFlag ? "active flag on" : "active flag off"}
          tone={partnerStatusTone(detailEntry)}
        />
        <KpiCard
          label="Readiness checks"
          value={`${readinessReadyCount}/${readinessItems.length}`}
          detail="All checks passed"
          tone="success"
        />
        <KpiCard
          label="Active credentials"
          value={activeCredentialCount}
          detail="Last used 2026-05-10 18:24"
          tone="accent"
        />
      </KpiRow>

      <WorkflowPanel
        title="Entry sections"
        description="Use anchored sections to keep overview, auth, eligibility, routing, readiness, credentials, and audit posture in the same review lane."
      >
        <FilterPillRow>
          <FilterPill label="Overview" tone="neutral" active />
          <FilterPill label="Auth" tone="info" />
          <FilterPill label="Eligibility" tone="neutral" />
          <FilterPill label="Routing" tone="platform" />
          <FilterPill
            label="Readiness"
            tone={readinessComplete ? "success" : "warning"}
            {...readinessFilterCountProps}
          />
          <FilterPill label="Lifecycle" tone="warning" />
          <FilterPill
            label="Credentials"
            tone="info"
            count={activeCredentialCount}
          />
          <FilterPill label="Audit" tone="neutral" />
        </FilterPillRow>
      </WorkflowPanel>

      <div style={anchorSectionStyle}>
        <div style={heroGridStyle}>
          <DataViewCard
            title="Entry overview"
            subtitle="Core identity, audit, and eligibility linkage for the selected entry."
            tone="platform"
          >
            <DetailMetadataGrid items={detailItems} minColumnWidth="220px" />
          </DataViewCard>
          <DataViewCard
            title="Promotion posture"
            subtitle="Keep readiness, entry routing, and credential coverage visible before enabling partner-facing traffic."
            tone="platform"
            actions={
              <button type="button" style={actionButtonStyle("secondary")}>
                Preview route
              </button>
            }
          >
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <StatusChip
                  label={detailEntry.status}
                  tone={partnerStatusTone(detailEntry)}
                />
                <StatusChip label={detailEntry.authMode} tone="info" />
                <StatusChip
                  label={detailEntry.eligibilityMode}
                  tone="neutral"
                />
              </div>
              <div style={statusSummaryGridStyle}>
                <CalloutBanner
                  tone="success"
                  title="Promotion clear"
                  description="Checklist is clear. The entry can be promoted without hiding platform authority boundaries."
                />
                <CalloutBanner
                  tone="info"
                  title="Credential posture"
                  description={`${activeCredentialCount} active credential(s) can gate ingress traffic.`}
                />
              </div>
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={snapshotItems}
              />
            </div>
          </DataViewCard>
        </div>
      </div>

      <WorkflowSplitLayout
        main={
          <>
            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Auth authority"
                description="Keep partner entry auth decisions explicit so rollout authority does not drift into tenant-owned settings."
              >
                <DetailMetadataGrid items={authItems} minColumnWidth="220px" />
              </WorkflowPanel>
            </div>

            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Eligibility contract"
                description="Partner-side eligibility is governed by contract snapshots, fallback policy, and adapter posture."
              >
                <DetailMetadataGrid
                  items={eligibilityItems}
                  minColumnWidth="220px"
                />
              </WorkflowPanel>
            </div>

            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Routing and branding"
                description="Entry routing, partner identity, auth mode, and branding remain platform-governed surfaces."
                footer="Storybook pins the governance layout; the shipped route keeps these fields editable in-app."
              >
                <DetailMetadataGrid
                  items={routingItems}
                  minColumnWidth="220px"
                />
              </WorkflowPanel>
            </div>
          </>
        }
        side={
          <>
            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Readiness checks"
                description="Do not enable the entry until every required routing, branding, and support dependency is present."
              >
                <div style={{ display: "grid", gap: "8px" }}>
                  {readinessItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ display: "grid", gap: "4px" }}>
                        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                          {item.label}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {item.value}
                        </span>
                      </div>
                      <StatusChip
                        label={item.ready ? "Ready" : "Missing"}
                        tone={item.ready ? "success" : "warning"}
                      />
                    </div>
                  ))}
                </div>
              </WorkflowPanel>
            </div>

            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Lifecycle controls"
                description="Lifecycle actions affect whether external traffic can reach this partner-facing entry."
              >
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <StatusChip
                    label={detailEntry.status}
                    tone={partnerStatusTone(detailEntry)}
                  />
                  <StatusChip label={detailEntry.authMode} tone="info" />
                  <StatusChip label={detailEntry.eligibilityMode} tone="info" />
                </div>
                <div style={buttonGroupStyle}>
                  <button type="button" style={actionButtonStyle("secondary")}>
                    Deactivate
                  </button>
                  <button type="button" style={actionButtonStyle("secondary")}>
                    Revoke
                  </button>
                </div>
              </WorkflowPanel>
            </div>

            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Active credentials"
                description="Rotate ingress credentials here. Plaintext material is only shown once after issuance."
              >
                <button type="button" style={actionButtonStyle("secondary")}>
                  Rotate credential
                </button>
                <CalloutBanner
                  tone="info"
                  title="Plaintext credential"
                  description="ctbc_live_01a2b3c4d5e6"
                />
                <div style={{ display: "grid", gap: "10px" }}>
                  {credentialRows.map((credential) => (
                    <div
                      key={credential.keyId}
                      style={{
                        display: "grid",
                        gap: "6px",
                        padding: "12px 14px",
                        borderRadius: "14px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <strong
                          style={{ fontSize: "13.5px", color: "#0f172a" }}
                        >
                          {credential.maskedValue}
                        </strong>
                        <StatusChip
                          label={credential.revokedAt ? "Revoked" : "Active"}
                          tone={credential.revokedAt ? "danger" : "success"}
                        />
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                        Created: {credential.createdAt}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                        Last used: {credential.lastUsedAt}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                        Source: {credential.source}
                      </div>
                    </div>
                  ))}
                </div>
              </WorkflowPanel>
            </div>

            <div style={anchorSectionStyle}>
              <WorkflowPanel
                title="Audit lineage"
                description="Creation, update, revoke, and credential activity must remain visible for platform review."
              >
                <DetailMetadataGrid items={auditItems} minColumnWidth="220px" />
              </WorkflowPanel>
            </div>
          </>
        }
      />
    </PlatformPartnersShell>
  );
}

const meta = {
  title: "Platform Admin/Partners",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin partner list and partner detail parity targets for `ADM-UI-RD-005`. Each built view is rendered beside the corresponding `PA_Partners` or `PA_PartnerDetail` artboard from `docs/05-ui/drts-design-canvas/Platform Admin.html`, while keeping the current route's governance controls in frame.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function ParityLayout({
  title,
  description,
  canvasSrc,
  canvasTitle,
  built,
}: {
  title: string;
  description: string;
  canvasSrc: string;
  canvasTitle: string;
  built: ReactNode;
}) {
  return (
    <div style={{ padding: "24px", background: "#e2e8f0" }}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#475569",
            }}
          >
            Platform Admin Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
        <div style={comparisonGridStyle}>
          <ComparisonFrame title="Built" subtitle={title}>
            <div
              style={{
                minWidth: "720px",
                borderRadius: "22px",
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
              }}
            >
              {built}
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle={`docs/05-ui/drts-design-canvas/Platform Admin.html${canvasSrc.split("Platform%20Admin.html")[1]}`}
          >
            <iframe
              src={canvasSrc}
              title={canvasTitle}
              style={{
                width: "100%",
                minWidth: "720px",
                height: "960px",
                border: "1px solid #cbd5e1",
                borderRadius: "22px",
                background: "#ffffff",
              }}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  );
}

export const PlatformPartnersParity: Story = {
  name: "PA_Partners parity",
  render: () => (
    <ParityLayout
      title="Built partner roster with readiness watchlist, governance KPIs, and partner-entry table."
      description="The built page keeps the current route's readiness-watchlist posture while remaining visually comparable to the Platform Admin partners artboard."
      canvasSrc={canvasPartnersSrc}
      canvasTitle="Platform Admin partners artboard"
      built={<PartnersListBuiltView />}
    />
  ),
};

export const PlatformPartnerDetailParity: Story = {
  name: "PA_PartnerDetail parity",
  render: () => (
    <ParityLayout
      title="Built partner detail with overview, promotion snapshot, readiness lane, lifecycle controls, credentials, and audit lineage."
      description="The built page keeps readiness, credentials, routing, and audit posture co-located on the same detail surface for manual comparison against the Platform Admin partner detail artboard."
      canvasSrc={canvasPartnerDetailSrc}
      canvasTitle="Platform Admin partner detail artboard"
      built={<PartnerDetailBuiltView />}
    />
  ),
};
