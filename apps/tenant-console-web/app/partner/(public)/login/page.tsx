import Link from "next/link";
import { CalloutPanel } from "@/components/page-primitives";
import { PartnerLoginForm } from "@/app/partner/(public)/login/partner-login-form";

export const dynamic = "force-dynamic";

export default function PartnerLoginPage() {
  return (
    <div className="partner-login-stack">
      <PartnerLoginForm />

      <CalloutPanel
        title="Partner credentials are issued by platform admin"
        description="Each entry has a slug and one or more API keys. Treat the API key as a shared secret — rotate it through platform-admin if it is exposed."
      >
        <ul className="panel-list">
          <li>
            Entry slug is the public identifier the partner uses to reach this
            booking surface.
          </li>
          <li>
            API key is the bootstrap secret. Backend verifies it and issues a
            bearer token that scopes the partner to entry / eligibility /
            booking-create only.
          </li>
          <li>
            Partner mode never inherits tenant-admin authority. There is no
            users, audit, integrations, or settings access in this surface.
          </li>
        </ul>
      </CalloutPanel>

      <p className="partner-public-link-row">
        <Link className="text-link" href="/">
          Back to tenant-admin home
        </Link>
      </p>
    </div>
  );
}
