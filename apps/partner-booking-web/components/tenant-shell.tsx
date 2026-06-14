import type { ReactNode } from "react";
import { getPartnerChromeVars, type PartnerBrand } from "@/lib/brand";
import type { Locale } from "@/lib/translations";
import {
  LocalizedText,
  PartnerShellControls,
} from "@/components/shell/partner-shell-controls";

type TenantShellProps = {
  brand: PartnerBrand;
  children: ReactNode;
  locale?: Locale;
};

const ENGLISH_BRAND_NAMES = {
  CTBC: { displayName: "CTBC World Elite", issuerLabel: "CTBC Bank" },
  CATHAY: {
    displayName: "Cathay CUBE World",
    issuerLabel: "Cathay United Bank",
  },
  TAISHIN: { displayName: "Taishin Infinite", issuerLabel: "Taishin Bank" },
  DBS: { displayName: "DBS Insignia", issuerLabel: "DBS Bank" },
  GRAND: { displayName: "Grand Concierge", issuerLabel: "Grand Hotel" },
  FUBON: {
    displayName: "Fubon Claim Mobility",
    issuerLabel: "Fubon Insurance",
  },
  LION: { displayName: "Lion Group Transfer", issuerLabel: "Lion Travel" },
} as const;

function getBrandDisplay(brand: PartnerBrand, locale: Locale) {
  if (locale === "zh") {
    return {
      displayName: brand.displayName,
      issuerLabel: brand.cardArt.issuerLabel,
      programLabel: brand.cardArt.programLabel,
      networkLabel: brand.cardArt.networkLabel,
      hotlineLabel: brand.hotline.label,
      hotlineNote: brand.hotline.note,
    };
  }

  const names = ENGLISH_BRAND_NAMES[brand.code];
  const programLabel =
    brand.code === "FUBON"
      ? "Insurance replacement mobility"
      : brand.code === "LION"
        ? "Travel agency group transfer"
        : brand.code === "GRAND"
          ? "Concierge booking"
          : "Credit-card airport transfer";

  return {
    displayName: names.displayName,
    issuerLabel: names.issuerLabel,
    programLabel,
    networkLabel: brand.cardArt.networkLabel,
    hotlineLabel: "24-hour concierge hotline",
    hotlineNote: "You will be connected to the partner support desk.",
  };
}

export function TenantShell({
  brand,
  children,
  locale = "zh",
}: TenantShellProps) {
  const display = getBrandDisplay(brand, locale);
  return (
    <div
      className="min-h-dvh bg-[color:var(--pbk-bg)] text-[color:var(--pbk-fg)]"
      style={getPartnerChromeVars(brand)}
    >
      <div className="mx-auto box-border flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-12">
        <header
          className="flex flex-col gap-2 rounded-xl border px-5 py-4"
          style={{
            background: brand.surface.bg,
            borderColor: brand.surface.border,
            color: brand.surface.fg,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">
              <LocalizedText
                labelKey="shell.brand"
                fallback="Partner Booking"
              />
            </span>
            <PartnerShellControls />
          </div>
          <strong className="text-lg">{display.displayName}</strong>
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
                <span className="font-semibold">{display.issuerLabel}</span>
              </div>
              <div className="mt-3 text-sm font-semibold">
                {display.programLabel}
              </div>
              <div className="mt-1 text-[11px] opacity-80">
                {display.networkLabel} · •••• {brand.cardArt.lastFour}
              </div>
            </div>

            <div className="flex min-w-48 flex-1 flex-col gap-1 rounded-xl border border-current/10 bg-white/55 px-3 py-3">
              <span className="font-semibold">
                {display.hotlineLabel || (
                  <LocalizedText labelKey="shell.hotline" fallback="Hotline" />
                )}
              </span>
              <span className="font-mono text-sm">{brand.hotline.phone}</span>
              <span className="text-[11px] opacity-80">
                {display.hotlineNote}
              </span>
            </div>
          </div>
        </header>

        <main className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-6 shadow-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
