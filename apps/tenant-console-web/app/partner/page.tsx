import { redirect } from "next/navigation";
import {
  PARTNER_LOGIN_PATH,
  PARTNER_START_PATH,
  getPartnerSession,
} from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerIndexPage() {
  const session = await getPartnerSession();
  redirect(session ? PARTNER_START_PATH : PARTNER_LOGIN_PATH);
}
