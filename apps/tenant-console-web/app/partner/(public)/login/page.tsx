import Link from "next/link";
import { CalloutPanel } from "@/components/page-primitives";
import { PartnerLoginForm } from "@/app/partner/(public)/login/partner-login-form";

export const dynamic = "force-dynamic";

export default function PartnerLoginPage() {
  return (
    <div className="partner-login-stack">
      <PartnerLoginForm />

      <CalloutPanel
        title="合作夥伴憑證由平台管理端簽發"
        description="每個入口都會有一個別名與一把以上的 API 金鑰。請將 API 金鑰視為共享密鑰；若有外洩風險，請回到平台管理端立即輪替。"
      >
        <ul className="panel-list">
          <li>入口別名是合作夥伴進入這個訂單建立入口時使用的公開識別。</li>
          <li>
            API 金鑰是啟動用密鑰。後端會先驗證它，再簽發只限這個入口使用的
            存取權杖，權限只包含入口資訊、資格驗證與建立訂單。
          </li>
          <li>
            合作夥伴模式不會繼承租戶管理權限。這個入口沒有使用者管理、稽核、
            整合治理或設定權限。
          </li>
        </ul>
      </CalloutPanel>

      <p className="partner-public-link-row">
        <Link className="text-link" href="/">
          返回租戶管理首頁
        </Link>
      </p>
    </div>
  );
}
