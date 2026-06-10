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
import { usePlatformAdminAssistantPage } from "@/components/assistant/route-context";
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
  type CanvasBtnProps,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
  ResourceActionDescriptor,
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

// ── availableActions-driven CTA descriptors (packets §3.5) ──────────────────
// PublicInfoVersionRecord / PlacardVersionRecord do not yet carry a backend
// `availableActions[]`, so this route synthesises ResourceActionDescriptor[]
// from record state. Every CTA renders from a descriptor (never hard-coded) so
// disabledReasonCode / riskLevel / requiresReason stay contract-shaped per the
// parity audit (§6 "canvas-critical action patterns").
const ACTION_CREATE_PUBLIC_INFO = "create_public_info_draft";
const ACTION_PUBLISH_PUBLIC_INFO = "publish_public_info_version";
const ACTION_GENERATE_PLACARD = "generate_placard_version";
const ACTION_PUBLISH_PLACARD = "publish_placard_version";

function buildDescriptor(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  opts?: { disabledReasonCode?: string | undefined; requiresReason?: boolean },
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...(!enabled && opts?.disabledReasonCode
      ? { disabledReasonCode: opts.disabledReasonCode }
      : {}),
    ...(opts?.requiresReason ? { requiresReason: true } : {}),
  };
}

function findAction(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | undefined {
  return actions.find((descriptor) => descriptor.action === action);
}

// A published placard is immutable; an unpublished one can still be published.
function buildPlacardActions(
  placard: PlacardVersionRecord,
): ResourceActionDescriptor[] {
  return [
    buildDescriptor(
      ACTION_PUBLISH_PLACARD,
      placard.publishedAt == null,
      "medium",
      { disabledReasonCode: "already_published" },
    ),
  ];
}

// Renders one CTA from its descriptor. A disabled descriptor surfaces its
// disabledReasonCode copy beneath the affordance instead of a dead button.
function DescriptorButton({
  descriptor,
  label,
  busy = false,
  busyLabel,
  icon,
  variant = "primary",
  size = "sm",
  danger,
  reasonText,
  onClick,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  busy?: boolean;
  busyLabel?: string;
  icon?: CanvasBtnProps["icon"];
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  danger?: boolean;
  reasonText?: string | undefined;
  onClick: () => void;
}) {
  const disabled = !descriptor.enabled || busy;
  const isDanger = danger ?? descriptor.riskLevel === "high";
  const reason = !descriptor.enabled ? reasonText : undefined;
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <CanvasBtn
        theme={th}
        variant={variant}
        size={size}
        danger={isDanger}
        disabled={disabled}
        onClick={onClick}
        {...(icon ? { icon } : {})}
      >
        {busy && busyLabel ? busyLabel : label}
      </CanvasBtn>
      {reason ? (
        <span style={{ color: th.textMuted, fontSize: 11 }}>{reason}</span>
      ) : null}
    </div>
  );
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
          <CanvasBtn
            theme={th}
            variant="ghost"
            size="xs"
            icon="x"
            onClick={onClose}
          >
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
          disabledReason: {
            no_draft_versions: "No draft versions to publish.",
            no_draft_selected: "Select a draft version to publish.",
            reason_required: "A reason is required to publish.",
            title_required: "A title is required.",
            no_source_version: "Select a source public info version.",
            source_retired: "The selected source version is retired.",
            version_code_conflict: "This version code is already in use.",
            already_published: "Already published (immutable).",
            no_public_info_version:
              "Create a public info version before generating placards.",
          } as Record<string, string>,
        }
      : {
          title: "公開資訊與牌貼",
          subtitle:
            "路由名稱保留為 /switchboard · 一個公開資訊版本可產生多張車內牌貼（Q-ADM14）",
          createDraft: "建立草稿",
          publishVersion: "發佈版本",
          refresh: "重新整理",
          tabVersions: "版本",
          tabPlacards: "牌貼",
          tabHistory: "歷史",
          versionsTitle: "公開資訊版本",
          versionsSubtitle: "生效起迄 · 公開電話 · 狀態",
          placardPreviewTitle: (code: string, src: string) =>
            `目前發行牌貼 · ${code}（來源 ${src}）`,
          placardPreviewEmpty: "目前尚未產生牌貼。",
          downloadPdf: "下載牌貼檔",
          generatePlacard: "產生新牌貼",
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
          colFrom: "生效起",
          colTo: "生效迄",
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
          fArtifact: "成品檔識別碼（選填）",
          receiptPublishVersion: (id: string, reason: string) =>
            `稽核憑據：已發佈公開資訊 ${id}。原因：${reason}`,
          receiptCreate: "稽核憑據：已建立公開資訊草稿。",
          receiptGenerate: (code: string) => `稽核憑據：已產生牌貼 ${code}。`,
          receiptPublishPlacard: (code: string) =>
            `稽核憑據：已發佈牌貼 ${code}。`,
          disabledReason: {
            no_draft_versions: "目前沒有可發佈的草稿版本。",
            no_draft_selected: "請選擇要發佈的草稿版本。",
            reason_required: "發佈需填寫原因。",
            title_required: "需填寫標題。",
            no_source_version: "請選擇來源公開資訊版本。",
            source_retired: "所選來源版本已停用。",
            version_code_conflict: "此版本代碼已被使用。",
            already_published: "已發佈（不可變）。",
            no_public_info_version: "請先建立公開資訊版本再產生牌貼。",
          } as Record<string, string>,
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

  const assistantBridge = useMemo(
    () => ({
      pageId: "switchboard",
      filters: {
        workspace_tab: {
          apply(value: unknown) {
            if (
              value !== "versions" &&
              value !== "placards" &&
              value !== "history"
            ) {
              return {
                ok: false,
                code: "invalid_filter_value",
                message:
                  "Switchboard tab filter accepts only versions, placards, or history.",
              } as const;
            }
            setActiveTab(value);
            return {
              ok: true,
              code: "filter_applied",
              message: `Applied switchboard tab ${value}.`,
              payload: { filterId: "workspace_tab", value },
            } as const;
          },
        },
      },
      drafts: {
        public_info_version: {
          fill(values: Record<string, unknown>) {
            setModal("create");
            setPublicInfoForm((current) => ({
              ...current,
              title:
                typeof values.title === "string" ? values.title : current.title,
              callPhone:
                typeof values.callPhone === "string"
                  ? values.callPhone
                  : (current.callPhone ?? null),
              complaintPhone:
                typeof values.complaintPhone === "string"
                  ? values.complaintPhone
                  : (current.complaintPhone ?? null),
              callRateText:
                typeof values.callRateText === "string"
                  ? values.callRateText
                  : (current.callRateText ?? null),
              fareText:
                typeof values.fareText === "string"
                  ? values.fareText
                  : (current.fareText ?? null),
              paymentMethodText:
                typeof values.paymentMethodText === "string"
                  ? values.paymentMethodText
                  : (current.paymentMethodText ?? null),
              effectiveFrom:
                typeof values.effectiveFrom === "string"
                  ? values.effectiveFrom
                  : (current.effectiveFrom ?? null),
              effectiveTo:
                typeof values.effectiveTo === "string"
                  ? values.effectiveTo
                  : (current.effectiveTo ?? null),
            }));
            return {
              ok: true,
              code: "draft_filled",
              message: "Filled public info draft without submitting.",
            } as const;
          },
        },
        placard_version: {
          fill(values: Record<string, unknown>) {
            setModal("placard");
            setPlacardForm((current) => ({
              ...current,
              versionCode:
                typeof values.versionCode === "string"
                  ? values.versionCode
                  : current.versionCode,
              publicInfoVersionId:
                typeof values.publicInfoVersionId === "string"
                  ? values.publicInfoVersionId
                  : current.publicInfoVersionId,
              templateName:
                typeof values.templateName === "string"
                  ? values.templateName
                  : current.templateName,
              artifactFileId:
                typeof values.artifactFileId === "string"
                  ? values.artifactFileId
                  : current.artifactFileId,
            }));
            return {
              ok: true,
              code: "draft_filled",
              message: "Filled placard draft without submitting.",
            } as const;
          },
        },
      },
    }),
    [],
  );

  usePlatformAdminAssistantPage(assistantBridge);

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

  const reasonText = (code: string | null | undefined): string | undefined =>
    code ? (copy.disabledReason[code] ?? code) : undefined;

  const createHeaderDescriptor = buildDescriptor(
    ACTION_CREATE_PUBLIC_INFO,
    true,
    "medium",
  );
  const publishHeaderDescriptor = buildDescriptor(
    ACTION_PUBLISH_PUBLIC_INFO,
    draftVersions.length > 0,
    "high",
    { disabledReasonCode: "no_draft_versions", requiresReason: true },
  );
  const generateOpenDescriptor = buildDescriptor(
    ACTION_GENERATE_PLACARD,
    publicInfo.length > 0,
    "medium",
    { disabledReasonCode: "no_public_info_version" },
  );

  const createConfirmReasonCode =
    publicInfoForm.title.trim() === "" ? "title_required" : undefined;
  const createConfirmDescriptor = buildDescriptor(
    ACTION_CREATE_PUBLIC_INFO,
    createConfirmReasonCode === undefined,
    "medium",
    { disabledReasonCode: createConfirmReasonCode },
  );

  const publishConfirmReasonCode =
    draftVersions.length === 0
      ? "no_draft_versions"
      : publishTargetId === ""
        ? "no_draft_selected"
        : publishReason.trim() === ""
          ? "reason_required"
          : undefined;
  const publishConfirmDescriptor = buildDescriptor(
    ACTION_PUBLISH_PUBLIC_INFO,
    publishConfirmReasonCode === undefined,
    "high",
    { disabledReasonCode: publishConfirmReasonCode, requiresReason: true },
  );

  const generateConfirmReasonCode =
    placardForm.publicInfoVersionId.trim() === ""
      ? "no_source_version"
      : placardSourceBlocked
        ? "source_retired"
        : versionCodePrecheckMessage !== null
          ? "version_code_conflict"
          : undefined;
  const generateConfirmDescriptor = buildDescriptor(
    ACTION_GENERATE_PLACARD,
    generateConfirmReasonCode === undefined,
    "medium",
    { disabledReasonCode: generateConfirmReasonCode },
  );

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
      r: (row) => {
        const publishAction = findAction(
          buildPlacardActions(row),
          ACTION_PUBLISH_PLACARD,
        );
        if (!publishAction) {
          return null;
        }
        return publishAction.enabled ? (
          <DescriptorButton
            descriptor={publishAction}
            label={copy.publish}
            busyLabel={copy.publishing}
            busy={publishingPlacardId === row.placardVersionId}
            icon="check"
            variant="primary"
            size="xs"
            onClick={() => void handlePublishPlacard(row)}
          />
        ) : (
          <span style={subcopyStyle}>
            {reasonText(publishAction.disabledReasonCode) ?? copy.immutable}
          </span>
        );
      },
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
    {
      h: copy.colFrom,
      w: 130,
      mono: true,
      r: (row) => row.effectiveFrom ?? "—",
    },
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
            <DescriptorButton
              descriptor={createHeaderDescriptor}
              label={copy.createDraft}
              icon="plus"
              variant="secondary"
              danger={false}
              onClick={() => {
                setPublicInfoForm(EMPTY_PUBLIC_INFO_FORM);
                setModal("create");
              }}
            />
            <DescriptorButton
              descriptor={publishHeaderDescriptor}
              label={copy.publishVersion}
              icon="check"
              variant="primary"
              danger={false}
              reasonText={reasonText(
                publishHeaderDescriptor.disabledReasonCode,
              )}
              onClick={() => {
                setPublishTargetId(draftVersions[0]?.versionId ?? "");
                setPublishReason("");
                setModal("publish");
              }}
            />
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
                      <CanvasBtn
                        theme={th}
                        variant="secondary"
                        size="sm"
                        disabled
                      >
                        {copy.downloadPdf}
                      </CanvasBtn>
                    )}
                    <DescriptorButton
                      descriptor={generateOpenDescriptor}
                      label={copy.generatePlacard}
                      icon="plus"
                      variant="primary"
                      danger={false}
                      reasonText={reasonText(
                        generateOpenDescriptor.disabledReasonCode,
                      )}
                      onClick={() => setModal("placard")}
                    />
                  </div>
                </>
              ) : (
                <div style={emptyStateStyle}>
                  <div style={{ marginBottom: 12 }}>
                    {copy.placardPreviewEmpty}
                  </div>
                  <DescriptorButton
                    descriptor={generateOpenDescriptor}
                    label={copy.generatePlacard}
                    icon="plus"
                    variant="primary"
                    danger={false}
                    reasonText={reasonText(
                      generateOpenDescriptor.disabledReasonCode,
                    )}
                    onClick={() => setModal("placard")}
                  />
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
              <DescriptorButton
                descriptor={generateOpenDescriptor}
                label={copy.generatePlacard}
                icon="plus"
                variant="primary"
                danger={false}
                reasonText={reasonText(
                  generateOpenDescriptor.disabledReasonCode,
                )}
                onClick={() => setModal("placard")}
              />
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
              <CanvasBtn
                theme={th}
                variant="secondary"
                size="sm"
                onClick={closeModal}
              >
                {copy.cancel}
              </CanvasBtn>
              <DescriptorButton
                descriptor={createConfirmDescriptor}
                label={copy.createDraft}
                busyLabel={copy.generating}
                busy={creatingPublicInfo}
                icon="plus"
                variant="primary"
                danger={false}
                reasonText={reasonText(
                  createConfirmDescriptor.disabledReasonCode,
                )}
                onClick={() =>
                  void handleCreatePublicInfo({
                    preventDefault: () => undefined,
                  } as React.FormEvent)
                }
              />
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
              <CanvasBtn
                theme={th}
                variant="secondary"
                size="sm"
                onClick={closeModal}
              >
                {copy.cancel}
              </CanvasBtn>
              <DescriptorButton
                descriptor={publishConfirmDescriptor}
                label={copy.confirmPublish}
                busyLabel={copy.publishing}
                busy={
                  publishTargetId !== "" &&
                  publishingVersionId === publishTargetId
                }
                icon="check"
                variant="primary"
                reasonText={reasonText(
                  publishConfirmDescriptor.disabledReasonCode,
                )}
                onClick={() =>
                  void handlePublish(publishTargetId, publishReason.trim())
                }
              />
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
                  style={{
                    ...fieldInputStyle,
                    minHeight: 72,
                    resize: "vertical",
                  }}
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
              <CanvasBtn
                theme={th}
                variant="secondary"
                size="sm"
                onClick={closeModal}
              >
                {copy.cancel}
              </CanvasBtn>
              <DescriptorButton
                descriptor={generateConfirmDescriptor}
                label={copy.confirmGenerate}
                busyLabel={copy.generating}
                busy={creatingPlacard}
                icon="plus"
                variant="primary"
                danger={false}
                reasonText={reasonText(
                  generateConfirmDescriptor.disabledReasonCode,
                )}
                onClick={() =>
                  void handleGeneratePlacard({
                    preventDefault: () => undefined,
                  } as React.FormEvent)
                }
              />
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
            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                color: th.warn,
                fontSize: 11.5,
              }}
            >
              {getPlacardRetiredSourceAuditNote(locale)}
            </p>
          ) : null}
          {versionCodePrecheckMessage ? (
            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                color: th.danger,
                fontSize: 11.5,
              }}
            >
              {versionCodePrecheckMessage}
            </p>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
