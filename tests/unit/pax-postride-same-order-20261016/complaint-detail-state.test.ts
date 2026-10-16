import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import {
  complaintProgressStates,
  loadComplaintTimeline,
} from "../../../apps/ops-console-web/lib/complaint-detail-state";

afterEach(() => vi.unstubAllGlobals());

const caseNo = "PAX-11111111-1111-4111-8111-111111111111";
const entry = {
  entryId: "case-created",
  caseNo,
  action: "case_created",
  note: "來源：乘客 App；同意客服聯繫：是",
  createdAt: "2026-10-16T15:27:00.000Z",
} satisfies ComplaintTimelineEntry;

it("uses the real SDK receiver to read the created case's actual timeline", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ data: { items: [entry] } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new ApiClient({ baseUrl: "https://ops-api.example" });
  expect(await loadComplaintTimeline(client, caseNo)).toEqual([entry]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    `https://ops-api.example/api/complaints/${caseNo}/timeline`,
  );
});

it("preserves an actually empty timeline instead of inventing assignment events", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: { items: [] } })),
  );
  expect(
    await loadComplaintTimeline(
      new ApiClient({ baseUrl: "https://ops-api.example" }),
      caseNo,
    ),
  ).toEqual([]);
});

it("reports unavailable timeline separately from real history", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  expect(
    await loadComplaintTimeline(
      new ApiClient({ baseUrl: "https://ops-api.example" }),
      caseNo,
    ),
  ).toBeNull();
});

it.each([
  ["new", ["complete", "current", "upcoming", "upcoming"]],
  ["assigned", ["complete", "complete", "current", "upcoming"]],
  ["under_investigation", ["complete", "complete", "current", "upcoming"]],
  ["reopened", ["complete", "complete", "current", "upcoming"]],
  ["resolved", ["complete", "complete", "complete", "current"]],
  ["closed", ["complete", "complete", "complete", "complete"]],
] as const)("presents actual %s case progress", (status, states) => {
  expect(
    Object.values(
      complaintProgressStates(status as ComplaintCaseRecord["status"]),
    ),
  ).toEqual(states);
});
