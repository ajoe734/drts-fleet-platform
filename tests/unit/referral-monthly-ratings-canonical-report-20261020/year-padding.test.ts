import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { afterEach, expect, it, vi } from "vitest";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { ReferralMonthlyRatingService } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.service";
import { ReferralMonthlyRatingController } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.controller";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("pads years below1000 in actual monthly reader SQL bounds, including December rollover", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const database = new DatabaseService();
  vi.spyOn(database, "isEnabled").mockReturnValue(true);
  const query = vi.spyOn(database, "query");
  query.mockResolvedValue({
    rows: [
      { record: { orders: [], driverTasks: [], dispatchAssignments: [] } },
    ],
    rowCount: 1,
    command: "SELECT",
    oid: 0,
    fields: [],
  });
  const repository = new ReportingRepository(database);
  const controller = new ReferralMonthlyRatingController(
    new ReferralMonthlyRatingService(repository),
  );
  for (const [month, next] of [
    ["0099-02", "0099-03-01"],
    ["0099-12", "0100-01-01"],
  ] as const) {
    const report = await controller.read({ periodMonth: month });
    expect(query.mock.calls.at(-1)![1]!.slice(0, 2)).toEqual([
      `${month}-01`,
      next,
    ]);
    expect(query.mock.calls.at(-1)![0]).toContain("AT TIME ZONE 'Asia/Taipei'");
    expect(report.data).toMatchObject({
      periodMonth: month,
      ratingCount: 0,
      averageRating: null,
    });
  }
});
