import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ONE_TIME_KEY_COOKIE = "tenant-api-key-flash";

type OneTimeKeyFlash = {
  keyId: string;
  keyName: string;
  plaintextKey: string;
  revokedApiKeyId: string | null;
};

function decodeOneTimeKeyFlash(
  value: string | undefined,
): OneTimeKeyFlash | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as OneTimeKeyFlash;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const encodedFlash = cookieStore.get(ONE_TIME_KEY_COOKIE)?.value;
  const flash = decodeOneTimeKeyFlash(encodedFlash);

  if (!flash) {
    const redirectUrl = new URL("/api-keys", request.url);
    redirectUrl.searchParams.set(
      "error",
      "No pending plaintext key was found. Issue or rotate a key again if you still need it.",
    );
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(ONE_TIME_KEY_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/api-keys",
      sameSite: "lax",
    });
    return response;
  }

  const success = new URL(request.url).searchParams.get("success");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>One-time API key reveal</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", sans-serif;
        background: #f4f7fb;
        color: #0f172a;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(191, 219, 254, 0.55), transparent 36%),
          linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
      }
      main {
        max-width: 780px;
        margin: 0 auto;
        padding: 3rem 1.25rem 4rem;
      }
      .panel {
        border-radius: 24px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.1);
        padding: 1.5rem;
      }
      .banner {
        border-radius: 16px;
        padding: 0.95rem 1rem;
        margin-bottom: 1rem;
        border: 1px solid rgba(15, 118, 110, 0.2);
        background: linear-gradient(180deg, rgba(236, 253, 245, 0.94), rgba(240, 249, 255, 0.96));
        color: #0f5132;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        align-items: flex-start;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.3rem 0.65rem;
        background: rgba(15, 118, 110, 0.12);
        color: #0f766e;
        font-size: 0.82rem;
        font-weight: 700;
      }
      pre {
        margin: 1rem 0 0;
        padding: 1rem;
        border-radius: 18px;
        background: #0f172a;
        color: #f8fafc;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      p {
        line-height: 1.55;
      }
      .muted {
        color: #475569;
      }
      a {
        color: #1d4ed8;
        font-weight: 600;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="panel">
        ${
          success
            ? `<div class="banner"><strong>Success:</strong> ${escapeHtml(success)}</div>`
            : ""
        }
        <div class="meta">
          <div>
            <h1 style="margin: 0; font-size: 1.75rem;">One-time plaintext key for ${escapeHtml(
              flash.keyName,
            )}</h1>
            <p class="muted" style="margin: 0.75rem 0 0;">
              This value has been consumed from the flash cookie and will not be shown again on refresh or revisit. Move it into your secret vault now.
            </p>
          </div>
          <span class="badge">${escapeHtml(flash.keyId)}</span>
        </div>
        <pre>${escapeHtml(flash.plaintextKey)}</pre>
        ${
          flash.revokedApiKeyId
            ? `<p class="muted" style="margin-top: 0.85rem;">Rotation revoked previous key <code>${escapeHtml(
                flash.revokedApiKeyId,
              )}</code>.</p>`
            : ""
        }
        <p style="margin: 1.2rem 0 0;">
          <a href="/api-keys">Return to API keys</a>
        </p>
      </div>
    </main>
  </body>
</html>`;

  const response = new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
  response.cookies.set(ONE_TIME_KEY_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api-keys",
    sameSite: "lax",
  });
  return response;
}
