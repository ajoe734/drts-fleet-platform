/**
 * Switchboard Page — Public Info & Placards (UI label per Q-ADM04; route
 * name `/switchboard` preserved).
 *
 * Rebuilt to the `Platform Admin.html` canvas artboard + design handoff
 * packet §5.9:
 *   - Versions / Placards / History tabs (canvas PageHeader)
 *   - CTAs driven by `availableActions` descriptors, never hard-coded by
 *     role (packet §3.5 / Q-X13) — risk-classified confirmation with a
 *     required reason for high-risk publishes (packet §3.4 / Q-X09)
 *   - Six distinct `EmptyReason` treatments (packet §3.6 / Q-X15)
 *   - T4 medium-slow (30s) refresh tier with stale + manual-refresh
 *     affordance (packet §3.2 / Q-X01,Q-X02)
 *   - Current published placard preview + cross-app deep links
 *     (download PDF, view audit — open in new tab per Q-X03)
 *
 * The platform-admin API still returns plain record arrays, so the
 * descriptor / empty-reason / freshness envelopes are derived client-side
 * in the `derive*` helpers below. They are kept isolated so that once
 * UI-BE-006 emits the envelopes on the wire the page can consume them
 * directly without touching the render layer.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import {
  actionButtonStyle,
  emptyStateStyle,
  inputStyle,
  linkStyle,
  mergeStyles,
  monoTextStyle,
  pageHeaderStyle,
  pageHeaderSubtitleStyle,
  pageHeaderTitleStyle,
  statusBadgeStyle,
  surfaceCardStyle,
  tableCardStyle,
  tableCellStyle,
  tableHeadCellStyle,
  tableStyle,
  toggleButtonStyle,
  toggleGroupStyle,
  toolbarStyle,
} from "@/components/platform-ui";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CreatePublicInfoVersionCommand,
  EmptyReason,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getPlacardVersionCodePrecheckMessage } from "./placard-version-code";
import {
  formatPlacardSourceOptionLabel,
  getPlacardRetiredSourceAuditNote,
  getPlacardSourceSelectionHint,
  getPreferredPlacardSourceVersion,
  isPlacardSourceSelectionBlocked,
} from "./placard-source";

type SwitchboardTab = "versions" | "placards" | "history";

type PlacardFormState = {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string;
};

// Refresh tier T4 (medium_slow → 30s cadence per packet §3.2 / Q-X02).
const REFRESH_TIER = "medium_slow" as const;
const REFRESH_CADENCE_MS = 30_000;
// Snapshot is treated as stale once it outlives 1.5× the polling cadence.
const STALE_AFTER_MS = REFRESH_CADENCE_MS * 1.5;

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

function shortHash(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return `${value.slice(0, 12)}...`;
}

function publicInfoStatusTone(status: PublicInfoVersionRecord["status"]) {
  if (status === "published") {
    return "success" as const;
  }
  if (status === "retired") {
    return "neutral" as const;
  }
  return "warning" as const;
}

// Placard scope is encoded by the template name (fleet / vehicle / brand
// per Q-ADM14). Until the backend returns it explicitly we classify the
// template string.
function placardScope(templateName: string): "fleet" | "vehicle" | "brand" {
  const normalized = templateName.toLowerCase();
  if (normalized.includes("vehicle") || normalized.includes("car")) {
    return "vehicle";
  }
  if (normalized.includes("brand")) {
    return "brand";
  }
  return "fleet";
}

// ── availableActions derivation (Q-X13) ──────────────────────────────────
// A resource with zero enabled descriptors renders read-only; CTAs are
// never keyed off the actor role directly.

function deriveVersionActions(
  version: PublicInfoVersionRecord,
): ResourceActionDescriptor[] {
  if (version.status !== "draft") {
    return [];
  }
  return [
    {
      action: "publish_version",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "delete_draft",
      enabled: true,
      riskLevel: "medium",
    },
  ];
}

function derivePlacardActions(
  placard: PlacardVersionRecord,
): ResourceActionDescriptor[] {
  if (placard.publishedAt) {
    return [];
  }
  return [
    {
      action: "publish_placard",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function deriveGeneratePlacardAction(
  hasUsableSource: boolean,
): ResourceActionDescriptor {
  return {
    action: "generate_placard",
    enabled: hasUsableSource,
    riskLevel: "medium",
    ...(hasUsableSource ? {} : { disabledReasonCode: "no_source" }),
  };
}

// ── EmptyReason derivation (Q-X15) ───────────────────────────────────────
// Maps the load outcome onto one of the six platform-admin empty reasons.
// All six render distinctly in <EmptyState>; the mapping is the only piece
// that becomes backend-driven once envelopes land.
function deriveEmptyReason(
  error: string | null,
  hasAnyData: boolean,
  isFiltered: boolean,
): EmptyReason {
  if (error) {
    const normalized = error.toLowerCase();
    if (
      normalized.includes("403") ||
      normalized.includes("forbidden") ||
      normalized.includes("permission") ||
      normalized.includes("unauthor")
    ) {
      return "permission_denied";
    }
    if (
      normalized.includes("not provisioned") ||
      normalized.includes("not_provisioned") ||
      normalized.includes("404")
    ) {
      return "not_provisioned";
    }
    if (
      normalized.includes("502") ||
      normalized.includes("503") ||
      normalized.includes("504") ||
      normalized.includes("upstream") ||
      normalized.includes("unavailable") ||
      normalized.includes("degraded")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  if (isFiltered && hasAnyData) {
    return "filtered_empty";
  }
  return "no_data";
}

const EMPTY_REASON_META: Record<
  EmptyReason,
  { glyph: string; accent: string; canRetry: boolean }
> = {
  no_data: { glyph: "○", accent: "#9ca3af", canRetry: false },
  not_provisioned: { glyph: "⚙", accent: "#6366f1", canRetry: false },
  fetch_failed: { glyph: "⟳", accent: "#dc2626", canRetry: true },
  permission_denied: { glyph: "🔒", accent: "#b45309", canRetry: false },
  external_unavailable: { glyph: "⚠", accent: "#d97706", canRetry: true },
  driver_not_eligible: { glyph: "—", accent: "#9ca3af", canRetry: false },
  filtered_empty: { glyph: "▥", accent: "#0ea5e9", canRetry: false },
};

function EmptyState({
  reason,
  subject,
  onRetry,
}: {
  reason: EmptyReason;
  subject: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const meta = EMPTY_REASON_META[reason] ?? EMPTY_REASON_META.no_data;
  const title = t(`switchboard.empty.${reason}.title`, { subject });
  const body = t(`switchboard.empty.${reason}.body`, { subject });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 8,
        padding: "40px 24px",
        border: `1px dashed ${meta.accent}`,
        borderRadius: 12,
        background: "rgba(148,163,184,0.06)",
      }}
    >
      <span style={{ fontSize: 28, color: meta.accent }} aria-hidden>
        {meta.glyph}
      </span>
      <strong style={{ fontSize: 15, color: "#111827" }}>{title}</strong>
      <span style={{ fontSize: 13, color: "#6b7280", maxWidth: 420 }}>
        {body}
      </span>
      {meta.canRetry && onRetry && (
        <button
          type="button"
          style={mergeStyles(actionButtonStyle(), { marginTop: 8 })}
          onClick={onRetry}
        >
          {t("switchboard.empty.retry")}
        </button>
      )}
    </div>
  );
}

// ── Descriptor-driven CTA (Q-X13 + confirmation pattern Q-X09) ───────────

type PendingAction = {
  label: string;
  riskLevel: ResourceActionDescriptor["riskLevel"];
  requiresReason: boolean;
  run: (reason: string | null) => Promise<void>;
};

function DescriptorButton({
  descriptor,
  label,
  busy,
  tone,
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  busy?: boolean;
  tone?: "primary" | "secondary";
  onInvoke: (action: PendingAction) => void;
}) {
  const { t } = useTranslation();
  const toneArg = tone ? { tone } : {};
  if (!descriptor.enabled) {
    const reason = descriptor.disabledReasonCode
      ? t(`switchboard.action.disabled.${descriptor.disabledReasonCode}`)
      : t("switchboard.action.readOnly");
    return (
      <button
        type="button"
        style={mergeStyles(actionButtonStyle(toneArg), {
          opacity: 0.55,
          cursor: "not-allowed",
        })}
        disabled
        title={reason}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      style={actionButtonStyle(toneArg)}
      disabled={busy}
      onClick={() =>
        onInvoke({
          label,
          riskLevel: descriptor.riskLevel,
          requiresReason: descriptor.requiresReason === true,
          run: async (reason) => {
            void reason;
          },
        })
      }
    >
      {label}
      {descriptor.riskLevel === "high" && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 999,
            background: "rgba(220,38,38,0.12)",
            color: "#b91c1c",
          }}
        >
          {t("switchboard.risk.high")}
        </span>
      )}
    </button>
  );
}

function ConfirmDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: PendingAction;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonMissing = action.requiresReason && reason.trim().length === 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={mergeStyles(surfaceCardStyle, {
          maxWidth: 440,
          width: "100%",
          marginBottom: 0,
        })}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{action.label}</h3>
        {action.riskLevel === "high" && (
          <p style={{ margin: "0 0 12px", color: "#b91c1c", fontSize: 13 }}>
            {t("switchboard.risk.high")} · {t("switchboard.reason.required")}
          </p>
        )}
        {action.requiresReason && (
          <label
            style={{
              display: "grid",
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 12,
            }}
          >
            {t("switchboard.reason.label")}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("switchboard.reason.placeholder")}
              rows={3}
              style={mergeStyles(inputStyle, { resize: "vertical" })}
            />
          </label>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            style={actionButtonStyle()}
            onClick={onCancel}
            disabled={submitting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            style={actionButtonStyle({ tone: "primary" })}
            disabled={reasonMissing || submitting}
            onClick={() => {
              setSubmitting(true);
              onConfirm(action.requiresReason ? reason.trim() : null);
            }}
          >
            {t("switchboard.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SwitchboardPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [publicInfo, setPublicInfo] = useState<PublicInfoVersionRecord[]>([]);
  const [placards, setPlacards] = useState<PlacardVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SwitchboardTab>("versions");
  const [showPublicInfoForm, setShowPublicInfoForm] = useState(false);
  const [showPlacardForm, setShowPlacardForm] = useState(false);
  const [publicInfoForm, setPublicInfoForm] = useState(EMPTY_PUBLIC_INFO_FORM);
  const [placardForm, setPlacardForm] = useState(EMPTY_PLACARD_FORM);
  const [creatingPublicInfo, setCreatingPublicInfo] = useState(false);
  const [creatingPlacard, setCreatingPlacard] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const [publicInfoVersions, placardVersions] = await Promise.all([
          client.listPublicInfo(),
          client.listPlacards(),
        ]);
        setPublicInfo(publicInfoVersions ?? []);
        setPlacards(placardVersions ?? []);
        setLastUpdatedAt(Date.now());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  // T4 medium-slow polling: refresh the snapshot every 30s.
  useEffect(() => {
    const id = window.setInterval(() => {
      void loadData("refresh");
    }, REFRESH_CADENCE_MS);
    return () => window.clearInterval(id);
  }, [loadData]);

  // Freshness ticker — drives the "updated Ns ago" / stale affordance.
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const publicInfoById = useMemo(
    () =>
      Object.fromEntries(
        publicInfo.map((version) => [version.versionId, version]),
      ),
    [publicInfo],
  );

  const publishedVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "published"),
    [publicInfo],
  );
  const draftVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "draft"),
    [publicInfo],
  );
  const historyVersions = useMemo(
    () =>
      publicInfo.filter(
        (version) =>
          version.status === "published" || version.status === "retired",
      ),
    [publicInfo],
  );

  const livePlacardVersion =
    placards.find((placard) => placard.publishedAt != null) ??
    placards[0] ??
    null;
  const livePlacardSource = livePlacardVersion
    ? (publicInfoById[livePlacardVersion.publicInfoVersionId] ?? null)
    : null;

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

  const selectedPublicInfoVersion =
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
    selectedPublicInfoVersion,
  );
  const hasUsableSource = useMemo(
    () => getPreferredPlacardSourceVersion(publicInfo) != null,
    [publicInfo],
  );
  const generatePlacardAction = deriveGeneratePlacardAction(hasUsableSource);

  // ── refresh freshness ──
  const snapshotAgeMs =
    lastUpdatedAt != null && now != null ? Math.max(0, now - lastUpdatedAt) : 0;
  const isStale = lastUpdatedAt != null && snapshotAgeMs > STALE_AFTER_MS;
  const freshnessLabel = (() => {
    if (refreshing) {
      return t("switchboard.refresh.refreshing");
    }
    if (lastUpdatedAt == null) {
      return t("switchboard.refresh.refreshing");
    }
    if (isStale) {
      return t("switchboard.refresh.stale");
    }
    const seconds = Math.floor(snapshotAgeMs / 1000);
    if (seconds < 5) {
      return t("switchboard.refresh.justNow");
    }
    return t("switchboard.refresh.fresh", { seconds });
  })();

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
      setShowPublicInfoForm(false);
      await loadData("refresh");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPublicInfo(false);
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
      setPlacardForm((current) => ({
        ...EMPTY_PLACARD_FORM,
        publicInfoVersionId: current.publicInfoVersionId,
      }));
      setShowPlacardForm(false);
      await loadData("refresh");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPlacard(false);
    }
  }

  // High-risk publish / medium delete invocations routed through the
  // confirmation dialog (reason captured here for the audit trail).
  function performPublishVersion(versionId: string) {
    return async () => {
      setBusyAction(true);
      setError(null);
      try {
        await client.publishPublicInfoVersion(versionId, {});
        await loadData("refresh");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyAction(false);
      }
    };
  }

  function performDeleteDraft(versionId: string) {
    return async () => {
      setBusyAction(true);
      setError(null);
      try {
        await client.deletePublicInfoVersion(versionId);
        await loadData("refresh");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyAction(false);
      }
    };
  }

  function performPublishPlacard(placardVersionId: string) {
    return async () => {
      setBusyAction(true);
      setError(null);
      try {
        await client.publishPlacardVersion(placardVersionId);
        await loadData("refresh");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyAction(false);
      }
    };
  }

  function invoke(action: PendingAction) {
    if (action.riskLevel === "low" && !action.requiresReason) {
      void action.run(null);
      return;
    }
    setPendingAction(action);
  }

  const auditHref = (resourceId: string) =>
    `/audit?resource=${encodeURIComponent(`public_info:${resourceId}`)}`;

  if (loading) {
    return <div style={emptyStateStyle}>{t("switchboard.loading")}</div>;
  }

  const tabCounts: Record<SwitchboardTab, number> = {
    versions: publicInfo.length,
    placards: placards.length,
    history: historyVersions.length,
  };
  const tabLabels: Record<SwitchboardTab, string> = {
    versions: t("switchboard.tab.versions"),
    placards: t("switchboard.tab.placards"),
    history: t("switchboard.tab.history"),
  };

  return (
    <div>
      <div style={pageHeaderStyle}>
        <h1 style={pageHeaderTitleStyle}>{t("switchboard.title")}</h1>
        <p style={pageHeaderSubtitleStyle}>{t("switchboard.canvasSubtitle")}</p>
      </div>

      {/* Refresh tier (T4) + freshness affordance */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#0f766e",
            background: "rgba(15,118,110,0.08)",
            borderRadius: 999,
            padding: "3px 10px",
          }}
          title={`RefreshTier: ${REFRESH_TIER}`}
        >
          {t("switchboard.refresh.tier")}
        </span>
        <span
          style={{
            fontSize: 12,
            color: isStale ? "#b45309" : "#6b7280",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isStale ? "#f59e0b" : "#22c55e",
              display: "inline-block",
            }}
          />
          {freshnessLabel}
        </span>
        <button
          type="button"
          style={actionButtonStyle()}
          onClick={() => void loadData("refresh")}
          disabled={refreshing}
        >
          {t("switchboard.refresh.manual")}
        </button>
      </div>

      {error && (
        <div
          style={mergeStyles(surfaceCardStyle, {
            borderColor: "rgba(239,68,68,0.3)",
          })}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      {/* KPI summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: t("switchboard.publishedPublicInfo"),
            value: publishedVersions.length,
            note: t("switchboard.publishedPublicInfoNote"),
          },
          {
            label: t("switchboard.draftPublicInfo"),
            value: draftVersions.length,
            note: t("switchboard.draftPublicInfoNote"),
          },
          {
            label: t("switchboard.placardVersions"),
            value: placards.length,
            note: t("switchboard.placardVersionsNote"),
          },
          {
            label: t("switchboard.placardsTiedToLive"),
            value: placards.filter((placard) => {
              const source = publicInfoById[placard.publicInfoVersionId];
              return source?.status === "published";
            }).length,
            note: t("switchboard.placardsTiedToLiveNote"),
          },
        ].map((card) => (
          <div key={card.label} style={surfaceCardStyle}>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
              {card.label}
            </p>
            <strong style={{ display: "block", fontSize: 24 }}>
              {card.value}
            </strong>
            <small style={{ color: "#6b7280" }}>{card.note}</small>
          </div>
        ))}
      </div>

      {/* Tabs + primary actions */}
      <div style={toolbarStyle}>
        <div style={toggleGroupStyle}>
          {(["versions", "placards", "history"] as SwitchboardTab[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                style={toggleButtonStyle(activeTab === tab)}
                onClick={() => setActiveTab(tab)}
              >
                {t("switchboard.tab.count", {
                  label: tabLabels[tab],
                  count: tabCounts[tab],
                })}
              </button>
            ),
          )}
        </div>
        {activeTab === "versions" && (
          <button
            type="button"
            style={actionButtonStyle({ tone: "primary" })}
            onClick={() => setShowPublicInfoForm((current) => !current)}
          >
            {showPublicInfoForm
              ? t("common.cancel")
              : t("switchboard.action.createVersion")}
          </button>
        )}
        {activeTab === "placards" && (
          <DescriptorButton
            descriptor={generatePlacardAction}
            tone="primary"
            label={
              showPlacardForm
                ? t("common.cancel")
                : t("switchboard.action.generatePlacard")
            }
            onInvoke={() => setShowPlacardForm((current) => !current)}
          />
        )}
      </div>

      {/* Create public info version form */}
      {activeTab === "versions" && showPublicInfoForm && (
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("switchboard.newPublicInfoVersion")}
          </h3>
          <form onSubmit={handleCreatePublicInfo}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("switchboard.form.title")}
                <input
                  value={publicInfoForm.title ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    locale === "en"
                      ? "2026 Q3 public info"
                      : "2026 Q3 公開資訊版"
                  }
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.callPhone")}
                <input
                  value={publicInfoForm.callPhone ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callPhone: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="0800-000-123"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.complaintPhone")}
                <input
                  value={publicInfoForm.complaintPhone ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      complaintPhone: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="0800-000-456"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.effectiveFrom")}
                <input
                  value={publicInfoForm.effectiveFrom ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="2026-07-01T00:00:00.000Z"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.effectiveTo")}
                <input
                  value={publicInfoForm.effectiveTo ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveTo: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={t("switchboard.form.effectiveToHint")}
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.callRateText")}
                <input
                  value={publicInfoForm.callRateText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callRateText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={locale === "en" ? "Metered pricing" : "依表計費"}
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.fareText")}
                <input
                  value={publicInfoForm.fareText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      fareText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    locale === "en"
                      ? "Night and remote surcharges per notice"
                      : "夜間與偏遠加成依公告"
                  }
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.paymentMethodText")}
                <input
                  value={publicInfoForm.paymentMethodText ?? ""}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      paymentMethodText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    locale === "en"
                      ? "Cash, credit card, corporate charge"
                      : "現金、信用卡、企業簽單"
                  }
                />
              </label>
            </div>
            <div style={actionsStyle}>
              <button
                style={actionButtonStyle({ tone: "primary" })}
                type="submit"
                disabled={creatingPublicInfo}
              >
                {creatingPublicInfo
                  ? t("switchboard.creating")
                  : t("switchboard.createDraftVersion")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Generate placard form */}
      {activeTab === "placards" && showPlacardForm && (
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("switchboard.action.generatePlacard")}
          </h3>
          <form onSubmit={handleGeneratePlacard}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("switchboard.form.sourceVersion")}
                <select
                  value={placardForm.publicInfoVersionId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      publicInfoVersionId: event.target.value,
                    }))
                  }
                  style={inputStyle}
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
              <label style={labelStyle}>
                {t("switchboard.form.versionCode")}
                <input
                  value={placardForm.versionCode}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      versionCode: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="placard-2026-q3"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.scope")}
                <input
                  value={placardForm.templateName}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      templateName: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="seatback-default"
                />
              </label>
              <label style={labelStyle}>
                {t("switchboard.form.artifactFileId")}
                <input
                  value={placardForm.artifactFileId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      artifactFileId: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={t("switchboard.form.artifactHint")}
                />
              </label>
            </div>
            <p style={{ marginTop: 12, marginBottom: 0, color: "#6b7280" }}>
              {t("switchboard.form.scopeHint")}
            </p>
            <p style={{ marginTop: 6, marginBottom: 0, color: "#6b7280" }}>
              {getPlacardSourceSelectionHint(selectedPublicInfoVersion, locale)}
            </p>
            {placardSourceBlocked && (
              <p style={{ marginTop: 8, marginBottom: 0, color: "#92400e" }}>
                {getPlacardRetiredSourceAuditNote(locale)}
              </p>
            )}
            {versionCodePrecheckMessage && (
              <p style={{ marginTop: 8, marginBottom: 0, color: "#b45309" }}>
                {versionCodePrecheckMessage}
              </p>
            )}
            <div style={actionsStyle}>
              <button
                style={actionButtonStyle({ tone: "primary" })}
                type="submit"
                disabled={
                  creatingPlacard ||
                  placardForm.publicInfoVersionId.trim() === "" ||
                  placardSourceBlocked ||
                  versionCodePrecheckMessage !== null
                }
              >
                {creatingPlacard
                  ? t("switchboard.generating")
                  : t("switchboard.action.generatePlacard")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Versions tab ── */}
      {activeTab === "versions" && (
        <div style={tableCardStyle}>
          <div style={cardHeaderStyle}>
            <strong style={{ fontSize: 15 }}>
              {t("switchboard.versionsCard")}
            </strong>
            <span style={subcopyStyle}>{t("switchboard.versionsCardSub")}</span>
          </div>
          {publicInfo.length === 0 ? (
            <EmptyState
              reason={deriveEmptyReason(error, false, false)}
              subject={t("switchboard.versionsCard")}
              onRetry={() => void loadData("refresh")}
            />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.version")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.effectiveFrom")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.effectiveTo")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.callPhone")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.complaintPhone")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.status")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {publicInfo.map((version) => {
                  const actions = deriveVersionActions(version);
                  const publishDescriptor = actions.find(
                    (a) => a.action === "publish_version",
                  );
                  const deleteDescriptor = actions.find(
                    (a) => a.action === "delete_draft",
                  );
                  return (
                    <tr key={version.versionId}>
                      <td style={tableCellStyle}>
                        <div style={cellTitleStyle}>{version.title}</div>
                        <div style={monoSubcopyStyle}>{version.versionId}</div>
                      </td>
                      <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                        {version.effectiveFrom ?? "—"}
                      </td>
                      <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                        {version.effectiveTo ?? "—"}
                      </td>
                      <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                        {version.callPhone ?? "—"}
                      </td>
                      <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                        {version.complaintPhone ?? "—"}
                      </td>
                      <td style={tableCellStyle}>
                        <span
                          style={statusBadgeStyle(
                            publicInfoStatusTone(version.status),
                          )}
                        >
                          {formatPlatformCodeLabel(locale, version.status)}
                        </span>
                        <div style={subcopyStyle}>
                          {formatDateTime(version.updatedAt)}
                        </div>
                      </td>
                      <td style={tableCellStyle}>
                        {actions.length === 0 ? (
                          <div style={actionsStyle}>
                            <span style={readOnlyChipStyle}>
                              {t("switchboard.action.readOnly")}
                            </span>
                            {version.status === "published" && (
                              <a
                                style={linkStyle}
                                href={auditHref(version.versionId)}
                                target="_blank"
                                rel="noreferrer"
                                title={t("switchboard.openNewTab")}
                              >
                                {t("switchboard.viewAudit")} ↗
                              </a>
                            )}
                          </div>
                        ) : (
                          <div style={actionsStyle}>
                            {publishDescriptor && (
                              <DescriptorButton
                                descriptor={publishDescriptor}
                                tone="primary"
                                busy={busyAction}
                                label={t("switchboard.action.publishVersion")}
                                onInvoke={(action) =>
                                  invoke({
                                    ...action,
                                    run: performPublishVersion(
                                      version.versionId,
                                    ),
                                  })
                                }
                              />
                            )}
                            {deleteDescriptor && (
                              <DescriptorButton
                                descriptor={deleteDescriptor}
                                busy={busyAction}
                                label={t("switchboard.deleteDraft")}
                                onInvoke={(action) =>
                                  invoke({
                                    ...action,
                                    run: performDeleteDraft(version.versionId),
                                  })
                                }
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Placards tab ── */}
      {activeTab === "placards" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={tableCardStyle}>
            <div style={cardHeaderStyle}>
              <strong style={{ fontSize: 15 }}>
                {t("switchboard.placardsCard")}
              </strong>
              <span style={subcopyStyle}>
                {t("switchboard.placardsCardSub")}
              </span>
            </div>
            {placards.length === 0 ? (
              <EmptyState
                reason={deriveEmptyReason(error, false, false)}
                subject={t("switchboard.placardsCard")}
                onRetry={() => void loadData("refresh")}
              />
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeadCellStyle}>
                      {t("switchboard.col.placardId")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("switchboard.col.sourceVersion")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("switchboard.col.scope")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("switchboard.col.artifact")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("switchboard.col.publishState")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("switchboard.col.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {placards.map((placard) => {
                    const sourceVersion =
                      publicInfoById[placard.publicInfoVersionId];
                    const actions = derivePlacardActions(placard);
                    const publishDescriptor = actions.find(
                      (a) => a.action === "publish_placard",
                    );
                    return (
                      <tr key={placard.placardVersionId}>
                        <td style={tableCellStyle}>
                          <div style={cellTitleStyle}>
                            {placard.versionCode}
                          </div>
                          <div style={monoSubcopyStyle}>
                            {placard.placardVersionId}
                          </div>
                          <div style={subcopyStyle}>
                            {formatDateTime(placard.createdAt)}
                          </div>
                        </td>
                        <td style={tableCellStyle}>
                          <div>
                            {sourceVersion?.title ??
                              placard.publicInfoVersionId}
                          </div>
                          <div style={subcopyStyle}>
                            {formatPlatformCodeLabel(
                              locale,
                              sourceVersion?.status ?? "unknown",
                            )}
                          </div>
                        </td>
                        <td style={tableCellStyle}>
                          <span style={scopeChipStyle}>
                            {placardScope(placard.templateName)}
                          </span>
                          <div style={monoSubcopyStyle}>
                            {placard.templateName}
                          </div>
                        </td>
                        <td style={tableCellStyle}>
                          <div style={monoSubcopyStyle}>
                            {placard.artifactFileId ??
                              getPlatformLabel(locale, "pendingArtifactId")}
                          </div>
                          <div style={monoSubcopyStyle}>
                            {shortHash(placard.artifactManifestHash)}
                          </div>
                          {placard.artifactDownloadUrl ? (
                            <a
                              style={linkStyle}
                              href={placard.artifactDownloadUrl}
                              rel="noreferrer"
                              target="_blank"
                              title={t("switchboard.openNewTab")}
                            >
                              {t("switchboard.downloadPdf")} ↗
                            </a>
                          ) : (
                            <div style={subcopyStyle}>—</div>
                          )}
                        </td>
                        <td style={tableCellStyle}>
                          <span
                            style={statusBadgeStyle(
                              placard.publishedAt ? "success" : "warning",
                            )}
                          >
                            {formatPlatformCodeLabel(
                              locale,
                              placard.publishedAt ? "published" : "draft",
                            )}
                          </span>
                          <div style={subcopyStyle}>
                            {formatDateTime(placard.publishedAt ?? "")}
                          </div>
                        </td>
                        <td style={tableCellStyle}>
                          {actions.length === 0 || !publishDescriptor ? (
                            <span style={readOnlyChipStyle}>
                              {t("switchboard.action.readOnly")}
                            </span>
                          ) : (
                            <DescriptorButton
                              descriptor={publishDescriptor}
                              tone="primary"
                              busy={busyAction}
                              label={t("switchboard.action.publishPlacard")}
                              onInvoke={(action) =>
                                invoke({
                                  ...action,
                                  run: performPublishPlacard(
                                    placard.placardVersionId,
                                  ),
                                })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Current published placard preview */}
          <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
              {t("switchboard.preview.title")}
            </p>
            {livePlacardVersion ? (
              <>
                <div style={placardPreviewStyle}>
                  <div style={placardTitleStyle}>
                    {livePlacardSource?.title ?? t("switchboard.title")}
                  </div>
                  <div style={placardContactStyle}>
                    {t("switchboard.preview.call")}{" "}
                    {livePlacardSource?.callPhone ?? "—"} ·{" "}
                    {t("switchboard.preview.complaint")}{" "}
                    {livePlacardSource?.complaintPhone ?? "—"}
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <div>{livePlacardSource?.callRateText ?? "—"}</div>
                    <div>{livePlacardSource?.fareText ?? "—"}</div>
                    <div>{livePlacardSource?.paymentMethodText ?? "—"}</div>
                    <div style={{ marginTop: 4, color: "#666" }}>
                      {livePlacardVersion.versionCode} ·{" "}
                      {t("switchboard.preview.source")}{" "}
                      {livePlacardVersion.publicInfoVersionId}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {livePlacardVersion.artifactDownloadUrl && (
                    <a
                      style={mergeStyles(actionButtonStyle(), {
                        textDecoration: "none",
                      })}
                      href={livePlacardVersion.artifactDownloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={t("switchboard.openNewTab")}
                    >
                      {t("switchboard.downloadPdf")} ↗
                    </a>
                  )}
                  <a
                    style={mergeStyles(actionButtonStyle(), {
                      textDecoration: "none",
                    })}
                    href={auditHref(livePlacardVersion.publicInfoVersionId)}
                    target="_blank"
                    rel="noreferrer"
                    title={t("switchboard.openNewTab")}
                  >
                    {t("switchboard.viewAudit")} ↗
                  </a>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                {t("switchboard.preview.none")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "history" && (
        <div style={tableCardStyle}>
          <div style={cardHeaderStyle}>
            <strong style={{ fontSize: 15 }}>
              {t("switchboard.history.title")}
            </strong>
            <span style={subcopyStyle}>{t("switchboard.history.note")}</span>
          </div>
          {historyVersions.length === 0 ? (
            <EmptyState
              reason={deriveEmptyReason(
                error,
                publicInfo.length > 0,
                publicInfo.length > 0,
              )}
              subject={t("switchboard.history.title")}
              onRetry={() => void loadData("refresh")}
            />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.version")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.status")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.effectiveFrom")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.effectiveTo")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.updated")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("switchboard.col.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyVersions.map((version) => (
                  <tr key={version.versionId}>
                    <td style={tableCellStyle}>
                      <div style={cellTitleStyle}>{version.title}</div>
                      <div style={monoSubcopyStyle}>{version.versionId}</div>
                      <div style={subcopyStyle}>
                        {version.publishedBy ?? "—"}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <span
                        style={statusBadgeStyle(
                          publicInfoStatusTone(version.status),
                        )}
                      >
                        {formatPlatformCodeLabel(locale, version.status)}
                      </span>
                    </td>
                    <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                      {version.effectiveFrom ?? "—"}
                    </td>
                    <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                      {version.effectiveTo ?? "—"}
                    </td>
                    <td style={tableCellStyle}>
                      <div style={subcopyStyle}>
                        {formatDateTime(
                          version.publishedAt ?? version.updatedAt,
                        )}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <a
                        style={linkStyle}
                        href={auditHref(version.versionId)}
                        target="_blank"
                        rel="noreferrer"
                        title={t("switchboard.openNewTab")}
                      >
                        {t("switchboard.viewAudit")} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {pendingAction && (
        <ConfirmDialog
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={(reason) => {
            const action = pendingAction;
            setPendingAction(null);
            void action.run(reason);
          }}
        />
      )}
    </div>
  );
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 500,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginTop: 0,
  flexWrap: "wrap",
  alignItems: "center",
};

const cellTitleStyle: React.CSSProperties = {
  fontWeight: 600,
};

const subcopyStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
};

const monoSubcopyStyle: React.CSSProperties = {
  ...subcopyStyle,
  ...monoTextStyle,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "16px 16px 0",
};

const readOnlyChipStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  background: "rgba(148,163,184,0.16)",
  borderRadius: 999,
  padding: "2px 10px",
};

const scopeChipStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#0369a1",
  background: "rgba(14,165,233,0.12)",
  borderRadius: 999,
  padding: "2px 10px",
  textTransform: "capitalize",
};

const placardPreviewStyle: React.CSSProperties = {
  background: "#FCFAF2",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  fontSize: 11.5,
  lineHeight: 1.55,
  color: "#1a1a1a",
};

const placardTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  textAlign: "center",
  marginBottom: 6,
};

const placardContactStyle: React.CSSProperties = {
  borderTop: "1px solid #1a1a1a",
  borderBottom: "1px solid #1a1a1a",
  padding: "6px 0",
  textAlign: "center",
  marginBottom: 8,
  fontWeight: 600,
};
