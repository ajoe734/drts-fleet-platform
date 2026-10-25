import { Card, CardBody, CardHeader } from "@drts/ui-web";

import { firstParam } from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LOGIN_ERRORS: Record<string, string> = {
  AUTH_STATE_MISMATCH: "登入狀態不符，請重新登入。",
  AUTH_SESSION_EXCHANGE_DENIED:
    "此 Google 帳號未綁定有效的機關帳號、存取期限已到期，或邀請已失效。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const redirectUri = firstParam(params.redirect_uri) ?? "/";
  const loginHref = `/api/auth/agency/login?redirect_uri=${encodeURIComponent(redirectUri)}`;
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 16 }}>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>主管機關唯讀查詢</h1>
        </CardHeader>
        <CardBody>
          <p style={{ marginTop: 0 }}>
            僅限平台邀請並啟用之機關帳號以 Google
            帳號登入；未綁定的帳號一律拒絕。
          </p>
          {error ? (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {LOGIN_ERRORS[error] ?? "登入失敗，請重新嘗試。"}
            </p>
          ) : null}
          <a
            href={loginHref}
            style={{
              display: "inline-block",
              padding: "10px 16px",
              borderRadius: 8,
              background: "#1d4ed8",
              color: "#ffffff",
              textDecoration: "none",
            }}
          >
            使用 Google 帳號登入
          </a>
        </CardBody>
      </Card>
    </main>
  );
}
