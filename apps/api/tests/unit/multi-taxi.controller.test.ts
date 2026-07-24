import { describe, expect, it, vi } from "vitest";

import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import type { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import type { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";

describe("MultiTaxiController ride intake", () => {
  it("awaits passenger ride creation before wrapping the API envelope", async () => {
    const result = {
      ride: { orderId: "order-001", orderNo: "MTX-001" },
      passengerAccess: {
        tokenId: "token-001",
        accessToken: "opaque-access-token",
      },
    };
    const service = {
      createRide: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.createRide(
      {} as never,
      null,
      "req-create-001",
    );

    expect(response.data).toEqual(result);
    expect(response.data).not.toBeInstanceOf(Promise);
    expect(service.createRide).toHaveBeenCalledWith({}, null, "req-create-001");
  });

  it("awaits call-center ride creation before wrapping the API envelope", async () => {
    const result = {
      ride: { orderId: "order-002", orderNo: "MTX-002" },
      passengerAccess: {
        tokenId: "token-002",
        accessToken: "opaque-call-center-token",
      },
    };
    const service = {
      createCallCenterRide: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.createCallCenterRide(
      {} as never,
      "req-create-002",
    );

    expect(response.data).toEqual(result);
    expect(response.data).not.toBeInstanceOf(Promise);
    expect(service.createCallCenterRide).toHaveBeenCalledWith(
      {},
      "req-create-002",
    );
  });

  it("wraps platform-admin trip records list responses after awaiting the service", async () => {
    const result = [
      {
        recordId: "mtr-order-001",
        orderId: "order-001",
        orderNo: "ZX-240720-0186",
      },
    ];
    const service = {
      listTripOperationalRecords: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.listTripOperationalRecords(
      { month: "2026-07", legalHold: "active" },
      "req-records-001",
    );

    expect(response.data.items).toEqual(result);
    expect(service.listTripOperationalRecords).toHaveBeenCalledWith({
      month: "2026-07",
      legalHold: "active",
    });
  });

  it("wraps platform-admin trip records export payload after awaiting the service", async () => {
    const result = {
      exportedAt: "2026-07-23T00:00:00.000Z",
      filename: "multi-taxi-trip-records-202607.csv",
      rows: [
        {
          orderNoMasked: "ZX-240...86",
          plateNoMasked: "BK...08",
        },
      ],
    };
    const service = {
      exportTripOperationalRecords: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.exportTripOperationalRecords(
      { month: "2026-07" },
      "req-records-export-001",
    );

    expect(response.data).toEqual(result);
    expect(service.exportTripOperationalRecords).toHaveBeenCalledWith({
      month: "2026-07",
    });
  });

  it("passes the authenticated actor and request ID to rating invalidation", async () => {
    const result = {
      rating: { ratingId: "rating-001", status: "invalidated" },
      driverRatingSummary: {
        driverId: "driver-001",
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
      },
      audit: { auditId: "audit-001" },
      replayed: false,
    };
    const service = {
      invalidatePassengerRating: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);
    const command = {
      reason: "Passenger confirmed submission error.",
      idempotencyKey: "rating-invalidate-001",
      confirmation: {
        action: "invalidate_rating" as const,
        ratingId: "rating-001",
      },
    };

    const response = await controller.invalidatePassengerRating(
      "rating-001",
      command,
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["multi_taxi_ratings:moderate"],
        requestId: "req-rating-invalidate-001",
      },
      "req-rating-invalidate-001",
    );

    expect(response.data).toEqual(result);
    expect(service.invalidatePassengerRating).toHaveBeenCalledWith(
      "rating-001",
      command,
      "platform-admin-001",
      "req-rating-invalidate-001",
    );
  });

  it("rejects rating invalidation when no auditable actor is present", async () => {
    const service = {
      invalidatePassengerRating: vi.fn(),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    await expect(
      controller.invalidatePassengerRating(
        "rating-001",
        {
          reason: "Passenger confirmed submission error.",
          idempotencyKey: "rating-invalidate-001",
          confirmation: {
            action: "invalidate_rating",
            ratingId: "rating-001",
          },
        },
        null,
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_MODERATION_ACTOR_REQUIRED" },
      },
    });
    expect(service.invalidatePassengerRating).not.toHaveBeenCalled();
  });

  it("wraps the canonical rating review list without reshaping it", async () => {
    const result = {
      items: [{ ratingId: "rating-001", status: "active" }],
      pageInfo: {
        page: 1,
        pageSize: 50,
        totalItems: 1,
        totalPages: 1,
      },
      refresh: {
        generatedAt: "2026-07-24T00:00:00.000Z",
        staleAfterMs: 300_000,
        stale: false,
      },
    };
    const service = {
      listPassengerRatingReviews: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);
    const query = { status: "active" as const, score: "5" };

    const response = await controller.listPassengerRatingReviews(
      query,
      "req-rating-list-001",
    );

    expect(response.data).toEqual(result);
    expect(service.listPassengerRatingReviews).toHaveBeenCalledWith(query);
  });

  it("derives detail mutation availability from authenticated capability", async () => {
    const result = {
      rating: { ratingId: "rating-001", status: "active" },
      availableActions: {
        invalidate: {
          enabled: false,
          disabledReason: "missing_multi_taxi_ratings_moderate",
        },
      },
    };
    const service = {
      getPassengerRatingReview: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.getPassengerRatingReview(
      "rating-001",
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["foundation:read", "multi_taxi_ratings:read"],
        requestId: "req-rating-detail-001",
      },
      "req-rating-detail-001",
    );

    expect(response.data).toEqual(result);
    expect(service.getPassengerRatingReview).toHaveBeenCalledWith(
      "rating-001",
      false,
    );
  });

  it("exposes the canonical driver rating authority envelope", async () => {
    const result = {
      summary: {
        driverId: "driver-001",
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
        lastRatedAt: null,
        aggregateVersion: 1,
        calculatedAt: "2026-07-24T00:00:00.000Z",
      },
      refresh: {
        generatedAt: "2026-07-24T00:00:00.000Z",
        staleAfterMs: 300_000,
        stale: false,
      },
      unavailableReason: null,
    };
    const service = {
      getDriverRatingAuthority: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.getDriverRatingAuthority(
      "driver-001",
      "req-rating-authority-001",
    );

    expect(response.data).toEqual(result);
    expect(service.getDriverRatingAuthority).toHaveBeenCalledWith("driver-001");
  });

  it("routes controlled export preview, creation, status, and download through reporting authority", async () => {
    const rows = [{ orderNoMasked: "ZX...86", plateNoMasked: "BK...08" }];
    const service = {
      exportTripOperationalRecords: vi.fn().mockResolvedValue({
        exportedAt: "2026-07-23T00:00:00.000Z",
        filename: "multi-taxi-trip-records-202607.csv",
        rows,
      }),
    } as unknown as MultiTaxiService;
    const reporting = {
      previewMultiTaxiTripExport: vi.fn().mockReturnValue({
        scope: { month: "2026-07" },
        recordCount: 1,
      }),
      createMultiTaxiTripExportJob: vi.fn().mockReturnValue({
        jobId: "JOB-001",
        status: "pending",
        idempotentReplay: false,
      }),
      getMultiTaxiTripExportJob: vi.fn().mockReturnValue({
        jobId: "JOB-001",
        status: "completed",
      }),
      issueMultiTaxiTripExportDownload: vi.fn().mockReturnValue({
        jobId: "JOB-001",
        download: { downloadUrl: "https://downloads.example.test/JOB-001" },
      }),
    } as unknown as ReportingFilingService;
    const identity = {
      actorId: "platform-admin-001",
      actorType: "platform_admin",
      realm: "platform",
      scopes: ["multi_taxi_records:export"],
    } as never;
    const controller = new MultiTaxiController(service, reporting);

    const preview = await controller.previewTripOperationalExport(
      { month: "2026-07" },
      identity,
      "req-preview-001",
    );
    const created = await controller.createTripOperationalExportJob(
      {
        scope: { month: "2026-07" },
        purpose: "Monthly review",
        idempotencyKey: "monthly-review-202607",
      },
      identity,
      "req-create-001",
    );
    const status = controller.getTripOperationalExportJob(
      "JOB-001",
      identity,
      "req-status-001",
    );
    const download = controller.downloadTripOperationalExport(
      "JOB-001",
      identity,
      "req-download-001",
    );

    expect(preview.data).toMatchObject({ recordCount: 1 });
    expect(created.data).toMatchObject({ jobId: "JOB-001" });
    expect(status.data).toMatchObject({ status: "completed" });
    expect(download.data).toMatchObject({ jobId: "JOB-001" });
    expect(reporting.createMultiTaxiTripExportJob).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "Monthly review" }),
      rows,
      identity,
      "req-create-001",
    );
  });
});
