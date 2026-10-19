// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as canvas from "../../../packages/ui-web/src/index";
import { ApiClient, ApiClientError } from "../../../packages/api-client/src";
import { t as translate } from "../../../apps/platform-admin-web/lib/translations";
import {
  ApiRequestError,
  toApiErrorEnvelope,
} from "../../../apps/api/src/common/api-envelope";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import { fixture, identity, publicAudits } from "./wire-fixture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function mount() {
  const h = await fixture();
  const client = new ApiClient({ baseUrl: "https://public-info.example" });
  const requests: { method: string; path: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname });
    const parts = url.pathname
      .replace(/^\/api\/platform-admin\//, "")
      .split("/");
    try {
      let envelope: unknown;
      if (parts[0] === "placards" && method === "GET")
        envelope = await h.controller.listPlacardVersions();
      else if (parts[0] === "public-info" && method === "GET")
        envelope = h.controller.listPublicInfoVersions();
      else if (parts[0] === "public-info" && method === "DELETE")
        envelope = await h.controller.deleteDraftPublicInfoVersion(
          parts[1]!,
          identity,
        );
      else if (parts[0] === "public-info" && parts[2] === "publish")
        envelope = await h.controller.publishPublicInfoVersion(
          parts[1]!,
          JSON.parse(String(init?.body)),
          identity,
        );
      else if (parts[0] === "public-info" && method === "POST")
        envelope = await h.controller.createPublicInfoVersion(
          JSON.parse(String(init?.body)),
        );
      else
        throw new Error(
          `Unexpected controlled route ${method} ${url.pathname}`,
        );
      return Response.json(deepToSnakeCase(envelope));
    } catch (error) {
      // Only the HTTP/socket exception boundary is controlled. The real
      // command/repository rejection reaches the production SDK error parser.
      if (error instanceof ApiRequestError)
        return Response.json(error.getResponse(), {
          status: error.getStatus(),
        });
      return Response.json(
        toApiErrorEnvelope(
          "TEST_STORAGE_UNAVAILABLE",
          error instanceof Error ? error.message : "Controlled storage failure",
        ),
        { status: 503 },
      );
    }
  });
  const appRoot = resolve("apps/platform-admin-web");
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@drts/api-client": { ApiClient, ApiClientError },
    "@/lib/admin-client": {
      usePlatformAdminClient: () => client,
      formatDateTime: (value: string) => value,
    },
    "@/lib/i18n": {
      useTranslation: () => ({
        locale: "en",
        t: (key: string) => translate(key, "en"),
      }),
    },
    "@/components/assistant/route-context": {
      usePlatformAdminAssistantPage() {},
    },
  });
  const { default: Page } = load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/switchboard/page.tsx"),
  );
  render(React.createElement(Page));
  await screen.findByText(h.draft.title);
  return { ...h, requests };
}
async function prepare(operation: "create" | "publish" | "delete") {
  if (operation === "create") {
    fireEvent.click(
      screen.getByRole("button", {
        name: (name) => name.includes("Create draft"),
      }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Mounted canonical draft" },
    });
    return screen
      .getAllByRole("button", { name: (name) => name.includes("Create draft") })
      .at(-1)!;
  }
  fireEvent.click(
    screen.getByRole("button", {
      name: (name) => name.includes("Publish version"),
    }),
  );
  if (operation === "delete")
    return screen.getByRole("button", {
      name: (name) => name.includes("Delete"),
    });
  fireEvent.change(
    screen.getByPlaceholderText("Why is this version being published now?"),
    { target: { value: "Verified publication for this version" } },
  );
  return screen.getByRole("button", {
    name: (name) => name.includes("Confirm publish"),
  });
}

it.each(["create", "publish", "delete"] as const)(
  "actual mounted switchboard waits for %s ACK before receipt or refreshed state",
  async (operation) => {
    const h = await mount();
    const submit = await prepare(operation);
    const gate = h.wire.pause("write");
    try {
      await act(async () => {
        fireEvent.click(submit);
        await Promise.resolve();
      });
      await gate.entered;
      expect(publicAudits(h.audit)).toHaveLength(0);
      expect(
        screen.queryByText(
          /Audit receipt: public info draft created|Audit receipt: published public info/,
        ),
      ).toBeNull();
      expect(
        screen.queryByText(
          operation === "create"
            ? "Create public info draft"
            : "Publish public info version",
        ),
      ).not.toBeNull();
      if (operation !== "create")
        expect(
          h.service
            .listPublicInfoVersions()
            .find((row) => row.versionId === h.draft.versionId)?.status,
        ).toBe("draft");
    } finally {
      await act(async () => {
        gate.release();
      });
    }
    await waitFor(() => expect(publicAudits(h.audit)).toHaveLength(1));
    if (operation === "create")
      await screen.findByText("Mounted canonical draft");
    if (operation === "publish")
      expect(
        await h.repository.getPublicInfoVersionRecord(h.draft.versionId),
      ).toMatchObject({ status: "published", publishedBy: identity.actorId });
    if (operation === "delete")
      await waitFor(() =>
        expect(
          h.service
            .listPublicInfoVersions()
            .some((row) => row.versionId === h.draft.versionId),
        ).toBe(false),
      );
  },
);

it.each(["create", "publish", "delete"] as const)(
  "actual mounted switchboard presents %s canonical failure without a synthetic success receipt",
  async (operation) => {
    const h = await mount();
    const before = h.wire.snapshot();
    const submit = await prepare(operation);
    h.wire.failWrite = h.wire.writes + 1;
    await act(async () => {
      fireEvent.click(submit);
    });
    await screen.findAllByText(/Controlled canonical write failure/);
    expect(publicAudits(h.audit)).toHaveLength(0);
    expect(h.wire.snapshot()).toEqual(before);
    expect(
      screen.queryByText(
        /Audit receipt: public info draft created|Audit receipt: published public info/,
      ),
    ).toBeNull();
    expect(
      h.service
        .listPublicInfoVersions()
        .find((row) => row.versionId === h.draft.versionId)?.status,
    ).toBe("draft");
    expect(
      h.requests.filter(
        (row) => row.method === (operation === "delete" ? "DELETE" : "POST"),
      ),
    ).toHaveLength(1);
  },
);
