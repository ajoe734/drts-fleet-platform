"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
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
import type {
  SupplySubmissionRecord,
  SupplySubmissionStatus,
} from "@drts/contracts";
import {
  FX_PSR_QUEUE,
  PSR_REVIEWER,
  PSR_SUB_STATUS,
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
  const router = useRouter();
  const client = usePlatformAdminClient();

  const [activeTab, setActiveTab] = useState<"pending" | "mine" | "history">(
    "pending",
  );
  const [submissions, setSubmissions] = useState<SupplyQueueRow[]>(FX_PSR_QUEUE);
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
      if (remoteList && remoteList.length > 0) {
        const mapped: SupplyQueueRow[] = remoteList.map((sub: any) => {
          const matchedSeed = FX_PSR_QUEUE.find(
            (item) => item.submissionId === sub.submissionId,
          );
          const fleetName =
            sub.fleetPartnerName ||
            matchedSeed?.fleet ||
            `車行 (${sub.fleetPartnerId})`;
          const subject =
            sub.subject ||
            matchedSeed?.subject ||
            `Submission #${sub.submissionId}`;
          const area =
            sub.businessArea === "yilan"
              ? "宜蘭縣"
              : sub.businessArea === "taichung"
                ? "台中市"
                : matchedSeed?.area || "台北市";
          const svc =
            Array.isArray(sub.supportedServiceProductCodes) &&
            sub.supportedServiceProductCodes.includes("airport")
              ? "airport"
              : Array.isArray(sub.supportedServiceProductCodes) &&
                  sub.supportedServiceProductCodes.includes("business")
                ? "business"
                : matchedSeed?.svc || "realtime";
          const missing =
            typeof sub.missingItemsCount === "number"
              ? sub.missingItemsCount
              : matchedSeed?.missing || 0;
          const lockedBy =
            sub.lockedBy ||
            (sub.reviewStartedBy === PSR_REVIEWER.name
              ? PSR_REVIEWER.display
              : matchedSeed?.lockedBy || null);

          return {
            id: sub.submissionId,
            submissionId: sub.submissionId,
            type: mapSubmissionToTypeZh(sub.submissionType),
            submissionType: sub.submissionType,
            fleet: fleetName,
            fleetPartnerId: sub.fleetPartnerId,
            subject,
            rev: sub.revisionNo || 1,
            revisionNo: sub.revisionNo || 1,
            status: sub.status,
            at: sub.submittedAt
              ? sub.submittedAt.slice(5, 16).replace("T", " ")
              : matchedSeed?.at || "06-18 10:00",
            submittedAt: sub.submittedAt || null,
            missing,
            lockedBy,
            area,
            svc,
          };
        });
        setSubmissions(mapped);
      } else {
        setSubmissions(FX_PSR_QUEUE);
      }
    } catch (e: any) {
      console.warn(
        "Failed to fetch admin supply review queue from API, using fallback data:",
        e,
      );
      setSubmissions(FX_PSR_QUEUE);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleStartReview = async (row: SupplyQueueRow) => {
    setStartingId(row.submissionId);
    try {
      await client.startAdminSupplyReview(row.submissionId, {
        expectedRevisionNo: row.revisionNo,
        reasonCode: "manual_screening",
        comment: "平台審核人受理審核",
      });
      router.push(`/supply-review/${encodeURIComponent(row.submissionId)}`);
    } catch (e: any) {
      console.warn(
        "Failed to start review via API, navigating to detail page:",
        e,
      );
      router.push(`/supply-review/${encodeURIComponent(row.submissionId)}`);
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

      if (fleetFilter !== "all" && r.fleet !== fleetFilter && r.fleetPartnerId !== fleetFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter && r.submissionType !== typeFilter) return false;
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
        const isMatchToday = dateStr.includes(nowIso) || dateStr.includes("06-18");
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
              {meta.zh}
              <span style={subMonoStyle}>{meta.en}</span>
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
              {missing > 0 && <CanvasPill tone="warn">缺 {missing}</CanvasPill>}
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
                受理審核
              </CanvasBtn>
            );
          }
          return (
            <Link
              href={`/supply-review/${encodeURIComponent(rowData.submissionId)}`}
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn size="xs" variant="ghost" icon="arrow-right">
                開啟
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
      待審 <CanvasPill tone="accent">{String(pendingCount)}</CanvasPill>
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
      我審核中 <CanvasPill tone="neutral">{String(mineCount)}</CanvasPill>
    </div>,
    <div
      key="history"
      style={{ cursor: "pointer" }}
      onClick={() => setActiveTab("history")}
    >
      歷史
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
        title="供給審核佇列 · Supply Review"
        subtitle="車行送件 → 審核 → 核可寫入 canonical registry"
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <CanvasBtn icon="filter" variant="secondary">
            更多篩選
          </CanvasBtn>
        }
      />

      <div style={pageContainerStyle}>
        {error && (
          <CanvasBanner
            tone="danger"
            icon="warn"
            title="載入佇列失敗"
            body={error}
            actions={<CanvasBtn onClick={fetchSubmissions}>重新整理</CanvasBtn>}
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
                <option value="all">車行：全部</option>
                <option value="大都會車隊">大都會車隊</option>
                <option value="蘭陽小客車">蘭陽小客車</option>
                <option value="海線車隊">海線車隊</option>
              </select>

              {/* Filter 2: Type */}
              <select
                style={selectStyle}
                value={typeFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTypeFilter(e.target.value)
                }
              >
                <option value="all">類型：全部</option>
                <option value="車輛">車輛</option>
                <option value="司機">司機</option>
                <option value="保險">保險</option>
              </select>

              {/* Filter 3: Service product */}
              <select
                style={selectStyle}
                value={serviceFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setServiceFilter(e.target.value)
                }
              >
                <option value="all">服務產品：全部</option>
                <option value="realtime">即時派車</option>
                <option value="airport">機場接送</option>
                <option value="business">商務包車</option>
              </select>

              {/* Filter 4: Business Area */}
              <select
                style={selectStyle}
                value={areaFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setAreaFilter(e.target.value)
                }
              >
                <option value="all">營業區：全部</option>
                <option value="taipei">台北市</option>
                <option value="yilan">宜蘭縣</option>
                <option value="taichung">台中市</option>
              </select>

              {/* Filter 5: Status */}
              <select
                style={selectStyle}
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setStatusFilter(e.target.value)
                }
              >
                <option value="all">狀態：全部</option>
                <option value="submitted">待受理 submitted</option>
                <option value="in_review">審核中 in_review</option>
                <option value="needs_revision">已退補正 needs_revision</option>
                <option value="approved">已核可 approved</option>
                <option value="rejected">已駁回 rejected</option>
              </select>

              {/* Filter 6: Missing items */}
              <select
                style={selectStyle}
                value={missingFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setMissingFilter(e.target.value)
                }
              >
                <option value="all">缺件狀態：全部</option>
                <option value="has_missing">有缺件</option>
                <option value="no_missing">無缺件</option>
              </select>

              {/* Filter 7: Date */}
              <select
                style={selectStyle}
                value={dateFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDateFilter(e.target.value)
                }
              >
                <option value="all">送審日期：全部</option>
                <option value="today">今日送審</option>
                <option value="recent">近 7 日</option>
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
