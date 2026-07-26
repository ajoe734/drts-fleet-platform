import { notFound } from "next/navigation";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import {
  ProgramBookingFlow,
  listProgramScreensForTheme,
  resolveProgramScreenSegment,
} from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

import type { BookingRecord } from "@drts/contracts";
import { getEmbedPartnerBooking } from "@/lib/api-client";

type PageProps = {
  params: Promise<{ tenantSlug: string; screen: string }>;
  searchParams?: Promise<{
    bookingId?: string | string[];
    orderId?: string | string[];
  }>;
};

function resolveEmbedScreen(segment: string) {
  return (
    resolveProgramScreenSegment(segment) ??
    resolveProgramScreenSegment(`embed-${segment}`)
  );
}

export default async function ProgramEmbedScreenPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug, screen: screenSegment } = await params;
  const resolvedSearchParams = await searchParams;
  const rawBookingId = Array.isArray(resolvedSearchParams?.bookingId)
    ? resolvedSearchParams.bookingId[0]
    : resolvedSearchParams?.bookingId;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);
  const screen = resolveEmbedScreen(screenSegment);

  if (
    theme.kind !== "card" ||
    !screen ||
    !listProgramScreensForTheme(theme, "embed").some(
      (visibleScreen) => visibleScreen.id === screen,
    )
  ) {
    notFound();
  }

  let booking: BookingRecord | null = null;
  if (rawBookingId) {
    try {
      booking = await getEmbedPartnerBooking(tenantSlug, rawBookingId);
    } catch {
      booking = null;
    }
  }

  return (
    <ProgramBookingFlow
      theme={theme}
      screen={screen}
      basePath={`/${tenantSlug}/program/embed`}
      locale={locale}
      surface="embed"
      booking={booking}
    />
  );
}
