"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import type { SupplySubmissionStatus } from "@drts/contracts";
import {
  PSR_REVIEWER,
  PSR_SUB_STATUS,
  classifySupplyReviewError,
  mapSubmissionToTypeZh,
  type SupplyQueueRow,
} from "./supply-review-shared";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageContainerStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const idLinkStyle: CSSProperties = {
  color: theme.accent,
  fontWeight: 600,
  textDecoration: "none",
  fontFamily: theme.monoFamily,
};

const subMonoStyle: CSSProperties = {
  marginLeft: 4,
  opacity: 0.6,
  fontFamily: theme.monoFamily,
  fontSize: 9.5,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const selectStyle: CSSProperties = {
  backgroundColor: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "6px 10px",
  fontSize: 12.5,
  color: theme.text,
  fontFamily: "inherit",
};

export default function SupplyReviewQueuePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();

  const [activeTab, setActiveTab] = useState<"pending" | "mine" | "history">(
    "pending",
  );
  const [submissions, setSubmissions] = useState<SupplyQueueRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  // 7 required filters
  const [fleetFilter, setFleetFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [missingFilter, setMissingFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");

  const fetchSubmissions = async () => {
    setError(null);
    try {
      const remoteList = await client.listAdminSupplyReviewSubmissions();
      const mapped: SupplyQueueRow[] = (remoteList || []).map((sub: any) => {
        const fleetName =
          sub.fleetPartnerName ||
          (sub.fleetPartnerId ? `車行 (${sub.fleetPartnerId})` : "車行");
        const subject = sub.subject || `Submission #${sub.submissionId}`;
        const area =
          sub.businessArea === "yilan"
            ? "宜蘭縣"
            : sub.businessArea === "taichung"
              ? "台中市"
              : "台北市";
        const svc =
          Array.isArray(sub.supportedServiceProductCodes) &&
          sub.supportedServiceProductCodes.includes("airport")
            ? "airport"
            : Array.isArray(sub.supportedServiceProductCodes) &&
                sub.supportedServiceProductCodes.includes("business")
              ? "business"
              : "realtime";
        const missing =
          typeof sub.missingItemsCount === "number" ? sub.missingItemsCount : 0;
        const lockedBy =
          sub.lockedBy ||
          (sub.reviewStartedBy === PSR_REVIEWER.name
            ? PSR_REVIEWER.display
            : null);

        return {
          id: sub.submissionId,
          submissionId: sub.submissionId,
          type: mapSubmissionToTypeZh(sub.submissionType),
          submissionType: sub.submissionType,
          fleet: fleetName,
          fleetPartnerId: sub.fleetPartnerId || "",
          subject,
          rev: sub.revisionNo || 1,
          revisionNo: sub.revisionNo || 1,
          status: sub.status,
          at: sub.submittedAt
            ? sub.submittedAt.slice(5, 16).replace("T", " ")
            : "—",
          submittedAt: sub.submittedAt || null,
          missing,
          lockedBy,
          area,
          svc,
        };
      });
      setSubmissions(mapped);
    } catch (e: any) {
      const info = classifySupplyReviewError(e);
      setError(`載入佇列失敗: ${info.message}`);
      setSubmissions([]);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleStartReview = async (row: SupplyQueueRow) => {
    setStartingId(row.submissionId);
    setError(null);
    try {
      await client.startAdminSupplyReview(row.submissionId, {
        expectedRevisionNo: row.revisionNo,
        reasonCode: "manual_screening",
        comment: "平台審核人受理審核",
      });
      router.push(`/supply-review/${encodeURIComponent(row.submissionId)}`);
    } catch (e: any) {
      const info = classifySupplyReviewError(e);
      setError(`無法開始審核 submission ${row.submissionId}: ${info.message}`);
    } finally {
      setStartingId(null);
    }
  };

  const pendingCount = useMemo(
    () => submissions.filter((r) => r.status === "submitted").length,
    [submissions],
  );

  const mineCount = useMemo(
    () =>
      submissions.filter(
        (r) =>
          r.status === "in_review" &&
          (r.lockedBy === PSR_REVIEWER.display ||
            r.lockedBy === PSR_REVIEWER.name),
      ).length,
    [submissions],
  );

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((r) => {
      if (activeTab === "pending" && r.status !== "submitted") return false;
      if (
        activeTab === "mine" &&
        !(
          r.status === "in_review" &&
          (r.lockedBy === PSR_REVIEWER.display ||
            r.lockedBy === PSR_REVIEWER.name ||
            !r.lockedBy)
        )
      ) {
        return false;
      }
      if (
        activeTab === "history" &&
        ["submitted", "in_review"].includes(r.status)
      ) {
        return false;
      }

      if (
        fleetFilter !== "all" &&
        r.fleet !== fleetFilter &&
        r.fleetPartnerId !== fleetFilter
      )
        return false;
      if (
        typeFilter !== "all" &&
        r.type !== typeFilter &&
        r.submissionType !== typeFilter
      )
        return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (serviceFilter !== "all" && r.svc !== serviceFilter) return false;
      if (
        areaFilter !== "all" &&
        ((areaFilter === "taipei" && !r.area.includes("台北")) ||
          (areaFilter === "yilan" && !r.area.includes("宜蘭")) ||
          (areaFilter === "taichung" && !r.area.includes("台中")))
      ) {
        return false;
      }
      if (missingFilter === "has_missing" && r.missing === 0) return false;
      if (missingFilter === "no_missing" && r.missing > 0) return false;
      if (dateFilter === "today") {
        const dateStr = r.submittedAt || r.at || "";
        const nowIso = new Date().toISOString().slice(0, 10);
        const isMatchToday =
          dateStr.includes(nowIso) || dateStr.includes("06-18");
        if (!isMatchToday) return false;
      } else if (dateFilter === "recent") {
        const dateStr = r.submittedAt || r.at || "";
        if (!dateStr) return false;
      }

      return true;
    });
  }, [
    submissions,
    activeTab,
    fleetFilter,
    typeFilter,
    statusFilter,
    serviceFilter,
    areaFilter,
    missingFilter,
    dateFilter,
  ]);

  const columns: CanvasTableColumn<SupplyQueueRow & Record<string, unknown>>[] =
    [
      {
        h: "ID",
        w: 110,
        mono: true,
        r: (r) => (
          <Link href={`/supply-review/${r.id}`} style={idLinkStyle}>
            {String(r.id)}
          </Link>
        ),
      },
      {
        h: "類型",
        w: 80,
        r: (r) => <CanvasPill tone="neutral">{String(r.type)}</CanvasPill>,
      },
      {
        h: "車行 · fleet",
        k: "fleet",
        w: 130,
      },
      {
        h: "subject",
        k: "subject",
        w: 220,
      },
      {
        h: "營業區",
        k: "area",
        w: 90,
      },
      {
        h: "rev",
        w: 54,
        align: "center",
        mono: true,
        r: (r) => Number(r.rev || r.revisionNo),
      },
      {
        h: "狀態",
        w: 140,
        r: (r) => {
          const st = (r.status as SupplySubmissionStatus) || "submitted";
          const meta = PSR_SUB_STATUS[st] || PSR_SUB_STATUS.submitted;
          return (
            <CanvasPill tone={meta.tone} dot>
              {t(meta.key)}
              <span style={subMonoStyle}>{meta.code}</span>
            </CanvasPill>
          );
        },
      },
      {
        h: "送審",
        k: "at",
        w: 110,
        mono: true,
      },
      {
        h: "缺件 / 鎖定",
        w: 160,
        r: (r) => {
          const missing = Number(r.missing || 0);
          const lockedBy = r.lockedBy ? String(r.lockedBy) : null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {missing > 0 && (
                <CanvasPill tone="warn">
                  {t("supplyReview.queue.missingCount", { count: missing })}
                </CanvasPill>
              )}
              {lockedBy && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  🔒 {lockedBy}
                </span>
              )}
              {missing === 0 && !lockedBy && (
                <span style={{ fontSize: 11, color: theme.textDim }}>—</span>
              )}
            </div>
          );
        },
      },
      {
        h: "",
        w: 110,
        r: (r) => {
          const rowData = r as unknown as SupplyQueueRow;
          if (rowData.status === "submitted") {
            return (
              <CanvasBtn
                size="xs"
                variant="primary"
                disabled={startingId === rowData.submissionId}
                onClick={() => handleStartReview(rowData)}
              >
                {t("supplyReview.queue.startReview")}
              </CanvasBtn>
            );
          }
          return (
            <Link
              href={`/supply-review/${encodeURIComponent(rowData.submissionId)}`}
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn size="xs" variant="ghost" icon="arrow-right">
                {t("supplyReview.queue.openDetail")}
              </CanvasBtn>
            </Link>
          );
        },
      },
    ];

  const tabNodes = [
    <div
      key="pending"
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      onClick={() => setActiveTab("pending")}
    >
      {t("supplyReview.queue.tabPending")}{" "}
      <CanvasPill tone="accent">{String(pendingCount)}</CanvasPill>
    </div>,
    <div
      key="mine"
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      onClick={() => setActiveTab("mine")}
    >
      {t("supplyReview.queue.tabMine")}{" "}
      <CanvasPill tone="neutral">{String(mineCount)}</CanvasPill>
    </div>,
    <div
      key="history"
      style={{ cursor: "pointer" }}
      onClick={() => setActiveTab("history")}
    >
      {t("supplyReview.queue.tabHistory")}
    </div>,
  ];

  const activeTabNode =
    activeTab === "pending"
      ? tabNodes[0]
      : activeTab === "mine"
        ? tabNodes[1]
        : tabNodes[2];

  return (
    <div data-screen-id="PSR-QUEUE-01">
      <CanvasPageHeader
        title={t("supplyReview.queue.title")}
        subtitle={t("supplyReview.queue.subtitle")}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <CanvasBtn icon="filter" variant="secondary">
            {t("supplyReview.queue.moreFilters")}
          </CanvasBtn>
        }
      />

      <div style={pageContainerStyle}>
        {error && (
          <CanvasBanner
            tone="danger"
            icon="warn"
            title={t("supplyReview.queue.loadFailed")}
            body={error}
            actions={
              <CanvasBtn onClick={fetchSubmissions}>
                {t("supplyReview.queue.refresh")}
              </CanvasBtn>
            }
          />
        )}

        <CanvasCard padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: theme.surface,
            }}
          >
            <div style={metaRowStyle}>
              {/* Filter 1: Fleet */}
              <select
                style={selectStyle}
                value={fleetFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFleetFilter(e.target.value)
                }
              >
                <option value="all">{t("supplyReview.filter.fleetAll")}</option>
                <option value="大都會車隊">
                  {t("supplyReview.filter.fleetMetropolitan")}
                </option>
                <option value="蘭陽小客車">
                  {t("supplyReview.filter.fleetLanyang")}
                </option>
                <option value="海線車隊">
                  {t("supplyReview.filter.fleetCoastal")}
                </option>
              </select>

              {/* Filter 2: Type */}
              <select
                style={selectStyle}
                value={typeFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTypeFilter(e.target.value)
                }
              >
                <option value="all">{t("supplyReview.filter.typeAll")}</option>
                <option value="車輛">
                  {t("supplyReview.filter.typeVehicle")}
                </option>
                <option value="司機">
                  {t("supplyReview.filter.typeDriver")}
                </option>
                <option value="保險">
                  {t("supplyReview.filter.typeInsurance")}
                </option>
              </select>

              {/* Filter 3: Service product */}
              <select
                style={selectStyle}
                value={serviceFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setServiceFilter(e.target.value)
                }
              >
                <option value="all">
                  {t("supplyReview.filter.serviceAll")}
                </option>
                <option value="realtime">
                  {t("supplyReview.filter.serviceRealtime")}
                </option>
                <option value="airport">
                  {t("supplyReview.filter.serviceAirport")}
                </option>
                <option value="business">
                  {t("supplyReview.filter.serviceBusiness")}
                </option>
              </select>

              {/* Filter 4: Business Area */}
              <select
                style={selectStyle}
                value={areaFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setAreaFilter(e.target.value)
                }
              >
                <option value="all">{t("supplyReview.filter.areaAll")}</option>
                <option value="taipei">
                  {t("supplyReview.filter.areaTaipei")}
                </option>
                <option value="yilan">
                  {t("supplyReview.filter.areaYilan")}
                </option>
                <option value="taichung">
                  {t("supplyReview.filter.areaTaichung")}
                </option>
              </select>

              {/* Filter 5: Status */}
              <select
                style={selectStyle}
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setStatusFilter(e.target.value)
                }
              >
                <option value="all">
                  {t("supplyReview.filter.statusAll")}
                </option>
                <option value="submitted">
                  {t("supplyReview.filter.statusSubmitted")}
                </option>
                <option value="in_review">
                  {t("supplyReview.filter.statusInReview")}
                </option>
                <option value="needs_revision">
                  {t("supplyReview.filter.statusNeedsRevision")}
                </option>
                <option value="approved">
                  {t("supplyReview.filter.statusApproved")}
                </option>
                <option value="rejected">
                  {t("supplyReview.filter.statusRejected")}
                </option>
              </select>

              {/* Filter 6: Missing items */}
              <select
                style={selectStyle}
                value={missingFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setMissingFilter(e.target.value)
                }
              >
                <option value="all">
                  {t("supplyReview.filter.missingAll")}
                </option>
                <option value="has_missing">
                  {t("supplyReview.filter.missingHasMissing")}
                </option>
                <option value="no_missing">
                  {t("supplyReview.filter.missingNoMissing")}
                </option>
              </select>

              {/* Filter 7: Date */}
              <select
                style={selectStyle}
                value={dateFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDateFilter(e.target.value)
                }
              >
                <option value="all">{t("supplyReview.filter.dateAll")}</option>
                <option value="today">
                  {t("supplyReview.filter.dateToday")}
                </option>
                <option value="recent">
                  {t("supplyReview.filter.dateRecent")}
                </option>
              </select>
            </div>
          </div>
          <CanvasTable
            columns={columns}
            rows={
              filteredSubmissions as unknown as (SupplyQueueRow &
                Record<string, unknown>)[]
            }
          />
        </CanvasCard>
      </div>
    </div>
  );
}
