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
            合作夥伴預約 · 白牌入口
          </span>
          <h1 className="text-3xl font-semibold leading-tight text-[color:var(--pbk-fg)]">
            選擇租戶入口以進入合作夥伴預約流程。
          </h1>
          <p className="text-sm leading-6 text-[color:var(--pbk-muted)]">
            這個服務採白牌架構，每個功能頁面都會依租戶入口切換品牌與權限。
            根目錄只用來協助內部流量選擇要進入的租戶入口。
          </p>
        </header>

        <section className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[color:var(--pbk-fg)]">
            已知參考租戶
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
                    開啟 /{brand.slug}
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
