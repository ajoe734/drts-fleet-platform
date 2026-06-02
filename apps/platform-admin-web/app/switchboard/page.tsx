/**
 * Switchboard Page — Public Info & Placards (Q-ADM04/14)
 *
 * Canvas parity target: docs/05-ui/drts-design-canvas/platform-screens-2.jsx (PA_Switchboard)
 * and docs/05-ui/platform-admin-body-parity-audit-20260602.md §9.
 *
 * Route name is preserved as /switchboard. Body is rebuilt to the canvas
 * "Public Info & Placards" language: three tabs (versions / placards / history),
 * a two-column versions + placard-preview layout, Q-ADM14 source lineage
 * (one public-info version -> many placards), a high-risk required-reason
 * publish action, and a medium-risk placard generation action.
 */

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { getPlatformLabel } from "@/lib/localized-labels";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
} from "@drts/contracts";
import { getPlacardVersionCodePrecheckMessage } from "./placard-version-code";
import {
  formatPlacardSourceOptionLabel,
  getPlacardSourceSelectionHint,
  getPreferredPlacardSourceVersion,
  getPlacardRetiredSourceAuditNote,
  isPlacardSourceSelectionBlocked,
} from "./placard-source";

type TabId = "versions" | "placards" | "history";
type ModalId = "create" | "publish" | "placard";

type PublicInfoRow = PublicInfoVersionRecord & Record<string, unknown>;
type PlacardRow = PlacardVersionRecord & Record<string, unknown>;

type PlacardFormState = {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string;
};

const th = buildCanvasTheme({ surface: "platform", density: "compact" });

const EMPTY_PUBLIC_INFO_FORM: CreatePublicInfoVersionCommand = {
  title: "",
  callPhone: "",
  complaintPhone: "",
  callRateText: "",
  fareText: "",
  paymentMethodText: "",
  effectiveFrom: "",
  effectiveTo: "",
};

const EMPTY_PLACARD_FORM: PlacardFormState = {
  versionCode: "",
  publicInfoVersionId: "",
  templateName: "seatback-default",
  artifactFileId: "",
};

function cleanNullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function publicInfoStatusTone(
  status: PublicInfoVersionRecord["status"],
): CanvasTone {
  if (status === "published") {
    return "success";
  }
  if (status === "draft") {
    return "warn";
  }
  return "neutral";
}

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

const versionsSplitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const fieldInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: th.text,
  marginBottom: 5,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const subcopyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  lineHeight: 1.4,
};

const monoCellStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  color: th.textMuted,
};

const cellStackStyle: CSSProperties = { display: "grid", gap: 2, minWidth: 0 };

const placardCardStyle: CSSProperties = {
  background: "#FCFAF2",
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: 14,
  fontSize: 11.5,
  lineHeight: 1.55,
  color: "#1a1a1a",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(11, 18, 32, 0.45)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "60px 16px",
  zIndex: 40,
  overflowY: "auto",
};

const modalDialogStyle: CSSProperties = {
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 24px 60px rgba(11, 18, 32, 0.25)",
  overflow: "hidden",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderBottom: `1px solid ${th.border}`,
};

const modalBodyStyle: CSSProperties = { padding: 16 };

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px",
  borderTop: `1px solid ${th.border}`,
};

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true">
      <div style={modalDialogStyle}>
        <header style={modalHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>
              {title}
            </div>
            {subtitle ? (
              <div style={{ ...subcopyStyle, marginTop: 3 }}>{subtitle}</div>
            ) : null}
          </div>
          <CanvasBtn theme={th} variant="ghost" size="xs" icon="x" onClick={onClose}>
            {""}
          </CanvasBtn>
        </header>
        <div style={modalBodyStyle}>{children}</div>
        {footer ? <footer style={modalFooterStyle}>{footer}</footer> : null}
      </div>
    </div>
  );
}

export default function SwitchboardPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [publicInfo, setPublicInfo] = useState<PublicInfoVersionRecord[]>([]);
  const [placards, setPlacards] = useState<PlacardVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("versions");
  const [modal, setModal] = useState<ModalId | null>(null);

  const [publicInfoForm, setPublicInfoForm] = useState(EMPTY_PUBLIC_INFO_FORM);
  const [placardForm, setPlacardForm] = useState(EMPTY_PLACARD_FORM);
  const [publishTargetId, setPublishTargetId] = useState<string>("");
  const [publishReason, setPublishReason] = useState<string>("");

  const [creatingPublicInfo, setCreatingPublicInfo] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(
    null,
  );
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(
    null,
  );
  const [creatingPlacard, setCreatingPlacard] = useState(false);
  const [publishingPlacardId, setPublishingPlacardId] = useState<string | null>(
    null,
  );

  const copy =
    locale === "en"
      ? {
          title: "Public Info & Placards",
          subtitle:
            "Route name preserved as /switchboard · one public-info version can produce many placards (Q-ADM14)",
          createDraft: "Create draft",
          publishVersion: "Publish version",
          refresh: "Refresh",
          tabVersions: "Versions",
          tabPlacards: "Placards",
          tabHistory: "History",
          versionsTitle: "Public info versions",
          versionsSubtitle: "effective from / to · public phones · status",
          placardPreviewTitle: (code: string, src: string) =>
            `Current placard · ${code} (source ${src})`,
          placardPreviewEmpty: "No placard generated yet.",
          downloadPdf: "Download PDF",
          generatePlacard: "Generate placard",
          placardListTitle: "Placard versions",
          placardListSubtitle: "Seat-back artifacts traced to a source version",
          historyVersionsTitle: "Public info version history",
          historyVersionsSubtitle:
            "Published versions are immutable disclosure records.",
          historyPlacardsTitle: "Placard lineage",
          historyPlacardsSubtitle:
            "Issued placards and the public-info version each was generated from.",
          loading: "Loading switchboard...",
          noVersions: "No public info versions.",
          noPlacards: "No placard versions.",
          noHistory: "No published history yet.",
          colVersion: "Version",
          colFrom: "Effective from",
          colTo: "Effective to",
          colCall: "Call line",
          colComplaint: "Complaint line",
          colStatus: "Status",
          colUpdated: "Updated",
          colPlacard: "Placard",
          colSource: "Source version",
          colTemplate: "Template",
          colArtifact: "Artifact",
          colActions: "Actions",
          colPublishedAt: "Published at",
          colPublishedBy: "Published by",
          publish: "Publish",
          publishing: "Publishing...",
          deleteDraft: "Delete",
          deleting: "Deleting...",
          immutable: "Immutable",
          createTitle: "Create public info draft",
          createSubtitle: "Medium-risk · saved as draft until published.",
          publishTitle: "Publish public info version",
          publishSubtitle:
            "High-risk · publishing replaces the live disclosure. A reason is required for the audit receipt.",
          publishNoDrafts: "No draft versions are available to publish.",
          publishPick: "Select draft version",
          publishReasonLabel: "Reason (required)",
          publishReasonPh: "Why is this version being published now?",
          confirmPublish: "Confirm publish",
          generateTitle: "Generate new placard",
          generateSubtitle:
            "Medium-risk · the placard is bound to the selected source public-info version.",
          confirmGenerate: "Generate placard",
          generating: "Generating...",
          cancel: "Cancel",
          fTitle: "Title",
          fCallPhone: "Call phone",
          fComplaintPhone: "Complaint phone",
          fEffectiveFrom: "Effective from",
          fEffectiveTo: "Effective to (optional)",
          fCallRate: "Call rate text",
          fFare: "Fare text",
          fPayment: "Payment method text",
          fSource: "Source public info version",
          fVersionCode: "Version code",
          fTemplate: "Template",
          fArtifact: "Artifact file id (optional)",
          receiptPublishVersion: (id: string, reason: string) =>
            `Audit receipt: published public info ${id}. Reason: ${reason}`,
          receiptCreate: "Audit receipt: public info draft created.",
          receiptGenerate: (code: string) =>
            `Audit receipt: placard ${code} generated.`,
          receiptPublishPlacard: (code: string) =>
            `Audit receipt: placard ${code} published.`,
        }
      : {
          title: "Public Info & Placards",
          subtitle:
            "route name 保留為 /switchboard · 1 個公開資訊版本可產生多個車牌貼 (Q-ADM14)",
          createDraft: "建立草稿",
          publishVersion: "發佈版本",
          refresh: "重新整理",
          tabVersions: "版本",
          tabPlacards: "牌貼",
          tabHistory: "歷史",
          versionsTitle: "Public info versions",
          versionsSubtitle: "effective from / to · 公開電話 · 狀態",
          placardPreviewTitle: (code: string, src: string) =>
            `目前發行牌貼 · ${code} (source ${src})`,
          placardPreviewEmpty: "目前尚未產生牌貼。",
          downloadPdf: "下載 PDF",
          generatePlacard: "產生新 placard",
          placardListTitle: "牌貼版本",
          placardListSubtitle: "每張牌貼皆可追溯到來源公開資訊版本",
          historyVersionsTitle: "公開資訊版本歷史",
          historyVersionsSubtitle: "已發佈版本為不可變的揭露紀錄。",
          historyPlacardsTitle: "牌貼沿革",
          historyPlacardsSubtitle: "已發行牌貼及其來源公開資訊版本。",
          loading: "載入交換台中...",
          noVersions: "目前沒有公開資訊版本。",
          noPlacards: "目前沒有牌貼版本。",
          noHistory: "目前尚無已發佈歷史。",
          colVersion: "版本",
          colFrom: "EFFECTIVE FROM",
          colTo: "EFFECTIVE TO",
          colCall: "叫車電話",
          colComplaint: "客訴電話",
          colStatus: "狀態",
          colUpdated: "更新",
          colPlacard: "牌貼",
          colSource: "來源版本",
          colTemplate: "範本",
          colArtifact: "成品",
          colActions: "操作",
          colPublishedAt: "發佈時間",
          colPublishedBy: "發佈者",
          publish: "發佈",
          publishing: "發佈中...",
          deleteDraft: "刪除",
          deleting: "刪除中...",
          immutable: "不可變",
          createTitle: "建立公開資訊草稿",
          createSubtitle: "中度風險 · 發佈前皆為草稿。",
          publishTitle: "發佈公開資訊版本",
          publishSubtitle:
            "高風險 · 發佈會替換目前生效的揭露資訊；需填寫原因以產生稽核憑據。",
          publishNoDrafts: "目前沒有可發佈的草稿版本。",
          publishPick: "選擇草稿版本",
          publishReasonLabel: "原因（必填）",
          publishReasonPh: "為何現在發佈此版本？",
          confirmPublish: "確認發佈",
          generateTitle: "產生新牌貼",
          generateSubtitle: "中度風險 · 牌貼會綁定所選的來源公開資訊版本。",
          confirmGenerate: "產生牌貼",
          generating: "產生中...",
          cancel: "取消",
          fTitle: "標題",
          fCallPhone: "叫車電話",
          fComplaintPhone: "客訴電話",
          fEffectiveFrom: "生效起",
          fEffectiveTo: "生效迄（選填）",
          fCallRate: "叫車費率說明",
          fFare: "計費說明",
          fPayment: "支付方式說明",
          fSource: "來源公開資訊版本",
          fVersionCode: "版本代碼",
          fTemplate: "範本",
          fArtifact: "成品檔 id（選填）",
          receiptPublishVersion: (id: string, reason: string) =>
            `稽核憑據：已發佈公開資訊 ${id}。原因：${reason}`,
          receiptCreate: "稽核憑據：已建立公開資訊草稿。",
          receiptGenerate: (code: string) => `稽核憑據：已產生牌貼 ${code}。`,
          receiptPublishPlacard: (code: string) =>
            `稽核憑據：已發佈牌貼 ${code}。`,
        };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [publicInfoVersions, placardVersions] = await Promise.all([
        client.listPublicInfo(),
        client.listPlacards(),
      ]);
      setPublicInfo(publicInfoVersions ?? []);
      setPlacards(placardVersions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const publicInfoById = useMemo(
    () =>
      Object.fromEntries(
        publicInfo.map((version) => [version.versionId, version]),
      ),
    [publicInfo],
  );

  const draftVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "draft"),
    [publicInfo],
  );

  const historyVersions = useMemo(
    () => publicInfo.filter((version) => version.status !== "draft"),
    [publicInfo],
  );

  const livePlacard = useMemo(
    () =>
      placards.find((placard) => placard.publishedAt != null) ??
      placards[0] ??
      null,
    [placards],
  );

  const livePlacardSource = livePlacard
    ? (publicInfoById[livePlacard.publicInfoVersionId] ?? null)
    : null;

  const publishedPlacards = useMemo(
    () => placards.filter((placard) => placard.publishedAt != null),
    [placards],
  );

  // Keep the placard generate form defaulted to a usable source version.
  useEffect(() => {
    const preferredVersion = getPreferredPlacardSourceVersion(publicInfo);
    if (!preferredVersion || placardForm.publicInfoVersionId) {
      return;
    }
    setPlacardForm((current) => ({
      ...current,
      publicInfoVersionId: preferredVersion.versionId,
    }));
  }, [placardForm.publicInfoVersionId, publicInfo]);

  const selectedPlacardSource =
    publicInfoById[placardForm.publicInfoVersionId] ?? null;
  const versionCodePrecheckMessage = useMemo(
    () =>
      getPlacardVersionCodePrecheckMessage(
        placardForm.versionCode,
        placards,
        locale,
      ),
    [locale, placardForm.versionCode, placards],
  );
  const placardSourceBlocked = isPlacardSourceSelectionBlocked(
    selectedPlacardSource,
  );

  const closeModal = useCallback(() => setModal(null), []);

  async function handleCreatePublicInfo(event: React.FormEvent) {
    event.preventDefault();
    setCreatingPublicInfo(true);
    setError(null);
    try {
      await client.createPublicInfoVersion({
        title: publicInfoForm.title.trim(),
        callPhone: cleanNullable(publicInfoForm.callPhone ?? ""),
        complaintPhone: cleanNullable(publicInfoForm.complaintPhone ?? ""),
        callRateText: cleanNullable(publicInfoForm.callRateText ?? ""),
        fareText: cleanNullable(publicInfoForm.fareText ?? ""),
        paymentMethodText: cleanNullable(
          publicInfoForm.paymentMethodText ?? "",
        ),
        effectiveFrom: cleanNullable(publicInfoForm.effectiveFrom ?? ""),
        effectiveTo: cleanNullable(publicInfoForm.effectiveTo ?? ""),
      });
      setPublicInfoForm(EMPTY_PUBLIC_INFO_FORM);
      setReceipt(copy.receiptCreate);
      setModal(null);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPublicInfo(false);
    }
  }

  async function handlePublish(versionId: string, reason: string) {
    setPublishingVersionId(versionId);
    setError(null);
    try {
      await client.publishPublicInfoVersion(versionId, {});
      setReceipt(copy.receiptPublishVersion(versionId, reason));
      setPublishTargetId("");
      setPublishReason("");
      setModal(null);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingVersionId(null);
    }
  }

  async function handleDeleteDraft(versionId: string) {
    setDeletingVersionId(versionId);
    setError(null);
    try {
      await client.deletePublicInfoVersion(versionId);
      if (publishTargetId === versionId) {
        setPublishTargetId("");
      }
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingVersionId(null);
    }
  }

  async function handleGeneratePlacard(event: React.FormEvent) {
    event.preventDefault();
    setCreatingPlacard(true);
    setError(null);
    try {
      const command: GeneratePlacardVersionCommand = {
        versionCode: placardForm.versionCode.trim(),
        publicInfoVersionId: placardForm.publicInfoVersionId,
        templateName: placardForm.templateName.trim(),
        artifactFileId: cleanNullable(placardForm.artifactFileId),
      };
      await client.generatePlacardVersion(command);
      setReceipt(copy.receiptGenerate(command.versionCode));
      setPlacardForm((current) => ({
        ...EMPTY_PLACARD_FORM,
        publicInfoVersionId: current.publicInfoVersionId,
      }));
      setModal(null);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPlacard(false);
    }
  }

  async function handlePublishPlacard(placard: PlacardVersionRecord) {
    setPublishingPlacardId(placard.placardVersionId);
    setError(null);
    try {
      await client.publishPlacardVersion(placard.placardVersionId);
      setReceipt(copy.receiptPublishPlacard(placard.versionCode));
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingPlacardId(null);
    }
  }

  const versionColumns: CanvasTableColumn<PublicInfoRow>[] = [
    {
      h: copy.colVersion,
      w: 200,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={{ fontWeight: 600 }}>{row.title}</span>
          <span style={monoCellStyle}>{row.versionId}</span>
        </div>
      ),
    },
    {
      h: copy.colFrom,
      w: 130,
      mono: true,
      r: (row) => row.effectiveFrom ?? "—",
    },
    {
      h: copy.colTo,
      w: 130,
      mono: true,
      r: (row) => row.effectiveTo ?? "—",
    },
    {
      h: copy.colCall,
      w: 130,
      mono: true,
      r: (row) => row.callPhone ?? "—",
    },
    {
      h: copy.colComplaint,
      w: 130,
      mono: true,
      r: (row) => row.complaintPhone ?? "—",
    },
    {
      h: copy.colStatus,
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={publicInfoStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: copy.colUpdated,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
  ];

  const placardColumns: CanvasTableColumn<PlacardRow>[] = [
    {
      h: copy.colPlacard,
      w: 200,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={{ fontWeight: 600 }}>{row.versionCode}</span>
          <span style={monoCellStyle}>{row.placardVersionId}</span>
        </div>
      ),
    },
    {
      h: copy.colSource,
      r: (row) => {
        const source = publicInfoById[row.publicInfoVersionId];
        return (
          <div style={cellStackStyle}>
            <span>{source?.title ?? row.publicInfoVersionId}</span>
            <span style={monoCellStyle}>{row.publicInfoVersionId}</span>
          </div>
        );
      },
    },
    { h: copy.colTemplate, k: "templateName", w: 150 },
    {
      h: copy.colArtifact,
      w: 200,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={monoCellStyle}>
            {row.artifactFileId ??
              getPlatformLabel(locale, "pendingArtifactId")}
          </span>
          {row.artifactDownloadUrl ? (
            <a
              href={row.artifactDownloadUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: th.accent, fontSize: 11.5 }}
            >
              {copy.downloadPdf}
            </a>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.colStatus,
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.publishedAt ? "success" : "warn"} dot>
          {row.publishedAt ? "published" : "draft"}
        </CanvasPill>
      ),
    },
    {
      h: copy.colActions,
      w: 120,
      r: (row) =>
        row.publishedAt ? (
          <span style={subcopyStyle}>{copy.immutable}</span>
        ) : (
          <CanvasBtn
            theme={th}
            variant="primary"
            size="xs"
            icon="check"
            disabled={publishingPlacardId === row.placardVersionId}
            onClick={() => void handlePublishPlacard(row)}
          >
            {publishingPlacardId === row.placardVersionId
              ? copy.publishing
              : copy.publish}
          </CanvasBtn>
        ),
    },
  ];

  const historyVersionColumns: CanvasTableColumn<PublicInfoRow>[] = [
    {
      h: copy.colVersion,
      w: 200,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={{ fontWeight: 600 }}>{row.title}</span>
          <span style={monoCellStyle}>{row.versionId}</span>
        </div>
      ),
    },
    { h: copy.colFrom, w: 130, mono: true, r: (row) => row.effectiveFrom ?? "—" },
    { h: copy.colTo, w: 130, mono: true, r: (row) => row.effectiveTo ?? "—" },
    {
      h: copy.colStatus,
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={publicInfoStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: copy.colPublishedAt,
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.publishedAt ?? ""),
    },
    {
      h: copy.colPublishedBy,
      mono: true,
      r: (row) => row.publishedBy ?? "—",
    },
  ];

  const historyPlacardColumns: CanvasTableColumn<PlacardRow>[] = [
    {
      h: copy.colPlacard,
      w: 200,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={{ fontWeight: 600 }}>{row.versionCode}</span>
          <span style={monoCellStyle}>{row.placardVersionId}</span>
        </div>
      ),
    },
    {
      h: copy.colSource,
      mono: true,
      r: (row) => row.publicInfoVersionId,
    },
    { h: copy.colTemplate, k: "templateName", w: 150 },
    {
      h: copy.colPublishedAt,
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.publishedAt ?? ""),
    },
  ];

  const tabDefs: { id: TabId; label: string; count?: number }[] = [
    { id: "versions", label: copy.tabVersions, count: publicInfo.length },
    { id: "placards", label: copy.tabPlacards, count: placards.length },
    { id: "history", label: copy.tabHistory },
  ];
  const tabNodes = tabDefs.map((def) => (
    <span
      key={def.id}
      onClick={() => setActiveTab(def.id)}
      style={{ cursor: "pointer" }}
    >
      {def.count != null ? `${def.label} (${def.count})` : def.label}
    </span>
  ));
  const activeTabIndex = tabDefs.findIndex((def) => def.id === activeTab);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        sticky={false}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={tabNodes[activeTabIndex]}
        actions={
          <>
            <CanvasBtn
              theme={th}
              variant="secondary"
              size="sm"
              icon="plus"
              onClick={() => {
                setPublicInfoForm(EMPTY_PUBLIC_INFO_FORM);
                setModal("create");
              }}
            >
              {copy.createDraft}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              size="sm"
              icon="check"
              onClick={() => {
                setPublishTargetId(draftVersions[0]?.versionId ?? "");
                setPublishReason("");
                setModal("publish");
              }}
            >
              {copy.publishVersion}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={getPlatformLabel(locale, "error")}
            body={error}
          />
        ) : null}

        {receipt ? (
          <CanvasBanner
            theme={th}
            tone="success"
            icon="check"
            body={receipt}
            actions={
              <CanvasBtn
                theme={th}
                variant="ghost"
                size="xs"
                icon="x"
                onClick={() => setReceipt(null)}
              >
                {""}
              </CanvasBtn>
            }
          />
        ) : null}

        {loading && publicInfo.length === 0 && placards.length === 0 ? (
          <CanvasCard theme={th}>
            <div style={emptyStateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : activeTab === "versions" ? (
          <div style={versionsSplitStyle}>
            <CanvasCard
              theme={th}
              title={copy.versionsTitle}
              subtitle={copy.versionsSubtitle}
              padding={0}
            >
              {publicInfo.length > 0 ? (
                <CanvasTable<PublicInfoRow>
                  theme={th}
                  columns={versionColumns}
                  rows={publicInfo as PublicInfoRow[]}
                />
              ) : (
                <div style={emptyStateStyle}>{copy.noVersions}</div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={
                livePlacard
                  ? copy.placardPreviewTitle(
                      livePlacard.versionCode,
                      livePlacard.publicInfoVersionId,
                    )
                  : copy.placardPreviewTitle("—", "—")
              }
            >
              {livePlacard ? (
                <>
                  <div style={placardCardStyle}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        textAlign: "center",
                        marginBottom: 6,
                      }}
                    >
                      {livePlacardSource?.title ?? livePlacard.versionCode}
                    </div>
                    <div
                      style={{
                        borderTop: "1px solid #1a1a1a",
                        borderBottom: "1px solid #1a1a1a",
                        padding: "6px 0",
                        textAlign: "center",
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      {locale === "en" ? "Call" : "叫車"}{" "}
                      {livePlacardSource?.callPhone ?? "—"} ·{" "}
                      {locale === "en" ? "Complaint" : "客訴"}{" "}
                      {livePlacardSource?.complaintPhone ?? "—"}
                    </div>
                    <div style={{ fontSize: 10.5 }}>
                      {livePlacardSource?.callRateText ? (
                        <div>{livePlacardSource.callRateText}</div>
                      ) : null}
                      {livePlacardSource?.fareText ? (
                        <div>{livePlacardSource.fareText}</div>
                      ) : null}
                      {livePlacardSource?.paymentMethodText ? (
                        <div>{livePlacardSource.paymentMethodText}</div>
                      ) : null}
                      <div style={{ marginTop: 4, color: "#666" }}>
                        {livePlacard.versionCode} · source{" "}
                        {livePlacard.publicInfoVersionId}
                        {livePlacardSource?.effectiveFrom
                          ? ` (${livePlacardSource.effectiveFrom}${
                              livePlacardSource.effectiveTo
                                ? ` ~ ${livePlacardSource.effectiveTo}`
                                : ""
                            })`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {livePlacard.artifactDownloadUrl ? (
                      <a
                        href={livePlacard.artifactDownloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: "none" }}
                      >
                        <CanvasBtn theme={th} variant="secondary" size="sm">
                          {copy.downloadPdf}
                        </CanvasBtn>
                      </a>
                    ) : (
                      <CanvasBtn theme={th} variant="secondary" size="sm" disabled>
                        {copy.downloadPdf}
                      </CanvasBtn>
                    )}
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      size="sm"
                      icon="plus"
                      onClick={() => setModal("placard")}
                    >
                      {copy.generatePlacard}
                    </CanvasBtn>
                  </div>
                </>
              ) : (
                <div style={emptyStateStyle}>
                  <div style={{ marginBottom: 12 }}>
                    {copy.placardPreviewEmpty}
                  </div>
                  <CanvasBtn
                    theme={th}
                    variant="primary"
                    size="sm"
                    icon="plus"
                    disabled={publicInfo.length === 0}
                    onClick={() => setModal("placard")}
                  >
                    {copy.generatePlacard}
                  </CanvasBtn>
                </div>
              )}
            </CanvasCard>
          </div>
        ) : activeTab === "placards" ? (
          <CanvasCard
            theme={th}
            title={copy.placardListTitle}
            subtitle={copy.placardListSubtitle}
            padding={0}
            actions={
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                icon="plus"
                disabled={publicInfo.length === 0}
                onClick={() => setModal("placard")}
              >
                {copy.generatePlacard}
              </CanvasBtn>
            }
          >
            {placards.length > 0 ? (
              <CanvasTable<PlacardRow>
                theme={th}
                columns={placardColumns}
                rows={placards as PlacardRow[]}
              />
            ) : (
              <div style={emptyStateStyle}>{copy.noPlacards}</div>
            )}
          </CanvasCard>
        ) : (
          <>
            <CanvasCard
              theme={th}
              title={copy.historyVersionsTitle}
              subtitle={copy.historyVersionsSubtitle}
              padding={0}
            >
              {historyVersions.length > 0 ? (
                <CanvasTable<PublicInfoRow>
                  theme={th}
                  columns={historyVersionColumns}
                  rows={historyVersions as PublicInfoRow[]}
                />
              ) : (
                <div style={emptyStateStyle}>{copy.noHistory}</div>
              )}
            </CanvasCard>
            <CanvasCard
              theme={th}
              title={copy.historyPlacardsTitle}
              subtitle={copy.historyPlacardsSubtitle}
              padding={0}
            >
              {publishedPlacards.length > 0 ? (
                <CanvasTable<PlacardRow>
                  theme={th}
                  columns={historyPlacardColumns}
                  rows={publishedPlacards as PlacardRow[]}
                />
              ) : (
                <div style={emptyStateStyle}>{copy.noHistory}</div>
              )}
            </CanvasCard>
          </>
        )}
      </div>

      {modal === "create" ? (
        <ModalShell
          title={copy.createTitle}
          subtitle={copy.createSubtitle}
          onClose={closeModal}
          footer={
            <>
              <CanvasBtn theme={th} variant="secondary" size="sm" onClick={closeModal}>
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                icon="plus"
                disabled={
                  creatingPublicInfo || publicInfoForm.title.trim() === ""
                }
                onClick={() =>
                  void handleCreatePublicInfo({
                    preventDefault: () => undefined,
                  } as React.FormEvent)
                }
              >
                {creatingPublicInfo ? copy.generating : copy.createDraft}
              </CanvasBtn>
            </>
          }
        >
          <div style={formGridStyle}>
            <label>
              <span style={fieldLabelStyle}>{copy.fTitle}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.title ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fCallPhone}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.callPhone ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    callPhone: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fComplaintPhone}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.complaintPhone ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    complaintPhone: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fEffectiveFrom}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.effectiveFrom ?? ""}
                placeholder="2026-07-01T00:00:00.000Z"
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    effectiveFrom: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fEffectiveTo}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.effectiveTo ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    effectiveTo: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fCallRate}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.callRateText ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    callRateText: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fFare}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.fareText ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    fareText: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fPayment}</span>
              <input
                style={fieldInputStyle}
                value={publicInfoForm.paymentMethodText ?? ""}
                onChange={(event) =>
                  setPublicInfoForm((current) => ({
                    ...current,
                    paymentMethodText: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </ModalShell>
      ) : null}

      {modal === "publish" ? (
        <ModalShell
          title={copy.publishTitle}
          subtitle={copy.publishSubtitle}
          onClose={closeModal}
          footer={
            <>
              <CanvasBtn theme={th} variant="secondary" size="sm" onClick={closeModal}>
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                icon="check"
                disabled={
                  draftVersions.length === 0 ||
                  publishTargetId === "" ||
                  publishReason.trim() === "" ||
                  publishingVersionId === publishTargetId
                }
                onClick={() =>
                  void handlePublish(publishTargetId, publishReason.trim())
                }
              >
                {publishingVersionId === publishTargetId
                  ? copy.publishing
                  : copy.confirmPublish}
              </CanvasBtn>
            </>
          }
        >
          {draftVersions.length === 0 ? (
            <div style={emptyStateStyle}>{copy.publishNoDrafts}</div>
          ) : (
            <>
              <label>
                <span style={fieldLabelStyle}>{copy.publishPick}</span>
                <select
                  style={fieldInputStyle}
                  value={publishTargetId}
                  onChange={(event) => setPublishTargetId(event.target.value)}
                >
                  <option value="">—</option>
                  {draftVersions.map((version) => (
                    <option key={version.versionId} value={version.versionId}>
                      {version.title} ({version.versionId})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block", marginTop: 12 }}>
                <span style={fieldLabelStyle}>{copy.publishReasonLabel}</span>
                <textarea
                  style={{ ...fieldInputStyle, minHeight: 72, resize: "vertical" }}
                  value={publishReason}
                  placeholder={copy.publishReasonPh}
                  onChange={(event) => setPublishReason(event.target.value)}
                />
              </label>
              {publishTargetId !== "" ? (
                <div style={{ marginTop: 12 }}>
                  <CanvasBtn
                    theme={th}
                    variant="secondary"
                    size="xs"
                    icon="x"
                    danger
                    disabled={deletingVersionId === publishTargetId}
                    onClick={() => void handleDeleteDraft(publishTargetId)}
                  >
                    {deletingVersionId === publishTargetId
                      ? copy.deleting
                      : copy.deleteDraft}
                  </CanvasBtn>
                </div>
              ) : null}
            </>
          )}
        </ModalShell>
      ) : null}

      {modal === "placard" ? (
        <ModalShell
          title={copy.generateTitle}
          subtitle={copy.generateSubtitle}
          onClose={closeModal}
          footer={
            <>
              <CanvasBtn theme={th} variant="secondary" size="sm" onClick={closeModal}>
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                icon="plus"
                disabled={
                  creatingPlacard ||
                  placardForm.publicInfoVersionId.trim() === "" ||
                  placardSourceBlocked ||
                  versionCodePrecheckMessage !== null
                }
                onClick={() =>
                  void handleGeneratePlacard({
                    preventDefault: () => undefined,
                  } as React.FormEvent)
                }
              >
                {creatingPlacard ? copy.generating : copy.confirmGenerate}
              </CanvasBtn>
            </>
          }
        >
          <div style={formGridStyle}>
            <label>
              <span style={fieldLabelStyle}>{copy.fSource}</span>
              <select
                style={fieldInputStyle}
                value={placardForm.publicInfoVersionId}
                onChange={(event) =>
                  setPlacardForm((current) => ({
                    ...current,
                    publicInfoVersionId: event.target.value,
                  }))
                }
              >
                <option value="">—</option>
                {publicInfo.map((version) => (
                  <option
                    key={version.versionId}
                    value={version.versionId}
                    disabled={isPlacardSourceSelectionBlocked(version)}
                  >
                    {formatPlacardSourceOptionLabel(version, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fVersionCode}</span>
              <input
                style={fieldInputStyle}
                value={placardForm.versionCode}
                placeholder="placard-2026-q3"
                onChange={(event) =>
                  setPlacardForm((current) => ({
                    ...current,
                    versionCode: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fTemplate}</span>
              <input
                style={fieldInputStyle}
                value={placardForm.templateName}
                placeholder="seatback-default"
                onChange={(event) =>
                  setPlacardForm((current) => ({
                    ...current,
                    templateName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>{copy.fArtifact}</span>
              <input
                style={fieldInputStyle}
                value={placardForm.artifactFileId}
                onChange={(event) =>
                  setPlacardForm((current) => ({
                    ...current,
                    artifactFileId: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <p style={{ ...subcopyStyle, marginTop: 12, marginBottom: 0 }}>
            {getPlacardSourceSelectionHint(selectedPlacardSource, locale)}
          </p>
          {placardSourceBlocked ? (
            <p style={{ marginTop: 8, marginBottom: 0, color: th.warn, fontSize: 11.5 }}>
              {getPlacardRetiredSourceAuditNote(locale)}
            </p>
          ) : null}
          {versionCodePrecheckMessage ? (
            <p style={{ marginTop: 8, marginBottom: 0, color: th.danger, fontSize: 11.5 }}>
              {versionCodePrecheckMessage}
            </p>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
