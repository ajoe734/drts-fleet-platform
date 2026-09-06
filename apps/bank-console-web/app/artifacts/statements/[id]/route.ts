import { NextRequest, NextResponse } from "next/server";
import { BANK_DEMO_TENANTS, getBankTenantName, resolveBankDemoTenant, resolveLocale } from "../../../../lib/demo-tenants";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  resolveServerSessionRole,
} from "../../../../lib/session";
import { loadBankStatementsData } from "../../../../lib/bank-dev-read-models";
import { buildSignedArtifactText } from "../../artifact-crypto";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cleanId = decodeURIComponent(id).replace(/\.pdf$/i, "").replace(/\.txt$/i, "");
    const searchParams = request.nextUrl.searchParams;
    const bankCode = searchParams.get("bank");
    const locale = resolveLocale(searchParams.get("locale"));
    const roleParam = searchParams.get("role");
    const cookieRoleParam =
      request.cookies.get(BANK_CONSOLE_SESSION_COOKIE)?.value ||
      request.cookies.get(BANK_CONSOLE_ROLE_COOKIE)?.value;

    const session = resolveServerSessionRole(
      cookieRoleParam,
      roleParam,
    );

    if (session.bankCode && bankCode && session.bankCode !== bankCode) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message:
              "Tenant scope mismatch: authenticated session does not match requested bank tenant.",
          },
        },
        { status: 403 },
      );
    }

    const targetBankCode = session.bankCode || bankCode;
    if (!targetBankCode || !(targetBankCode in BANK_DEMO_TENANTS)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "Missing or invalid bank tenant parameter.",
          },
        },
        { status: 400 },
      );
    }

    const tenant = resolveBankDemoTenant(targetBankCode);

    // Unauthorised roles, signature forgery, and tampering check
    if (!session.isAuthorizedForExport) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: session.isForged
              ? "Invalid or forged session signature: server session cookie signature verification failed."
              : session.isTampered
                ? "Role parameter tampering detected: client role parameter does not match authenticated server session identity."
                : `Role ${session.role} is not authorized to export statements or download settlement artifacts.`,
          },
        },
        { status: 403 },
      );
    }

    const statementData = await loadBankStatementsData(tenant.tenantId, session.role);
    const statements = statementData.data.statements;

    // Match statement strictly by statementNo, period, or artifact href
    const statement = statements.find(
      (s) =>
        s.statementNo === cleanId ||
        s.period === cleanId ||
        s.signedArtifactHref.includes(cleanId),
    );

    if (!statement) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Statement not found." } },
        { status: 404 },
      );
    }

    const bodyLines = [
      "================================================================================",
      "DRTS SETTLEMENT STATEMENT (NON-FIXTURE ARTIFACT)",
      "================================================================================",
      `Statement ID  : ${statement.statementNo}`,
      `Period        : ${statement.period}`,
      `Issuer Tenant : ${getBankTenantName(tenant, locale)} (${tenant.tenantId})`,
      `Program       : ${statement.programLabel}`,
      `Status        : ${statement.status.toUpperCase()}`,
      `Issued At     : ${statement.issuedAt}`,
      `Due At        : ${statement.dueAt}`,
      "",
      "--------------------------------------------------------------------------------",
      "FINANCIAL SUMMARY (ISSUER PAYS DRTS)",
      "--------------------------------------------------------------------------------",
      `Total Trips                  : ${statement.totalTrips}`,
      `Total Fare Amount            : TWD ${statement.totalFareAmount.toLocaleString()}`,
      `Total Subsidised Amount      : TWD ${statement.totalSubsidisedAmount.toLocaleString()}`,
      `Total Cardholder Paid Amount : TWD ${statement.totalPaidAmount.toLocaleString()}`,
      `Total Issuer Payable Amount  : TWD ${statement.totalIssuerPayableAmount.toLocaleString()}`,
      "",
      "--------------------------------------------------------------------------------",
      "TRIP LINE ITEMS",
      "--------------------------------------------------------------------------------",
      ...statement.trips.map(
        (trip, idx) =>
          `[${idx + 1}] Trip ID: ${trip.tripId} | Order No: ${trip.orderNo} | Date: ${trip.tripDate}\n` +
          `    Route       : ${trip.routeLabel}\n` +
          `    Fare        : TWD ${trip.fareAmount} | Subsidy: TWD ${trip.subsidisedAmount} | Paid: TWD ${trip.paidAmount}\n` +
          `    Benefit Ref : ${trip.benefitReferenceMasked}\n` +
          `    Cardholder  : ${trip.cardholderReferenceMasked}\n` +
          `    Card Ref    : ${trip.cardReferenceMasked}\n` +
          `    Disputed    : ${trip.disputed ? "YES" : "NO"}`,
      ),
    ];

    const { fullText } = buildSignedArtifactText(bodyLines.join("\n"), {
      generatedAt: statement.issuedAt,
    });

    return new NextResponse(fullText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${statement.statementNo}.txt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Statement download failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
