/** @vitest-environment jsdom */
// PAX-PLAN-CERTIFICATE-20261102: the completed-ride, rating and E-04 ride
// certificate screens follow the operations plan (第二冊 附錄 E: E-04, E-18,
// E-18b). Only HTTP transport is substituted; the real mapper and components run.
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  MultiTaxiElectronicReceipt,
  PassengerRideAuthorityView,
} from "@drts/contracts";
import {
  PassengerRidePage,
  RideContent,
} from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import {
  mapPassengerCertificate,
  mapPassengerRideAuthorityToFixture,
} from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority } from "../pax-live-tracking-20261017/fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function receipt(
  overrides: Record<string, unknown> = {},
): MultiTaxiElectronicReceipt {
  return {
    receiptId: "PLAN-RECEIPT",
    orderId: "ETA-ORDER",
    receiptNo: "MTX-20260720-PLAN0001",
    amountMinor: 35500,
    currency: "TWD",
    issuedAt: "2026-07-20T07:07:30Z",
    record: {
      plateNo: "TST-0001",
      pickupAt: "2026-07-20T06:32:00Z",
      dropoffAt: "2026-07-20T07:07:00Z",
      travelDurationSeconds: 2100,
      routeSummary: "板橋車站（示範地點） → 府中站（示範地點）",
      distanceMeters: 6400,
      tollMinor: 0,
      consumerServicePhone: "02-2944-0985",
      authorityComplaintPhone: "1999",
      pdfUrl: "/api/passenger-app/rides/ETA-ORDER/receipt/artifacts/pdf",
      htmlUrl: "/api/passenger-app/rides/ETA-ORDER/receipt/artifacts/html",
      e04Snapshot: {
        fleetOperatorName: "智行車隊",
        driverSurname: "測試",
        driverRegistrationMasked: "••••0001",
        paymentMethodDisplay: "測試卡 ••••0000",
        fareBreakdown: {
          startMinor: 8500,
          distanceMinor: 24500,
          delayMinor: 2500,
          nightMinor: 0,
        },
      },
      ...overrides,
    },
  } as unknown as MultiTaxiElectronicReceipt;
}

function completedView(
  paymentStatus: "captured" | "failed",
): PassengerRideAuthorityView {
  const view = authority("completed");
  view.receipt = receipt();
  view.actions.canReadReceipt = true;
  view.actions.canRate = paymentStatus === "captured";
  view.payment = {
    status: paymentStatus,
    amount: { amountMinor: 35500, currency: "TWD" },
  } as PassengerRideAuthorityView["payment"];
  return view;
}

it("maps the receipt into the plan's E-04 rows, fare breakdown and trip summary", () => {
  const certificate = mapPassengerCertificate(receipt(), true);
  const rows = certificate.rows ?? [];
  const row = (label: string) => rows.find((item) => item.label === label);
  expect(rows.map((item) => item.label)).toEqual([
    "車隊／派遣業者",
    "車牌",
    "駕駛",
    "上車／下車時間",
    "起訖地點",
    "行駛里程",
    "行駛時間",
    "車資明細",
    "通行費",
    "車資合計",
    "支付方式",
    "客服電話",
    "主管機關申訴電話",
  ]);
  expect(row("車隊／派遣業者")?.value).toBe("智行車隊");
  expect(row("駕駛")).toMatchObject({
    value: "測試○○",
    secondary: "執登證號 ••••0001",
  });
  expect(row("上車／下車時間")?.value).toBe("2026/07/20 14:32 / 15:07");
  expect(row("行駛里程")?.value).toBe("6.4 公里");
  expect(row("行駛時間")?.value).toBe("35 分鐘");
  expect(row("車資明細")?.items).toEqual([
    { label: "起程", value: "NT$ 85", mono: true },
    { label: "續程", value: "NT$ 245", mono: true },
    { label: "延滯計時", value: "NT$ 25", mono: true },
    { label: "夜間加成", value: "NT$ 0", mono: true },
  ]);
  expect(row("車資合計")).toMatchObject({ value: "NT$ 355", emphasis: true });
  expect(certificate.receiptNo).toBe("MTX-20260720-PLAN0001");
  expect(certificate.trip).toEqual({
    timeRangeText: "2026/07/20 14:32 – 15:07",
    plateNo: "TST-0001",
    driverName: "測試○○",
    fareTotalText: "NT$ 355",
  });
});

it("prints Taiwan time and repeats the date when the trip crosses midnight", () => {
  const certificate = mapPassengerCertificate(
    receipt({
      pickupAt: "2026-07-20T15:50:00Z",
      dropoffAt: "2026-07-20T16:10:00Z",
    }),
    true,
  );
  expect(
    certificate.rows?.find((item) => item.label === "上車／下車時間")?.value,
  ).toBe("2026/07/20 23:50 / 2026/07/21 00:10");
  expect(certificate.trip?.timeRangeText).toBe(
    "2026/07/20 23:50 – 2026/07/21 00:10",
  );
});

it("the receipt route is the E-04 page: header, certificate, PDF and 分享 only", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ data: { ride: completedView("captured") } }),
    ),
  );
  render(<PassengerRidePage token="ETA-ORDER" authMode="id" kind="receipt" />);
  await screen.findByText("電子乘車證明");
  expect(screen.queryByText("行程已完成")).toBeNull();
  expect(screen.getByText("智行車隊")).toBeTruthy();
  expect(screen.getByText("執登證號 ••••0001")).toBeTruthy();
  expect(
    screen.getByText("證明編號 MTX-20260720-PLAN0001 · 個資已遮碼"),
  ).toBeTruthy();
  for (const absent of ["付款狀態", "服務評分", "客訴與遺失物表單"])
    expect(screen.queryByText(absent)).toBeNull();
  expect(screen.getByText("下載 PDF").closest("a")?.getAttribute("href")).toBe(
    "/api/passenger-app/rides/ETA-ORDER/receipt/artifacts/pdf",
  );
  expect(screen.getByRole("button", { name: "分享" })).toBeTruthy();
  expect(screen.getByText("返回行程").closest("a")?.getAttribute("href")).toBe(
    "/rides/ETA-ORDER",
  );
});

it("a completed ride shows the trip summary, keeps an unpaid state visible and requires a star", () => {
  const view = completedView("failed");
  const fixture = mapPassengerRideAuthorityToFixture(view, "ETA-ORDER");
  expect(fixture.screenId).toBe("P5-08");
  render(<RideContent fixture={fixture} token="ETA-ORDER" authMode="id" />);
  const summary = screen.getByText("本次行程").closest("section")!;
  const summaryText = summary.textContent ?? "";
  for (const fact of [
    "上車Test pickup",
    "下車Test dropoff",
    "時間2026/07/20 14:32 – 15:07",
    "車牌 · 駕駛TST-0001 · 測試○○",
    "車資NT$ 355",
  ])
    expect(summaryText).toContain(fact);
  // A failed payment still needs attention, so its status stays on the page.
  expect(screen.getByText("付款失敗")).toBeTruthy();
  const submit = screen.getByRole("button", { name: "目前無法評分" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText("車資合計")).toBeNull();
  expect(
    screen.getByText("查看電子乘車證明").closest("a")?.getAttribute("href"),
  ).toBe("/rides/ETA-ORDER/receipt");
  expect(screen.getByRole("button", { name: "客訴與遺失物表單" })).toBeTruthy();
});

it("a captured payment hides the payment card; the rating needs a star and explains the low-score case", async () => {
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { score: 2 } });
    }),
  );
  const fixture = mapPassengerRideAuthorityToFixture(
    completedView("captured"),
    "ETA-ORDER",
  );
  render(<RideContent fixture={fixture} token="ETA-ORDER" authMode="id" />);
  expect(screen.queryByText("付款狀態")).toBeNull();
  expect(screen.getByText("感謝您的搭乘，請為本次服務評分")).toBeTruthy();
  const submit = screen.getByRole("button", {
    name: "送出評分",
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(screen.getByText("請點選星等")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "4 星" }));
  expect(screen.getByText("4 滿意")).toBeTruthy();
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "2 星" }));
  expect(screen.getByText("2 不滿意")).toBeTruthy();
  const contact = screen.getByRole("switch", {
    name: "需要客服與您聯繫嗎？",
  }) as HTMLInputElement;
  expect(contact.checked).toBe(true);
  expect(contact.getAttribute("aria-describedby")).toBeTruthy();
  expect(
    document.getElementById(contact.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("送出後即建立客訴案件；開啟表示同意客服與您聯繫");
  const wellDone = screen.getByText("做得好（可複選）");
  expect(wellDone).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "繞路" }));
  fireEvent.change(screen.getByLabelText("補充意見（選填）"), {
    target: { value: "測試意見" },
  });
  expect(screen.getByText("4 / 200")).toBeTruthy();
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    rideId: "ETA-ORDER",
    rating: 2,
    tags: ["繞路"],
    comments: "測試意見",
    contactRequested: true,
  });
  await screen.findByText("評分已送出");
});

it("a rated ride offers the certificate, complaint form and home, without the rating form", () => {
  const view = completedView("captured");
  view.rating = { score: 5 } as PassengerRideAuthorityView["rating"];
  const fixture = mapPassengerRideAuthorityToFixture(view, "ETA-ORDER");
  expect(fixture.screenId).toBe("P5-09");
  render(<RideContent fixture={fixture} token="ETA-ORDER" authMode="id" />);
  expect(screen.getByText("感謝您的評價")).toBeTruthy();
  expect(
    within(screen.getByText("本次行程").closest("section")!).getByText(
      "TST-0001 · 測試○○",
    ),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "送出評分" })).toBeNull();
  expect(
    screen.getByText("查看電子乘車證明").closest("a")?.getAttribute("href"),
  ).toBe("/rides/ETA-ORDER/receipt");
  expect(screen.getByText("回到首頁").closest("a")?.getAttribute("href")).toBe(
    "/",
  );
  expect(screen.getByRole("button", { name: "客訴與遺失物表單" })).toBeTruthy();
});

it("does not link to a certificate the rider cannot read", () => {
  const view = completedView("captured");
  view.receipt = null;
  view.actions.canReadReceipt = false;
  const fixture = mapPassengerRideAuthorityToFixture(view, "ETA-ORDER");
  render(<RideContent fixture={fixture} token="ETA-ORDER" authMode="id" />);
  expect(screen.queryByText("查看電子乘車證明")).toBeNull();
  // Without a certificate the summary keeps only facts the ride itself has.
  const summaryText =
    screen.getByText("本次行程").closest("section")?.textContent ?? "";
  expect(summaryText).toContain("車牌 · 駕駛TEST-ETA");
  expect(summaryText).not.toContain("時間");
});
