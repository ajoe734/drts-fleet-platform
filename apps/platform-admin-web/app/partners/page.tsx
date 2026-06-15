"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ENTRY_FORM,
  buildPartnerReadinessItems,
  toPartnerCreateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ENTRY_STATUSES,
  PARTNER_ELIGIBILITY_MODES,
  type PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";

type PartnerFilter = "all" | "active" | "inactive" | "revoked" | "attention";
type PartnerTableRow = PartnerChannelEntryRecord & Record<string, unknown>;

const theme = buildCanvasTheme({
  dark: true,
  surface: "platform",
  density: "compact",
});

// Canvas PA_Partners body: page padding 24, single table-first card.
const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const pillsRowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const entryCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
} satisfies CSSProperties;

const entryAccentStyle = (accent: string): CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 6,
  background: accent,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
});

const monoSubtleStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const entryLinkStyle = {
  color: theme.text,
  fontWeight: 600,
  textDecoration: "none",
} satisfies CSSProperties;

const pillButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const inputBaseStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 34,
  fontSize: 13,
  fontWeight: 600,
  background: theme.accent,
  color: "#fff",
  border: `1px solid ${theme.accent}`,
  borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

// Route-local medium-risk action modal (no shared modal primitive in @drts/ui-web).
const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 11, 18, 0.62)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "48px 24px",
  overflowY: "auto",
  zIndex: 60,
} satisfies CSSProperties;

const modalPanelStyle = {
  width: "100%",
  maxWidth: 760,
} satisfies CSSProperties;

function statusTone(
  status: PartnerChannelEntryRecord["status"],
): "success" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "warn";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

function partnerNeedsAttention(entry: PartnerChannelEntryRecord) {
  return buildPartnerReadinessItems(entry, (key: string) => key).some(
    (item) => !item.ready,
  );
}

function readinessState(
  entry: PartnerChannelEntryRecord,
  t: (key: string) => string,
): {
  missingCount: number;
  label: string;
  tone: "success" | "warn";
} {
  const items = buildPartnerReadinessItems(entry, t);
  const missingCount = items.filter((item) => !item.ready).length;

  return {
    missingCount,
    label:
      missingCount === 0
        ? "ok"
        : `${missingCount} ${missingCount === 1 ? "gap" : "gaps"}`,
    tone: missingCount === 0 ? "success" : "warn",
  };
}

export default function PartnersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [createForm, setCreateForm] =
    useState<EntryFormState>(EMPTY_ENTRY_FORM);

  const copy =
    locale === "en"
      ? {
          title: "Partner entry",
          subtitle:
            "Bank / hotel / enterprise partner entry routing, auth, eligibility, and branding.",
          searchPlaceholder: "Search entries, tenants, credentials...",
          filterAction: "Filter",
          createAction: "Create entry",
          createTitle: "Create partner entry",
          createSubtitle:
            "Provision routing, auth mode, eligibility mode, and brand metadata before traffic goes live.",
          refresh: "Refresh",
          last30Days: "last 30 days",
          errorTitle: "Unable to load partner entries",
          filters: {
            all: "all",
            active: "active",
            inactive: "inactive",
            attention: "attention",
            revoked: "revoked",
          },
          openDetail: "Open entry detail",
        }
      : {
          title: "合作夥伴 entry",
          subtitle:
            "銀行 / 飯店 / 企業 partner 入口、auth 模式、eligibility、品牌",
          searchPlaceholder: "搜尋 entry、租戶、憑證...",
          filterAction: "篩選",
          createAction: "建立 entry",
          createTitle: "建立 partner entry",
          createSubtitle:
            "在正式導流前先補齊 routing、auth mode、eligibility mode 與品牌 metadata。",
          refresh: "重新整理",
          last30Days: "近 30 天",
          errorTitle: "無法載入 partner entries",
          filters: {
            all: "全部",
            active: "active",
            inactive: "inactive",
            attention: "待處理",
            revoked: "revoked",
          },
          openDetail: "查看 entry 詳情",
        };

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformPartnerEntries();
      setEntries(result ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Close the create modal on Escape for keyboard parity with canvas action modals.
  useEffect(() => {
    if (!showCreate) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCreate(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreate]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      active: entries.filter((entry) => entry.status === "active").length,
      inactive: entries.filter((entry) => entry.status === "inactive").length,
      revoked: entries.filter((entry) => entry.status === "revoked").length,
      attention: entries.filter(partnerNeedsAttention).length,
    }),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    switch (filter) {
      case "attention":
        return entries.filter(partnerNeedsAttention);
      case "active":
      case "inactive":
      case "revoked":
        return entries.filter((entry) => entry.status === filter);
      case "all":
      default:
        return entries;
    }
  }, [entries, filter]);

  const tableRows = useMemo(
    () => visibleEntries as PartnerTableRow[],
    [visibleEntries],
  );

  const filterPills = useMemo(
    () =>
      [
        {
          value: "all" as const,
          label: `${copy.filters.all} ${counts.all}`,
          tone: "neutral" as const,
        },
        {
          value: "active" as const,
          label: `${copy.filters.active} ${counts.active}`,
          tone: "success" as const,
        },
        {
          value: "inactive" as const,
          label: `${copy.filters.inactive} ${counts.inactive}`,
          tone: "warn" as const,
        },
        {
          value: "attention" as const,
          label: `${copy.filters.attention} ${counts.attention}`,
          tone: "warn" as const,
        },
        {
          value: "revoked" as const,
          label: `${copy.filters.revoked} ${counts.revoked}`,
          tone: "danger" as const,
        },
      ] satisfies Array<{
        value: PartnerFilter;
        label: string;
        tone: "neutral" | "success" | "warn" | "danger";
      }>,
    [copy.filters, counts],
  );

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformPartnerEntry(
        toPartnerCreateCommand(createForm),
      );
      setCreateForm(EMPTY_ENTRY_FORM);
      setShowCreate(false);
      await loadEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const createDisabled =
    creating ||
    !createForm.partnerCode.trim() ||
    !createForm.programId.trim() ||
    !createForm.entrySlug.trim() ||
    !createForm.displayName.trim();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              onClick={() => setShowFilters((current) => !current)}
            >
              {copy.filterAction}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreate(true)}
            >
              {copy.createAction}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {showFilters ? (
          <div style={pillsRowStyle}>
            {filterPills.map((item) => (
              <button
                key={item.value}
                type="button"
                style={pillButtonStyle}
                onClick={() => setFilter(item.value)}
              >
                <CanvasPill
                  theme={theme}
                  tone={filter === item.value ? "accent" : item.tone}
                  dot={item.value !== "all"}
                >
                  {item.label}
                </CanvasPill>
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <CanvasPill theme={theme} tone="neutral">
              {copy.last30Days}
            </CanvasPill>
            <CanvasBtn theme={theme} onClick={() => void loadEntries()}>
              {copy.refresh}
            </CanvasBtn>
          </div>
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {loading ? (
            <div
              style={{
                padding: "24px 16px",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("partners.loading")}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("partners.empty")}
            </div>
          ) : (
            <CanvasTable<PartnerTableRow>
              theme={theme}
              rows={tableRows}
              columns={[
                {
                  h: "ENTRY",
                  w: 220,
                  r: (entry) => (
                    <div style={entryCellStyle}>
                      <span
                        style={entryAccentStyle(
                          entry.themeAccent?.trim() || theme.accent,
                        )}
                      >
                        {entry.partnerCode.slice(0, 2).toUpperCase() || "PE"}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <Link
                          href={`/partners/${entry.entrySlug}`}
                          style={entryLinkStyle}
                          aria-label={copy.openDetail}
                        >
                          {entry.displayName}
                        </Link>
                        <span style={monoSubtleStyle}>/{entry.entrySlug}</span>
                      </div>
                    </div>
                  ),
                },
                {
                  h: "PROGRAM",
                  w: 140,
                  r: (entry) =>
                    entry.programCode
                      ? `${entry.programId} · ${entry.programCode}`
                      : entry.programId,
                },
                {
                  h: "SUBTYPE",
                  w: 150,
                  mono: true,
                  r: (entry) => (
                    <span style={{ fontSize: 11 }}>
                      {entry.businessDispatchSubtype}
                    </span>
                  ),
                },
                {
                  h: "AUTH",
                  w: 130,
                  mono: true,
                  k: "authMode",
                },
                {
                  h: "ELIGIBILITY",
                  w: 110,
                  mono: true,
                  k: "eligibilityMode",
                },
                {
                  h: "STATUS",
                  w: 100,
                  r: (entry) => (
                    <CanvasPill
                      theme={theme}
                      tone={statusTone(entry.status)}
                      dot
                    >
                      {entry.status}
                    </CanvasPill>
                  ),
                },
                {
                  h: "READINESS",
                  w: 180,
                  r: (entry) => {
                    const readiness = readinessState(entry, t);
                    return (
                      <CanvasPill
                        theme={theme}
                        tone={readiness.tone}
                        dot={readiness.missingCount > 0}
                      >
                        {readiness.label}
                      </CanvasPill>
                    );
                  },
                },
              ]}
            />
          )}
        </CanvasCard>
      </div>

      {showCreate ? (
        <div
          style={modalOverlayStyle}
          role="dialog"
          aria-modal="true"
          aria-label={copy.createTitle}
          onClick={() => setShowCreate(false)}
        >
          <div
            style={modalPanelStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <CanvasCard
              theme={theme}
              title={copy.createTitle}
              subtitle={copy.createSubtitle}
              actions={
                <CanvasBtn
                  theme={theme}
                  icon="x"
                  onClick={() => setShowCreate(false)}
                >
                  {t("common.cancel")}
                </CanvasBtn>
              }
            >
              <form onSubmit={handleCreate}>
                <div style={formGridStyle}>
                  <CanvasField
                    theme={theme}
                    label={t("partners.form.tenantId")}
                    required
                  >
                    <input
                      value={createForm.tenantId}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          tenantId: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.partnerCode")}
                    required
                  >
                    <input
                      value={createForm.partnerCode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          partnerCode: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.partnerType")}
                  >
                    <input
                      value={createForm.partnerType}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          partnerType: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.programId")}
                    required
                  >
                    <input
                      value={createForm.programId}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          programId: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.programCode")}
                  >
                    <input
                      value={createForm.programCode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          programCode: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.bankCode")}
                  >
                    <input
                      value={createForm.bankCode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          bankCode: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.entrySlug")}
                    required
                  >
                    <input
                      value={createForm.entrySlug}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          entrySlug: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.displayName")}
                    required
                  >
                    <input
                      value={createForm.displayName}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                      style={inputBaseStyle()}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.dispatchSubtype")}
                  >
                    <select
                      value={createForm.businessDispatchSubtype}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          businessDispatchSubtype: event.target
                            .value as EntryFormState["businessDispatchSubtype"],
                        }))
                      }
                      style={inputBaseStyle(true)}
                    >
                      {BUSINESS_DISPATCH_SUBTYPES.map((value) => (
                        <option key={value} value={value}>
                          {formatPlatformCodeLabel(locale, value)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.authMode")}
                  >
                    <select
                      value={createForm.authMode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          authMode: event.target
                            .value as EntryFormState["authMode"],
                        }))
                      }
                      style={inputBaseStyle(true)}
                    >
                      {PARTNER_ENTRY_AUTH_MODES.map((value) => (
                        <option key={value} value={value}>
                          {formatPlatformCodeLabel(locale, value)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.eligibilityMode")}
                  >
                    <select
                      value={createForm.eligibilityMode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          eligibilityMode: event.target
                            .value as EntryFormState["eligibilityMode"],
                        }))
                      }
                      style={inputBaseStyle(true)}
                    >
                      {PARTNER_ELIGIBILITY_MODES.map((value) => (
                        <option key={value} value={value}>
                          {formatPlatformCodeLabel(locale, value)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.entryHost")}
                  >
                    <input
                      value={createForm.entryHost}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          entryHost: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.entryPath")}
                  >
                    <input
                      value={createForm.entryPath}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          entryPath: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.themeAccent")}
                  >
                    <input
                      value={createForm.themeAccent}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          themeAccent: event.target.value,
                        }))
                      }
                      style={inputBaseStyle(true)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.supportEmail")}
                  >
                    <input
                      type="email"
                      value={createForm.supportEmail}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          supportEmail: event.target.value,
                        }))
                      }
                      style={inputBaseStyle()}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={theme}
                    label={t("partners.form.supportPhone")}
                  >
                    <input
                      type="tel"
                      value={createForm.supportPhone}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          supportPhone: event.target.value,
                        }))
                      }
                      style={inputBaseStyle()}
                    />
                  </CanvasField>

                  <CanvasField theme={theme} label={t("partners.form.status")}>
                    <select
                      value={createForm.status}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          status: event.target
                            .value as EntryFormState["status"],
                        }))
                      }
                      style={inputBaseStyle(true)}
                    >
                      {PARTNER_ENTRY_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {formatPlatformCodeLabel(locale, value)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="submit"
                    disabled={createDisabled}
                    style={submitButtonStyle(createDisabled)}
                  >
                    {creating
                      ? t("common.creating")
                      : t("partners.createEntry")}
                  </button>
                  <CanvasBtn theme={theme} onClick={() => setShowCreate(false)}>
                    {t("common.cancel")}
                  </CanvasBtn>
                </div>
              </form>
            </CanvasCard>
          </div>
        </div>
      ) : null}
    </>
  );
}
