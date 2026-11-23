// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@drts/contracts";
import type { Locale } from "@/lib/translations";

const APP_ROOT = path.resolve(__dirname, "../..");

const SHARED_ORDER_A = "580e0ebf-c1e6-41c4-93dc-449bd92a010f";
const SHARED_ORDER_B = "98e6e9fd-c986-4985-8339-3b00ee977e92";
const JOB_A = "test-job-A";
const JOB_B = "test-job-B";
const URL_A = `/fixture-download/${SHARED_ORDER_A}.csv`;
const URL_B = `/fixture-download/${SHARED_ORDER_B}.csv`;

function resolveSourceFile(basePath: string): string {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve module at ${basePath}`);
}

function createClientLoader(mocks: Record<string, unknown>) {
  const cache = new Map<string, Record<string, unknown>>();

  function loadModule(specifier: string, fromDir = APP_ROOT): unknown {
    if (specifier in mocks) {
      return mocks[specifier];
    }
    if (specifier === "react") {
      return React;
    }
    if (
      specifier === "react/jsx-runtime" ||
      specifier === "react/jsx-dev-runtime"
    ) {
      return jsxRuntime;
    }

    let targetPath: string;
    if (specifier.startsWith("@/")) {
      targetPath = resolveSourceFile(
        path.resolve(APP_ROOT, specifier.slice(2)),
      );
    } else if (specifier.startsWith(".")) {
      targetPath = resolveSourceFile(path.resolve(fromDir, specifier));
    } else {
      throw new Error(
        `Unmocked external module in client loader: ${specifier}`,
      );
    }

    const existing = cache.get(targetPath);
    if (existing) {
      return existing;
    }

    const exportsObj: Record<string, unknown> = {};
    const moduleObj = { exports: exportsObj };
    cache.set(targetPath, exportsObj);

    const source = fs.readFileSync(targetPath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: targetPath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    const localRequire = (childSpecifier: string) =>
      loadModule(childSpecifier, path.dirname(targetPath));
    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      outputText,
    );
    fn(
      moduleObj.exports,
      localRequire,
      moduleObj,
      targetPath,
      path.dirname(targetPath),
    );
    cache.set(targetPath, moduleObj.exports);
    return moduleObj.exports;
  }

  return { loadModule };
}

function deferredResponse() {
  let resolvePromise!: (value: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (status: number, body: unknown) =>
      resolvePromise(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TripExportPanel active job, scope, and download consistency under overlapping/late responses", () => {
  const loader = createClientLoader({
    "@drts/contracts": contracts,
    "next/navigation": {
      useRouter: () => ({ refresh: vi.fn() }),
      usePathname: () => "/trip-records/exports",
    },
  });

  const { TripExportPanel } = loader.loadModule(
    "@/components/trip-export-panel",
  ) as {
    TripExportPanel: React.ComponentType<{
      initialScope?: Record<string, string | undefined>;
      locale?: Locale;
    }>;
  };

  beforeEach(() => {
    document.cookie = "drts_agency_csrf=csrf-token-export-switch; path=/";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("retains job B and job B's CSV download link when job A's download response arrives after job B is already downloadable", async () => {
    const firstDownload = deferredResponse();
    const requests: Array<{
      url: string;
      method: string;
      scope?: unknown;
      purpose?: unknown;
    }> = [];

    global.fetch = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method ?? "GET";
          const parsedBody =
            typeof init?.body === "string" ? JSON.parse(init.body) : null;
          requests.push({
            url,
            method,
            scope: parsedBody?.scope,
            purpose: parsedBody?.purpose,
          });

          if (
            url === "/api/agency/trip-records/export-jobs" &&
            method === "POST"
          ) {
            const requestedOrderId = parsedBody?.scope?.orderId;
            if (requestedOrderId === SHARED_ORDER_A) {
              return jsonResponse(200, {
                data: { job_id: JOB_A, status: "completed" },
              });
            }
            if (requestedOrderId === SHARED_ORDER_B) {
              return jsonResponse(200, {
                data: { job_id: JOB_B, status: "completed" },
              });
            }
          }
          if (
            url === `/api/agency/trip-records/export-jobs/${JOB_A}/download`
          ) {
            return firstDownload.promise;
          }
          if (
            url === `/api/agency/trip-records/export-jobs/${JOB_B}/download`
          ) {
            return jsonResponse(200, {
              data: { download: { download_url: URL_B } },
            });
          }
          throw new Error(`Unexpected BFF request: ${method} ${url}`);
        },
      );

    render(
      React.createElement(TripExportPanel, {
        initialScope: { orderId: SHARED_ORDER_A },
        locale: "zh",
      }),
    );

    const purposeInput = screen.getByLabelText("匯出目的（必填）");
    fireEvent.change(purposeInput, {
      target: { value: "受控同單匯出示意" },
    });

    const createBtn = screen.getByRole("button", { name: "建立匯出" });
    fireEvent.click(createBtn);

    expect(await screen.findByText(JOB_A)).toBeTruthy();
    expect(screen.getByText(/狀態：已完成/)).toBeTruthy();

    // Start job A's download request, held pending
    fireEvent.click(screen.getByRole("button", { name: "取得下載連結" }));

    // Switch orderId input to shared order B
    const orderIdInput = screen.getByLabelText(
      "訂單 ID（精確）",
    ) as HTMLInputElement;
    expect(orderIdInput.value).toBe(SHARED_ORDER_A);
    fireEvent.change(orderIdInput, { target: { value: SHARED_ORDER_B } });

    // Previous job A is cleared upon changing scope while purpose is preserved
    expect(screen.queryByText(JOB_A)).toBeNull();
    expect((purposeInput as HTMLTextAreaElement).value).toBe(
      "受控同單匯出示意",
    );

    // Create job B and request its download link
    fireEvent.click(createBtn);
    expect(await screen.findByText(JOB_B)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取得下載連結" }));
    const linkBefore = await screen.findByRole("link", {
      name: "下載（連結有效期限內）",
    });
    expect(linkBefore.getAttribute("href")).toBe(URL_B);

    // Deliver late download response for job A
    await React.act(async () => {
      firstDownload.resolve(200, {
        data: { download: { download_url: URL_A } },
      });
    });

    expect(orderIdInput.value).toBe(SHARED_ORDER_B);
    expect(screen.getByText(JOB_B)).toBeTruthy();
    expect(screen.queryByText(JOB_A)).toBeNull();
    const linkAfter = screen.getByRole("link", {
      name: "下載（連結有效期限內）",
    });
    expect(linkAfter.getAttribute("href")).toBe(URL_B);
    expect(screen.queryByRole("alert")).toBeNull();

    expect(requests.map((r) => ({ url: r.url, scope: r.scope }))).toEqual([
      {
        url: "/api/agency/trip-records/export-jobs",
        scope: { orderId: SHARED_ORDER_A },
      },
      {
        url: `/api/agency/trip-records/export-jobs/${JOB_A}/download`,
        scope: undefined,
      },
      {
        url: "/api/agency/trip-records/export-jobs",
        scope: { orderId: SHARED_ORDER_B },
      },
      {
        url: `/api/agency/trip-records/export-jobs/${JOB_B}/download`,
        scope: undefined,
      },
    ]);
  });

  it("keeps state consistent when rapidly creating two jobs and their create responses arrive in reverse order", async () => {
    const createA = deferredResponse();
    const createB = deferredResponse();

    global.fetch = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method ?? "GET";
          const parsedBody =
            typeof init?.body === "string" ? JSON.parse(init.body) : null;

          if (
            url === "/api/agency/trip-records/export-jobs" &&
            method === "POST"
          ) {
            if (parsedBody?.scope?.orderId === SHARED_ORDER_A) {
              return createA.promise;
            }
            if (parsedBody?.scope?.orderId === SHARED_ORDER_B) {
              return createB.promise;
            }
          }
          if (
            url === `/api/agency/trip-records/export-jobs/${JOB_B}/download`
          ) {
            return jsonResponse(200, {
              data: { download: { download_url: URL_B } },
            });
          }
          throw new Error(`Unexpected BFF request: ${method} ${url}`);
        },
      );

    render(
      React.createElement(TripExportPanel, {
        initialScope: { orderId: SHARED_ORDER_A },
        locale: "en",
      }),
    );

    const purposeInput = screen.getByLabelText("Export Purpose (Required)");
    fireEvent.change(purposeInput, {
      target: { value: "Rapid dual export verification" },
    });

    const createBtn = screen.getByRole("button", { name: "Create Export Job" });
    // Trigger create A (stays pending)
    fireEvent.click(createBtn);

    // Immediately switch scope to order B and trigger create B
    const orderIdInput = screen.getByLabelText("Order ID (Exact)");
    fireEvent.change(orderIdInput, { target: { value: SHARED_ORDER_B } });
    fireEvent.click(createBtn);

    // Create B resolves first
    await React.act(async () => {
      createB.resolve(200, {
        data: { job_id: JOB_B, status: "completed" },
      });
    });

    expect(await screen.findByText(JOB_B)).toBeTruthy();
    expect(screen.getByText(/Status: Completed/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Get Download Link" }));
    const downloadLink = await screen.findByRole("link", {
      name: "Download (while signed link is valid)",
    });
    expect(downloadLink.getAttribute("href")).toBe(URL_B);

    // Late Create A resolves with running job-A
    await React.act(async () => {
      createA.resolve(200, {
        data: { job_id: JOB_A, status: "running" },
      });
    });

    expect(screen.getByText(JOB_B)).toBeTruthy();
    expect(screen.queryByText(JOB_A)).toBeNull();
    expect(screen.getByText(/Status: Completed/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Download (while signed link is valid)" })
        .getAttribute("href"),
    ).toBe(URL_B);
  });

  it("ignores stale preview, status refresh, and download errors from an earlier scope or job after switching to a new scope/job", async () => {
    const previewA = deferredResponse();
    const statusA = deferredResponse();
    const downloadErrorA = deferredResponse();

    global.fetch = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method ?? "GET";
          const parsedBody =
            typeof init?.body === "string" ? JSON.parse(init.body) : null;

          if (
            url === "/api/agency/trip-records/export-jobs/preview" &&
            method === "POST"
          ) {
            if (parsedBody?.scope?.orderId === SHARED_ORDER_A) {
              return previewA.promise;
            }
            if (parsedBody?.scope?.orderId === SHARED_ORDER_B) {
              return jsonResponse(200, { data: { record_count: 1 } });
            }
          }
          if (
            url === "/api/agency/trip-records/export-jobs" &&
            method === "POST"
          ) {
            if (parsedBody?.scope?.orderId === SHARED_ORDER_A) {
              return jsonResponse(200, {
                data: { job_id: JOB_A, status: "completed" },
              });
            }
            if (parsedBody?.scope?.orderId === SHARED_ORDER_B) {
              return jsonResponse(200, {
                data: { job_id: JOB_B, status: "completed" },
              });
            }
          }
          if (
            url === `/api/agency/trip-records/export-jobs/${JOB_A}` &&
            method === "GET"
          ) {
            return statusA.promise;
          }
          if (
            url === `/api/agency/trip-records/export-jobs/${JOB_A}/download`
          ) {
            return downloadErrorA.promise;
          }
          if (
            url === `/api/agency/trip-records/export-jobs/${JOB_B}/download`
          ) {
            return jsonResponse(200, {
              data: { download: { download_url: URL_B } },
            });
          }
          throw new Error(`Unexpected BFF request: ${method} ${url}`);
        },
      );

    render(
      React.createElement(TripExportPanel, {
        initialScope: { orderId: SHARED_ORDER_A },
        locale: "zh",
      }),
    );

    // 1. Start preview for order A (stays pending)
    fireEvent.click(screen.getByRole("button", { name: "預覽筆數" }));

    // 2. Create job A, start status refresh and download for job A (both stay pending)
    fireEvent.change(screen.getByLabelText("匯出目的（必填）"), {
      target: { value: "跨工作狀態與預覽隔離測試" },
    });
    fireEvent.click(screen.getByRole("button", { name: "建立匯出" }));
    expect(await screen.findByText(JOB_A)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重新查詢狀態" }));
    fireEvent.click(screen.getByRole("button", { name: "取得下載連結" }));

    // 3. Change scope to order B, preview order B (count: 1), create job B, and get job B download link
    fireEvent.change(screen.getByLabelText("訂單 ID（精確）"), {
      target: { value: SHARED_ORDER_B },
    });

    fireEvent.click(screen.getByRole("button", { name: "預覽筆數" }));
    expect(await screen.findByText("符合保存期間的筆數：1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "建立匯出" }));
    expect(await screen.findByText(JOB_B)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取得下載連結" }));
    expect(
      (
        await screen.findByRole("link", { name: "下載（連結有效期限內）" })
      ).getAttribute("href"),
    ).toBe(URL_B);

    // 4. Late responses from order A / job A arrive out of order (including stale count 99, running status, and 403 error)
    await React.act(async () => {
      previewA.resolve(200, { data: { record_count: 99 } });
      statusA.resolve(200, { data: { status: "running" } });
      downloadErrorA.resolve(403, {
        error: { code: "FORBIDDEN", message: "Forbidden" },
      });
    });

    // Order B / Job B state remains completely intact
    expect(screen.getByText("符合保存期間的筆數：1")).toBeTruthy();
    expect(screen.queryByText("符合保存期間的筆數：99")).toBeNull();
    expect(screen.getByText(JOB_B)).toBeTruthy();
    expect(screen.getByText(/狀態：已完成/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "下載（連結有效期限內）" })
        .getAttribute("href"),
    ).toBe(URL_B);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears stale preview count, job status, download link, and error alert immediately when scope filters change", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { record_count: 3 } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { job_id: JOB_A, status: "completed" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { download: { download_url: URL_A } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(500, {
          error: { code: "INTERNAL_ERROR", message: "Temporary failure" },
        }),
      );

    render(
      React.createElement(TripExportPanel, {
        initialScope: { month: "2026-11", orderId: SHARED_ORDER_A },
        locale: "zh",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "預覽筆數" }));
    expect(await screen.findByText("符合保存期間的筆數：3")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("匯出目的（必填）"), {
      target: { value: "單筆建立與範圍變更清理驗證" },
    });
    fireEvent.click(screen.getByRole("button", { name: "建立匯出" }));
    expect(await screen.findByText(JOB_A)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取得下載連結" }));
    expect(
      (
        await screen.findByRole("link", { name: "下載（連結有效期限內）" })
      ).getAttribute("href"),
    ).toBe(URL_A);

    // Trigger an error on refresh status
    fireEvent.click(screen.getByRole("button", { name: "重新查詢狀態" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    // Change month scope filter -> clears previous scope's count, job, download link, and error
    fireEvent.change(screen.getByLabelText("月份"), {
      target: { value: "2026-10" },
    });

    expect(screen.queryByText("符合保存期間的筆數：3")).toBeNull();
    expect(screen.queryByText(JOB_A)).toBeNull();
    expect(
      screen.queryByRole("link", { name: "下載（連結有效期限內）" }),
    ).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByLabelText("匯出目的（必填）") as HTMLTextAreaElement).value,
    ).toBe("單筆建立與範圍變更清理驗證");
  });

  it("preserves single-job preview/create/refresh/download flow and ignores reverse-order status or download responses on the same job", async () => {
    const firstStatusPoll = deferredResponse();
    const firstDownloadReq = deferredResponse();

    global.fetch = vi
      .fn()
      // 1. preview
      .mockResolvedValueOnce(jsonResponse(200, { data: { record_count: 2 } }))
      // 2. create (running)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { job_id: JOB_B, status: "running" },
        }),
      )
      // 3. first status refresh (slow, will resolve late with "running")
      .mockImplementationOnce(() => firstStatusPoll.promise)
      // 4. second status refresh (fast, resolves immediately with "completed")
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { status: "completed" } }),
      )
      // 5. first download request (slow, will resolve late with 500 error)
      .mockImplementationOnce(() => firstDownloadReq.promise)
      // 6. second download request (fast, resolves immediately with signed URL_B)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { download: { download_url: URL_B } },
        }),
      );

    render(
      React.createElement(TripExportPanel, {
        initialScope: { orderId: SHARED_ORDER_B },
        locale: "zh",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "預覽筆數" }));
    expect(await screen.findByText("符合保存期間的筆數：2")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("匯出目的（必填）"), {
      target: { value: "單筆工作重疊狀態與下載回歸" },
    });
    fireEvent.click(screen.getByRole("button", { name: "建立匯出" }));
    expect(await screen.findByText(JOB_B)).toBeTruthy();
    expect(screen.getByText(/狀態：執行中/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "取得下載連結",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    const refreshBtn = screen.getByRole("button", { name: "重新查詢狀態" });
    // First status poll (pending) + second status poll (resolves to completed)
    fireEvent.click(refreshBtn);
    fireEvent.click(refreshBtn);
    expect(await screen.findByText(/狀態：已完成/)).toBeTruthy();

    // Earlier status poll arrives late with "running" -> must not downgrade "completed"
    await React.act(async () => {
      firstStatusPoll.resolve(200, { data: { status: "running" } });
    });
    expect(screen.getByText(/狀態：已完成/)).toBeTruthy();

    const downloadBtn = screen.getByRole("button", { name: "取得下載連結" });
    expect((downloadBtn as HTMLButtonElement).disabled).toBe(false);

    // First download request (pending) + second download request (resolves URL_B)
    fireEvent.click(downloadBtn);
    fireEvent.click(downloadBtn);
    const link = await screen.findByRole("link", {
      name: "下載（連結有效期限內）",
    });
    expect(link.getAttribute("href")).toBe(URL_B);

    // Earlier download request fails late with HTTP 500 -> must not clear URL_B or show alert
    await React.act(async () => {
      firstDownloadReq.resolve(500, {
        error: { code: "STALE_DOWNLOAD_FAILURE", message: "Stale failure" },
      });
    });

    expect(
      screen
        .getByRole("link", { name: "下載（連結有效期限內）" })
        .getAttribute("href"),
    ).toBe(URL_B);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
