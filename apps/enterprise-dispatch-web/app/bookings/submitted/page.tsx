import Link from "next/link";
import {
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  entBtnStyle,
} from "@/components/ent-kit";
import { getEnterpriseBookingDraft } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default async function SubmittedBookingPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const draft = getEnterpriseBookingDraft(locale);

  return (
    <div style={{ maxWidth: 620, margin: "10px auto" }}>
      <ECard t={t} accent={t.warn}>
        <div style={{ textAlign: "center", padding: "14px 8px 4px" }}>
          <div
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              margin: "0 auto 16px",
              background: t.warnBg,
              color: t.warn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EIcon name="shield" size={30} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
            {tr("submitted.title")}
          </h1>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 4,
            }}
          >
            <EPill t={t} tone="warn" dot>
              {tr("submitted.subtitle")}
              <span
                style={{
                  fontFamily: t.mono,
                  fontSize: 9.5,
                  marginLeft: 4,
                  opacity: 0.7,
                }}
              >
                awaiting_approval
              </span>
            </EPill>
          </div>
          <p
            style={{
              fontSize: 13.5,
              color: t.muted,
              lineHeight: 1.65,
              maxWidth: 440,
              margin: "10px auto 0",
            }}
          >
            {tr("submitted.banner.body")}
          </p>
        </div>
        <div
          style={{
            marginTop: 18,
            background: t.surfaceLo,
            border: "1px solid " + t.line,
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <ERow t={t} k={tr("submitted.card.summary")} v="EB-7K2E1D" mono />
          <ERow
            t={t}
            k={tr("review.card.summary")}
            v={`${draft.passenger} · ${draft.bookedBy}`}
          />
          <ERow t={t} k={tr("new.field.costCenter")} v="CC-PRD-07" mono />
          <ERow
            t={t}
            k={tr("submitted.summary.estimatedResult")}
            v={
              <EPill t={t} tone="warn" dot>
                {tr("submitted.pending")}
              </EPill>
            }
            last
          />
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <Link
            href="/bookings/submitted"
            style={entBtnStyle(t, { variant: "default", block: true })}
          >
            <EBtnContent icon="refresh">{tr("submitted.refresh")}</EBtnContent>
          </Link>
          <Link
            href="/bookings/EB-7K2E1D"
            style={entBtnStyle(t, { variant: "primary", block: true })}
          >
            <EBtnContent iconR="arrow">{tr("submitted.bookings")}</EBtnContent>
          </Link>
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link
            href="/"
            style={entBtnStyle(t, { variant: "ghost", size: "sm" })}
          >
            <EBtnContent size="sm">{tr("home.cta.backHome")}</EBtnContent>
          </Link>
        </div>
      </ECard>
    </div>
  );
}
