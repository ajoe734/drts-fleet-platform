import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { requirePartnerSession } from "@/lib/partner-session";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const ELIGIBILITY_REQUIRED: Record<string, boolean> = {
  none: false,
  bank_card_inline: true,
  reference_required: true,
};

export default async function PartnerStartPage() {
  const session = await requirePartnerSession();
  const locale = await getServerLocale();
  const eligibilityRequired =
    ELIGIBILITY_REQUIRED[session.partnerEntry.eligibilityMode] ?? true;
  const subtype = session.partnerEntry.businessDispatchSubtype;
  const status = session.partnerEntry.status;
  const isActive = status === "active";

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("partner.start.hero.eyebrow", locale)}
        title={t("partner.start.hero.title", locale, {
          name: session.partnerEntry.displayName,
        })}
        description={t("partner.start.hero.description", locale)}
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("partner.start.entry.kicker", locale)}
          title={t("partner.start.entry.title", locale)}
          description={t("partner.start.entry.description", locale)}
        >
          <dl className="definition-grid">
            <div>
              <dt>{t("partner.start.field.displayName", locale)}</dt>
              <dd>{session.partnerEntry.displayName}</dd>
            </div>
            <div>
              <dt>{t("partner.start.field.slug", locale)}</dt>
              <dd>
                <code>{session.partnerEntry.entrySlug}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.start.field.partnerCode", locale)}</dt>
              <dd>
                <code>{session.partnerEntry.partnerCode}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.start.field.program", locale)}</dt>
              <dd>
                {session.partnerEntry.programCode ? (
                  <code>{session.partnerEntry.programCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("partner.start.field.bank", locale)}</dt>
              <dd>
                {session.partnerEntry.bankCode ? (
                  <code>{session.partnerEntry.bankCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("partner.start.field.subtype", locale)}</dt>
              <dd>
                <code>{subtype}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.start.field.authMode", locale)}</dt>
              <dd>
                <code>{session.partnerEntry.authMode}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.start.field.status", locale)}</dt>
              <dd>
                <span
                  className={`status-badge${isActive ? "" : " is-warning"}`}
                >
                  {status}
                </span>
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("partner.start.eligibility.kicker", locale)}
          title={
            eligibilityRequired
              ? t("partner.start.eligibility.requiredTitle", locale)
              : t("partner.start.eligibility.notRequiredTitle", locale)
          }
          description={
            eligibilityRequired
              ? t("partner.start.eligibility.requiredDescription", locale)
              : t("partner.start.eligibility.notRequiredDescription", locale)
          }
        >
          <p>
            {t("partner.start.eligibility.mode", locale)}:{" "}
            <code>{session.partnerEntry.eligibilityMode}</code>
          </p>
          <div className="link-row">
            <Link className="text-link" href="/partner/eligibility">
              {t("partner.start.eligibility.open", locale)}
            </Link>
            {!eligibilityRequired ? (
              <Link className="text-link" href="/partner/booking/new">
                {t("partner.start.eligibility.skip", locale)}
              </Link>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("partner.start.booking.kicker", locale)}
          title={t("partner.start.booking.title", locale)}
          description={t("partner.start.booking.description", locale)}
        >
          <ul className="panel-list">
            <li>{t("partner.start.booking.subtypeFixed", locale)}</li>
            <li>{t("partner.start.booking.backendOwnsFare", locale)}</li>
            <li>{t("partner.start.booking.negativeStops", locale)}</li>
          </ul>
          <div className="link-row">
            <Link className="text-link" href="/partner/booking/new">
              {t("partner.start.booking.open", locale)}
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("partner.start.boundary.kicker", locale)}
          title={t("partner.start.boundary.title", locale)}
          description={t("partner.start.boundary.description", locale)}
        >
          <ul className="panel-list">
            <li>{t("partner.start.boundary.users", locale)}</li>
            <li>{t("partner.start.boundary.admin", locale)}</li>
            <li>{t("partner.start.boundary.billing", locale)}</li>
            <li>{t("partner.start.boundary.ops", locale)}</li>
          </ul>
        </SurfaceCard>
      </section>

      {!isActive ? (
        <CalloutPanel
          title={t("partner.start.inactive.title", locale)}
          description={t("partner.start.inactive.description", locale, {
            status,
          })}
          tone="warning"
        />
      ) : null}
    </div>
  );
}
