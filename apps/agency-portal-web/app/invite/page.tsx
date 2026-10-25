import { Card, CardBody, CardHeader } from "@drts/ui-web";

import { firstParam } from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Invitation acceptance: the one-time token is bound to the OIDC state. */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = firstParam(params.token);
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 16 }}>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>接受機關帳號邀請</h1>
        </CardHeader>
        <CardBody>
          {token ? (
            <>
              <p style={{ marginTop: 0 }}>
                請以收到邀請的 Google
                帳號登入。電子郵件須與邀請相同且已驗證；邀請只能使用一次。
              </p>
              <a
                href={`/api/auth/agency/login?token=${encodeURIComponent(token)}`}
                style={{
                  display: "inline-block",
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "#1d4ed8",
                  color: "#ffffff",
                  textDecoration: "none",
                }}
              >
                以 Google 帳號接受邀請
              </a>
            </>
          ) : (
            <p role="alert">邀請連結無效。請向平台管理者確認。</p>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
