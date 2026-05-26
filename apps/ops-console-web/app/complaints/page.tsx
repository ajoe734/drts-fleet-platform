"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  ComplaintCaseListWorkspace,
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintSlaStatus,
  ComplaintTimelineEntry,
  CreateComplaintCaseCommand,
  CrossAppResourceLink,
  EmptyReason,
  EscalateComplaintToIncidentCommand,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  COMPLAINT_CASE_STATUSES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";

const STATUS_OPTIONS: ComplaintCaseStatus[] = [...COMPLAINT_CASE_STATUSES];
const CATEGORY_OPTIONS: ComplaintCategory[] = [...COMPLAINT_CATEGORIES];
const DEMO_ASSIGNEE = "AGENT-OPS-002";
const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

type OwnerFilter = "all" | "mine" | "unassigned";
type SeverityFilter = "all" | ComplaintCaseRecord["severity"];
type SlaFilter = "all" | ComplaintSlaStatus;
type ModalState =
  | {
      action: "create";
    }
  | {
      action:
        | "assign_complaint"
        | "add_note"
        | "resolve_complaint"
        | "close_complaint"
        | "reopen_complaint"
        | "escalate_to_incident";
      record: ComplaintCaseRecord;
    };

const INITIAL_CREATE_FORM: CreateComplaintCaseCommand = {
  caseSource: "ops",
  category: "fare_dispute",
  severity: "normal",
  description: "",
  relatedOrderId: "",
  relatedCallId: "",
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatCountdown(
  dueAt: string,
  locale: "en" | "zh",
  slaStatus: ComplaintSlaStatus,
) {
  const deltaMinutes = Math.round(
    (new Date(dueAt).getTime() - Date.now()) / (1000 * 60),
  );

  if (slaStatus === "breached" || deltaMinutes < 0) {
    return locale === "en"
      ? `${Math.abs(deltaMinutes)} min overdue`
      : `逾期 ${Math.abs(deltaMinutes)} 分鐘`;
  }

  if (deltaMinutes < 60) {
    return locale === "en"
      ? `${deltaMinutes} min left`
      : `剩餘 ${deltaMinutes} 分鐘`;
  }

  const hours = Math.round((deltaMinutes / 60) * 10) / 10;
  return locale === "en" ? `${hours} hr left` : `剩餘 ${hours} 小時`;
}

function toneForSla(slaStatus: ComplaintSlaStatus) {
  if (slaStatus === "breached") return "danger";
  if (slaStatus === "warning") return "warning";
  return "ok";
}

function toneForStatus(status: ComplaintCaseStatus) {
  if (status === "closed") return "neutral";
  if (status === "resolved") return "ok";
  if (status === "reopened") return "warning";
  return "info";
}

function toneForSeverity(severity: ComplaintCaseRecord["severity"]) {
  return severity === "high" ? "danger" : "neutral";
}

function getRecordSlaStatus(record: ComplaintCaseRecord): ComplaintSlaStatus {
  if (record.slaStatus) {
    return record.slaStatus;
  }
  return record.slaBreach ? "breached" : "within_sla";
}

function toLabelFromSource(
  locale: "en" | "zh",
  source: ComplaintCaseRecord["caseSource"],
) {
  const map = {
    phone: locale === "en" ? "Phone" : "電話",
    web: locale === "en" ? "Tenant web" : "租戶 Web",
    app: locale === "en" ? "Passenger app" : "乘客 App",
    ops: locale === "en" ? "Ops" : "營運",
  } as const;
  return map[source];
}

function getDisabledReason(locale: "en" | "zh", code?: string) {
  const messages: Record<string, { en: string; zh: string }> = {
    case_read_only: {
      en: "This case is already read-only.",
      zh: "此案件已進入唯讀狀態。",
    },
    already_resolved_or_closed: {
      en: "This case is already resolved or closed.",
      zh: "此案件已解決或已關閉。",
    },
    resolve_required: {
      en: "Resolve the case before closing it.",
      zh: "需先解決案件才能關閉。",
    },
    already_closed: {
      en: "This case is already closed.",
      zh: "此案件已關閉。",
    },
    close_required: {
      en: "Only closed cases can be reopened.",
      zh: "只有已關閉案件才能 reopen。",
    },
    closed_case_cannot_escalate: {
      en: "Closed cases cannot be escalated.",
      zh: "已關閉案件不可升級。",
    },
    incident_already_linked: {
      en: "This case is already linked to an incident.",
      zh: "此案件已連結 incident。",
    },
    no_export_ready_case: {
      en: "Select a case to export.",
      zh: "請先選擇案件再匯出。",
    },
    no_cases_available: {
      en: "No case is available right now.",
      zh: "目前沒有可用案件。",
    },
  };

  if (!code) return "";
  const message = messages[code];
  return message ? message[locale] : code;
}

function normalizeEmptyReason(value: string | null): EmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function buildAuditLink(caseNo: string): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/audit?resourceType=complaint_case&resourceId=${encodeURIComponent(caseNo)}`,
    resourceType: "audit_log",
    resourceId: caseNo,
    openMode: "new_tab",
    label: `Audit ${caseNo}`,
  };
}

function ActionPill({
  descriptor,
  locale,
  onClick,
}: {
  descriptor: ResourceActionDescriptor;
  locale: "en" | "zh";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`action-pill ${descriptor.enabled ? "" : "is-disabled"}`}
      disabled={!descriptor.enabled}
      title={getDisabledReason(locale, descriptor.disabledReasonCode)}
      onClick={onClick}
    >
      <span>{descriptor.action.replaceAll("_", " ")}</span>
      <small>{descriptor.riskLevel}</small>
    </button>
  );
}

function ResourceLinkAnchor({
  link,
}: {
  link: CrossAppResourceLink;
}) {
  const isExternal = link.openMode === "new_tab";
  const content = (
    <>
      <span>{link.label}</span>
      {isExternal ? <span aria-hidden="true"> ↗</span> : null}
    </>
  );

  if (isExternal) {
    return (
      <a href={link.route} target="_blank" rel="noreferrer" className="link-chip">
        {content}
      </a>
    );
  }

  return (
    <Link href={link.route} className="link-chip">
      {content}
    </Link>
  );
}

export default function ComplaintsPage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<ComplaintCaseListWorkspace | null>(
    null,
  );
  const [selectedCaseNo, setSelectedCaseNo] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<ComplaintTimelineEntry[]>([]);
  const [exportView, setExportView] = useState<ComplaintExportViewRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    link?: CrossAppResourceLink;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ComplaintCaseStatus | "all">(
    "all",
  );
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("all");
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);
  const [assigneeId, setAssigneeId] = useState(DEMO_ASSIGNEE);
  const [assignmentNote, setAssignmentNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [escalateTitle, setEscalateTitle] = useState("");
  const [escalateSeverity, setEscalateSeverity] =
    useState<EscalateComplaintToIncidentCommand["severity"]>("medium");
  const [escalateReason, setEscalateReason] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const forcedEmptyReason = normalizeEmptyReason(searchParams.get("emptyReason"));
  const caseNoFromQuery = searchParams.get("caseNo");

  const records = forcedEmptyReason ? [] : (workspace?.items ?? []);
  const selectedRecord =
    records.find((record) => record.caseNo === selectedCaseNo) ?? null;
  const validResolutionCodes = selectedRecord
    ? (COMPLAINT_CATEGORY_VALID_RESOLUTIONS[selectedRecord.category] ?? [])
    : [];
  const resolutionCode = validResolutionCodes[0] ?? "resolved_other";

  useEffect(() => {
    void loadWorkspace(caseNoFromQuery ?? undefined);
  }, [caseNoFromQuery]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadWorkspace(selectedCaseNo ?? undefined, false);
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [selectedCaseNo]);

  useEffect(() => {
    if (!selectedCaseNo || forcedEmptyReason) {
      setTimeline([]);
      setExportView(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const client = getOpsClient();
        const [nextTimeline, nextExportView] = await Promise.all([
          client.getComplaintTimeline(selectedCaseNo),
          client.getComplaintExportView(selectedCaseNo),
        ]);
        if (cancelled) return;
        setTimeline(nextTimeline);
        setExportView(nextExportView);
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : locale === "en"
                ? "Unknown error"
                : "未知錯誤",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forcedEmptyReason, locale, selectedCaseNo]);

  async function loadWorkspace(preferredCaseNo?: string, updateLoading = true) {
    if (updateLoading) {
      setLoading(true);
    }
    try {
      const nextWorkspace = await getOpsClient().listComplaints();
      setWorkspace(nextWorkspace);
      setError(null);
      const candidate =
        preferredCaseNo ??
        caseNoFromQuery ??
        selectedCaseNo ??
        nextWorkspace.items[0]?.caseNo ??
        null;
      setSelectedCaseNo(
        nextWorkspace.items.some((item) => item.caseNo === candidate)
          ? candidate
          : (nextWorkspace.items[0]?.caseNo ?? null),
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : locale === "en"
            ? "Unknown error"
            : "未知錯誤",
      );
    } finally {
      if (updateLoading) {
        setLoading(false);
      }
    }
  }

  async function runBusyAction(
    actionKey: string,
    handler: () => Promise<void>,
  ) {
    setBusyAction(actionKey);
    try {
      await handler();
      setModalState(null);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : locale === "en"
            ? "Unknown error"
            : "未知錯誤",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const filteredRecords = records.filter((record) => {
    if (ownerFilter === "mine" && record.assigneeId !== DEMO_ASSIGNEE) {
      return false;
    }
    if (ownerFilter === "unassigned" && record.assigneeId) {
      return false;
    }
    if (statusFilter !== "all" && record.status !== statusFilter) {
      return false;
    }
    if (severityFilter !== "all" && record.severity !== severityFilter) {
      return false;
    }
    if (slaFilter !== "all" && getRecordSlaStatus(record) !== slaFilter) {
      return false;
    }
    if (!deferredQuery) {
      return true;
    }
    return [
      record.caseNo,
      record.description,
      record.assigneeId ?? "",
      record.relatedOrderId ?? "",
      record.relatedCallId ?? "",
      record.category,
      record.status,
      getRecordSlaStatus(record),
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredQuery);
  });

  const tabCounts = {
    all: records.length,
    mine: records.filter((record) => record.assigneeId === DEMO_ASSIGNEE).length,
    breach: records.filter(
      (record) => getRecordSlaStatus(record) === "breached",
    ).length,
    escalated: records.filter((record) => record.relatedIncidentId).length,
  };
  const staleAt = workspace
    ? new Date(workspace.refresh.generatedAt).getTime() +
      workspace.refresh.staleAfterMs
    : 0;
  const isStale =
    Boolean(workspace) &&
    (workspace.refresh.dataFreshness === "stale" ||
      workspace.refresh.dataFreshness === "degraded" ||
      clockTick > staleAt);
  const emptyReason =
    forcedEmptyReason ??
    (!workspace && error
      ? "fetch_failed"
      : null) ??
    ((workspace?.items.length ?? 0) === 0
      ? (workspace?.emptyState?.reason ?? "no_data")
      : filteredRecords.length === 0
        ? "filtered_empty"
        : null);

  const pageActions = workspace?.pageActions ?? [];
  const createAction = pageActions.find(
    (descriptor) => descriptor.action === "create_complaint",
  );
  const exportPageAction = pageActions.find(
    (descriptor) => descriptor.action === "export_case_view",
  );
  const modalRecord =
    modalState && "record" in modalState ? modalState.record : null;

  async function handleAction(descriptor: ResourceActionDescriptor) {
    if (!descriptor.enabled || !selectedRecord) {
      return;
    }

    if (descriptor.action === "export_case_view") {
      await runBusyAction("export_case_view", async () => {
        const nextExportView = await getOpsClient().getComplaintExportView(
          selectedRecord.caseNo,
        );
        setExportView(nextExportView);
        setNotice({
          message:
            locale === "en"
              ? `${selectedRecord.caseNo} export packet refreshed.`
              : `${selectedRecord.caseNo} 匯出封包已更新。`,
          link: buildAuditLink(selectedRecord.caseNo),
        });
      });
      return;
    }

    setModalState({
      action: descriptor.action as ModalState["action"],
      record: selectedRecord,
    });
  }

  function renderEmptyState(reason: EmptyReason) {
    const copy: Record<
      EmptyReason,
      {
        title: string;
        body: string;
        hint: string;
      }
    > = {
      no_data: {
        title: locale === "en" ? "No complaint case waiting." : "目前沒有待處理客訴。",
        body:
          locale === "en"
            ? "Ops has no open case in the current workspace snapshot."
            : "目前的 workspace snapshot 中沒有 open complaint case。",
        hint: locale === "en" ? "Create a complaint if intake happened outside the queue." : "若有脫離佇列的人工受理，可直接建立客訴。",
      },
      not_provisioned: {
        title: locale === "en" ? "Complaint workflow not provisioned." : "客訴流程尚未開通。",
        body:
          locale === "en"
            ? "This tenant or environment has not enabled complaint handling."
            : "此租戶或環境尚未啟用 complaint handling。",
        hint: locale === "en" ? "Escalate to platform admin to enable the feature set." : "需由 platform admin 啟用對應功能集。",
      },
      fetch_failed: {
        title: locale === "en" ? "Workspace fetch failed." : "工作區資料抓取失敗。",
        body:
          locale === "en"
            ? "The backend did not return a valid complaints snapshot."
            : "後端未成功回傳 complaints snapshot。",
        hint: locale === "en" ? "Retry or inspect the upstream complaint service." : "請重試或檢查上游 complaint service。",
      },
      permission_denied: {
        title: locale === "en" ? "You do not have complaint scope." : "你沒有 complaints scope。",
        body:
          locale === "en"
            ? "The current actor lacks permission to read this complaint workspace."
            : "目前 actor 沒有讀取此 complaint workspace 的權限。",
        hint: locale === "en" ? "Request ops_compliance visibility." : "請申請 ops_compliance 可見權限。",
      },
      external_unavailable: {
        title: locale === "en" ? "External dependency unavailable." : "外部依賴不可用。",
        body:
          locale === "en"
            ? "A linked intake or recording dependency is currently degraded."
            : "受理或錄音相關依賴目前降級不可用。",
        hint: locale === "en" ? "Stay in triage mode and refresh once upstream recovers." : "先維持 triage，待上游恢復後再刷新。",
      },
      filtered_empty: {
        title: locale === "en" ? "Filters removed every result." : "目前篩選條件把結果全部排除了。",
        body:
          locale === "en"
            ? "The base queue has data, but the current owner / severity / SLA filters are too narrow."
            : "原始佇列有資料，但 owner / severity / SLA 篩選過窄。",
        hint: locale === "en" ? "Reset one or more filters to continue triage." : "放寬條件後再繼續 triage。",
      },
    };

    const state = copy[reason];
    return (
      <section className={`empty-state reason-${reason}`}>
        <div className="empty-icon">{reason.slice(0, 2).toUpperCase()}</div>
        <div>
          <h3>{state.title}</h3>
          <p>{state.body}</p>
          <small>{state.hint}</small>
        </div>
      </section>
    );
  }

  return (
    <div className="complaints-page">
      <PageHeader
        title={locale === "en" ? "Complaint Center" : "客訴中心"}
        subtitle={
          locale === "en"
            ? "Case triage · SLA · escalation · reopen history stays explicit"
            : "案件全流程 · SLA · 升級 · reopen 歷史不可覆蓋"
        }
        actions={
          <div className="header-actions">
            <button
              type="button"
              className="header-btn"
              onClick={() => setModalState({ action: "create" })}
              disabled={createAction?.enabled === false}
              title={getDisabledReason(locale, createAction?.disabledReasonCode)}
            >
              {locale === "en" ? "Create complaint" : "建立客訴"}
            </button>
            <button
              type="button"
              className="header-btn secondary"
              disabled={!selectedRecord || exportPageAction?.enabled === false}
              title={
                !selectedRecord
                  ? locale === "en"
                    ? "Select a case first."
                    : "請先選擇案件。"
                  : getDisabledReason(locale, exportPageAction?.disabledReasonCode)
              }
              onClick={() =>
                selectedRecord
                  ? void handleAction({
                      action: "export_case_view",
                      enabled: true,
                      riskLevel: "low",
                    })
                  : undefined
              }
            >
              {locale === "en" ? "Export case view" : "匯出案件視圖"}
            </button>
          </div>
        }
      />

      <section className="hero-row">
        <div className="hero-copy">
          <p className="eyebrow">T3 / 15s refresh</p>
          <h2>
            {locale === "en"
              ? "Complaints list rebuilt around queue-first triage."
              : "客訴頁面已改成 queue-first triage。"}
          </h2>
          <p>
            {locale === "en"
              ? "Backend-computed SLA status, row-level authority, six empty reasons, and cross-app audit exits are visible on the surface."
              : "頁面直接呈現 backend 計算的 SLA、row-level authority、六種 empty reason 與 cross-app audit 出口。"}
          </p>
        </div>
        <div className="kpi-grid">
          <article className="kpi-card">
            <span>{locale === "en" ? "Open queue" : "未結案件"}</span>
            <strong>{tabCounts.all}</strong>
          </article>
          <article className="kpi-card breach">
            <span>SLA breach</span>
            <strong>{tabCounts.breach}</strong>
          </article>
          <article className="kpi-card">
            <span>{locale === "en" ? "Assigned to me" : "我負責"}</span>
            <strong>{tabCounts.mine}</strong>
          </article>
          <article className="kpi-card">
            <span>{locale === "en" ? "Escalated" : "已升級事故"}</span>
            <strong>{tabCounts.escalated}</strong>
          </article>
        </div>
      </section>

      {isStale ? (
        <div className="banner stale">
          <div>
            <strong>{locale === "en" ? "Stale snapshot" : "資料已過期"}</strong>
            <span>
              {locale === "en"
                ? ` Generated ${formatDateTime(workspace?.refresh.generatedAt)}.`
                : ` 產生時間 ${formatDateTime(workspace?.refresh.generatedAt)}。`}
            </span>
          </div>
          <button
            type="button"
            className="text-btn"
            onClick={() => void loadWorkspace(selectedCaseNo ?? undefined)}
          >
            {locale === "en" ? "Refresh now" : "立即刷新"}
          </button>
        </div>
      ) : null}

      {error ? <div className="banner error">{error}</div> : null}

      {notice ? (
        <div className="banner notice">
          <span>{notice.message}</span>
          {notice.link ? <ResourceLinkAnchor link={notice.link} /> : null}
        </div>
      ) : null}

      <section className="tabs-row">
        <button type="button" className="tab-chip">
          {locale === "en" ? "All" : "全部"} <strong>{tabCounts.all}</strong>
        </button>
        <button type="button" className="tab-chip active">
          {locale === "en" ? "Mine" : "我負責"} <strong>{tabCounts.mine}</strong>
        </button>
        <button type="button" className="tab-chip danger">
          SLA breach <strong>{tabCounts.breach}</strong>
        </button>
        <button type="button" className="tab-chip">
          {locale === "en" ? "Escalated" : "已升級"} <strong>{tabCounts.escalated}</strong>
        </button>
      </section>

      <section className="toolbar">
        <input
          type="search"
          value={query}
          placeholder={locale === "en" ? "Search case / order / call" : "搜尋案件 / 訂單 / 通話"}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value as OwnerFilter)}
        >
          <option value="all">{locale === "en" ? "All owners" : "所有負責人"}</option>
          <option value="mine">{locale === "en" ? "Mine" : "我的案件"}</option>
          <option value="unassigned">
            {locale === "en" ? "Unassigned" : "未指派"}
          </option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as ComplaintCaseStatus | "all")
          }
        >
          <option value="all">{locale === "en" ? "All status" : "所有狀態"}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {formatOpsCodeLabel(locale, status)}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(event) =>
            setSeverityFilter(
              event.target.value as ComplaintCaseRecord["severity"] | "all",
            )
          }
        >
          <option value="all">{locale === "en" ? "All severity" : "所有嚴重度"}</option>
          <option value="normal">{locale === "en" ? "Normal" : "一般"}</option>
          <option value="high">{locale === "en" ? "High" : "高"}</option>
        </select>
        <select
          value={slaFilter}
          onChange={(event) =>
            setSlaFilter(event.target.value as ComplaintSlaStatus | "all")
          }
        >
          <option value="all">{locale === "en" ? "All SLA" : "所有 SLA"}</option>
          <option value="within_sla">within_sla</option>
          <option value="warning">warning</option>
          <option value="breached">breached</option>
        </select>
        <button
          type="button"
          className="header-btn secondary"
          onClick={() => void loadWorkspace(selectedCaseNo ?? undefined)}
        >
          {locale === "en" ? "Refresh" : "重新整理"}
        </button>
      </section>

      {loading ? (
        <section className="loading-panel">
          {locale === "en" ? "Loading complaint workspace..." : "載入 complaint workspace..."}
        </section>
      ) : emptyReason ? (
        renderEmptyState(emptyReason)
      ) : (
        <section className="workspace-grid">
          <div className="list-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>CASE</th>
                    <th>{locale === "en" ? "Source" : "來源"}</th>
                    <th>{locale === "en" ? "Category" : "類別"}</th>
                    <th>SEV</th>
                    <th>{locale === "en" ? "Description" : "摘要"}</th>
                    <th>ORDER</th>
                    <th>CALL</th>
                    <th>SLA</th>
                    <th>{locale === "en" ? "Owner" : "負責人"}</th>
                    <th>{locale === "en" ? "Status" : "狀態"}</th>
                    <th>{locale === "en" ? "Updated" : "更新時間"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr
                      key={record.caseNo}
                      className={record.caseNo === selectedCaseNo ? "selected" : ""}
                      onClick={() => setSelectedCaseNo(record.caseNo)}
                    >
                      <td className="mono accent">{record.caseNo}</td>
                      <td>{toLabelFromSource(locale, record.caseSource)}</td>
                      <td>{formatOpsCodeLabel(locale, record.category)}</td>
                      <td>
                        <span className={`pill ${toneForSeverity(record.severity)}`}>
                          {record.severity}
                        </span>
                      </td>
                      <td className="summary-cell">
                        <strong>{record.description}</strong>
                        {record.reopenCount > 0 ? (
                          <small>
                            {locale === "en"
                              ? `Reopened ${record.reopenCount} time(s)`
                              : `已 reopen ${record.reopenCount} 次`}
                          </small>
                        ) : null}
                      </td>
                      <td className="mono">{record.relatedOrderId ?? "—"}</td>
                      <td className="mono">{record.relatedCallId ?? "—"}</td>
                      <td>
                        <span className={`pill ${toneForSla(getRecordSlaStatus(record))}`}>
                          {getRecordSlaStatus(record)}
                        </span>
                        <small>
                          {formatCountdown(
                            record.slaDueAt,
                            locale,
                            getRecordSlaStatus(record),
                          )}
                        </small>
                      </td>
                      <td className="mono">
                        {record.assigneeId ??
                          (locale === "en" ? "unassigned" : "未指派")}
                      </td>
                      <td>
                        <span className={`pill ${toneForStatus(record.status)}`}>
                          {record.status}
                        </span>
                      </td>
                      <td>{formatDateTime(record.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="detail-column">
            {selectedRecord ? (
              <>
                <section className="detail-card">
                  <div className="detail-head">
                    <div>
                      <p className="eyebrow">
                        {locale === "en" ? "Selected complaint" : "已選取案件"}
                      </p>
                      <h3>{selectedRecord.caseNo}</h3>
                    </div>
                    <div className="head-badges">
                      <span
                        className={`pill ${toneForSla(
                          getRecordSlaStatus(selectedRecord),
                        )}`}
                      >
                        {getRecordSlaStatus(selectedRecord)}
                      </span>
                      <span className={`pill ${toneForStatus(selectedRecord.status)}`}>
                        {selectedRecord.status}
                      </span>
                    </div>
                  </div>
                  <p className="detail-description">{selectedRecord.description}</p>
                  <dl className="meta-grid">
                    <div>
                      <dt>{locale === "en" ? "Source" : "來源"}</dt>
                      <dd>{toLabelFromSource(locale, selectedRecord.caseSource)}</dd>
                    </div>
                    <div>
                      <dt>{locale === "en" ? "Category" : "類別"}</dt>
                      <dd>{formatOpsCodeLabel(locale, selectedRecord.category)}</dd>
                    </div>
                    <div>
                      <dt>{locale === "en" ? "Severity" : "嚴重度"}</dt>
                      <dd>{selectedRecord.severity}</dd>
                    </div>
                    <div>
                      <dt>{locale === "en" ? "Assignee" : "負責人"}</dt>
                      <dd>{selectedRecord.assigneeId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>SLA due</dt>
                      <dd>{formatDateTime(selectedRecord.slaDueAt)}</dd>
                    </div>
                    <div>
                      <dt>{locale === "en" ? "Last update" : "最後更新"}</dt>
                      <dd>{formatDateTime(selectedRecord.updatedAt)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="detail-card">
                  <div className="section-head">
                    <h4>{locale === "en" ? "Available actions" : "可用動作"}</h4>
                    <small>
                      {locale === "en"
                        ? "Driven by availableActions"
                        : "由 availableActions 驅動"}
                    </small>
                  </div>
                  <div className="actions-grid">
                    {(selectedRecord.availableActions ?? []).map((descriptor) => (
                      <ActionPill
                        key={`${selectedRecord.caseNo}-${descriptor.action}`}
                        descriptor={descriptor}
                        locale={locale}
                        onClick={() => void handleAction(descriptor)}
                      />
                    ))}
                  </div>
                </section>

                <section className="detail-card">
                  <div className="section-head">
                    <h4>{locale === "en" ? "Links" : "連結"}</h4>
                    <small>
                      {locale === "en" ? "Cross-app links open in a new tab" : "跨 app 連結會以新分頁開啟"}
                    </small>
                  </div>
                  <div className="links-wrap">
                    {(selectedRecord.resourceLinks ?? []).map((link) => (
                      <ResourceLinkAnchor key={link.route} link={link} />
                    ))}
                  </div>
                </section>

                <section className="detail-card">
                  <div className="section-head">
                    <h4>{locale === "en" ? "Timeline" : "時間軸"}</h4>
                    <small>{timeline.length}</small>
                  </div>
                  <div className="timeline-list">
                    {timeline.slice(-5).reverse().map((entry) => (
                      <article key={entry.entryId} className="timeline-item">
                        <strong>{entry.action}</strong>
                        <p>{entry.note}</p>
                        <small>{formatDateTime(entry.createdAt)}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="detail-card">
                  <div className="section-head">
                    <h4>{locale === "en" ? "Export view" : "匯出視圖"}</h4>
                    <small>
                      {exportView?.readyForAudit
                        ? locale === "en"
                          ? "PII-masked packet ready"
                          : "PII-masked packet 已就緒"
                        : locale === "en"
                          ? "Awaiting closeout details"
                          : "等待結案資訊補齊"}
                    </small>
                  </div>
                  <div className="export-box">
                    <span>{formatDateTime(exportView?.exportGeneratedAt)}</span>
                    <ResourceLinkAnchor link={buildAuditLink(selectedRecord.caseNo)} />
                  </div>
                </section>
              </>
            ) : (
              <section className="detail-card">
                {locale === "en"
                  ? "Select a complaint row to inspect actions, links, and timeline."
                  : "選擇一筆客訴案件以檢視動作、連結與時間軸。"}
              </section>
            )}
          </aside>
        </section>
      )}

      {modalState ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true">
            <div className="section-head">
              <h4>{modalState.action.replaceAll("_", " ")}</h4>
              <button
                type="button"
                className="text-btn"
                onClick={() => setModalState(null)}
              >
                {locale === "en" ? "Close" : "關閉"}
              </button>
            </div>

            {modalState.action === "create" ? (
              <form
                className="modal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runBusyAction("create_complaint", async () => {
                    const created = await getOpsClient().createComplaint(createForm);
                    setCreateForm(INITIAL_CREATE_FORM);
                    await loadWorkspace(created.caseNo);
                    setNotice({
                      message:
                        locale === "en"
                          ? `${created.caseNo} created.`
                          : `${created.caseNo} 已建立。`,
                      link: buildAuditLink(created.caseNo),
                    });
                  });
                }}
              >
                <select
                  value={createForm.category}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      category: event.target.value as ComplaintCategory,
                    }))
                  }
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {formatOpsCodeLabel(locale, category)}
                    </option>
                  ))}
                </select>
                <select
                  value={createForm.severity}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      severity: event.target.value as CreateComplaintCaseCommand["severity"],
                    }))
                  }
                >
                  <option value="normal">{locale === "en" ? "Normal" : "一般"}</option>
                  <option value="high">{locale === "en" ? "High" : "高"}</option>
                </select>
                <textarea
                  rows={4}
                  required
                  placeholder={locale === "en" ? "Complaint description" : "客訴描述"}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <input
                  type="text"
                  placeholder="relatedOrderId"
                  value={createForm.relatedOrderId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedOrderId: event.target.value,
                    }))
                  }
                />
                <input
                  type="text"
                  placeholder="relatedCallId"
                  value={createForm.relatedCallId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedCallId: event.target.value,
                    }))
                  }
                />
                <button type="submit" className="header-btn" disabled={busyAction === "create_complaint"}>
                  {locale === "en" ? "Create" : "建立"}
                </button>
              </form>
            ) : null}

            {modalState.action === "assign_complaint" && modalRecord ? (
              <form
                className="modal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runBusyAction("assign_complaint", async () => {
                    await getOpsClient().assignComplaint(modalRecord.caseNo, {
                      assigneeId,
                      note: assignmentNote,
                    });
                    setAssignmentNote("");
                    await loadWorkspace(modalRecord.caseNo);
                    setNotice({
                      message:
                        locale === "en"
                          ? `${modalRecord.caseNo} reassigned.`
                          : `${modalRecord.caseNo} 已重新指派。`,
                      link: buildAuditLink(modalRecord.caseNo),
                    });
                  });
                }}
              >
                <input
                  type="text"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                />
                <textarea
                  rows={3}
                  placeholder={locale === "en" ? "Assignment note" : "指派備註"}
                  value={assignmentNote}
                  onChange={(event) => setAssignmentNote(event.target.value)}
                />
                <button type="submit" className="header-btn" disabled={busyAction === "assign_complaint"}>
                  {locale === "en" ? "Confirm assign" : "確認指派"}
                </button>
              </form>
            ) : null}

            {modalState.action === "add_note" && modalRecord ? (
              <form
                className="modal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runBusyAction("add_note", async () => {
                    await getOpsClient().addComplaintNote(modalRecord.caseNo, {
                      note: noteText,
                    });
                    setNoteText("");
                    await loadWorkspace(modalRecord.caseNo);
                    setNotice({
                      message:
                        locale === "en"
                          ? `Note added to ${modalRecord.caseNo}.`
                          : `已為 ${modalRecord.caseNo} 新增備註。`,
                      link: buildAuditLink(modalRecord.caseNo),
                    });
                  });
                }}
              >
                <textarea
                  rows={4}
                  required
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
                <button type="submit" className="header-btn" disabled={busyAction === "add_note"}>
                  {locale === "en" ? "Save note" : "儲存備註"}
                </button>
              </form>
            ) : null}

            {(modalState.action === "resolve_complaint" ||
              modalState.action === "close_complaint") &&
            modalRecord ? (
              <form
                className="modal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runBusyAction(modalState.action, async () => {
                    const command = {
                      resolutionCode: resolutionCode as ComplaintResolutionCode,
                      closingNote,
                    };
                    if (modalState.action === "resolve_complaint") {
                      await getOpsClient().resolveComplaint(modalRecord.caseNo, command);
                    } else {
                      await getOpsClient().closeComplaint(modalRecord.caseNo, command);
                    }
                    setClosingNote("");
                    await loadWorkspace(modalRecord.caseNo);
                    setNotice({
                      message:
                        locale === "en"
                          ? `${modalRecord.caseNo} ${modalState.action === "resolve_complaint" ? "resolved" : "closed"}.`
                          : `${modalRecord.caseNo} 已${modalState.action === "resolve_complaint" ? "解決" : "關閉"}。`,
                      link: buildAuditLink(modalRecord.caseNo),
                    });
                  });
                }}
              >
                <select disabled value={resolutionCode}>
                  {validResolutionCodes.map((code) => (
                    <option key={code} value={code}>
                      {formatOpsCodeLabel(locale, code)}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={4}
                  required
                  value={closingNote}
                  placeholder={locale === "en" ? "Closing note" : "結案說明"}
                  onChange={(event) => setClosingNote(event.target.value)}
                />
                <button type="submit" className="header-btn" disabled={busyAction === modalState.action}>
                  {locale === "en" ? "Confirm" : "確認"}
                </button>
              </form>
            ) : null}

            {modalState.action === "reopen_complaint" && modalRecord ? (
              <form
                className="modal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runBusyAction("reopen_complaint", async () => {
                    await getOpsClient().reopenComplaint(modalRecord.caseNo, {
                      reason: reopenReason,
                    });
                    setReopenReason("");
                    await loadWorkspace(modalRecord.caseNo);
                    setNotice({
                      message:
                        locale === "en"
                          ? `${modalRecord.caseNo} reopened.`
                          : `${modalRecord.caseNo} 已 reopen。`,
                      link: buildAuditLink(modalRecord.caseNo),
                    });
                  });
                }}
              >
                <textarea
                  rows={4}
                  required
                  value={reopenReason}
                  placeholder={locale === "en" ? "Reason is required" : "必填原因"}
                  onChange={(event) => setReopenReason(event.target.value)}
                />
                <button type="submit" className="header-btn" disabled={busyAction === "reopen_complaint"}>
                  {locale === "en" ? "Reopen" : "重新開啟"}
                </button>
              </form>
            ) : null}

            {modalState.action === "escalate_to_incident" && modalRecord ? (
              <form
                className="modal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runBusyAction("escalate_to_incident", async () => {
                    const result = await getOpsClient().escalateComplaintToIncident(
                      modalRecord.caseNo,
                      {
                        title: escalateTitle,
                        severity: escalateSeverity,
                        reason: escalateReason,
                      },
                    );
                    setEscalateTitle("");
                    setEscalateReason("");
                    setEscalateSeverity("medium");
                    await loadWorkspace(modalRecord.caseNo);
                    setNotice({
                      message:
                        locale === "en"
                          ? `${modalRecord.caseNo} escalated to ${result.incident.incidentId}.`
                          : `${modalRecord.caseNo} 已升級至 ${result.incident.incidentId}。`,
                      link: {
                        targetApp: "ops-console",
                        route: `/incidents/${result.incident.incidentId}`,
                        resourceType: "incident",
                        resourceId: result.incident.incidentId,
                        openMode: "same_tab",
                        label: result.incident.incidentId,
                      },
                    });
                  });
                }}
              >
                <input
                  type="text"
                  required
                  placeholder={locale === "en" ? "Incident title" : "事件標題"}
                  value={escalateTitle}
                  onChange={(event) => setEscalateTitle(event.target.value)}
                />
                <select
                  value={escalateSeverity}
                  onChange={(event) =>
                    setEscalateSeverity(
                      event.target.value as EscalateComplaintToIncidentCommand["severity"],
                    )
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
                <textarea
                  rows={4}
                  required
                  placeholder={locale === "en" ? "Escalation reason" : "升級原因"}
                  value={escalateReason}
                  onChange={(event) => setEscalateReason(event.target.value)}
                />
                <button type="submit" className="header-btn" disabled={busyAction === "escalate_to_incident"}>
                  {locale === "en" ? "Escalate" : "升級"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .complaints-page {
          padding: 24px;
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 28%),
            linear-gradient(180deg, #f7fafc 0%, #eef3f7 100%);
          min-height: 100%;
        }
        .header-actions,
        .tabs-row,
        .toolbar,
        .hero-row,
        .kpi-grid,
        .workspace-grid,
        .actions-grid,
        .links-wrap {
          display: flex;
          gap: 12px;
        }
        .hero-row,
        .workspace-grid {
          align-items: stretch;
        }
        .hero-row {
          margin: 16px 0;
          justify-content: space-between;
        }
        .hero-copy,
        .list-card,
        .detail-card,
        .kpi-card,
        .loading-panel,
        .empty-state,
        .modal-card {
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
        }
        .hero-copy {
          flex: 1;
          padding: 24px;
        }
        .hero-copy h2,
        .detail-head h3,
        .empty-state h3 {
          margin: 0 0 8px;
        }
        .eyebrow {
          margin: 0 0 8px;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
          font-weight: 700;
        }
        .kpi-grid {
          width: min(440px, 100%);
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .kpi-card {
          padding: 18px;
        }
        .kpi-card span {
          display: block;
          font-size: 12px;
          color: #64748b;
        }
        .kpi-card strong {
          display: block;
          margin-top: 8px;
          font-size: 28px;
        }
        .kpi-card.breach {
          background: linear-gradient(135deg, #fff1f2, #ffffff);
        }
        .banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin: 12px 0;
          padding: 12px 16px;
          border-radius: 14px;
          font-size: 13px;
        }
        .banner.stale {
          background: #fff7ed;
          color: #9a3412;
        }
        .banner.error {
          background: #fef2f2;
          color: #991b1b;
        }
        .banner.notice {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .tab-chip,
        .header-btn,
        .text-btn,
        .action-pill,
        .link-chip {
          border: 0;
          border-radius: 999px;
          cursor: pointer;
          transition: transform 120ms ease, opacity 120ms ease;
        }
        .tab-chip,
        .header-btn,
        .action-pill {
          padding: 10px 14px;
        }
        .tab-chip {
          background: rgba(255, 255, 255, 0.84);
          color: #0f172a;
        }
        .tab-chip.active {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .tab-chip.danger {
          background: #fee2e2;
          color: #b91c1c;
        }
        .header-btn {
          background: #0f172a;
          color: white;
          font-weight: 600;
        }
        .header-btn.secondary {
          background: white;
          color: #0f172a;
          border: 1px solid rgba(15, 23, 42, 0.12);
        }
        .toolbar {
          margin: 16px 0;
          flex-wrap: wrap;
        }
        .toolbar input,
        .toolbar select,
        .modal-form input,
        .modal-form select,
        .modal-form textarea {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 14px;
          padding: 12px 14px;
          background: white;
          font: inherit;
        }
        .toolbar input {
          min-width: 260px;
          flex: 1;
        }
        .loading-panel,
        .empty-state {
          padding: 28px;
        }
        .empty-state {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .empty-icon {
          width: 72px;
          height: 72px;
          border-radius: 24px;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.06);
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .workspace-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr);
        }
        .list-card,
        .detail-column {
          min-width: 0;
        }
        .table-wrap {
          overflow: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1120px;
        }
        th,
        td {
          padding: 14px 12px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.9);
          text-align: left;
          vertical-align: top;
          font-size: 13px;
        }
        th {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
          background: rgba(248, 250, 252, 0.9);
          position: sticky;
          top: 0;
        }
        tbody tr {
          cursor: pointer;
        }
        tbody tr.selected {
          background: #eff6ff;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .accent {
          color: #2563eb;
          font-weight: 700;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: lowercase;
        }
        .pill.danger {
          background: #fee2e2;
          color: #b91c1c;
        }
        .pill.warning {
          background: #ffedd5;
          color: #c2410c;
        }
        .pill.ok {
          background: #dcfce7;
          color: #15803d;
        }
        .pill.neutral {
          background: #e2e8f0;
          color: #334155;
        }
        .pill.info {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .summary-cell strong,
        .timeline-item strong,
        .section-head h4,
        .detail-card h4 {
          display: block;
        }
        .summary-cell small,
        td small,
        .timeline-item small,
        .section-head small,
        .empty-state small {
          color: #64748b;
        }
        .detail-column {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .detail-card {
          padding: 18px;
        }
        .detail-head,
        .section-head,
        .export-box {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .head-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .detail-description {
          margin: 12px 0 0;
          color: #334155;
        }
        .meta-grid {
          margin: 16px 0 0;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .meta-grid dt {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
        }
        .meta-grid dd {
          margin: 6px 0 0;
        }
        .actions-grid {
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .action-pill {
          background: #0f172a;
          color: white;
          text-align: left;
        }
        .action-pill.is-disabled {
          background: #e2e8f0;
          color: #64748b;
          cursor: not-allowed;
        }
        .action-pill small {
          display: block;
          opacity: 0.7;
        }
        .links-wrap {
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .link-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 12px;
          text-decoration: none;
          background: #f8fafc;
          color: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.24);
        }
        .timeline-list {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .timeline-item {
          border-left: 3px solid #cbd5e1;
          padding-left: 12px;
        }
        .export-box {
          margin-top: 14px;
          align-items: center;
        }
        .text-btn {
          background: transparent;
          color: inherit;
          padding: 0;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: grid;
          place-items: center;
          padding: 24px;
          z-index: 40;
        }
        .modal-card {
          width: min(560px, 100%);
          padding: 22px;
        }
        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
        }
        @media (max-width: 1180px) {
          .workspace-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 860px) {
          .complaints-page {
            padding: 16px;
          }
          .hero-row,
          .tabs-row,
          .toolbar {
            flex-direction: column;
          }
          .kpi-grid,
          .meta-grid {
            grid-template-columns: 1fr;
          }
          .header-actions {
            width: 100%;
            flex-wrap: wrap;
          }
          .header-btn,
          .header-btn.secondary {
            width: 100%;
          }
          table {
            min-width: 920px;
          }
        }
      `}</style>
    </div>
  );
}
