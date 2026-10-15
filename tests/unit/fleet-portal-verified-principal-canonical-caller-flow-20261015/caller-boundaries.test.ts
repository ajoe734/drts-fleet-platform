// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../apps/fleet-partner-portal-web/middleware";
import {
  NewDriverSubmissionForm,
  NewVehicleSubmissionForm,
} from "../../../apps/fleet-partner-portal-web/components/fleet-supply-workspace";
import { CaseReplyComposer } from "../../../apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer";
import type { FleetCaseItem } from "../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server";
import {
  fleetDocumentRequest,
  putFleetDocument,
} from "../../../apps/fleet-partner-portal-web/lib/fleet-document-upload";

// Only navigation and the browser's HTTP/cookie boundary are adapted. Real
// React forms, action buttons, upload helpers and middleware execute unchanged.
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let requests: Array<{
  path: string;
  method: string;
  headers: Headers;
  status: number;
}>;
beforeEach(() => {
  vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "");
  requests = [];
  document.cookie = "drts_session=existing-session; path=/";
  document.cookie = "drts_csrf=existing-csrf; path=/";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      // A browser sends same-origin cookies independently of the caller's headers.
      headers.set("cookie", document.cookie);
      headers.set("origin", "https://portal.test");
      const method = init.method ?? "GET";
      const result = middleware(
        new NextRequest(new URL(path, "https://portal.test"), {
          method,
          headers,
        }),
      );
      requests.push({ path, method, headers, status: result.status });
      // No proxy/backend fixture can hide a middleware denial.
      if (result.status !== 200) return result;
      return Response.json({ data: {} });
    }),
  );
});
afterEach(() => {
  cleanup();
  document.cookie = "drts_session=; max-age=0; path=/";
  document.cookie = "drts_csrf=; max-age=0; path=/";
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// These are defect-reproduction assertions, NOT successful browser acceptance.
// Replace the rejection assertions with middleware→proxy success when the
// Supervisor grants the three exact caller leaves listed in the task artifact.
it.each([
  ["drivers", NewDriverSubmissionForm],
  ["vehicles", NewVehicleSubmissionForm],
] as const)(
  "known gap: real %s create-entry is denied before the proxy",
  async (subject, Form) => {
    const { container } = render(
      createElement(Form, { draftScope: `csrf-${subject}` }),
    );
    const form = container.querySelector("form")!;
    await waitFor(() =>
      expect(form.querySelector("fieldset")!.disabled).toBe(false),
    );
    fireEvent.submit(form);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.path).toBe(
      `/control-plane-proxy/fleet-partner/supply-submissions/${subject}`,
    );
    expect(requests[0]!.headers.get("x-csrf-token")).toBeNull();
    expect(requests[0]!.status).toBe(403);
    await waitFor(() => expect(form.getAttribute("aria-busy")).toBe("false"));
    expect(router.push).not.toHaveBeenCalled();
  },
);

it("known gap: the real editable case-reply caller is denied before the proxy", async () => {
  render(
    createElement(CaseReplyComposer, {
      caseDetail: {
        id: "case-csrf",
        fleetPartnerId: "fleet-1",
        status: "open",
        responsibility: "fleet",
      } as FleetCaseItem,
      initialAttachments: [],
    }),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Existing caller reply" },
  });
  fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]!.path).toBe(
    "/control-plane-proxy/fleet-partner/cases/case-csrf/reply",
  );
  expect(requests[0]!.headers.get("x-csrf-token")).toBeNull();
  expect(requests[0]!.status).toBe(403);
  await screen.findByText("回覆送出失敗");
  expect(router.refresh).not.toHaveBeenCalled();
});

it("known gap: real document request/content/confirm helpers are denied before the proxy", async () => {
  const root = "/api/fleet-partner/cases/case-csrf/attachments";
  for (const path of [root, `${root}/attachment-1/confirm`]) {
    await expect(
      fleetDocumentRequest(path, { method: "POST", body: "{}" }),
    ).rejects.toThrow();
  }
  await expect(
    putFleetDocument(
      {
        uploadUrl: `${root}/content?objectKey=existing-object`,
        method: "PUT",
        headers: { "content-type": "application/pdf" },
      },
      new File(["bytes"], "proof.pdf", { type: "application/pdf" }),
    ),
  ).rejects.toThrow();
  expect(requests).toHaveLength(3);
  for (const request of requests) {
    expect(request.headers.get("x-csrf-token")).toBeNull();
    expect(request.status).toBe(403);
  }
});
