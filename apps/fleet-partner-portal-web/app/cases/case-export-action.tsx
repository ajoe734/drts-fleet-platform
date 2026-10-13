"use client";

import { useState } from "react";
import { FleetActionButton } from "../../components/fleet-action-button";
import type { CaseDetailView } from "../../lib/fleet-portal-data.server";
import { useTranslation } from "../../lib/i18n";

export function CaseExportAction({
  caseDetail,
  timeline,
  attachments,
}: Pick<CaseDetailView, "caseDetail" | "timeline" | "attachments">) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  const download = () => {
    setFailed(false);
    let objectUrl: string | undefined;
    const anchor = document.createElement("a");
    try {
      const content = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          caseDetail,
          timeline,
          attachments,
        },
        null,
        2,
      );
      objectUrl = URL.createObjectURL(
        new Blob([`${content}\n`], {
          type: "application/json;charset=utf-8",
        }),
      );
      anchor.href = objectUrl;
      anchor.download = `${caseDetail.id}-case.json`;
      document.body.appendChild(anchor);
      anchor.click();
    } catch {
      setFailed(true);
    } finally {
      anchor.remove();
      if (objectUrl) {
        const downloadedUrl = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000);
      }
    }
  };

  return (
    <div>
      <FleetActionButton
        descriptor={{ action: "export", enabled: true, riskLevel: "low" }}
        icon="reports"
        label={t("cases.action.export")}
        onClick={download}
      />
      {failed ? <div role="alert">{t("cases.exportFailed")}</div> : null}
    </div>
  );
}
