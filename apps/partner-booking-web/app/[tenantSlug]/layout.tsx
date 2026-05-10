import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantShell } from "@/components/tenant-shell";
import { getBrandForSlug } from "@/lib/brand";

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
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    return { title: "Partner Booking" };
  }
  return {
    title: `${brand.displayName} · Partner Booking`,
    description: brand.tagline,
  };
}

export default async function TenantLayout({ children, params }: LayoutProps) {
  const { tenantSlug } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  return <TenantShell brand={brand}>{children}</TenantShell>;
}
