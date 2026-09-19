import { EventEmitter } from "node:events";
import { lookup } from "node:dns";
import { request, type RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { partnerNotificationHttpsFetch } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-https";
vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("node:dns", () => ({ lookup: vi.fn() }));

function harness(status = 202) {
  const response = new EventEmitter() as IncomingMessage;
  response.statusCode = status;
  response.destroy = vi.fn(() => response);
  const req = new EventEmitter() as ReturnType<typeof request>;
  let options: RequestOptions;
  req.end = vi.fn(() => req) as typeof req.end;
  vi.mocked(request).mockImplementation(((
    url: URL,
    supplied: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    options = supplied;
    req.end = vi.fn(() => {
      callback(response);
      return req;
    }) as typeof req.end;
    return req;
  }) as typeof request);
  return { response, req, options: () => options };
}
beforeEach(() => vi.resetAllMocks());
describe("bounded HTTPS client without a network server", () => {
  it("stops reading after 4 KiB and returns an invalid oversized ack", async () => {
    const h = harness();
    const result = partnerNotificationHttpsFetch(
      "https://partner.example.test/notify",
      { body: "signed bytes" },
    );
    h.response.emit("data", Buffer.alloc(4096));
    h.response.emit("data", Buffer.from("x"));
    expect(h.response.destroy).toHaveBeenCalledOnce();
    expect((await (await result).text!()).length).toBe(4097);
    expect(h.req.end).toHaveBeenCalledWith("signed bytes");
  });
  it("never follows a redirect", async () => {
    const h = harness(302);
    const result = partnerNotificationHttpsFetch(
      "https://partner.example.test/notify",
    );
    h.response.emit("end");
    expect(await result).toMatchObject({ ok: false, status: 302 });
    expect(request).toHaveBeenCalledOnce();
  });
  it("validates all DNS answers at the socket lookup and rejects mixed public/private results", async () => {
    const h = harness();
    const result = partnerNotificationHttpsFetch(
      "https://partner.example.test/notify",
    );
    const dns = h.options().lookup!;
    const callback = vi.fn();
    vi.mocked(lookup).mockImplementation(((
      _host: string,
      _options: unknown,
      done: (
        error: Error | null,
        addresses: { address: string; family: number }[],
      ) => void,
    ) =>
      done(null, [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ])) as typeof lookup);
    dns("partner.example.test", { all: true }, callback);
    expect(callback.mock.calls[0]![0]).toBeInstanceOf(Error);
    h.response.emit("end");
    await result;
  });
});
