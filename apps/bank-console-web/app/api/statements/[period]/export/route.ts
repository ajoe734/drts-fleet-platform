import { NextRequest, NextResponse } from "next/server";
import { BANK_DEMO_TENANTS, resolveBankDemoTenant } from "@/lib/demo-tenants";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  resolveServerSessionRole,
} from "@/lib/session";
import { loadBankStatementsData } from "@/lib/bank-dev-read-models";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ period: string }> },
) {
  try {
    const { period } = await params;
    const searchParams = request.nextUrl.searchParams;
    const bankCode = searchParams.get("bank");
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
                : `Role ${session.role} is not authorized to export statement CSV data.`,
          },
        },
        { status: 403 },
      );
    }

    const statementData = await loadBankStatementsData(tenant.tenantId, session.role);
    const statement = statementData.data.statements.find(
      (s) => s.period === period,
    );

    if (!statement) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Statement for period ${period} not found.`,
          },
        },
        { status: 404 },
      );
    }

    const csvRows = [
      [
        "Period",
        "StatementNo",
        "TripID",
        "OrderNo",
        "TripDate",
        "RouteLabel",
        "FareAmount",
        "SubsidisedAmount",
        "PaidAmount",
        "BenefitReferenceMasked",
        "CardholderReferenceMasked",
        "CardReferenceMasked",
        "Disputed",
      ].join(","),
      ...statement.trips.map((trip) =>
        [
          statement.period,
          statement.statementNo,
          trip.tripId,
          trip.orderNo,
          `"${trip.tripDate}"`,
          `"${trip.routeLabel}"`,
          trip.fareAmount,
          trip.subsidisedAmount,
          trip.paidAmount,
          `"${trip.benefitReferenceMasked}"`,
          `"${trip.cardholderReferenceMasked}"`,
          `"${trip.cardReferenceMasked}"`,
          trip.disputed ? "true" : "false",
        ].join(","),
      ),
    ];

    return new NextResponse(csvRows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="statement-${period}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Statement export failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
