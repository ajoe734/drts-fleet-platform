import { resolve } from "node:path";
import { requireApi } from "../referral-manual-complaints-canonical-20261020/setup-reflection";
import { renderInNode } from "./server-pdf-worker";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { vi } from "vitest";
// The integration test combines a DOM client with an actual Node-only server
// dependency. Select its unchanged CJS server implementation, not browser boot.
vi.mock("pdfkit", async () => {
  const { createRequire } = await import("node:module");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: undefined,
  });
  try {
    return {
      default: createRequire(
        (await import("node:path")).resolve(
          process.cwd(),
          "apps/api/package.json",
        ),
      )("pdfkit"),
    };
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else delete (globalThis as any).document;
  }
});

import { manualWire } from "../referral-manual-complaints-canonical-20261020/fixture";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { GET as txtGET } from "../../../apps/referral-embed-web/app/api/referral/receipt/[orderId]/download/route";
const { of, lastValueFrom } = requireApi("rxjs");
export async function pdfWire() {
  const pdfRouteFile = resolve(
    process.cwd(),
    "apps/referral-embed-web/app/api/referral/receipt/[orderId]/pdf/route.ts",
  );
  const target = resolve(
    process.cwd(),
    "apps/api/src/modules/owned-mobility/referral-receipt-document.ts",
  );
  if (fs.existsSync(target))
    vi.doMock(target, async () =>
      typeof document === "undefined"
        ? vi.importActual(target)
        : {
            renderReferralReceiptDocument: async (receipt: unknown) =>
              renderInNode(receipt as never),
          },
    );

  const f = await manualWire();
  const row = await f.stored();
  if (!row) throw new Error("Actual owned receipt order missing");
  await f.change({
    status: "completed",
    completedAt: "2026-10-20T08:00:00Z",
    passenger: { ...row.passenger, name: "王小明", phone: "0912345678" },
    pickup: { ...row.pickup, address: "新北市中和區測試社區（A）\\B" },
    dropoff: { ...row.dropoff, address: "臺北車站東三門" },
  });
  f.db.table("ops.phase1_driver_tasks").set("unit-pdf-task", {
    taskId: "unit-pdf-task",
    orderId: f.orderId,
    assignmentId: "unit-pdf-assignment",
    driverId: "unit-pdf-driver",
    vehicleId: "unit-pdf-vehicle",
    status: "completed",
    completedAt: "2026-10-20T08:00:00Z",
    fare: { currency: "TWD", amountMinor: 12000 },
    actualFareBreakdown: {
      startMinor: 8500,
      distanceMinor: 2000,
      delayMinor: 500,
      nightMinor: 1000,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const original = f.fetch;
  const pdfDocuments: any[] = [];
  const pdfCalls: string[] = [];
  const wire = async (envelope: unknown) =>
    lastValueFrom(
      new SnakeCaseInterceptor().intercept({} as never, {
        handle: () => of(envelope),
      }),
    );
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://embed.example.test").pathname;
    if (path === `/api/referral/receipt/${f.orderId}/pdf`) {
      pdfCalls.push(path);
      const response = await (
        await import(pdfRouteFile)
      ).GET(new Request("https://embed.example.test" + path), {
        params: Promise.resolve({ orderId: f.orderId }),
      });
      if (process.env.REFERRAL_PDF_DIAGNOSTICS) {
        const bytes = new Uint8Array(await response.clone().arrayBuffer());
        fs.appendFileSync(
          process.env.REFERRAL_PDF_DIAGNOSTICS,
          JSON.stringify({
            stage: "pdf-bff-response",
            status: response.status,
            type: response.headers.get("content-type"),
            bytes: bytes.byteLength,
            prefix: Array.from(bytes.slice(0, 16)),
            sha256: createHash("sha256").update(bytes).digest("hex"),
            producerSha256: pdfDocuments.at(-1)?.sha256,
          }) + "\n",
        );
      }
      return response;
    }
    if (path === `/api/referral/receipt/${f.orderId}/download`)
      return txtGET(new Request("https://embed.example.test" + path), {
        params: Promise.resolve({ orderId: f.orderId }),
      });
    if (
      path ===
        `/api/partner/referral/passenger/orders/${f.orderId}/receipt/pdf` ||
      path === `/api/partner/referral/passenger/orders/${f.orderId}/receipt`
    ) {
      try {
        const result = path.endsWith("/pdf")
          ? await f.controller.getReferralPassengerReceiptPdf(
              f.orderId,
              f.identity,
              "unit-pdf",
            )
          : await f.controller.getReferralPassengerReceipt(
              f.orderId,
              f.identity,
              "unit-original-receipt",
            );
        if (path.endsWith("/pdf")) pdfDocuments.push(result.data);
        return Response.json(await wire(result));
      } catch (error) {
        if (process.env.REFERRAL_PDF_DIAGNOSTICS)
          fs.appendFileSync(
            process.env.REFERRAL_PDF_DIAGNOSTICS,
            JSON.stringify({
              stage: "api-exception",
              name: (error as any)?.name,
              message: String((error as any)?.message).slice(0, 1200),
            }) + "\n",
          );
        if (typeof (error as any)?.getStatus !== "function") throw error;
        return Response.json((error as any).getResponse(), {
          status: (error as any).getStatus(),
        });
      }
    }
    return original(input, init);
  });
  vi.stubGlobal("fetch", fetch);
  return {
    ...f,
    fetch,
    pdfCalls,
    pdfDocuments,
    view: () => f.page("receipt"),
    pdf: () => fetch(`/api/referral/receipt/${f.orderId}/pdf`),
    text: () => fetch(`/api/referral/receipt/${f.orderId}/download`),
  };
}
