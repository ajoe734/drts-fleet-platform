import { NextRequest, NextResponse } from "next/server";
import { BANK_DEMO_TENANTS, getBankTenantName, resolveBankDemoTenant, resolveLocale } from "../../../../lib/demo-tenants";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  resolveServerSessionRole,
} from "../../../../lib/session";
import { loadBankStatementsData } from "../../../../lib/bank-dev-read-models";
import { buildArtifactText } from "../../artifact-crypto";

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
                : `Role ${session.role} is not authorized to export trip artifacts.`,
          },
        },
        { status: 403 },
      );
    }

    const statementData = await loadBankStatementsData(tenant.tenantId, session.role);
    let matchedTripLine:
      | {
          tripId: string;
          tripDate: string;
          orderNo: string;
          routeLabel: string;
          fareAmount: number;
          subsidisedAmount: number;
          paidAmount: number;
          benefitReferenceMasked: string;
          cardholderReferenceMasked: string;
          cardReferenceMasked: string;
          disputed: boolean;
        }
      | undefined;
    let parentStatementNo = "";

    for (const statement of statementData.data.statements) {
      const found = statement.trips.find(
        (t) => t.tripId === cleanId || t.orderNo === cleanId,
      );
      if (found) {
        matchedTripLine = found;
        parentStatementNo = statement.statementNo;
        break;
      }
    }

    if (!matchedTripLine) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Trip artifact ${cleanId} not found.`,
          },
        },
        { status: 404 },
      );
    }

    const payloadContent = [
      "================================================================================",
      "DRTS TRIP SETTLEMENT RECEIPT (NON-FIXTURE ARTIFACT)",
      "================================================================================",
      `Trip ID            : ${matchedTripLine.tripId}`,
      `Order No           : ${matchedTripLine.orderNo}`,
      `Statement Ref      : ${parentStatementNo}`,
      `Trip Date          : ${matchedTripLine.tripDate}`,
      `Issuer Tenant      : ${getBankTenantName(tenant, locale)} (${tenant.tenantId})`,
      `Route              : ${matchedTripLine.routeLabel}`,
      "",
      "--------------------------------------------------------------------------------",
      "FARE & SUBSIDY BREAKDOWN",
      "--------------------------------------------------------------------------------",
      `Gross Fare Amount  : TWD ${matchedTripLine.fareAmount.toLocaleString()}`,
      `Program Subsidy    : TWD ${matchedTripLine.subsidisedAmount.toLocaleString()}`,
      `Cardholder Paid    : TWD ${matchedTripLine.paidAmount.toLocaleString()}`,
      "",
      "--------------------------------------------------------------------------------",
      "MASKED IDENTIFIERS",
      "--------------------------------------------------------------------------------",
      `Benefit Ref        : ${matchedTripLine.benefitReferenceMasked}`,
      `Cardholder Ref     : ${matchedTripLine.cardholderReferenceMasked}`,
      `Card Ref           : ${matchedTripLine.cardReferenceMasked}`,
      `Dispute Status     : ${matchedTripLine.disputed ? "DISPUTED" : "NORMAL"}`,
    ].join("\n");

    const textContent = buildArtifactText(payloadContent, {
      authDomain: "drts.settlement.issuer",
    });

    return new NextResponse(textContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="trip-${matchedTripLine.tripId}.txt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Trip artifact download failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
