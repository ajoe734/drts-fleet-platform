"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import {
  AFFILIATION_TYPES,
  createDriverAffiliation,
  createRevenueShareRule,
  EMPTY_AFFILIATION_FORM,
  EMPTY_RULE_FORM,
  formatMoneyMinor,
  getFleetPartner,
  listFleetPartnerDrivers,
  listFleetStatements,
  listRevenueShareRules,
  PARTNERSHIP_TYPES,
  RULE_APPLIES_TO_VALUES,
  RULE_FORMULAS,
  toFleetPartnerFormState,
  updateFleetPartner,
  type DriverFleetAffiliationRecord,
  type FleetAffiliationFormState,
  type FleetPartnerFormState,
  type FleetPartnerRecord,
  type FleetPartnerRevenueShareRuleRecord,
  type FleetPartnerStatementRecord,
  type FleetRuleFormState,
} from "../fleet-partner-shared";

type DriverTableRow = DriverFleetAffiliationRecord & Record<string, unknown>;
type RuleTableRow = FleetPartnerRevenueShareRuleRecord &
  Record<string, unknown>;
type StatementTableRow = FleetPartnerStatementRecord & Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

function statusTone(active: boolean): CanvasTone {
  return active ? "success" : "warn";
}

function payoutTone(status?: string): CanvasTone {
  switch (status) {
    case "paid":
    case "reconciled":
      return "success";
    case "pending":
    case "pending_approval":
      return "warn";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function partnershipTypeKey(value: string) {
  return `fleetPartners.partnershipType.${value}`;
}

function affiliationTypeKey(value: string) {
  return `fleetPartners.affiliationType.${value}`;
}

function appliesToKey(value: string) {
  return `fleetPartners.rule.appliesTo.${value}`;
}

function formulaKey(value: string) {
  return `fleetPartners.rule.formula.${value}`;
}

export default function FleetPartnerDetailPage() {
  const params = useParams<{ fleetPartnerId: string }>();
  const fleetPartnerId = String(params?.fleetPartnerId ?? "");
  const client = usePlatformAdminClient();
  const { t, locale } = useTranslation();

  const [partner, setPartner] = useState<FleetPartnerRecord | null>(null);
  const [partnerForm, setPartnerForm] = useState<FleetPartnerFormState | null>(
    null,
  );
  const [drivers, setDrivers] = useState<DriverFleetAffiliationRecord[]>([]);
  const [rules, setRules] = useState<FleetPartnerRevenueShareRuleRecord[]>([]);
  const [statements, setStatements] = useState<FleetPartnerStatementRecord[]>(
    [],
  );
  const [affiliationForm, setAffiliationForm] =
    useState<FleetAffiliationFormState>(EMPTY_AFFILIATION_FORM);
  const [ruleForm, setRuleForm] = useState<FleetRuleFormState>(EMPTY_RULE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingAffiliation, setCreatingAffiliation] = useState(false);
  const [creatingRule, setCreatingRule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async () => {
    if (!fleetPartnerId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [partnerRecord, driverRecords, ruleRecords, statementRecords] =
        await Promise.all([
          getFleetPartner(client, fleetPartnerId),
          listFleetPartnerDrivers(client, fleetPartnerId),
          listRevenueShareRules(client, fleetPartnerId),
          listFleetStatements(client, fleetPartnerId),
        ]);
      setPartner(partnerRecord);
      setPartnerForm(toFleetPartnerFormState(partnerRecord));
      setDrivers(driverRecords);
      setRules(ruleRecords);
      setStatements(statementRecords);
    } catch (loadError: any) {
      setError(loadError?.message ?? t("common.unknown"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [client, fleetPartnerId]);

  const handleSavePartner = async () => {
    if (!partnerForm) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateFleetPartner(
        client,
        fleetPartnerId,
        partnerForm,
      );
      setPartner(updated);
      setPartnerForm(toFleetPartnerFormState(updated));
    } catch (saveError: any) {
      setError(saveError?.message ?? t("common.unknown"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAffiliation = async () => {
    setCreatingAffiliation(true);
    setError(null);
    try {
      const created = await createDriverAffiliation(
        client,
        fleetPartnerId,
        affiliationForm,
      );
      setDrivers((current) => [created, ...current]);
      setAffiliationForm(EMPTY_AFFILIATION_FORM);
    } catch (createError: any) {
      setError(createError?.message ?? t("common.unknown"));
    } finally {
      setCreatingAffiliation(false);
    }
  };

  const handleCreateRule = async () => {
    setCreatingRule(true);
    setError(null);
    try {
      const created = await createRevenueShareRule(
        client,
        fleetPartnerId,
        ruleForm,
      );
      setRules((current) => [created, ...current]);
      setRuleForm(EMPTY_RULE_FORM);
    } catch (createError: any) {
      setError(createError?.message ?? t("common.unknown"));
    } finally {
      setCreatingRule(false);
    }
  };

  const driverColumns: CanvasTableColumn<DriverTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.drivers.col.driverId"),
        r: (row: DriverTableRow) => row.driverId,
      },
      {
        h: t("fleetPartners.drivers.col.affiliationType"),
        r: (row: DriverTableRow) => t(affiliationTypeKey(row.affiliationType)),
      },
      {
        h: t("fleetPartners.drivers.col.effectiveFrom"),
        r: (row: DriverTableRow) => row.effectiveFrom || t("common.noValues"),
      },
      {
        h: t("fleetPartners.drivers.col.effectiveUntil"),
        r: (row: DriverTableRow) =>
          row.effectiveUntil || t("fleetPartners.openEnded"),
      },
    ],
    [t],
  );

  const ruleColumns: CanvasTableColumn<RuleTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.rules.col.ruleId"),
        r: (row: RuleTableRow) => row.ruleId,
      },
      {
        h: t("fleetPartners.rules.col.scope"),
        r: (row: RuleTableRow) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{t(appliesToKey(row.appliesTo))}</span>
            <span style={mutedTextStyle}>
              {row.serviceProduct ||
                row.tenantServiceProgramId ||
                row.sourcePlatform ||
                row.driverGroup ||
                t("fleetPartners.rules.allScope")}
            </span>
          </div>
        ),
      },
      {
        h: t("fleetPartners.rules.col.formula"),
        r: (row: RuleTableRow) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{t(formulaKey(row.formula))}</span>
            <span style={mutedTextStyle}>
              {row.rateBps !== undefined
                ? `${row.rateBps} bps`
                : row.fixedAmountMinor !== undefined
                  ? formatMoneyMinor(locale, row.fixedAmountMinor)
                  : t("common.noValues")}
            </span>
          </div>
        ),
      },
      {
        h: t("fleetPartners.rules.col.effective"),
        r: (row: RuleTableRow) =>
          `${row.effectiveFrom || t("common.noValues")} → ${row.effectiveUntil || t("fleetPartners.openEnded")}`,
      },
    ],
    [locale, t],
  );

  const statementColumns: CanvasTableColumn<StatementTableRow>[] = useMemo(
    () => [
      {
        h: t("fleetPartners.statements.col.statementId"),
        r: (row: StatementTableRow) => row.statementId,
      },
      {
        h: t("fleetPartners.statements.col.period"),
        r: (row: StatementTableRow) => row.periodMonth,
      },
      {
        h: t("fleetPartners.statements.col.gross"),
        r: (row: StatementTableRow) =>
          formatMoneyMinor(locale, row.grossAmountMinor, row.currency),
      },
      {
        h: t("fleetPartners.statements.col.share"),
        r: (row: StatementTableRow) =>
          formatMoneyMinor(locale, row.partnerShareMinor, row.currency),
      },
      {
        h: t("fleetPartners.statements.col.status"),
        r: (row: StatementTableRow) => (
          <CanvasPill tone={payoutTone(row.payoutStatus)} dot>
            {row.payoutStatus || t("common.noValues")}
          </CanvasPill>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <div style={pageBodyStyle}>
      <CanvasPageHeader
        title={
          partner ? (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              <span>{partner.displayName || partner.legalName}</span>
              <CanvasPill tone={statusTone(partner.active)} dot>
                {partner.active
                  ? t("fleetPartners.status.active")
                  : t("fleetPartners.status.inactive")}
              </CanvasPill>
            </span>
          ) : (
            t("fleetPartners.detail.title")
          )
        }
        subtitle={t("fleetPartners.detail.subtitle", { id: fleetPartnerId })}
        actions={
          <>
            <Link href="/fleet-partners" style={{ textDecoration: "none" }}>
              <CanvasBtn>{t("fleetPartners.backToList")}</CanvasBtn>
            </Link>
            <CanvasBtn onClick={() => void loadDetail()}>
              {t("common.refresh")}
            </CanvasBtn>
            <CanvasBtn
              variant="primary"
              disabled={saving || !partnerForm}
              onClick={() => void handleSavePartner()}
            >
              {saving ? t("common.saving") : t("fleetPartners.savePartner")}
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

      {loading || !partner || !partnerForm ? (
        <CanvasCard>{t("fleetPartners.detail.loading")}</CanvasCard>
      ) : (
        <>
          <div style={heroStyle}>
            <CanvasCard
              title={t("fleetPartners.partnerProfileTitle")}
              subtitle={t("fleetPartners.partnerProfileSubtitle")}
            >
              <div style={formGridStyle}>
                <CanvasField label={t("fleetPartners.form.legalName")}>
                  <input
                    value={partnerForm.legalName}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, legalName: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.displayName")}>
                  <input
                    value={partnerForm.displayName}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, displayName: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField
                  label={t("fleetPartners.form.businessRegistrationNo")}
                >
                  <input
                    value={partnerForm.businessRegistrationNo}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? {
                              ...current,
                              businessRegistrationNo: event.target.value,
                            }
                          : current,
                      )
                    }
                    style={inputStyle(true)}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.contactName")}>
                  <input
                    value={partnerForm.contactName}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, contactName: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.contactPhone")}>
                  <input
                    value={partnerForm.contactPhone}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? { ...current, contactPhone: event.target.value }
                          : current,
                      )
                    }
                    style={inputStyle(true)}
                  />
                </CanvasField>
                <CanvasField label={t("fleetPartners.form.partnershipType")}>
                  <select
                    value={partnerForm.partnershipType}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? {
                              ...current,
                              partnershipType: event.target
                                .value as FleetPartnerRecord["partnershipType"],
                            }
                          : current,
                      )
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
                    value={String(partnerForm.active)}
                    onChange={(event) =>
                      setPartnerForm((current) =>
                        current
                          ? {
                              ...current,
                              active: event.target.value === "true",
                            }
                          : current,
                      )
                    }
                    style={inputStyle()}
                  >
                    <option value="true">{t("common.yes")}</option>
                    <option value="false">{t("common.no")}</option>
                  </select>
                </CanvasField>
              </div>
            </CanvasCard>

            <CanvasCard
              title={t("fleetPartners.snapshotTitle")}
              subtitle={t("fleetPartners.snapshotSubtitle")}
            >
              <CanvasDL
                cols={1}
                items={[
                  {
                    k: t("fleetPartners.snapshot.partnerId"),
                    v: partner.fleetPartnerId,
                    mono: true,
                  },
                  {
                    k: t("fleetPartners.snapshot.status"),
                    v: partner.active
                      ? t("fleetPartners.status.active")
                      : t("fleetPartners.status.inactive"),
                  },
                  {
                    k: t("fleetPartners.snapshot.createdAt"),
                    v: partner.createdAt
                      ? formatDateTime(partner.createdAt)
                      : t("common.noValues"),
                  },
                  {
                    k: t("fleetPartners.snapshot.updatedAt"),
                    v: partner.updatedAt
                      ? formatDateTime(partner.updatedAt)
                      : t("common.noValues"),
                  },
                  {
                    k: t("fleetPartners.snapshot.affiliations"),
                    v: String(drivers.length),
                    mono: true,
                  },
                  {
                    k: t("fleetPartners.snapshot.rules"),
                    v: String(rules.length),
                    mono: true,
                  },
                  {
                    k: t("fleetPartners.snapshot.statements"),
                    v: String(statements.length),
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </div>

          <CanvasCard
            title={t("fleetPartners.drivers.title")}
            subtitle={t("fleetPartners.drivers.subtitle")}
          >
            <div style={formGridStyle}>
              <CanvasField label={t("fleetPartners.drivers.form.driverId")}>
                <input
                  value={affiliationForm.driverId}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      driverId: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.drivers.form.affiliationType")}
              >
                <select
                  value={affiliationForm.affiliationType}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      affiliationType: event.target
                        .value as DriverFleetAffiliationRecord["affiliationType"],
                    }))
                  }
                  style={inputStyle()}
                >
                  {AFFILIATION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(affiliationTypeKey(value))}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.drivers.form.effectiveFrom")}
              >
                <input
                  type="date"
                  value={affiliationForm.effectiveFrom}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.drivers.form.effectiveUntil")}
              >
                <input
                  type="date"
                  value={affiliationForm.effectiveUntil}
                  onChange={(event) =>
                    setAffiliationForm((current) => ({
                      ...current,
                      effectiveUntil: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
            </div>
            <div style={actionRowStyle}>
              <CanvasBtn
                variant="primary"
                disabled={creatingAffiliation}
                onClick={() => void handleCreateAffiliation()}
              >
                {creatingAffiliation
                  ? t("common.creating")
                  : t("fleetPartners.drivers.createAction")}
              </CanvasBtn>
            </div>
            <div style={{ marginTop: 16 }}>
              {drivers.length === 0 ? (
                <div>{t("fleetPartners.drivers.empty")}</div>
              ) : (
                <CanvasTable
                  columns={driverColumns}
                  rows={drivers as DriverTableRow[]}
                />
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            title={t("fleetPartners.rules.title")}
            subtitle={t("fleetPartners.rules.subtitle")}
          >
            <div style={formGridStyle}>
              <CanvasField label={t("fleetPartners.rules.form.appliesTo")}>
                <select
                  value={ruleForm.appliesTo}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      appliesTo: event.target
                        .value as FleetPartnerRevenueShareRuleRecord["appliesTo"],
                    }))
                  }
                  style={inputStyle()}
                >
                  {RULE_APPLIES_TO_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {t(appliesToKey(value))}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.formula")}>
                <select
                  value={ruleForm.formula}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      formula: event.target
                        .value as FleetPartnerRevenueShareRuleRecord["formula"],
                    }))
                  }
                  style={inputStyle()}
                >
                  {RULE_FORMULAS.map((value) => (
                    <option key={value} value={value}>
                      {t(formulaKey(value))}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.serviceProduct")}>
                <input
                  value={ruleForm.serviceProduct}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      serviceProduct: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.rules.form.tenantServiceProgramId")}
              >
                <input
                  value={ruleForm.tenantServiceProgramId}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      tenantServiceProgramId: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.sourcePlatform")}>
                <input
                  value={ruleForm.sourcePlatform}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      sourcePlatform: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.driverGroup")}>
                <input
                  value={ruleForm.driverGroup}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      driverGroup: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.rateBps")}>
                <input
                  value={ruleForm.rateBps}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      rateBps: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField
                label={t("fleetPartners.rules.form.fixedAmountMinor")}
              >
                <input
                  value={ruleForm.fixedAmountMinor}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      fixedAmountMinor: event.target.value,
                    }))
                  }
                  style={inputStyle(true)}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.effectiveFrom")}>
                <input
                  type="date"
                  value={ruleForm.effectiveFrom}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
              <CanvasField label={t("fleetPartners.rules.form.effectiveUntil")}>
                <input
                  type="date"
                  value={ruleForm.effectiveUntil}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      effectiveUntil: event.target.value,
                    }))
                  }
                  style={inputStyle()}
                />
              </CanvasField>
            </div>
            <div style={actionRowStyle}>
              <CanvasBtn
                variant="primary"
                disabled={creatingRule}
                onClick={() => void handleCreateRule()}
              >
                {creatingRule
                  ? t("common.creating")
                  : t("fleetPartners.rules.createAction")}
              </CanvasBtn>
            </div>
            <div style={{ marginTop: 16 }}>
              {rules.length === 0 ? (
                <div>{t("fleetPartners.rules.empty")}</div>
              ) : (
                <CanvasTable
                  columns={ruleColumns}
                  rows={rules as RuleTableRow[]}
                />
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            title={t("fleetPartners.statements.title")}
            subtitle={t("fleetPartners.statements.subtitle")}
          >
            {statements.length === 0 ? (
              <div>{t("fleetPartners.statements.empty")}</div>
            ) : (
              <CanvasTable
                columns={statementColumns}
                rows={statements as StatementTableRow[]}
              />
            )}
          </CanvasCard>
        </>
      )}
    </div>
  );
}

const mutedTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 16,
};

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
