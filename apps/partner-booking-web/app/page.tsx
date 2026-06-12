import Link from "next/link";
import { PartnerShellControls } from "@/components/shell/partner-shell-controls";
import { getPartnerChromeVars, listKnownBrands } from "@/lib/brand";
import {
  isCardAirportIssuerBrand,
  isPartnerProgramSurfaceBrand,
} from "@/lib/program-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

function getRootBrandDisplay(
  brand: ReturnType<typeof listKnownBrands>[number],
  locale: Locale,
) {
  if (locale === "zh") {
    return {
      displayName: brand.displayName,
      bankName: brand.bankName,
      programName: brand.programName,
    };
  }

  const bankName =
    brand.code === "CTBC"
      ? "CTBC Bank"
      : brand.code === "FUBON"
        ? "Fubon Insurance"
        : brand.code === "LION"
          ? "Lion Travel"
          : brand.bankName;
  const programName =
    brand.code === "FUBON"
      ? "Insurance replacement mobility"
      : brand.code === "LION"
        ? "Travel agency group transfer"
        : "Credit-card airport transfer";

  return {
    displayName: brand.displayName.replace("中信銀行", "CTBC Bank"),
    bankName,
    programName,
  };
}

export default async function RootIndex() {
  const locale = await getServerLocale();
  const brands = listKnownBrands();
  return (
    <main
      className="min-h-dvh bg-[color:var(--pbk-bg)] text-[color:var(--pbk-fg)]"
      style={getPartnerChromeVars()}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--pbk-muted)]">
              {t("root.eyebrow", undefined, locale)}
            </span>
            <PartnerShellControls />
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-[color:var(--pbk-fg)]">
            {t("root.title", undefined, locale)}
          </h1>
          <p className="text-sm leading-6 text-[color:var(--pbk-muted)]">
            {t("root.description", undefined, locale)}
          </p>
        </header>

        <section className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[color:var(--pbk-fg)]">
            {t("root.knownTenants", undefined, locale)}
          </h2>
          <ul className="mt-4 grid gap-3">
            {brands.map((brand) => (
              <li
                key={brand.code}
                className="rounded-xl border border-[color:var(--pbk-panel-border)] p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--pbk-fg)]">
                      {getRootBrandDisplay(brand, locale).displayName}
                    </div>
                    <div className="text-xs text-[color:var(--pbk-muted)]">
                      {getRootBrandDisplay(brand, locale).bankName} ·{" "}
                      {getRootBrandDisplay(brand, locale).programName} ·{" "}
                      {brand.hotline.phone}
                    </div>
                  </div>
                  <Link
                    href={`/${brand.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--pbk-panel-border)] px-4 py-2 text-sm font-medium text-[color:var(--pbk-accent)] hover:bg-[color:var(--pbk-accent-soft)]"
                  >
                    {t("root.openTenant", { slug: brand.slug }, locale)}
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/${brand.slug}`}
                    className="inline-flex items-center rounded-lg bg-[color:var(--pbk-accent-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--pbk-accent)]"
                  >
                    {t("root.surface.website", undefined, locale)}
                  </Link>
                  {isPartnerProgramSurfaceBrand(brand) ? (
                    <Link
                      href={`/${brand.slug}/program/site`}
                      className="inline-flex items-center rounded-lg bg-[color:var(--pbk-accent-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--pbk-accent)]"
                    >
                      {t("root.surface.funnel", undefined, locale)}
                    </Link>
                  ) : null}
                  {isCardAirportIssuerBrand(brand) ? (
                    <Link
                      href={`/${brand.slug}/program/embed`}
                      className="inline-flex items-center rounded-lg bg-[color:var(--pbk-accent-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--pbk-accent)]"
                    >
                      {t("root.surface.embed", undefined, locale)}
                    </Link>
                  ) : null}
                  {isPartnerProgramSurfaceBrand(brand) ? (
                    <Link
                      href={`/${brand.slug}/program`}
                      className="inline-flex items-center rounded-lg border border-[color:var(--pbk-panel-border)] px-3 py-2 text-xs font-semibold text-[color:var(--pbk-muted)]"
                    >
                      {t("root.surface.selector", undefined, locale)}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
