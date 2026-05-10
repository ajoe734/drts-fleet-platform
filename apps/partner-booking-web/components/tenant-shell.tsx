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
          background: brand.accent.bg,
          borderColor: brand.accent.border,
          color: brand.accent.fg,
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">
          Partner Booking
        </span>
        <strong className="text-lg">{brand.displayName}</strong>
      </header>

      <main className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-6 shadow-sm">
        {children}
      </main>
    </div>
  );
}
