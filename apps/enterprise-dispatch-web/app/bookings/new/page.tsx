import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  getEnterpriseAddresses,
  getEnterpriseBookingDraft,
  getEnterpriseCostCenters,
  getEnterprisePassengers,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

const cardGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.95fr)",
} as const;

const fieldStyle = { display: "grid", gap: 6 } as const;
const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: enterpriseTheme.textMuted,
} as const;
const valueStyle = {
  minHeight: 42,
  padding: "11px 12px",
  borderRadius: 12,
  border: `1px solid ${enterpriseTheme.border}`,
  background: enterpriseTheme.surfaceLo,
  color: enterpriseTheme.text,
  fontSize: 13,
} as const;
const actionLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "8px 12px",
  borderRadius: 10,
  textDecoration: "none",
  fontSize: 12.5,
  fontWeight: 600,
} as const;

export default async function NewBookingPage() {
  const locale = await getServerLocale();
  const draft = getEnterpriseBookingDraft(locale);
  const passengers = getEnterprisePassengers(locale);
  const addresses = getEnterpriseAddresses(locale);
  const costCenters = getEnterpriseCostCenters(locale);

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={t("new.title", undefined, locale)}
        subtitle={t("new.subtitle", undefined, locale)}
        actions={
          <Link
            href="/bookings/review"
            style={{
              ...actionLinkStyle,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
            }}
          >
            {t("new.review", undefined, locale)}
          </Link>
        }
      />

      <EnterpriseBanner
        tone="info"
        title={t("new.banner.title", undefined, locale)}
        body={t("new.banner.body", undefined, locale)}
      />

      <div style={cardGridStyle}>
        <EnterpriseCard title={t("new.card.booking", undefined, locale)}>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              ["new.field.passenger", draft.passenger],
              ["new.field.bookedBy", draft.bookedBy],
              ["new.field.pickup", draft.pickup],
              ["new.field.dropoff", draft.dropoff],
              ["new.field.window", draft.reservationWindow],
              ["new.field.costCenter", draft.costCenter],
            ].map(([key, value]) => (
              <div key={key} style={fieldStyle}>
                <span style={labelStyle}>{t(key as never, undefined, locale)}</span>
                <div style={valueStyle}>{value}</div>
              </div>
            ))}
            <div style={fieldStyle}>
              <span style={labelStyle}>{t("new.field.airport", undefined, locale)}</span>
              <div style={valueStyle}>
                {draft.flight} · {draft.terminal} · {draft.luggage}
              </div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>{t("new.field.contact", undefined, locale)}</span>
              <div style={valueStyle}>{draft.onsiteContact}</div>
            </div>
          </div>
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard
            title={t("new.card.policy", undefined, locale)}
            actions={<EnterprisePill tone="warn">{t("new.card.policyBadge", undefined, locale)}</EnterprisePill>}
          >
            <EnterpriseDl
              cols={1}
              items={[
                { k: t("new.policy.approval", undefined, locale), v: draft.approval },
                { k: t("new.policy.quotaImpact", undefined, locale), v: draft.quotaImpact },
                { k: t("new.policy.vehicle", undefined, locale), v: draft.vehicle },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard title={t("new.card.saved", undefined, locale)}>
            <EnterpriseDl
              cols={1}
              items={[
                { k: t("new.saved.passengers", undefined, locale), v: passengers.join(" / ") },
                { k: t("new.saved.addresses", undefined, locale), v: addresses.slice(0, 2).join(" / ") },
                { k: t("new.saved.costCenters", undefined, locale), v: costCenters.join(" / ") },
              ]}
            />
          </EnterpriseCard>
        </EnterpriseSection>
      </div>

      <EnterpriseCard title={t("new.card.next", undefined, locale)}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/bookings/review"
            style={{
              ...actionLinkStyle,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
            }}
          >
            {t("new.next.review", undefined, locale)}
          </Link>
          <Link
            href="/bookings"
            style={{
              ...actionLinkStyle,
              background: enterpriseTheme.surface,
              border: `1px solid ${enterpriseTheme.border}`,
              color: enterpriseTheme.text,
            }}
          >
            {t("new.next.back", undefined, locale)}
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
