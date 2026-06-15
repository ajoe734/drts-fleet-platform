"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import {
  createFleetPartner,
  EMPTY_FLEET_PARTNER_FORM,
  listFleetPartners,
  PARTNERSHIP_TYPES,
  type FleetPartnerFormState,
  type FleetPartnerRecord,
} from "./fleet-partner-shared";

type FleetPartnerFilter = "all" | "active" | "inactive";
type FleetPartnerTableRow = FleetPartnerRecord & Record<string, unknown>;

const theme = buildCanvasTheme({
  dark: true,
  surface: "platform",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const linkStyle: CSSProperties = {
  color: theme.text,
  textDecoration: "none",
  display: "grid",
  gap: 2,
};

const primaryTextStyle: CSSProperties = {
  fontWeight: 600,
  color: theme.text,
};

const secondaryTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
};

function fleetPartnerTone(active: boolean): CanvasTone {
  return active ? "success" : "warn";
}

function filterTone(value: FleetPartnerFilter, active: boolean): CanvasTone {
  if (active) {
    return "accent";
  }
  return value === "inactive" ? "warn" : "neutral";
}

function partnershipTypeKey(value: string) {
  return `fleetPartners.partnershipType.${value}`;
}

export default function FleetPartnersPage() {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const [partners, setPartners] = useState<FleetPartnerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<FleetPartnerFilter>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FleetPartnerFormState>(
    EMPTY_FLEET_PARTNER_FORM,
  );

  const loadPartners = async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await listFleetPartners(client);
      setPartners(records);
    } catch (loadError: any) {
      setError(loadError?.message ?? t("common.unknown"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPartners();
  }, [client]);

  const filteredPartners = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return partners.filter((partner) => {
      if (filter === "active" && !partner.active) {
        return false;
      }
      if (filter === "inactive" && partner.active) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      return [
        partner.displayName,
        partner.legalName,
        partner.businessRegistrationNo,
        partner.contactName,
        partner.contactPhone,
        partner.fleetPartnerId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [filter, partners, search]);

  const counts = useMemo(
    () => ({
      all: partners.length,
      active: partners.filter((partner) => partner.active).length,
      inactive: partners.filter((partner) => !partner.active).length,
    }),
    [partners],
  );

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await createFleetPartner(client, form);
      setPartners((current) => [created, ...current]);
      setForm(EMPTY_FLEET_PARTNER_FORM);
      setShowCreate(false);
    } catch (createError: any) {
      setError(createError?.message ?? t("common.unknown"));
    } finally {
      setCreating(false);
    }
  };

  const columns: CanvasTableColumn<FleetPartnerTableRow>[] = [
    {
      h: t("fleetPartners.col.partner"),
      r: (partner: FleetPartnerTableRow) => (
        <Link
          href={`/fleet-partners/${encodeURIComponent(partner.fleetPartnerId)}`}
          style={linkStyle}
        >
          <span style={primaryTextStyle}>
            {partner.displayName || partner.legalName}
          </span>
          <span style={secondaryTextStyle}>{partner.fleetPartnerId}</span>
        </Link>
      ),
    },
    {
      h: t("fleetPartners.col.registration"),
      r: (partner: FleetPartnerTableRow) =>
        partner.businessRegistrationNo || t("common.noValues"),
    },
    {
      h: t("fleetPartners.col.partnershipType"),
      r: (partner: FleetPartnerTableRow) =>
        t(partnershipTypeKey(partner.partnershipType)),
    },
    {
      h: t("fleetPartners.col.contact"),
      r: (partner: FleetPartnerTableRow) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span>{partner.contactName || t("common.noValues")}</span>
          <span style={secondaryTextStyle}>
            {partner.contactPhone || t("common.noValues")}
          </span>
        </div>
      ),
    },
    {
      h: t("fleetPartners.col.status"),
      r: (partner: FleetPartnerTableRow) => (
        <CanvasPill tone={fleetPartnerTone(partner.active)} dot>
          {partner.active
            ? t("fleetPartners.status.active")
            : t("fleetPartners.status.inactive")}
        </CanvasPill>
      ),
    },
    {
      h: t("fleetPartners.col.updatedAt"),
      r: (partner: FleetPartnerTableRow) =>
        partner.updatedAt
          ? formatDateTime(partner.updatedAt)
          : partner.createdAt
            ? formatDateTime(partner.createdAt)
            : t("common.noValues"),
    },
  ];

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        title={t("fleetPartners.list.title")}
        subtitle={t("fleetPartners.list.subtitle", {
          count: filteredPartners.length,
          total: partners.length,
        })}
        actions={
          <>
            <CanvasBtn onClick={() => void loadPartners()}>
              {t("common.refresh")}
            </CanvasBtn>
            <CanvasBtn
              variant="primary"
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.hide") : t("fleetPartners.createAction")}
            </CanvasBtn>
          </>
        }
      />

      {error ? (
        <CanvasBanner
          tone="danger"
          title={t("fleetPartners.loadErrorTitle")}
          body={error}
        />
      ) : null}

      <CanvasCard>
        <div style={filterRowStyle}>
          {(["all", "active", "inactive"] as FleetPartnerFilter[]).map(
            (value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <CanvasPill tone={filterTone(value, filter === value)}>
                  {t(`fleetPartners.filter.${value}`)} · {counts[value]}
                </CanvasPill>
              </button>
            ),
          )}
        </div>
        <div style={{ marginTop: 14 }}>
          <CanvasField label={t("fleetPartners.searchLabel")}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("fleetPartners.searchPlaceholder")}
              style={{
                width: "100%",
                boxSizing: "border-box",
                minHeight: 34,
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                padding: "8px 10px",
                fontFamily: theme.fontFamily,
                fontSize: 12.5,
              }}
            />
          </CanvasField>
        </div>
      </CanvasCard>

      {showCreate ? (
        <CanvasCard
          title={t("fleetPartners.createPanelTitle")}
          subtitle={t("fleetPartners.createPanelSubtitle")}
        >
          <div style={formGridStyle}>
            <CanvasField label={t("fleetPartners.form.legalName")}>
              <input
                value={form.legalName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    legalName: event.target.value,
                  }))
                }
                style={inputStyle()}
              />
            </CanvasField>
            <CanvasField label={t("fleetPartners.form.displayName")}>
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                style={inputStyle()}
              />
            </CanvasField>
            <CanvasField label={t("fleetPartners.form.businessRegistrationNo")}>
              <input
                value={form.businessRegistrationNo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    businessRegistrationNo: event.target.value,
                  }))
                }
                style={inputStyle(true)}
              />
            </CanvasField>
            <CanvasField label={t("fleetPartners.form.contactName")}>
              <input
                value={form.contactName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    contactName: event.target.value,
                  }))
                }
                style={inputStyle()}
              />
            </CanvasField>
            <CanvasField label={t("fleetPartners.form.contactPhone")}>
              <input
                value={form.contactPhone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    contactPhone: event.target.value,
                  }))
                }
                style={inputStyle(true)}
              />
            </CanvasField>
            <CanvasField label={t("fleetPartners.form.partnershipType")}>
              <select
                value={form.partnershipType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    partnershipType: event.target
                      .value as FleetPartnerRecord["partnershipType"],
                  }))
                }
                style={inputStyle()}
              >
                {PARTNERSHIP_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(partnershipTypeKey(value))}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField label={t("fleetPartners.form.active")}>
              <select
                value={String(form.active)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.value === "true",
                  }))
                }
                style={inputStyle()}
              >
                <option value="true">{t("common.yes")}</option>
                <option value="false">{t("common.no")}</option>
              </select>
            </CanvasField>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 16,
              gap: 8,
            }}
          >
            <CanvasBtn onClick={() => setShowCreate(false)}>
              {t("common.cancel")}
            </CanvasBtn>
            <CanvasBtn
              variant="primary"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? t("common.creating") : t("common.create")}
            </CanvasBtn>
          </div>
        </CanvasCard>
      ) : null}

      <CanvasCard>
        {loading ? (
          <div>{t("fleetPartners.loading")}</div>
        ) : filteredPartners.length === 0 ? (
          <div>{t("fleetPartners.empty")}</div>
        ) : (
          <CanvasTable
            columns={columns}
            rows={filteredPartners as FleetPartnerTableRow[]}
          />
        )}
      </CanvasCard>
    </div>
  );
}

function inputStyle(mono = false): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 34,
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    padding: "8px 10px",
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
    fontSize: 12.5,
    background: theme.bgRaised,
    color: theme.text,
  };
}
