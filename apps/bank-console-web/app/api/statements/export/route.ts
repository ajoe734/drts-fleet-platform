import { NextRequest, NextResponse } from "next/server";
import { BANK_DEMO_TENANTS, resolveBankDemoTenant } from "@/lib/demo-tenants";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  resolveServerSessionRole,
} from "@/lib/session";
import { loadBankStatementsData } from "@/lib/bank-dev-read-models";

export async function GET(request: NextRequest) {
  try {
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
    const statements = statementData.data.statements;

    const csvRows = [
      [
        "Period",
        "StatementNo",
        "ProgramLabel",
        "Status",
        "IssuedAt",
        "DueAt",
        "TotalFareAmount",
        "TotalSubsidisedAmount",
        "TotalPaidAmount",
        "TotalIssuerPayableAmount",
        "TotalTrips",
      ].join(","),
      ...statements.map((s) =>
        [
          s.period,
          s.statementNo,
          `"${s.programLabel}"`,
          s.status,
          `"${s.issuedAt}"`,
          `"${s.dueAt}"`,
          s.totalFareAmount,
          s.totalSubsidisedAmount,
          s.totalPaidAmount,
          s.totalIssuerPayableAmount,
          s.totalTrips,
        ].join(","),
      ),
    ];

    return new NextResponse(csvRows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="statements-all.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Statement list export failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
