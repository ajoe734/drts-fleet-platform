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
          This is the PBK-UI-001 happy-path landing for tenant{" "}
          <code>{tenantSlug}</code>. The CTBC reference funnel and other screens
          land in PBK-UI-003. Authority-aware brand layering lands in
          PBK-UI-002.
        </p>
      </header>
    </section>
  );
}
