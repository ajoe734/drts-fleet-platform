// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { pdfWire } from "./fixture";
import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import { parsePdf } from "../billing-pdf-chinese-printable-content-20261016/pdf-parser";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function capture(name: string, value: unknown) {
  if (process.env.REFERRAL_PDF_FIXTURE_CAPTURE_DIR)
    fs.writeFileSync(
      process.env.REFERRAL_PDF_FIXTURE_CAPTURE_DIR + "/" + name + ".json",
      JSON.stringify(value, null, 2) + "\n",
    );
}

it("real canonical service/controller -> snake/deepCamel/BFF downloads a parseable embedded-Chinese PDF with actual fare and masked name", async () => {
  const f = await pdfWire();
  const response = await f.pdf();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("cache-control")).toContain("no-store");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
  expect(f.pdfDocuments.at(-1)).toMatchObject({
    orderId: f.orderId,
    sha256: hash(bytes),
    bytes: bytes.byteLength,
    formalTaxReceipt: false,
  });
  const parsed = await parsePdf(Buffer.from(bytes));
  expect(parsed.text).toContain("乘車明細（非正式稅務憑證）");
  expect(parsed.text).toContain("新北市中和區測試社區（A）\\B");
  expect(parsed.text).toContain("臺北車站東三門");
  expect(parsed.text).toContain("王*");
  expect(parsed.text).not.toContain("王小明");
  expect(parsed.text).not.toContain("0912345678");
  expect(parsed.text).toContain("2026/10/20 16:00:00");
  expect(parsed.text).toContain("用車服務：企業派車");
  expect(parsed.text).toContain("實際車資合計：NT$ 120");
  expect(parsed.text).toContain("起步價：NT$ 85");
  expect(parsed.text).toContain("夜間費：NT$ 10");
  expect(parsed.text).toContain("付款及結算狀態未提供");
  const chinese = parsed.glyphs.filter((g) =>
    /[\u3400-\u9fff]/u.test(g.unicode),
  );
  expect(chinese.length).toBeGreaterThan(20);
  expect(chinese.every((g) => g.isInFont)).toBe(true);
  capture("first", f.pdfDocuments.at(-1));
  if (process.env.REFERRAL_PDF_ARTIFACT_OUTPUT)
    fs.writeFileSync(process.env.REFERRAL_PDF_ARTIFACT_OUTPUT, bytes);
});
it("unknown actual fare remains unknown in the PDF rather than using the genuine quote estimate", async () => {
  const f = await pdfWire();
  const task = f.db.table("ops.phase1_driver_tasks").get("unit-pdf-task");
  f.db.table("ops.phase1_driver_tasks").set("unit-pdf-task", {
    ...task,
    fare: null,
    actualFareBreakdown: undefined,
  });
  const parsed = await parsePdf(
    Buffer.from(await (await f.pdf()).arrayBuffer()),
  );
  expect(parsed.text).toContain("實際車資待確認");
  expect(parsed.text).toContain("實際分項未提供");
  expect(parsed.text).not.toContain("實際車資合計：NT$ 0");
  capture("second", f.pdfDocuments.at(-1));
});
it("two genuine Referral subjects still use the existing original receipt ownership rule", async () => {
  const f = await domainFixture();
  const first = await f.identity("pdf-first"),
    second = await f.identity("pdf-second");
  const ack = await f.service.createReferralPassengerBooking(
    await f.command(first),
    first,
  );
  const row = await f.repository.findOrderById(ack.orderId);
  f.db
    .table("ops.phase1_owned_orders")
    .set(ack.orderId, { ...row, status: "completed" });
  await expect(
    f.service.getReferralPassengerReceiptPdf(ack.orderId, second),
  ).rejects.toMatchObject({ code: "PARTNER_SCOPE_MISMATCH" });
});
it.each(["created", "cancelled", "dispatch_timeout"])(
  "a %s trip cannot become a successful PDF receipt",
  async (status) => {
    const f = await pdfWire();
    await f.change({ status });
    const result = await f.pdf();
    expect(result.status).toBe(409);
    expect(result.headers.get("content-type")).not.toBe("application/pdf");
    expect(f.pdfDocuments).toHaveLength(0);
  },
);
it("a real original repository read failure stays an error instead of returning a sample PDF", async () => {
  const f = await pdfWire();
  f.db.failSql = /FROM ops\.phase1_owned_orders/;
  const result = await f.pdf();
  expect(result.status).toBe(503);
  expect(f.pdfDocuments).toHaveLength(0);
});
it("an existing font-source failure rejects the document rather than replacing Chinese characters", async () => {
  const f = await pdfWire();
  const read = fs.readFileSync;
  vi.spyOn(fs, "readFileSync").mockImplementation(((p: any, ...args: any[]) => {
    if (String(p).endsWith("NotoSansCJKtc-Regular.otf"))
      throw new Error("controlled font unavailable");
    return (read as any)(p, ...args);
  }) as any);
  const result = await f.pdf();
  expect(result.status).toBe(503);
  expect(f.pdfDocuments).toHaveLength(0);
});
it("long original Chinese route data wraps across real PDF pages without truncation", async () => {
  const f = await pdfWire();
  const row = await f.stored();
  if (!row) throw new Error("Actual owned receipt order missing");
  await f.change({
    dropoff: {
      ...row.dropoff,
      address: "長地址".repeat(2500) + "END完整目的地",
    },
  });
  const parsed = await parsePdf(
    Buffer.from(await (await f.pdf()).arrayBuffer()),
  );
  expect(parsed.pages.length).toBeGreaterThan(1);
  expect(parsed.text.replaceAll("\n", "")).toContain("END完整目的地");
});
it("the original TXT receipt download is byte-readable and unchanged alongside the new PDF", async () => {
  const f = await pdfWire();
  const response = await f.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/plain");
  const text = await response.text();
  expect(text).toContain("TOTAL FARE: NT$ 120");
  expect(text).toContain("Payment Channel: 付款及結算狀態未提供");
  expect(text).toContain("非正式稅務憑證");
});
