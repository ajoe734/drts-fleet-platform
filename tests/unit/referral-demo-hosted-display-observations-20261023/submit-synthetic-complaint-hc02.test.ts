import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import {
  submitSyntheticComplaint,
  type DisplayObservationsParams,
} from "../../e2e/owned-referral-business-journey/display-observations";
import { Evidence } from "../../e2e/owned-referral-business-journey/protocol";

// HC02 (Root-formal-e230-review-HC02-request-changes.json): the ACK must
// resolve from the exact captured POST, never from a different request that
// merely echoes the same orderId/idempotencyKey. These fakes implement only
// the Page/Request/Response surface submitSyntheticComplaint actually calls.

type RequestListener = (request: FakeRequest) => void;

class FakeResponse {
  constructor(
    private readonly payload: unknown,
    private readonly okValue = true,
    private readonly duringJson?: () => void,
  ) {}
  ok(): boolean {
    return this.okValue;
  }
  async json(): Promise<unknown> {
    this.duringJson?.();
    // Yield a microtask so a request emitted by duringJson() reaches the
    // page's "request" listeners before this promise settles.
    await Promise.resolve();
    return this.payload;
  }
}

class FakeRequest {
  private settled = false;
  private settledResponse: FakeResponse | null = null;
  private waiters: Array<(value: FakeResponse | null) => void> = [];
  constructor(
    private readonly urlValue: string,
    private readonly body: unknown,
  ) {}
  url(): string {
    return this.urlValue;
  }
  method(): string {
    return "POST";
  }
  postDataJSON(): unknown {
    return this.body;
  }
  response(): Promise<FakeResponse | null> {
    if (this.settled) return Promise.resolve(this.settledResponse);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  resolveResponse(response: FakeResponse | null): void {
    this.settled = true;
    this.settledResponse = response;
    for (const waiter of this.waiters) waiter(response);
    this.waiters = [];
  }
}

class FakePage {
  private listeners: RequestListener[] = [];
  constructor(private readonly onSubmitClick: () => void) {}
  getByLabel() {
    return { fill: async () => undefined };
  }
  getByRole() {
    return {
      click: async () => {
        this.onSubmitClick();
      },
    };
  }
  on(event: string, listener: RequestListener): void {
    if (event === "request") this.listeners.push(listener);
  }
  off(event: string, listener: RequestListener): void {
    if (event === "request")
      this.listeners = this.listeners.filter((l) => l !== listener);
  }
  waitForRequest(
    predicate: (request: FakeRequest) => boolean,
  ): Promise<FakeRequest> {
    return new Promise((resolve) => {
      const listener: RequestListener = (request) => {
        if (predicate(request)) {
          this.off("request", listener);
          resolve(request);
        }
      };
      this.on("request", listener);
    });
  }
  emit(request: FakeRequest): void {
    for (const listener of [...this.listeners]) listener(request);
  }
}

async function makeParams(
  page: FakePage,
  directory: string,
): Promise<DisplayObservationsParams> {
  return {
    page: page as unknown as Page,
    referral: async () => {
      throw new Error("unused in this unit test");
    },
    evidence: new Evidence(),
    referralOrigin: "https://referral.example.test",
    entrySlug: "demo-entry",
    entryHost: "demo.example.test",
    completedOrderId: "order-completed",
    unassignedCancelledOrderId: undefined,
    nonce: "nonce-hc02",
    directory,
    definitionSha: "a".repeat(40),
    runtimeSha: "b".repeat(40),
  };
}

describe("submitSyntheticComplaint (HC02 request/response binding)", () => {
  it("resolves the ACK from the exact captured POST (good-ACK case)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hc02-good-"));
    try {
      const orderId = "order-good";
      const submitUrl = `https://referral.example.test/api/referral/complaints/${orderId}`;
      let captured: FakeRequest | undefined;
      const page = new FakePage(() => {
        captured = new FakeRequest(submitUrl, {
          orderId,
          contactRequested: false,
          idempotencyKey: "key-good",
        });
        page.emit(captured);
        queueMicrotask(() => {
          captured?.resolveResponse(
            new FakeResponse({
              ok: true,
              data: {
                orderId,
                caseNo: "CASE-GOOD",
                idempotencyKey: "key-good",
              },
            }),
          );
        });
      });
      const result = await submitSyntheticComplaint(
        await makeParams(page, directory),
        orderId,
      );
      expect(result.caseNo).toBe("CASE-GOOD");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects when a second same-URL POST appears, even echoing the same orderId/idempotencyKey (wrong-request case)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hc02-wrong-"));
    try {
      const orderId = "order-wrong";
      const submitUrl = `https://referral.example.test/api/referral/complaints/${orderId}`;
      const page = new FakePage(() => {
        const original = new FakeRequest(submitUrl, {
          orderId,
          contactRequested: false,
          idempotencyKey: "key-original",
        });
        const duplicate = new FakeRequest(submitUrl, {
          orderId,
          contactRequested: false,
          idempotencyKey: "key-original",
        });
        page.emit(original);
        page.emit(duplicate);
        // The stray duplicate's response resolves first, echoing the same
        // orderId/idempotencyKey as the original command: the pre-fix code
        // would have accepted this as the original ACK via a URL+method
        // filter alone.
        duplicate.resolveResponse(
          new FakeResponse({
            ok: true,
            data: {
              orderId,
              caseNo: "CASE-WRONG",
              idempotencyKey: "key-original",
            },
          }),
        );
        queueMicrotask(() => {
          original.resolveResponse(
            new FakeResponse({
              ok: true,
              data: {
                orderId,
                caseNo: "CASE-ORIGINAL",
                idempotencyKey: "key-original",
              },
            }),
          );
        });
      });
      await expect(
        submitSyntheticComplaint(await makeParams(page, directory), orderId),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects when a duplicate POST arrives while awaiting the JSON body (late-duplicate case)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hc02-late-"));
    try {
      const orderId = "order-late-dup";
      const submitUrl = `https://referral.example.test/api/referral/complaints/${orderId}`;
      const page = new FakePage(() => {
        const original = new FakeRequest(submitUrl, {
          orderId,
          contactRequested: false,
          idempotencyKey: "key-late",
        });
        page.emit(original);
        queueMicrotask(() => {
          original.resolveResponse(
            new FakeResponse(
              {
                ok: true,
                data: {
                  orderId,
                  caseNo: "CASE-LATE",
                  idempotencyKey: "key-late",
                },
              },
              true,
              () => {
                // The single-POST invariant must still be checked after this
                // point: a duplicate arriving mid-read of the body must not
                // slip past a check that only ran before response.json().
                page.emit(
                  new FakeRequest(submitUrl, {
                    orderId,
                    contactRequested: false,
                    idempotencyKey: "key-late",
                  }),
                );
              },
            ),
          );
        });
      });
      await expect(
        submitSyntheticComplaint(await makeParams(page, directory), orderId),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
