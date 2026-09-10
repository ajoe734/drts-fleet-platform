import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /host is the Host (individual vehicle owner) entry point. The only Host
// surface is the owned-vehicle list (host-screen-contract.md: HOST_NAV has a
// single entry, "自有車輛"), so the bare entry redirects straight to it
// rather than rendering a separate landing page.
export default function HostIndexPage() {
  redirect("/host/vehicles");
}
