import { redirect } from "next/navigation";
import { AppShellCard } from "@drts/ui-web";
import { signInTenantPortal } from "./actions";
import {
  getTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";
import { formatPortalUiError } from "@/lib/error-copy";

const SEEDED_EMAILS = [
  "admin@acme.example",
  "ops@acme.example",
  "finance@acme.example",
  "viewer@acme.example",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getTenantPortalSession();
  if (session) {
    redirect("/");
  }

  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <main
      className="app-grid"
      style={{ minHeight: "100vh", placeItems: "center" }}
    >
      <div style={{ width: "min(560px, 100%)" }}>
        <AppShellCard
          title="租戶入口登入"
          description="建立由後端簽發的租戶啟動工作階段，並讓入口依據該權限脈絡解析身分、權限範圍與角色導覽。"
        >
          {resolvedSearchParams.error ? (
            <div className="error-banner">
              <strong>錯誤：</strong>{" "}
              {formatPortalUiError(resolvedSearchParams.error, "登入失敗")}
            </div>
          ) : null}

          <form action={signInTenantPortal} className="form-grid">
            <div className="form-row">
              <label htmlFor="email">受邀電子郵件</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="例如：admin@tenant.demo"
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="tenantId">租戶 ID</label>
              <input
                id="tenantId"
                name="tenantId"
                type="text"
                placeholder="選填。不填則使用後端預設租戶。"
              />
            </div>
            <button type="submit" className="btn-primary">
              開始登入
            </button>
          </form>

          <div className="callout-panel" style={{ marginTop: "1rem" }}>
            <strong>種子受邀帳號</strong>
            <p>開發環境目前會辨識下列由後端 seed 建立的租戶使用者電子郵件。</p>
            <div className="chip-row">
              {SEEDED_EMAILS.map((email) => (
                <span className="status-chip" key={email}>
                  {email}
                </span>
              ))}
            </div>
            <p className="muted-copy">
              此路由固定為 <code>{TENANT_PORTAL_LOGIN_PATH}</code>，不會在前端
              造出本地角色。登入成功後，系統會把後端簽發的存取權杖存入僅供 HTTP
              存取的工作階段憑證。
            </p>
          </div>
        </AppShellCard>
      </div>
    </main>
  );
}
