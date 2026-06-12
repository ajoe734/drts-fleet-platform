import Link from "next/link";
import { CalloutPanel } from "@/components/page-primitives";
import { PartnerLoginForm } from "@/app/partner/(public)/login/partner-login-form";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function PartnerLoginPage() {
  const locale = await getServerLocale();

  return (
    <div className="partner-login-stack">
      <PartnerLoginForm />

      <CalloutPanel
        title={t("partner.login.callout.title", locale)}
        description={t("partner.login.callout.description", locale)}
      >
        <ul className="panel-list">
          <li>{t("partner.login.callout.entrySlug", locale)}</li>
          <li>{t("partner.login.callout.apiKey", locale)}</li>
          <li>{t("partner.login.callout.boundary", locale)}</li>
        </ul>
      </CalloutPanel>

      <p className="partner-public-link-row">
        <Link className="text-link" href="/">
          {t("partner.login.backHome", locale)}
        </Link>
      </p>
    </div>
  );
}
