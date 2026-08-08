import Link from "next/link";
import { REALM_COLORS } from "@drts/ui-tokens";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  getBankTenantName,
  resolveBankDemoTenant,
  resolveLocale,
} from "@/lib/demo-tenants";
import { loadBankAuditData } from "@/lib/bank-dev-read-models";
import { bankConsoleHref, getBankConsoleSession } from "@/lib/session";
import { tenantDisplayText } from "@/lib/tenant-display";
import { t, type Locale, type TranslationKey } from "@/lib/translations";

type SearchParamValue = string | string[] | undefined;

type AuditEventType =
  | "eligibility_decision"
  | "dispatch_assignment"
  | "settlement_close"
  | "access";

type AuditActorCode =
  | "bank_ops_viewer"
  | "bank_program_admin"
  | "bank_finance"
  | "system";

type AuditReasonCode =
  | "ELIGIBLE_APPROVED"
  | "MANUAL_REVIEW_REQUIRED"
  | "DRIVER_ASSIGNED"
  | "STATEMENT_PUBLISHED"
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED";

type AuditLinkKind = "booking" | "statement";

type AuditRecord = {
  id: string;
  timestamp: string;
  period: string;
  type: AuditEventType;
  actor: AuditActorCode;
  actorLabel: string;
  actorHandle: string;
  subjectMasked: string;
  reasonCode: AuditReasonCode;
  summary: string;
  relatedEntity: {
    kind: AuditLinkKind;
    href: string;
    label: string;
  };
};

type AuditFilterState = {
  type: string;
  actor: string;
  period: string;
  subject: string;
};

// Cross-actor realm coloring (design-canvas BK_Audit ActorRealmChip): the
// system eligibility/gateway actor reads on the `system` plane; every issuer
// staff actor sits on the bank's `tenant` plane, matching the console shell.
type AuditRealm = "system" | "tenant";

function resolveAuditRealm(actor: AuditActorCode): AuditRealm {
  return actor === "system" ? "system" : "tenant";
}

function ActorRealmChip({
  realm,
  label,
}: {
  realm: AuditRealm;
  label: string;
}) {
  const colors = REALM_COLORS[realm].dark;

  return (
    <span
      className="audit-realm-chip"
      style={{
        color: colors.fg,
        background: colors.bg,
        borderColor: colors.border,
      }}
    >
      {label}
    </span>
  );
}

const auditTypeOptions: AuditEventType[] = [
  "eligibility_decision",
  "dispatch_assignment",
  "settlement_close",
  "access",
];

const actorOptions: AuditActorCode[] = [
  "bank_ops_viewer",
  "bank_program_admin",
  "bank_finance",
  "system",
];

const auditTypeLabelKeys: Record<AuditEventType, TranslationKey> = {
  eligibility_decision: "audit.type.eligibility_decision",
  dispatch_assignment: "audit.type.dispatch_assignment",
  settlement_close: "audit.type.settlement_close",
  access: "audit.type.access",
};

const auditActorLabelKeys: Record<AuditActorCode, TranslationKey> = {
  bank_ops_viewer: "audit.actor.bank_ops_viewer",
  bank_program_admin: "audit.actor.bank_program_admin",
  bank_finance: "audit.actor.bank_finance",
  system: "audit.actor.system",
};

const auditReasonLabelKeys: Record<AuditReasonCode, TranslationKey> = {
  ELIGIBLE_APPROVED: "audit.reason.ELIGIBLE_APPROVED",
  MANUAL_REVIEW_REQUIRED: "audit.reason.MANUAL_REVIEW_REQUIRED",
  DRIVER_ASSIGNED: "audit.reason.DRIVER_ASSIGNED",
  STATEMENT_PUBLISHED: "audit.reason.STATEMENT_PUBLISHED",
  ACCESS_GRANTED: "audit.reason.ACCESS_GRANTED",
  ACCESS_DENIED: "audit.reason.ACCESS_DENIED",
};

function getSingleQueryValue(value: SearchParamValue) {
  return Array.isArray(value) ? (value.find(Boolean) ?? "") : (value ?? "");
}

function parseFilters(
  params: Record<string, SearchParamValue>,
): AuditFilterState {
  return {
    type: getSingleQueryValue(params.type).trim(),
    actor: getSingleQueryValue(params.actor).trim(),
    period: getSingleQueryValue(params.period).trim(),
    subject: getSingleQueryValue(params.subject).trim(),
  };
}

function isMaskedReference(value: string) {
  return ["****", "***", "masked"].some((token) => value.includes(token));
}

function getTypeLabel(type: AuditEventType, locale: Locale) {
  return t(auditTypeLabelKeys[type], locale);
}

function getReasonLabel(reasonCode: AuditReasonCode, locale: Locale) {
  return t(auditReasonLabelKeys[reasonCode], locale);
}

function getLinkLabel(kind: AuditLinkKind, value: string, locale: Locale) {
  const key =
    kind === "statement" ? "audit.related.statement" : "audit.related.booking";
  return `${t(key, locale)} ${value}`;
}

function filterRecords(records: AuditRecord[], filters: AuditFilterState) {
  const subjectNeedle = filters.subject.toLowerCase();

  return records.filter((record) => {
    if (filters.type && record.type !== filters.type) {
      return false;
    }

    if (filters.actor && record.actor !== filters.actor) {
      return false;
    }

    if (filters.period && record.period !== filters.period) {
      return false;
    }

    if (!subjectNeedle) {
      return true;
    }

    const searchable = [
      record.subjectMasked,
      record.relatedEntity.label,
      record.summary,
      record.reasonCode,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(subjectNeedle);
  });
}

function getPeriodOptions(records: AuditRecord[]) {
  return records.reduce<string[]>((options, record) => {
    if (!options.includes(record.period)) {
      options.push(record.period);
    }

    return options;
  }, []);
}

function getSummaryCount(records: AuditRecord[], type: AuditEventType) {
  return records.filter((record) => record.type === type).length;
}

type AuditPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const session = getBankConsoleSession(
    tenant,
    locale,
    resolvedSearchParams.role,
  );
  const auditData = await loadBankAuditData(tenant.tenantId, session.role);
  const issuerBrand = tenant.template.tokens.light;
  const filters = parseFilters(resolvedSearchParams);
  const records = filterRecords(
    auditData.data.records as AuditRecord[],
    filters,
  );
  const periods = getPeriodOptions(auditData.data.records as AuditRecord[]);
  const allMasked = records.every((record) =>
    isMaskedReference(record.subjectMasked),
  );

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("audit.eyebrow", locale)}
        title={
          <span className="audit-title-wrap">
            <span>{t("audit.title", locale)}</span>
            <span className="status-chip">{t("audit.readOnly", locale)}</span>
            <span
              className="audit-issuer-badge"
              style={{
                borderColor: issuerBrand.surface.border,
                background: issuerBrand.theme.accentSoft,
                color: issuerBrand.primaryDark,
              }}
            >
              {getBankTenantName(tenant, locale)}
            </span>
          </span>
        }
        description={t("audit.description", locale)}
      />

      <div className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("audit.summary.eligibilityKicker", locale)}
          title={`${getSummaryCount(records, "eligibility_decision")} ${t("audit.summary.events", locale)}`}
          description={t("audit.summary.eligibilityBody", locale)}
        />
        <SurfaceCard
          kicker={t("audit.summary.dispatchKicker", locale)}
          title={`${getSummaryCount(records, "dispatch_assignment")} ${t("audit.summary.events", locale)}`}
          description={t("audit.summary.dispatchBody", locale)}
        />
        <SurfaceCard
          kicker={t("audit.summary.settlementKicker", locale)}
          title={`${getSummaryCount(records, "settlement_close")} ${t("audit.summary.events", locale)}`}
          description={t("audit.summary.settlementBody", locale)}
        />
      </div>

      <CalloutPanel
        title={t("audit.callout.title", locale)}
        description={
          allMasked
            ? t("audit.callout.bodyMasked", locale)
            : t("audit.callout.bodyFallback", locale)
        }
      />
      {auditData.degradedMessage ? (
        <section className="surface-card">
          <p>{auditData.degradedMessage}</p>
        </section>
      ) : null}

      <section className="audit-panel">
        <div className="audit-panel-head">
          <div>
            <span className="surface-kicker">
              {t("audit.filters.kicker", locale)}
            </span>
            <h2>{t("audit.filters.title", locale)}</h2>
            <p>{t("audit.filters.description", locale)}</p>
          </div>
          <Link
            className="audit-reset-link"
            href={bankConsoleHref("/audit", tenant, locale, session.role)}
          >
            {t("audit.filters.reset", locale)}
          </Link>
        </div>

        <form className="audit-filter-grid" method="get">
          <input name="bank" type="hidden" value={tenant.code} />
          <input name="locale" type="hidden" value={locale} />
          <input name="role" type="hidden" value={session.role} />
          <label className="audit-filter-field">
            <span>{t("audit.filters.type", locale)}</span>
            <select name="type" defaultValue={filters.type}>
              <option value="">{t("audit.filters.allTypes", locale)}</option>
              {auditTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {getTypeLabel(option, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="audit-filter-field">
            <span>{t("audit.filters.actor", locale)}</span>
            <select name="actor" defaultValue={filters.actor}>
              <option value="">{t("audit.filters.allActors", locale)}</option>
              {actorOptions.map((option) => (
                <option key={option} value={option}>
                  {t(auditActorLabelKeys[option], locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="audit-filter-field">
            <span>{t("audit.filters.period", locale)}</span>
            <select name="period" defaultValue={filters.period}>
              <option value="">{t("audit.filters.allPeriods", locale)}</option>
              {periods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </label>

          <label className="audit-filter-field">
            <span>{t("audit.filters.subject", locale)}</span>
            <input
              defaultValue={filters.subject}
              name="subject"
              placeholder={t("audit.filters.subjectPlaceholder", locale)}
              type="search"
            />
          </label>

          <div className="audit-filter-actions">
            <button className="audit-apply-button" type="submit">
              {t("audit.filters.apply", locale)}
            </button>
          </div>
        </form>
      </section>

      <section className="audit-panel">
        <div className="audit-panel-head">
          <div>
            <span className="surface-kicker">
              {t("audit.list.kicker", locale)}
            </span>
            <h2>{t("audit.list.title", locale, { count: records.length })}</h2>
            <p>{t("audit.list.description", locale)}</p>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="audit-empty-state">
            <strong>{t("audit.empty.title", locale)}</strong>
            <p>{t("audit.empty.body", locale)}</p>
          </div>
        ) : (
          <div className="audit-list">
            {records.map((record) => (
              <article className="audit-row" key={record.id}>
                <div className="audit-row-main">
                  <div className="audit-row-topline">
                    <time className="audit-time" dateTime={record.timestamp}>
                      {record.timestamp.replace("T", " ").slice(0, 16)}
                    </time>
                    <span className="audit-type-pill">
                      {getTypeLabel(record.type, locale)}
                    </span>
                    <span className="audit-reason-pill">
                      {getReasonLabel(record.reasonCode, locale)}
                    </span>
                  </div>

                  <div className="audit-row-grid">
                    <div>
                      <span className="audit-label">
                        {t("audit.column.actor", locale)}
                      </span>
                      <ActorRealmChip
                        realm={resolveAuditRealm(record.actor)}
                        label={t(auditActorLabelKeys[record.actor], locale)}
                      />
                      <p>{tenantDisplayText(record.actorHandle, tenant)}</p>
                    </div>
                    <div>
                      <span className="audit-label">
                        {t("audit.column.subject", locale)}
                      </span>
                      <strong>
                        {tenantDisplayText(record.subjectMasked, tenant)}
                      </strong>
                      <p>
                        {isMaskedReference(record.subjectMasked)
                          ? t("audit.mask.ok", locale)
                          : t("audit.mask.needsReview", locale)}
                      </p>
                    </div>
                    <div>
                      <span className="audit-label">
                        {t("audit.column.reasonCode", locale)}
                      </span>
                      <strong>{record.reasonCode}</strong>
                      <p>{tenantDisplayText(record.summary, tenant)}</p>
                    </div>
                    <div>
                      <span className="audit-label">
                        {t("audit.column.related", locale)}
                      </span>
                      <Link
                        className="audit-entity-link"
                        href={bankConsoleHref(
                          record.relatedEntity.href,
                          tenant,
                          locale,
                          session.role,
                        )}
                      >
                        {getLinkLabel(
                          record.relatedEntity.kind,
                          record.relatedEntity.label,
                          locale,
                        )}
                      </Link>
                      <p>{record.id}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
