// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { pdfWire } from "../referral-receipt-pdf-file-share-20261020/fixture";
import { parsePdf } from "../billing-pdf-chinese-printable-content-20261016/pdf-parser";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const E04_LABELS = [
  "證明編號",
  "車隊／派遣業者",
  "司機",
  "執業登記證號（遮碼）",
  "車牌",
  "上車時間（臺灣）",
  "下車時間（臺灣）",
  "路線",
  "實際里程",
  "起程",
  "續程",
  "延滯計時",
  "夜間加成",
  "車資合計",
  "支付方式",
  "客服電話",
  "主管機關申訴電話",
];

async function wireWithCompletedTask(patch: Record<string, unknown> = {}) {
  const f = await pdfWire();
  const table = f.db.table("ops.phase1_driver_tasks");
  table.set("unit-pdf-task", {
    ...table.get("unit-pdf-task"),
    startedAt: "2026-10-20T07:40:00Z",
    actualDistanceKm: 5.234,
    ...patch,
  });
  return f;
}

async function receiptOf(f: Awaited<ReturnType<typeof pdfWire>>) {
  return (
    await f.controller.getReferralPassengerReceipt(
      f.orderId,
      f.identity,
      "bureau-r03",
    )
  ).data;
}

const pdfText = async (f: Awaited<ReturnType<typeof pdfWire>>) =>
  (await parsePdf(Buffer.from(await (await f.pdf()).arrayBuffer()))).text;

it("projects pickup/drop-off times and actual distance from the same completed task into receipt, TXT and PDF", async () => {
  const f = await wireWithCompletedTask();
  const receipt = await receiptOf(f);
  expect(receipt).toMatchObject({
    pickupAt: "2026-10-20T07:40:00Z",
    dropoffAt: "2026-10-20T08:00:00Z",
    distanceMeters: 5234,
  });
  const txt = await (await f.text()).text();
  const pdf = await pdfText(f);
  for (const doc of [txt, pdf.replaceAll("\n", "")]) {
    expect(doc).toContain("E-04 乘車證明欄位");
    expect(doc).toContain("上車時間（臺灣）：2026/10/20 15:40:00");
    expect(doc).toContain("下車時間（臺灣）：2026/10/20 16:00:00");
    expect(doc).toContain("實際里程：5.23 公里（5234 公尺）");
    expect(doc).toContain(
      "路線：新北市中和區測試社區（A）\\B → 臺北車站東三門",
    );
    expect(doc).toContain("起程：NT$ 85");
    expect(doc).toContain("續程：NT$ 20");
    expect(doc).toContain("延滯計時：NT$ 5");
    expect(doc).toContain("夜間加成：NT$ 10");
    expect(doc).toContain("車資合計：NT$ 120");
    expect(doc).toContain("客服電話：02-2944-0985");
    expect(doc).toContain("主管機關申訴電話：1999");
    expect(doc).toContain("非正式稅務憑證");
  }
  for (const label of E04_LABELS) expect(txt).toContain(`${label}：`);
});

it("absent operator, registration, payment and certificate authority render 未提供 rather than a lookalike value", async () => {
  const f = await wireWithCompletedTask();
  const receipt = await receiptOf(f);
  expect(receipt).toMatchObject({
    fleetOperatorName: null,
    driverRegistrationMasked: null,
    paymentMethodDisplay: null,
    certificateNo: null,
  });
  const txt = await (await f.text()).text();
  const pdf = (await pdfText(f)).replaceAll("\n", "");
  for (const doc of [txt, pdf]) {
    expect(doc).toContain("證明編號：未提供");
    expect(doc).toContain("車隊／派遣業者：未提供");
    expect(doc).toContain("執業登記證號（遮碼）：未提供");
    expect(doc).toContain("支付方式：未提供");
    // The order number is never relabelled as an issued certificate.
    expect(doc).not.toContain(`證明編號：${receipt.orderNo}`);
    expect(doc).not.toMatch(/[•*]{4}\d{1,4}/);
  }
  // The existing payment/settlement wording is kept, not replaced by a status.
  expect(receipt.paymentChannel).toBe("付款及結算狀態未提供");
});

it("missing start time and distance stay 未提供 and are never taken from other timestamps or the quote", async () => {
  const f = await wireWithCompletedTask({
    startedAt: null,
    actualDistanceKm: null,
  });
  const receipt = await receiptOf(f);
  expect(receipt.pickupAt).toBeNull();
  expect(receipt.distanceMeters).toBeNull();
  const txt = await (await f.text()).text();
  expect(txt).toContain("上車時間（臺灣）：未提供");
  expect(txt).toContain("實際里程：未提供");
});

it("a genuine zero distance is kept as zero, not shown as missing", async () => {
  const f = await wireWithCompletedTask({ actualDistanceKm: 0 });
  expect((await receiptOf(f)).distanceMeters).toBe(0);
  const txt = await (await f.text()).text();
  expect(txt).toContain("實際里程：0.00 公里（0 公尺）");
});

it("reads operator, masked registration, declared surname and payment display from the existing receipt authorities", async () => {
  const f = await wireWithCompletedTask({
    driverSurname: "王",
    driverSurnameSource: "driver_profile_declared",
    driverSurnameProfileUpdatedAt: "2026-10-01T00:00:00Z",
  });
  const row = await f.stored();
  if (!row) throw new Error("order missing");
  const tokenRef = "0f0e0d0c-0b0a-4908-8706-050403020100";
  await f.change({
    operatingAuthorizationId: "auth-r03",
    paymentMethodTokenRef: tokenRef,
  });
  const service = f.service as any;
  const operatorIds = vi.fn(async (id: string) =>
    id === "auth-r03" ? "operator-r03" : null,
  );
  const operatorNames = vi.fn(async (id: string) =>
    id === "operator-r03" ? "合成車隊股份有限公司" : null,
  );
  const payments = vi.fn(async (_passengerId: string, ref: unknown) =>
    ref === tokenRef ? "信用卡 ••••4242" : null,
  );
  const identity = vi.fn(async (driverId: string) => ({
    surname: null,
    driverRegistrationMasked:
      driverId === "unit-pdf-driver" ? "••••5678" : null,
  }));
  service.receiptRegistryRepository = { findCompletionOperatorId: operatorIds };
  service.receiptFleetRepository = { findReceiptOperatorName: operatorNames };
  service.receiptPaymentMethods = { getReceiptDisplay: payments };
  service.regulatoryRegistryService.getDriverCompletionReceiptIdentity =
    identity;

  const receipt = await receiptOf(f);
  expect(receipt).toMatchObject({
    fleetOperatorName: "合成車隊股份有限公司",
    driverSurname: "王",
    driverSurnameSource: "driver_profile_declared",
    driverRegistrationMasked: "••••5678",
    paymentMethodDisplay: "信用卡 ••••4242",
    certificateNo: null,
  });
  expect(operatorIds).toHaveBeenCalledWith("auth-r03");
  expect(payments).toHaveBeenCalledWith(row.passenger.passengerId, tokenRef);
  expect(identity).toHaveBeenCalledWith("unit-pdf-driver");
  const txt = await (await f.text()).text();
  expect(txt).toContain("車隊／派遣業者：合成車隊股份有限公司");
  expect(txt).toContain("駕駛自填姓氏（非身分核驗）：王○○");
  expect(txt).toContain("執業登記證號（遮碼）：••••5678");
  expect(txt).toContain("支付方式：信用卡 ••••4242");
  expect(txt).toContain("證明編號：未提供");
  const pdf = (await pdfText(f)).replaceAll("\n", "");
  expect(pdf).toContain("車隊／派遣業者：合成車隊股份有限公司");
  expect(pdf).toContain("支付方式：信用卡 ••••4242");
});
