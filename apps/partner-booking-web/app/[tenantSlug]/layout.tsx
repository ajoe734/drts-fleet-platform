import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantShell } from "@/components/tenant-shell";
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
    });
    return {
      title: `${brand.displayName} · Partner Booking`,
      description: brand.tagline,
    };
  } catch (error) {
    if (
      error instanceof PartnerAuthorityError &&
      error.code === "PARTNER_ENTRY_NOT_FOUND"
    ) {
      return { title: "Partner Booking" };
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
    return <TenantShell brand={brand}>{children}</TenantShell>;
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
