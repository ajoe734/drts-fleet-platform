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
  getEnterpriseBookingDraft,
  getEnterpriseReviewChecklist,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function ReviewBookingPage() {
  const locale = await getServerLocale();
  const draft = getEnterpriseBookingDraft(locale);
  const checklist = getEnterpriseReviewChecklist(locale);

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={t("review.title", undefined, locale)}
        subtitle={t("review.subtitle", undefined, locale)}
      />

      <EnterpriseBanner
        tone="warn"
        title={t("review.banner.title", undefined, locale)}
        body={t("review.banner.body", undefined, locale)}
      />

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
        }}
      >
        <EnterpriseCard
          title={t("review.card.summary", undefined, locale)}
          actions={<EnterprisePill tone="accent">{t("review.card.badge", undefined, locale)}</EnterprisePill>}
        >
          <EnterpriseDl
            cols={2}
            items={[
              { k: t("new.field.passenger", undefined, locale), v: draft.passenger },
              { k: t("new.field.bookedBy", undefined, locale), v: draft.bookedBy },
              { k: t("review.summary.pickupDropoff", undefined, locale), v: `${draft.pickup} → ${draft.dropoff}` },
              { k: t("review.summary.time", undefined, locale), v: draft.reservationWindow, mono: true },
              { k: t("review.summary.costCenter", undefined, locale), v: draft.costCenter, mono: true },
              { k: t("review.summary.contact", undefined, locale), v: draft.onsiteContact },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseSection>
          <EnterpriseCard title={t("review.card.approval", undefined, locale)}>
            <EnterpriseDl
              cols={1}
              items={[
                { k: t("review.approval.posture", undefined, locale), v: draft.approval },
                { k: t("review.approval.quotaImpact", undefined, locale), v: draft.quotaImpact },
                { k: t("review.approval.notes", undefined, locale), v: draft.notes },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard title={t("review.card.checklist", undefined, locale)}>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {checklist.map((item) => (
                <li key={item} style={{ color: enterpriseTheme.text, fontSize: 12.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </EnterpriseCard>
        </EnterpriseSection>
      </div>

      <EnterpriseCard title={t("review.card.submit", undefined, locale)}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/bookings/submitted"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "8px 12px",
              borderRadius: 10,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {t("review.submit", undefined, locale)}
          </Link>
          <Link
            href="/bookings/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "8px 12px",
              borderRadius: 10,
              background: enterpriseTheme.surface,
              border: `1px solid ${enterpriseTheme.border}`,
              color: enterpriseTheme.text,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {t("review.back", undefined, locale)}
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
