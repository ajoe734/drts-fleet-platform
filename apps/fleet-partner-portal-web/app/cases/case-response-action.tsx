"use client";

import Link from "next/link";
import { FleetActionButton } from "../../components/fleet-action-button";
import { buildFleetTheme } from "../../lib/fleet-portal-theme";
import { useTranslation } from "../../lib/i18n";

/** Navigation into the existing composer; this action never submits a reply. */
export function CaseResponseAction({
  caseId,
  responsibility,
  status,
  availability,
  currentPage = false,
}: {
  caseId: string;
  responsibility: string;
  status: string;
  availability?: { enabled: boolean; disabledReasonCode?: string };
  currentPage?: boolean;
}) {
  const { t } = useTranslation();
  const theme = buildFleetTheme();
  const reason =
    responsibility === "platform"
      ? t("actions.reason.casePlatformOwned")
      : status === "closed"
        ? t("actions.reason.caseClosed")
        : availability?.enabled === false
          ? t("actions.reason.caseUnavailable")
          : null;
  if (reason)
    return (
      <FleetActionButton
        descriptor={{
          action: "respond",
          enabled: false,
          disabledReasonCode: reason,
          riskLevel: "medium",
        }}
        label={t("cases.action.respond")}
        size="xs"
      />
    );
  return (
    <Link
      href={`${currentPage ? "" : `/cases/${encodeURIComponent(caseId)}`}#case-reply-content`}
      {...(currentPage
        ? {
            onClick: () =>
              document.getElementById("case-reply-content")?.focus(),
          }
        : {})}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 30,
        padding: "4px 10px",
        border: `1px solid ${theme.accentBorder}`,
        borderRadius: 6,
        color: theme.accent,
        textDecoration: "none",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {t("cases.action.respond")}
    </Link>
  );
}
