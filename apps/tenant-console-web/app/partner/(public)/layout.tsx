import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PartnerPublicShell } from "@/components/partner-shell";
import { PARTNER_START_PATH, getPartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerPublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getPartnerSession();
  if (session) {
    redirect(PARTNER_START_PATH);
  }
  return <PartnerPublicShell>{children}</PartnerPublicShell>;
}
