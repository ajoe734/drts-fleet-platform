import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantShell } from "@/components/tenant-shell";
import { getServerLocale } from "@/lib/server-locale";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug, {
      allowInactive: true,
      allowAuthorityOutage: true,
    });
    return {
      title: `${brand.displayName} · 合作預約`,
      description: brand.tagline,
    };
  } catch (error) {
    if (
      error instanceof PartnerAuthorityError &&
      error.code === "PARTNER_ENTRY_NOT_FOUND"
    ) {
      return { title: "合作預約" };
    }
    throw error;
  }
}

export default async function TenantLayout({ children, params }: LayoutProps) {
  const { tenantSlug } = await params;
  try {
    const { brand, provenance } = await getPartnerRouteContext(tenantSlug, {
      allowInactive: true,
      allowAuthorityOutage: true,
    });
    const locale = await getServerLocale();
    return (
      <TenantShell brand={brand} locale={locale} provenance={provenance}>
        {children}
      </TenantShell>
    );
  } catch (error) {
    if (
      error instanceof PartnerAuthorityError &&
      error.code === "PARTNER_ENTRY_NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }
}
