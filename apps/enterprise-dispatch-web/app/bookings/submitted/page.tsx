import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import { getEnterpriseBookingDraft } from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function SubmittedBookingPage() {
  const locale = await getServerLocale();
  const draft = getEnterpriseBookingDraft(locale);

  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader
        title={t("submitted.title", undefined, locale)}
        subtitle={t("submitted.subtitle", undefined, locale)}
        actions={<EnterprisePill tone="warn">{t("submitted.badge", undefined, locale)}</EnterprisePill>}
      />

      <EnterpriseBanner
        tone="info"
        title={t("submitted.banner.title", undefined, locale)}
        body={t("submitted.banner.body", undefined, locale)}
      />

      <EnterpriseCard title={t("submitted.card.summary", undefined, locale)}>
        <EnterpriseDl
          cols={2}
          items={[
            { k: t("new.field.passenger", undefined, locale), v: draft.passenger },
            { k: t("new.field.bookedBy", undefined, locale), v: draft.bookedBy },
            { k: t("new.field.costCenter", undefined, locale), v: draft.costCenter, mono: true },
            {
              k: t("review.approval.notes", undefined, locale),
              v: t("submitted.summary.estimatedResult", undefined, locale),
            },
          ]}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Link
            href="/approval-pending"
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
            {t("submitted.pending", undefined, locale)}
          </Link>
          <Link
            href="/bookings"
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
            {t("submitted.bookings", undefined, locale)}
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
