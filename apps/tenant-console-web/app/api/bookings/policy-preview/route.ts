import { NextRequest, NextResponse } from "next/server";
import type {
  BusinessDispatchSubtype,
  TenantApprovalEvaluationResult,
  TenantBookingQuotaImpactPreview,
  TenantPassengerMasterRole,
} from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";

interface PolicyPreviewRequestBody {
  businessDispatchSubtype: BusinessDispatchSubtype;
  selectedPassengerId?: string | null;
  passengerName?: string;
  passengerPhone?: string;
  passengerRole?: TenantPassengerMasterRole | null;
  reservationWindowStart: string;
  reservationWindowEnd?: string;
  costCenter?: string | null;
  estimatedAmountMinor?: number | null;
  vehiclePreference?: string | null;
  direction?: "pickup" | "dropoff" | null;
  flightNo?: string | null;
  signoffRequired?: boolean;
  expenseProofRequired?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PolicyPreviewRequestBody;
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);

    const quotaPreview = (await client.previewTenantBookingQuotaImpact({
      reservationWindowStart: body.reservationWindowStart,
      ...(body.estimatedAmountMinor == null
        ? {}
        : {
            amountMinor: body.estimatedAmountMinor,
            currency: "TWD",
          }),
      ...(body.costCenter ? { costCenter: body.costCenter } : {}),
    })) as TenantBookingQuotaImpactPreview;

    const approvalEvaluation = (await client.evaluateApprovalRules({
      subject: {
        subjectType: "booking",
        bookingId: null,
        draftId: null,
        operation: "dry_run",
      },
      inputSnapshot: {
        costCenterCode: body.costCenter ?? null,
        businessDispatchSubtype: body.businessDispatchSubtype,
        reservationWindowStart: body.reservationWindowStart,
        reservationWindowEnd: body.reservationWindowEnd ?? null,
        passengerId: body.selectedPassengerId ?? null,
        passengerRole: body.passengerRole ?? null,
        amountMinor: body.estimatedAmountMinor ?? null,
        currency: body.estimatedAmountMinor == null ? null : "TWD",
        vehiclePreference: body.vehiclePreference ?? null,
        direction: body.direction ?? null,
        flightNoPresent: Boolean(body.flightNo?.trim()),
        flightNo: body.flightNo ?? null,
        signoffRequired: body.signoffRequired ?? false,
        expenseProofRequired: body.expenseProofRequired ?? false,
      },
      quotaImpacts: quotaPreview.impacts,
    })) as TenantApprovalEvaluationResult;

    return NextResponse.json({
      ok: true,
      quotaPreview,
      approvalEvaluation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Booking policy preview failed.",
      },
      { status: 502 },
    );
  }
}
