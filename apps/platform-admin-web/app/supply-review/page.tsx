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
import {
  PSR_REVIEWER,
  PSR_SUB_STATUS,
  fetchSupplyReviewSubmissions,
  startReviewAction,
  type SupplyReviewItem,
} from "@/lib/supply-review-client";
import type { SupplySubmissionStatus } from "@drts/contracts";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

type QueueTab = "pending" | "mine" | "history";

const selectStyle: CSSProperties = {
  background: theme.bgRaised,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "6px 10px",
  fontSize: 12.5,
  color: theme.text,
  outline: "none",
  cursor: "pointer",
};

export default function SupplyReviewQueuePage() {
  const router = useRouter();
  const client = usePlatformAdminClient();

  const [items, setItems] = useState<SupplyReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<QueueTab>("pending");
  const [fleetFilter, setFleetFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupplyReviewSubmissions(client);
      setItems(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load supply review submissions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [client]);

  const counts = useMemo(() => {
    const pending = items.filter((i) => i.status === "submitted").length;
    const mine = items.filter(
      (i) =>
        i.status === "in_review" &&
        (i.lockedBy === PSR_REVIEWER.display ||
          i.lockedBy === PSR_REVIEWER.name),
    ).length;
    const history = items.filter((i) =>
      ["approved", "rejected", "needs_revision", "withdrawn"].includes(
        i.status,
      ),
    ).length;
    return { pending, mine, history };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (
        activeTab === "pending" &&
        item.status !== "submitted" &&
        item.status !== "in_review"
      ) {
        return false;
      }
      if (
        activeTab === "mine" &&
        (item.status !== "in_review" ||
          (item.lockedBy !== PSR_REVIEWER.display &&
            item.lockedBy !== PSR_REVIEWER.name))
      ) {
        return false;
      }
      if (
        activeTab === "history" &&
        !["approved", "rejected", "needs_revision", "withdrawn"].includes(
          item.status,
        )
      ) {
        return false;
      }

      if (
        fleetFilter !== "all" &&
        item.fleet !== fleetFilter &&
        item.fleetPartnerId !== fleetFilter
      ) {
        return false;
      }
      if (
        typeFilter !== "all" &&
        item.type !== typeFilter &&
        item.submissionType !== typeFilter
      ) {
        return false;
      }
      if (productFilter !== "all" && item.svc !== productFilter) {
        return false;
      }
      if (areaFilter !== "all" && item.area !== areaFilter) {
        return false;
      }

      return true;
    });
  }, [items, activeTab, fleetFilter, typeFilter, productFilter, areaFilter]);

  const handleStartReview = async (item: SupplyReviewItem) => {
    setStartingId(item.id);
    try {
      await startReviewAction(client, item.id, item.rev || item.revisionNo);
    } catch {
      // Ignore conflict or proceed to detail page
    } finally {
      setStartingId(null);
      router.push(`/supply-review/${encodeURIComponent(item.id)}`);
    }
  };

  function renderPill(status: SupplySubmissionStatus) {
    const info = PSR_SUB_STATUS[status] || PSR_SUB_STATUS.submitted;
    return (
      <CanvasPill theme={theme} tone={info.tone} dot>
        {info.zh}
        <span
          style={{
            marginLeft: 4,
            opacity: 0.6,
            fontFamily: theme.monoFamily,
            fontSize: 9.5,
          }}
        >
          {info.en}
        </span>
      </CanvasPill>
    );
  }

  const columns: CanvasTableColumn<SupplyReviewItem>[] = [
    {
      h: "ID",
      k: "id",
      w: 100,
      mono: true,
      r: (r) => (
        <Link
          href={`/supply-review/${encodeURIComponent(r.id)}`}
          style={{
            color: theme.accent,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {r.id}
        </Link>
      ),
    },
    {
      h: "類型",
      w: 72,
      r: (r) => (
        <CanvasPill theme={theme} tone="neutral">
          {r.type}
        </CanvasPill>
      ),
    },
    { h: "車行 · fleet", k: "fleet", w: 130 },
    { h: "subject", k: "subject", w: 210 },
    { h: "營業區", k: "area", w: 84 },
    {
      h: "rev",
      w: 48,
      align: "center",
      mono: true,
      r: (r) => r.rev || r.revisionNo,
    },
    {
      h: "狀態",
      w: 140,
      r: (r) => renderPill(r.status),
    },
    { h: "送審", k: "at", w: 100, mono: true },
    {
      h: "缺件 / 鎖定",
      w: 150,
      r: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {r.missing > 0 && (
            <CanvasPill theme={theme} tone="warn">
              缺 {r.missing}
            </CanvasPill>
          )}
          {r.lockedBy && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: theme.textMuted,
              }}
            >
              <svg
                width={11}
                height={11}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              {r.lockedBy}
            </span>
          )}
          {r.missing === 0 && !r.lockedBy && (
            <span style={{ fontSize: 11, color: theme.textDim }}>—</span>
          )}
        </div>
      ),
    },
    {
      h: "",
      w: 110,
      r: (r) =>
        r.status === "submitted" ? (
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="primary"
            disabled={startingId === r.id}
            onClick={() => void handleStartReview(r)}
          >
            {startingId === r.id ? "處理中..." : "受理審核"}
          </CanvasBtn>
        ) : (
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="ghost"
            icon="arrow"
            onClick={() =>
              router.push(`/supply-review/${encodeURIComponent(r.id)}`)
            }
          >
            開啟
          </CanvasBtn>
        ),
    },
  ];

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <CanvasPageHeader
        theme={theme}
        title="供給審核佇列 · Supply Review"
        subtitle="車行送件 → 審核 → 核可寫入 canonical registry"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              style={selectStyle}
              value={fleetFilter}
              onChange={(e) => setFleetFilter(e.target.value)}
            >
              <option value="all">車行：全部</option>
              <option value="大都會車隊">大都會車隊</option>
              <option value="蘭陽小客車">蘭陽小客車</option>
              <option value="海線車隊">海線車隊</option>
            </select>
            <select
              style={selectStyle}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">類型：全部</option>
              <option value="車輛">車輛</option>
              <option value="司機">司機</option>
              <option value="保險">保險</option>
            </select>
            <select
              style={selectStyle}
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            >
              <option value="all">服務產品：全部</option>
              <option value="realtime">即時叫車 (realtime)</option>
              <option value="airport">機場接送 (airport)</option>
              <option value="business">商務專車 (business)</option>
            </select>
            <select
              style={selectStyle}
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
            >
              <option value="all">營業區：全部</option>
              <option value="台北市">台北市</option>
              <option value="宜蘭縣">宜蘭縣</option>
              <option value="台中市">台中市</option>
            </select>
            <CanvasBtn theme={theme} icon="filter">
              更多篩選
            </CanvasBtn>
          </div>
        }
      />

      <div style={{ padding: 24 }}>
        {/* Tabs Bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <CanvasBtn
            theme={theme}
            variant={activeTab === "pending" ? "primary" : "secondary"}
            onClick={() => setActiveTab("pending")}
          >
            待審 ({counts.pending})
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            variant={activeTab === "mine" ? "primary" : "secondary"}
            onClick={() => setActiveTab("mine")}
          >
            我審核中 ({counts.mine})
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            variant={activeTab === "history" ? "primary" : "secondary"}
            onClick={() => setActiveTab("history")}
          >
            歷史 ({counts.history})
          </CanvasBtn>
        </div>

        {loading && (
          <div
            style={{ marginBottom: 16, color: theme.textMuted, fontSize: 13 }}
          >
            載入審核佇列中…
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16 }}>
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              title="載入錯誤"
              body={error}
            />
          </div>
        )}

        <CanvasCard theme={theme} padding={0}>
          <CanvasTable<SupplyReviewItem>
            theme={theme}
            columns={columns}
            rows={filteredItems}
          />
        </CanvasCard>
      </div>
    </div>
  );
}
