import { notFound } from "next/navigation";
import { getBrandForSlug } from "@/lib/brand";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function TenantHomePage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--pbk-muted)]">
          {brand.displayName}
        </span>
        <h1 className="text-3xl font-semibold leading-tight text-[color:var(--pbk-fg)]">
          {brand.tagline}
        </h1>
        <p className="text-sm leading-6 text-[color:var(--pbk-muted)]">
          This white-label route now resolves its partner identity from
          <code>@drts/ui-tokens</code>. The CTBC reference funnel and other
          richer screens still land in PBK-UI-003, but the brand layer is
          already shared for tenant <code>{tenantSlug}</code>.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--pbk-muted)]">
            Program
          </div>
          <div className="mt-2 text-base font-semibold text-[color:var(--pbk-fg)]">
            {brand.cardArt.programLabel}
          </div>
          <div className="mt-1 text-sm text-[color:var(--pbk-muted)]">
            {brand.bankName} · {brand.cardArt.networkLabel}
          </div>
        </article>

        <article className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--pbk-muted)]">
            Support
          </div>
          <div className="mt-2 font-mono text-base text-[color:var(--pbk-fg)]">
            {brand.hotline.phone}
          </div>
          <div className="mt-1 text-sm text-[color:var(--pbk-muted)]">
            {brand.hotline.note}
          </div>
        </article>

        <article className="rounded-xl border border-[color:var(--pbk-panel-border)] bg-[color:var(--pbk-panel)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--pbk-muted)]">
            Entry host
          </div>
          <div className="mt-2 text-base font-semibold text-[color:var(--pbk-fg)]">
            {brand.host}
          </div>
          <div className="mt-1 text-sm text-[color:var(--pbk-muted)]">
            Tenant code {brand.tenantCode}
          </div>
        </article>
      </section>
    </section>
  );
}
