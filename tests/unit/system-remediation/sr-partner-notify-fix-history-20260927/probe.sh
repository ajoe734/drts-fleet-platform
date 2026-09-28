#!/usr/bin/env bash
set -e

echo "Node Version: $(node -v)"
echo "Vitest Version: $(pnpm exec vitest --version)"
echo "TS Version: $(pnpm exec tsc --version)"

OLD_SHA="585087a2fd8114eaac0eb8a470dfca58e13dfbe4"
ROUTE_FILE="apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts"
OLD_ROUTE_FILE="apps/referral-embed-web/app/api/referral/history/[orderId]/route.old.ts"

# 1. Test New Version
echo ""
echo "=== Running exact vitest command for NEW source ==="
pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route.test.ts --no-cache

# 2. Test Old Version without resetting worktree
echo ""
echo "=== Running probe for OLD source (${OLD_SHA}) ==="
# Extract old route and fix alias import to relative path so vitest can resolve it
git show "${OLD_SHA}:${ROUTE_FILE}" | sed 's|@/|../../../../../|g' > "${OLD_ROUTE_FILE}"

# Create a temporary test that imports from the old file
cat << 'TEST_EOF' > tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route-old.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../../../../apps/referral-embed-web/app/api/referral/history/[orderId]/route.old";
import { getReferralEmbedSession } from "../../../../apps/referral-embed-web/lib/embed-partner-session";

vi.mock("../../../../apps/referral-embed-web/lib/embed-partner-session");
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init: any) => new Response(JSON.stringify(body), init),
  },
}));

const globalFetchMock = vi.fn();
global.fetch = globalFetchMock;

describe("GET /api/referral/history/[orderId] (OLD SHA)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalFetchMock.mockReset();
  });

  it("fabricates 200 for unknown order/wrong subject/cross tenant (defect)", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: { tenantId: "tenant-B", drtsPassengerId: "pass-1" },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [] }, // Backend filters it out
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    // OLD behavior was to return 200 and fabricate CONFIRMED status
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("CONFIRMED");
  });

  it("preserves own history correctly", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: { drtsPassengerId: "pass-1" },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [{ orderId: "order-123", status: "CONFIRMED" }] },
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
TEST_EOF

echo "Running vitest against OLD source (expecting it to succeed in reproducing the old behavior):"
pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route-old.test.ts --no-cache

# Cleanup
rm "${OLD_ROUTE_FILE}"
rm tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route-old.test.ts
echo "=== Done ==="
