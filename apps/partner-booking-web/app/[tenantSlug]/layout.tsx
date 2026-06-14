import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantShell } from "@/components/tenant-shell";
import type { PartnerBrand } from "@/lib/brand";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
};

function getTenantMetadataDescription(brand: PartnerBrand, locale: Locale) {
  return locale === "zh"
    ? brand.tagline
    : `${brand.displayName} · ${t("app.description", undefined, locale)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();

  try {
    const { brand } = await getPartnerRouteContext(tenantSlug, {
      allowInactive: true,
    });
    return {
      title: `${brand.displayName} · ${t("app.title", undefined, locale)}`,
      description: getTenantMetadataDescription(brand, locale),
    };
  } catch (error) {
    if (
      error instanceof PartnerAuthorityError &&
      error.code === "PARTNER_ENTRY_NOT_FOUND"
    ) {
      return { title: t("app.title", undefined, locale) };
    }
    throw error;
  }
}

export default async function TenantLayout({ children, params }: LayoutProps) {
  const { tenantSlug } = await params;
  try {
    const { brand } = await getPartnerRouteContext(tenantSlug, {
      allowInactive: true,
    });
    const locale = await getServerLocale();
    return (
      <TenantShell brand={brand} locale={locale}>
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
