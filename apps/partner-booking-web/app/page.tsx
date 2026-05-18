import Link from "next/link";
import { getPartnerChromeVars, listKnownBrands } from "@/lib/brand";

export default function RootIndex() {
  const brands = listKnownBrands();
  return (
    <main
      className="min-h-screen bg-[color:var(--pbk-bg)] text-[color:var(--pbk-fg)]"
      style={getPartnerChromeVars()}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--pbk-muted)]">
            Partner Booking · White Label
          </span>
          <h1 className="text-3xl font-semibold leading-tight text-[color:var(--pbk-fg)]">
            Pick a tenant slug to enter the partner booking funnel.
          </h1>
          <p className="text-sm leading-6 text-[color:var(--pbk-muted)]">
            This app is white-label by construction. Every functional surface
            lives under <code>/[tenantSlug]/...</code>; the root path only
            exists to direct internal traffic to a tenant entry point during
            PBK-UI-001 / PBK-UI-002 bring-up.
          </p>
        </header>

        <section className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[color:var(--pbk-fg)]">
            Known reference tenants
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
                      {brand.displayName}
                    </div>
                    <div className="text-xs text-[color:var(--pbk-muted)]">
                      {brand.bankName} · {brand.programName} ·{" "}
                      {brand.hotline.phone}
                    </div>
                  </div>
                  <Link
                    href={`/${brand.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--pbk-panel-border)] px-4 py-2 text-sm font-medium text-[color:var(--pbk-accent)] hover:bg-[color:var(--pbk-accent-soft)]"
                  >
                    Open /{brand.slug}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
