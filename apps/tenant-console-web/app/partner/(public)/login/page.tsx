import Link from "next/link";
import { CalloutPanel } from "@/components/page-primitives";
import { PartnerLoginForm } from "@/app/partner/(public)/login/partner-login-form";

export const dynamic = "force-dynamic";

export default function PartnerLoginPage() {
  return (
    <div className="partner-login-stack">
      <PartnerLoginForm />

      <CalloutPanel
        title="合作夥伴憑證由平台管理員核發"
        description="每個 entry 都有一個 slug 與一個以上的 API 金鑰。請將 API 金鑰視為共用密鑰 —— 若外洩請透過 platform-admin 輪替。"
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
