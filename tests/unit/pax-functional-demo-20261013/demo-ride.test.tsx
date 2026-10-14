// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DemoRideScreen,
  RideScreen,
} from "../../../apps/passenger-app-web/components/demo/demo-ride-screen";
import {
  DemoHistoryScreen,
  HistoryScreen,
} from "../../../apps/passenger-app-web/components/demo/demo-history-screen";
import {
  getDemoState,
  resetDemo,
  stopDemo,
  updateDemoState,
} from "../../../apps/passenger-app-web/lib/demo/store";
import type { DemoRide } from "../../../apps/passenger-app-web/lib/demo/types";
import { P5 } from "../../../apps/passenger-app-web/components/auth/ui";

const rideId = "demo-ride-unit";
function seedRide(): DemoRide {
  return {
    id: rideId,
    orderNo: "DEMO-UNIT-001",
    status: "reserved",
    origin: { address: "示意上車點", lat: 25.0478, lng: 121.517 },
    destination: { address: "示意下車點", lat: 25.0338, lng: 121.5645 },
    scheduledAt: "2099-10-13T02:00:00Z",
    createdAt: "2099-10-13T01:00:00Z",
    completedAt: null,
    cancelledAt: null,
    paymentMethodId: "demo-method",
    paymentStatus: "pending",
    amount: 240,
    estimatedMin: 220,
    estimatedMax: 260,
    driver: { name: "示範司機", plate: "DEMO-001", vehicle: "示意轎車" },
    operator: "示範營運者",
    rating: null,
    ratingTags: [],
    ratingComment: "",
    contactRequested: false,
    complaints: [],
  };
}
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
function finishRide() {
  for (const action of [
    "模擬司機接單",
    "模擬司機抵達",
    "模擬開始乘車",
    "模擬完成行程",
  ])
    click(action);
}
beforeEach(() => {
  window.localStorage.clear();
  resetDemo();
  updateDemoState((state) => {
    state.loggedIn = true;
    state.rides = [seedRide()];
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("explicit passenger demonstration: ride and history", () => {
  it("moves through every real demo-store stage, completes payment, and downloads a labelled receipt", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<RideScreen rideId={rideId} />);
    await screen.findByRole("button", { name: "模擬司機接單" });
    expect(screen.getByText(/不會派出車輛或實際扣款/)).toBeTruthy();
    click("模擬司機接單");
    expect(screen.getByText("DEMO-001")).toBeTruthy();
    click("模擬司機抵達");
    click("模擬開始乘車");
    expect(screen.queryByRole("button", { name: "取消此行程" })).toBeNull();
    click("模擬完成行程");
    expect(getDemoState()?.rides[0]?.status).toBe("completed");
    expect(getDemoState()?.rides[0]?.paymentStatus).toBe("paid");
    const link = screen.getByRole("link", { name: "下載示範乘車紀錄" });
    expect(link.getAttribute("download")).toBe("DEMO-UNIT-001.html");
    const receipt = decodeURIComponent(
      link.getAttribute("href")!.split(",")[1]!,
    );
    expect(receipt).toContain("非正式憑證");
    expect(receipt).toContain("示意上車點");
    expect(receipt).toContain("NT$ 240");
    expect(receipt).toContain("示意起跳費");
    expect(receipt).toContain("示意里程費");
    expect(receipt).toContain("示意延滯費");
    expect(receipt).toContain("示意夜間加成");
    expect(receipt).toContain("DEMO-***001");
    expect(receipt).toContain(`color:${P5.ink}`);
    expect(receipt).toContain(`border-bottom:1px solid ${P5.line}`);
    expect(receipt).toContain(`border:2px solid ${P5.brand}`);
    expect(receipt).not.toMatch(/#182638|#ddd|#315c9e/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists payment failure and retry, rating and navigation across remounts", async () => {
    const page = render(<DemoRideScreen rideId={rideId} />);
    await screen.findByRole("button", { name: "模擬司機接單" });
    finishRide();
    click("體驗扣款失敗");
    expect(getDemoState()?.rides[0]?.paymentStatus).toBe("failed");
    expect(screen.queryByRole("link", { name: "下載示範乘車紀錄" })).toBeNull();
    expect(screen.getByText("完成示範付款後即可下載乘車紀錄。")).toBeTruthy();
    click("重試示範付款");
    expect(screen.getByRole("link", { name: "下載示範乘車紀錄" })).toBeTruthy();
    click("2 星");
    click("駕駛態度");
    click("繞路");
    fireEvent.change(screen.getByLabelText("評價內容"), {
      target: { value: "希望車內更安靜" },
    });
    fireEvent.click(
      screen.getByLabelText("希望客服聯絡我（示範不會實際聯絡）"),
    );
    click("儲存示範評價");
    expect(getDemoState()?.rides[0]).toMatchObject({
      paymentStatus: "paid",
      rating: 2,
      ratingTags: ["繞路", "駕駛態度"],
      ratingComment: "希望車內更安靜",
      contactRequested: true,
    });
    page.unmount();
    const history = render(<DemoHistoryScreen />);
    const link = await screen.findByRole("link", {
      name: "查看行程 DEMO-UNIT-001",
    });
    expect(link.getAttribute("href")).toBe(`/ride?rideId=${rideId}`);
    expect(screen.getByText(/模擬付款成功/)).toBeTruthy();
    history.unmount();
    render(<DemoRideScreen rideId={rideId} />);
    await screen.findByRole("img", { name: "2 星" });
    expect(screen.getAllByText("希望車內更安靜").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("list", { name: "已儲存評價標籤" }).textContent,
    ).toContain("駕駛態度");
    expect(
      screen.getByText("已要求示範客服聯繫，示範客訴案件已建立。"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("評價內容")).toBeNull();
    expect(screen.queryByRole("button", { name: "儲存示範評價" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("uses canonical stars, persistent selectable tags and the 200-character comment boundary", async () => {
    render(<DemoRideScreen rideId={rideId} />);
    await screen.findByRole("button", { name: "模擬司機接單" });
    finishRide();
    const fourStars = screen.getByRole("button", { name: "4 星" });
    expect(fourStars.getAttribute("aria-pressed")).toBe("true");
    expect(fourStars.querySelector("svg path")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "車內整潔" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("switch")).toBeNull();
    click("2 星");
    expect(screen.getByText("2 不滿意")).toBeTruthy();
    expect(
      screen.getByText("開啟後送出將自動建立示範客訴案件，不會通知實際客服。"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "車內整潔" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(
      screen.getByRole("switch", {
        name: "希望客服聯絡我（示範不會實際聯絡）",
      }),
    );
    click("駕駛態度");
    click("5 星");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "駕駛態度" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    click("車內整潔");
    click("準時到達");
    click("路線順暢");
    click("路線順暢");
    const comment = screen.getByLabelText("評價內容") as HTMLTextAreaElement;
    expect(comment.maxLength).toBe(200);
    fireEvent.change(comment, { target: { value: "好".repeat(201) } });
    expect(comment.value).toBe("好".repeat(200));
    expect(screen.getByText("200 / 200")).toBeTruthy();
    click("儲存示範評價");
    expect(getDemoState()?.rides[0]).toMatchObject({
      rating: 5,
      ratingTags: ["準時到達", "車內整潔"],
      ratingComment: "好".repeat(200),
      contactRequested: false,
      complaints: [],
    });
    expect(
      screen.getByRole("list", { name: "已儲存評價標籤" }).textContent,
    ).toContain("準時到達");
    expect(screen.queryByRole("button", { name: "5 星" })).toBeNull();
    expect(screen.queryByRole("button", { name: "儲存示範評價" })).toBeNull();
  });

  it("acknowledges service and lost-item intake with persisted identifiers", async () => {
    render(<DemoRideScreen rideId={rideId} />);
    await screen.findByLabelText("問題描述");
    expect(screen.getByRole("button", { name: "送出示範案件" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(screen.getByLabelText("問題描述"), {
      target: { value: "希望確認上車時間" },
    });
    click("送出示範案件");
    const first = getDemoState()?.rides[0]?.complaints[0];
    expect(first).toMatchObject({
      category: "service",
      content: "希望確認上車時間",
      contactConsent: false,
    });
    expect(screen.getByText(`示範案件已受理：${first?.id}`)).toBeTruthy();
    const category = screen.getByLabelText("案件類型", {
      exact: true,
    }) as HTMLSelectElement;
    expect(category.labels?.[0]?.textContent).toBe("案件類型");
    fireEvent.change(category, {
      target: { value: "lost_item" },
    });
    fireEvent.change(screen.getByLabelText("遺失物描述"), {
      target: { value: "藍色雨傘" },
    });
    fireEvent.click(
      screen.getByLabelText("同意客服就此案件聯絡我（示範不會實際聯絡）"),
    );
    click("送出示範案件");
    expect(getDemoState()?.rides[0]?.complaints[1]).toMatchObject({
      category: "lost_item",
      lostItemDescription: "藍色雨傘",
      contactConsent: true,
    });
    expect(
      within(
        screen.getByRole("list", { name: "已送出的示範案件" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  it("requires cancellation confirmation and retains the cancelled trip in history", async () => {
    const page = render(<DemoRideScreen rideId={rideId} />);
    await screen.findByRole("button", { name: "取消此行程" });
    click("取消此行程");
    click("保留行程");
    expect(getDemoState()?.rides[0]?.status).toBe("reserved");
    click("取消此行程");
    click("確認取消行程");
    expect(getDemoState()?.rides[0]?.status).toBe("cancelled");
    expect(screen.queryByRole("button", { name: "模擬司機接單" })).toBeNull();
    expect(screen.queryByRole("link", { name: "下載示範乘車紀錄" })).toBeNull();
    page.unmount();
    render(<DemoHistoryScreen />);
    await screen.findByLabelText("篩選行程");
    fireEvent.change(screen.getByLabelText("篩選行程"), {
      target: { value: "cancelled" },
    });
    expect(
      screen.getByRole("link", { name: "查看行程 DEMO-UNIT-001" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("篩選行程"), {
      target: { value: "active" },
    });
    expect(
      screen.getByText("這個分類沒有行程。預約一趟示範行程即可體驗。"),
    ).toBeTruthy();
  });

  it("shows missing and signed-out states without inventing a trip", async () => {
    const page = render(<DemoRideScreen rideId="unknown" />);
    await screen.findByText("這筆示範行程不存在，或示範資料已重設。");
    expect(screen.queryByText("DEMO-UNIT-001")).toBeNull();
    page.unmount();
    updateDemoState((state) => {
      state.loggedIn = false;
    });
    render(<DemoRideScreen rideId={rideId} />);
    await screen.findByRole("link", { name: "前往登入" });
    expect(screen.queryByText("DEMO-UNIT-001")).toBeNull();
  });
});

describe("live mode keeps actual trip transport", () => {
  const liveRide = {
    order: {
      order_id: "live-1",
      order_no: "LIVE-1",
      status: "assigned",
      requested_pickup_at: "2099-10-13T02:00:00Z",
      pickup: { address: "真實上車點" },
      dropoff: { address: "真實下車點" },
    },
    actions: { can_cancel: false },
  };
  it("reads snake_case backend data and exposes no demo controls", async () => {
    stopDemo();
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ride: liveRide } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<RideScreen rideId="live-1" />);
    await screen.findByText("上車：真實上車點");
    expect(fetch).toHaveBeenCalledWith(
      "/api/passenger-app/rides/live-1",
      undefined,
    );
    expect(screen.queryByRole("button", { name: "模擬司機接單" })).toBeNull();
    expect(screen.queryByText("DEMO-UNIT-001")).toBeNull();
  });
  it("reports actual API errors and retries instead of filling demo history", async () => {
    stopDemo();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { rides: [liveRide] } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<HistoryScreen />);
    await screen.findByText("無法讀取行程，請稍後重試。");
    expect(screen.queryByText("DEMO-UNIT-001")).toBeNull();
    click("重新載入行程");
    await screen.findByRole("link", { name: "查看行程 LIVE-1" });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
