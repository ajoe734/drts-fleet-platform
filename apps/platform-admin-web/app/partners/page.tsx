"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ENTRY_FORM,
  EntryForm,
  buildPartnerReadinessItems,
  partnerStatusTone,
  toPartnerCreateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";

type PartnerFilter = "all" | "active" | "inactive" | "revoked" | "attention";

function partnerNeedsAttention(entry: PartnerChannelEntryRecord) {
  return buildPartnerReadinessItems(entry, (key: string) => key).some(
    (item) => !item.ready,
  );
}

export default function PartnersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [createForm, setCreateForm] =
    useState<EntryFormState>(EMPTY_ENTRY_FORM);

  const copy =
    locale === "en"
      ? {
          title: "Partner entry",
          subtitle:
            "Govern bank, hotel, and enterprise-facing entry programs, readiness, and ingress controls.",
          refresh: "Refresh",
          view: "Open detail",
          createTitle: "Create partner entry",
          createSubtitle:
            "Provision entry routing, auth mode, eligibility mode, and branding metadata before enabling traffic.",
          attention: (count: number) =>
            `${count} entry(s) still have readiness gaps and should not be promoted blindly.`,
          columns: {
            entry: "Entry",
            tenant: "Tenant / program",
            auth: "Auth + eligibility",
            status: "Status",
            readiness: "Readiness",
            updated: "Updated",
            actions: "Actions",
          },
          filtersLabel: "Filter partner entries",
        }
      : {
          title: "合作夥伴 entry",
          subtitle:
            "治理銀行、飯店與企業入口方案的 readiness、routing 與 ingress 控制。",
          refresh: "重新整理",
          view: "查看詳情",
          createTitle: "建立 partner entry",
          createSubtitle:
            "在正式導流前，先補齊 entry routing、auth mode、eligibility mode 與 branding metadata。",
          attention: (count: number) =>
            `${count} 筆 entry 仍有 readiness 缺口，不應直接推進。`,
          columns: {
            entry: "入口",
            tenant: "租戶 / 方案",
            auth: "驗證 + 資格",
            status: "狀態",
            readiness: "Readiness",
            updated: "更新",
            actions: "操作",
          },
          filtersLabel: "篩選 partner entry",
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

  const handleCreate = async (event: React.FormEvent) => {
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

  const setEntryStatus = useCallback(
    async (
      entrySlug: string,
      nextStatus: "active" | "inactive" | "revoked",
    ) => {
      setChangingStatus(`${entrySlug}:${nextStatus}`);
      setError(null);
      try {
        if (nextStatus === "active") {
          await client.activatePlatformPartnerEntry(entrySlug);
        } else if (nextStatus === "inactive") {
          await client.deactivatePlatformPartnerEntry(entrySlug);
        } else {
          await client.revokePlatformPartnerEntry(entrySlug);
        }
        await loadEntries();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChangingStatus(null);
      }
    },
    [client, loadEntries],
  );

  if (loading) {
    return <div className="admin-empty">{t("partners.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={locale === "en" ? "Partner Governance" : "Partner Governance"}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => void loadEntries()}
            >
              {copy.refresh}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : t("partners.newEntry")}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Unable to load partner entries"
              : "無法載入 partner entries"
          }
          description={error}
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={locale === "en" ? "Total entries" : "總 entry 數"}
          value={counts.all}
          detail={`${counts.active} active · ${counts.inactive} inactive`}
          tone="neutral"
        />
        <KpiCard
          label={locale === "en" ? "Needs attention" : "待補 readiness"}
          value={counts.attention}
          detail={
            locale === "en"
              ? "Branding, routing, support, or audit metadata is incomplete"
              : "品牌、routing、support 或 audit metadata 尚未補齊"
          }
          tone={counts.attention > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Revoked entries" : "已撤銷 entry"}
          value={counts.revoked}
          detail={
            locale === "en"
              ? "Revoked entries stay visible for audit lineage"
              : "已撤銷 entry 仍保留供 audit lineage 追溯"
          }
          tone={counts.revoked > 0 ? "danger" : "neutral"}
        />
      </KpiRow>

      {counts.attention > 0 ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en"
              ? "Promotion readiness is incomplete"
              : "Promotion readiness 尚未完整"
          }
          description={copy.attention(counts.attention)}
        />
      ) : null}

      {showCreate ? (
        <WorkflowPanel
          title={copy.createTitle}
          description={copy.createSubtitle}
          tone="info"
        >
          <form onSubmit={handleCreate}>
            <EntryForm form={createForm} setForm={setCreateForm} t={t} />
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating ||
                !createForm.partnerCode.trim() ||
                !createForm.programId.trim() ||
                !createForm.entrySlug.trim() ||
                !createForm.displayName.trim()
              }
            >
              {creating ? t("common.creating") : t("partners.createEntry")}
            </button>
          </form>
        </WorkflowPanel>
      ) : null}

      <DataViewCard
        title={copy.title}
        subtitle={copy.subtitle}
        filters={
          <DataFilterBar
            value={filter}
            onChange={setFilter}
            ariaLabel={copy.filtersLabel}
            filters={[
              {
                value: "all",
                label: locale === "en" ? "All" : "全部",
                count: counts.all,
                tone: "neutral",
              },
              {
                value: "active",
                label: "active",
                count: counts.active,
                tone: "success",
              },
              {
                value: "inactive",
                label: "inactive",
                count: counts.inactive,
                tone: "warning",
              },
              {
                value: "attention",
                label: locale === "en" ? "attention" : "待處理",
                count: counts.attention,
                tone: "warning",
              },
              {
                value: "revoked",
                label: "revoked",
                count: counts.revoked,
                tone: "danger",
              },
            ]}
          />
        }
      >
        <DataTable
          columns={[
            { label: copy.columns.entry, width: "240px" },
            { label: copy.columns.tenant, width: "220px" },
            { label: copy.columns.auth, width: "220px" },
            { label: copy.columns.status, width: "120px" },
            { label: copy.columns.readiness, width: "200px" },
            { label: copy.columns.updated, width: "180px" },
            { label: copy.columns.actions, width: "260px" },
          ]}
          empty={t("partners.empty")}
        >
          {visibleEntries.map((entry) => {
            const readiness = buildPartnerReadinessItems(entry, t);
            const readyCount = readiness.filter((item) => item.ready).length;
            const missingCount = readiness.length - readyCount;

            return (
              <Tr key={entry.entrySlug}>
                <Td>
                  <DataCellStack
                    primary={<strong>{entry.displayName}</strong>}
                    secondary={`/${entry.entrySlug}`}
                    tertiary={entry.entryHost ?? undefined}
                  />
                </Td>
                <Td>
                  <DataCellStack
                    primary={`${entry.tenantId} · ${entry.programId}`}
                    secondary={entry.partnerCode}
                    tertiary={entry.programCode ?? undefined}
                  />
                </Td>
                <Td>
                  <DataCellStack
                    primary={formatPlatformCodeLabel(locale, entry.authMode)}
                    secondary={formatPlatformCodeLabel(
                      locale,
                      entry.eligibilityMode,
                    )}
                    tertiary={formatPlatformCodeLabel(
                      locale,
                      entry.businessDispatchSubtype,
                    )}
                  />
                </Td>
                <Td>
                  <StatusChip
                    label={formatPlatformCodeLabel(locale, entry.status)}
                    tone={partnerStatusTone(entry.status)}
                  />
                </Td>
                <Td>
                  <DataCellStack
                    primary={
                      missingCount === 0
                        ? locale === "en"
                          ? "Ready"
                          : "已就緒"
                        : locale === "en"
                          ? `${missingCount} gap(s)`
                          : `${missingCount} 項缺口`
                    }
                    secondary={`${readyCount}/${readiness.length} checks`}
                    tertiary={
                      missingCount === 0
                        ? undefined
                        : readiness
                            .filter((item) => !item.ready)
                            .map((item) => item.label)
                            .join(" · ")
                    }
                  />
                </Td>
                <Td>{formatDateTime(entry.updatedAt)}</Td>
                <Td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Link
                      href={`/partners/${entry.entrySlug}`}
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                    >
                      {copy.view}
                    </Link>
                    {entry.status === "active" ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        disabled={
                          changingStatus === `${entry.entrySlug}:inactive`
                        }
                        onClick={() =>
                          void setEntryStatus(entry.entrySlug, "inactive")
                        }
                      >
                        {t("partners.deactivate")}
                      </button>
                    ) : entry.status === "inactive" ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        disabled={
                          changingStatus === `${entry.entrySlug}:active`
                        }
                        onClick={() =>
                          void setEntryStatus(entry.entrySlug, "active")
                        }
                      >
                        {t("partners.activate")}
                      </button>
                    ) : null}
                    {entry.status !== "revoked" ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        disabled={
                          changingStatus === `${entry.entrySlug}:revoked`
                        }
                        onClick={() =>
                          void setEntryStatus(entry.entrySlug, "revoked")
                        }
                      >
                        {t("partners.revoke")}
                      </button>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </DataViewCard>
    </div>
  );
}
