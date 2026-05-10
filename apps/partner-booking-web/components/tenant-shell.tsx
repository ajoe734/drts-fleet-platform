import type { ReactNode } from "react";
import type { PartnerBrand } from "@/lib/brand";

type TenantShellProps = {
  brand: PartnerBrand;
  children: ReactNode;
};

export function TenantShell({ brand, children }: TenantShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header
        className="flex flex-col gap-2 rounded-xl border px-5 py-4"
        style={{
          background: brand.surface.bg,
          borderColor: brand.surface.border,
          color: brand.surface.fg,
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">
          Partner Booking
        </span>
        <strong className="text-lg">{brand.displayName}</strong>
        <div className="mt-3 flex flex-wrap items-start gap-3 text-xs text-[color:inherit]">
          <div
            className="min-w-44 rounded-xl px-3 py-3 text-white shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${brand.cardArt.gradientFrom} 0%, ${brand.cardArt.gradientTo} 72%)`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                style={{
                  background: brand.cardArt.badgeBackground,
                  color: brand.cardArt.badgeForeground,
                }}
              >
                {brand.cardArt.badgeText}
              </span>
              <span className="font-semibold">{brand.cardArt.issuerLabel}</span>
            </div>
            <div className="mt-3 text-sm font-semibold">
              {brand.cardArt.programLabel}
            </div>
            <div className="mt-1 text-[11px] opacity-80">
              {brand.cardArt.networkLabel} · •••• {brand.cardArt.lastFour}
            </div>
          </div>

          <div className="flex min-w-48 flex-1 flex-col gap-1 rounded-xl border border-current/10 bg-white/55 px-3 py-3">
            <span className="font-semibold">{brand.hotline.label}</span>
            <span className="font-mono text-sm">{brand.hotline.phone}</span>
            <span className="text-[11px] opacity-80">{brand.hotline.note}</span>
          </div>
        </div>
      </header>

      <main className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-6 shadow-sm">
        {children}
      </main>
    </div>
  );
}
