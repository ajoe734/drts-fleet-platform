"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import {
  CanvasIcon,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

export type ContractRow = Record<string, unknown> & {
  contractId: string;
  serviceScope: string;
  operatingAreaId: string | null;
  kindKey: string;
  kindLabel: string;
  partnerId: string;
  partnerDisplayName: string;
  partnerType: string;
  partnerEntrySlug: string | null;
  vehicleId: string;
  statusKey: "all" | "active" | "draft" | "expiring" | "terminated";
  statusLabel: string;
  statusTone: CanvasTone;
  lifecycleLabel: string;
  startAt: string;
  endAt: string;
  termLabel: string;
  effectiveFromLabel: string;
  effectiveToLabel: string;
  daysToExpiry: number | null;
  expiringSoon: boolean;
  expired: boolean;
  keyTermsLabel: string;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
};

export type PartnerRelationRow = Record<string, unknown> & {
  partnerId: string;
  displayName: string;
  entrySlug: string;
  programId: string;
  partnerTypeLabel: string;
  eligibilityLabel: string;
  authLabel: string;
  statusLabel: string;
  statusTone: CanvasTone;
  governanceHref: string;
};

type AppOrigins = {
  opsConsole: string;
  platformAdmin: string;
  tenantConsole: string;
};

type ContractsTableProps = {
  locale: Locale;
  rows: ContractRow[];
  appOrigins: AppOrigins;
};

type PartnerRelationsTableProps = {
  locale: Locale;
  rows: PartnerRelationRow[];
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
  whiteSpace: "normal",
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 11.5,
  minWidth: 0,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  minWidth: 0,
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: {
      bg: theme.dangerBg,
      fg: theme.danger,
      bd: theme.dangerBorder,
    },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: {
      bg: theme.accentBg,
      fg: theme.accent,
      bd: theme.accentBorder,
    },
    neutral: {
      bg: theme.surfaceLo,
      fg: theme.textMuted,
      bd: theme.border,
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return {
    fontSize: 10.5,
    color: colors[tone],
    letterSpacing: 0.2,
  };
}

function resolveAppOrigin(
  targetApp: CrossAppResourceLink["targetApp"],
  appOrigins: AppOrigins,
) {
  if (targetApp === "platform-admin") return appOrigins.platformAdmin;
  if (targetApp === "tenant-console") return appOrigins.tenantConsole;
  return appOrigins.opsConsole;
}

function buildCrossAppHref(link: CrossAppResourceLink, appOrigins: AppOrigins) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }

  return `${resolveAppOrigin(link.targetApp, appOrigins)}${link.route.startsWith("/") ? link.route : `/${link.route}`}`;
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return "neutral";
  }
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function actionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_contract_detail":
      return copy(locale, "Contract detail", "合約詳情");
    case "open_partner_governance":
      return copy(locale, "Partner governance", "夥伴治理");
    case "open_fleet_governance":
      return copy(locale, "Fleet governance", "車隊治理");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) {
    return null;
  }

  if (action.disabledReasonCode === "contract_detail_pending") {
    return copy(
      locale,
      "Read-only detail route ships in a follow-up ops leaf (Q-OPS03).",
      "唯讀詳情路由將由後續 ops 子任務交付（Q-OPS03）。",
    );
  }

  return formatOpsCodeLabel(locale, action.disabledReasonCode);
}

function buildActionHref(
  action: ResourceActionDescriptor,
  row: ContractRow,
  appOrigins: AppOrigins,
): string | null {
  switch (action.action) {
    case "open_contract_detail":
      return `/contracts/${encodeURIComponent(row.contractId)}`;
    case "open_partner_governance":
    case "open_fleet_governance":
      return row.crossAppLinks[0]
        ? buildCrossAppHref(row.crossAppLinks[0], appOrigins)
        : null;
    default:
      return null;
  }
}

function isActionNewTab(action: ResourceActionDescriptor, row: ContractRow) {
  if (
    action.action === "open_partner_governance" ||
    action.action === "open_fleet_governance"
  ) {
    return row.crossAppLinks[0]?.openMode === "new_tab";
  }

  return false;
}

function renderAction(
  action: ResourceActionDescriptor,
  row: ContractRow,
  locale: Locale,
  key: string,
  appOrigins: AppOrigins,
): ReactNode {
  const label = actionLabel(action, locale);
  const href = action.enabled ? buildActionHref(action, row, appOrigins) : null;
  const reason = actionReason(action, locale);

  return (
    <div key={key} style={{ display: "grid", gap: 4 }}>
      {href ? (
        <Link
          href={href}
          target={isActionNewTab(action, row) ? "_blank" : undefined}
          rel={isActionNewTab(action, row) ? "noreferrer" : undefined}
          style={linkButtonStyle(actionTone(action))}
        >
          {label}
          {isActionNewTab(action, row) ? (
            <CanvasIcon name="ext" size={11} />
          ) : null}
        </Link>
      ) : (
        <span
          style={linkButtonStyle(actionTone(action), !action.enabled)}
          title={reason ?? undefined}
        >
          {label}
        </span>
      )}
      <span style={tinyMetaStyle(actionTone(action))}>
        {copy(locale, `risk:${action.riskLevel}`, `風險:${action.riskLevel}`)}
        {action.requiresReason
          ? copy(locale, " · reason required", " · 需填原因")
          : ""}
      </span>
      {!action.enabled && reason ? (
        <span style={mutedTextStyle}>{reason}</span>
      ) : null}
    </div>
  );
}

function buildContractColumns(
  locale: Locale,
  appOrigins: AppOrigins,
): CanvasTableColumn<ContractRow>[] {
  return [
    {
      h: copy(locale, "CONTRACT", "合約"),
      w: 200,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...primaryTextStyle, ...monoTextStyle }}>
            {row.contractId}
          </span>
          <span style={secondaryTextStyle}>{row.serviceScope}</span>
          <span style={{ ...mutedTextStyle, ...monoTextStyle }}>
            {row.operatingAreaId ?? copy(locale, "no area", "無營運區")}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "KIND", "類型"),
      w: 130,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.kindLabel}</span>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.vehicleId}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "COUNTERPARTY", "交易對手"),
      w: 220,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.partnerDisplayName}</span>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.partnerId} · {formatOpsCodeLabel(locale, row.partnerType)}
          </span>
          {row.partnerEntrySlug ? (
            <span style={mutedTextStyle}>{row.partnerEntrySlug}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy(locale, "TERM", "合約期間"),
      w: 210,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...primaryTextStyle, ...monoTextStyle }}>
            {row.termLabel}
          </span>
          <span
            style={{
              ...secondaryTextStyle,
              color: row.expiringSoon
                ? theme.warn
                : row.expired
                  ? theme.danger
                  : theme.textDim,
            }}
          >
            {row.expired
              ? copy(locale, "Expired", "已到期")
              : row.daysToExpiry === null
                ? copy(locale, "Open-ended", "無到期日")
                : row.expiringSoon
                  ? copy(
                      locale,
                      `Expires in ${row.daysToExpiry}d`,
                      `${row.daysToExpiry} 天後到期`,
                    )
                  : copy(
                      locale,
                      `${row.daysToExpiry}d remaining`,
                      `剩 ${row.daysToExpiry} 天`,
                    )}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "STATUS / TERMS", "狀態 / 條款"),
      w: 230,
      r: (row) => (
        <div style={stackStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill theme={theme} tone={row.statusTone} dot>
              {row.statusLabel}
            </Pill>
            <Pill theme={theme} tone="neutral">
              {row.lifecycleLabel}
            </Pill>
          </div>
          <span style={secondaryTextStyle}>{row.keyTermsLabel}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "ACTIONS", "操作"),
      w: 220,
      r: (row) => (
        <div style={actionStackStyle}>
          {row.availableActions
            .slice(0, 2)
            .map((action, index) =>
              renderAction(
                action,
                row,
                locale,
                `${row.contractId}-${action.action}-${index}`,
                appOrigins,
              ),
            )}
          {row.crossAppLinks.slice(0, 1).map((link) => (
            <Link
              key={`${row.contractId}-${link.label}`}
              href={buildCrossAppHref(link, appOrigins)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={linkButtonStyle("info")}
            >
              {link.label}
              {link.openMode === "new_tab" ? (
                <CanvasIcon name="ext" size={11} />
              ) : null}
            </Link>
          ))}
        </div>
      ),
    },
  ];
}

function buildPartnerColumns(
  locale: Locale,
): CanvasTableColumn<PartnerRelationRow>[] {
  return [
    {
      h: copy(locale, "PARTNER ENTRY", "夥伴渠道"),
      w: 240,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.displayName}</span>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.entrySlug}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "PROGRAM", "方案"),
      w: 180,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...primaryTextStyle, ...monoTextStyle }}>
            {row.programId}
          </span>
          <span style={secondaryTextStyle}>{row.partnerTypeLabel}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "ELIGIBILITY", "資格模式"),
      w: 180,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.eligibilityLabel}</span>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.authLabel}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "STATUS", "狀態"),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {row.statusLabel}
        </Pill>
      ),
    },
    {
      h: copy(locale, "GOVERNANCE", "治理"),
      w: 160,
      r: (row) => (
        <Link
          href={row.governanceHref}
          target="_blank"
          rel="noreferrer"
          style={linkButtonStyle("info")}
        >
          {copy(locale, "Partner admin", "夥伴管理")}
          <CanvasIcon name="ext" size={11} />
        </Link>
      ),
    },
  ];
}

export function ContractsTable({
  locale,
  rows,
  appOrigins,
}: ContractsTableProps) {
  return (
    <Table
      theme={theme}
      columns={buildContractColumns(locale, appOrigins)}
      rows={rows}
    />
  );
}

export function PartnerRelationsTable({
  locale,
  rows,
}: PartnerRelationsTableProps) {
  return (
    <Table theme={theme} columns={buildPartnerColumns(locale)} rows={rows} />
  );
}
