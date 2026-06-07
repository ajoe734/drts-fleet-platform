import { NextRequest, NextResponse } from "next/server";
import { formatTenantUiError, toTenantErrorMessage } from "@/lib/error-copy";
import {
  clearPartnerSession,
  createPartnerSession,
} from "@/lib/partner-session";

type LoginPayload = {
  entrySlug?: unknown;
  apiKey?: unknown;
};

export async function POST(request: NextRequest) {
  let body: LoginPayload;
  try {
    body = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json(
      { error: "請求內容格式錯誤，無法解析登入資料。" },
      { status: 400 },
    );
  }

  const entrySlug =
    typeof body.entrySlug === "string" ? body.entrySlug.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!entrySlug || !apiKey) {
    return NextResponse.json(
      { error: "入口別名與合作夥伴 API 金鑰皆為必填。" },
      { status: 400 },
    );
  }

  try {
    const session = await createPartnerSession({ entrySlug, apiKey });
    return NextResponse.json({
      ok: true,
      partnerEntry: session.partnerEntry,
      identity: session.identity,
      expiresIn: session.expiresIn,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: formatTenantUiError(
          toTenantErrorMessage(error, "合作夥伴登入失敗。"),
          "合作夥伴登入失敗",
        ),
      },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  await clearPartnerSession();
  return NextResponse.json({ ok: true });
}
