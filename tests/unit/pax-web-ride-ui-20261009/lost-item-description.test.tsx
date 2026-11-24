/** @vitest-environment jsdom */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ComplaintForm } from "../../../apps/passenger-app-web/components/ride/complaint-form";

const rideId = "11000000-0000-4000-8000-000000000001";
const complaintId = "case-001";
const path = `/api/passenger-app/rides/${rideId}/complaints`;

function openLostItem() {
  render(<ComplaintForm token={rideId} authMode="id" isOpen />);
  const category = screen.getByRole("combobox");
  fireEvent.change(category, { target: { value: "lost_item" } });
  return {
    category,
    details: screen.getByPlaceholderText(/請描述您的問題/),
    item: screen.getByRole<HTMLInputElement>("textbox", {
      name: /遺失物描述.*必填/,
    }),
    submit: screen.getByRole<HTMLButtonElement>("button", { name: "確認送出" }),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps lost-item submission disabled until both descriptions contain text", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { item, details, submit } = openLostItem();
  expect(item.required).toBe(true);
  fireEvent.change(details, { target: { value: "下車後才發現不見" } });
  for (const value of ["", "   "]) {
    fireEvent.change(item, { target: { value } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
  }
  fireEvent.change(item, { target: { value: "藍色錢包" } });
  expect(submit.disabled).toBe(false);
  fireEvent.change(details, { target: { value: "  " } });
  expect(submit.disabled).toBe(true);
  fireEvent.click(submit);
  expect(fetch).not.toHaveBeenCalled();
});

it("retries an unchanged lost-item report for the same ride and shows the returned case", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "UNAVAILABLE", message: "Retry" } },
        { status: 503 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ data: { complaintId } }));
  vi.stubGlobal("fetch", fetch);
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  const { item, details, submit } = openLostItem();
  fireEvent.change(details, { target: { value: "留在後座" } });
  fireEvent.change(item, { target: { value: "藍色錢包" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(submit);
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId("passenger-complaint-ack")).toBeNull();
  fireEvent.click(submit);
  expect(
    (await screen.findByTestId("passenger-complaint-id")).textContent,
  ).toBe(complaintId);
  expect(
    screen.getByTestId("passenger-complaint-ack").getAttribute("data-order-id"),
  ).toBe(rideId);
  expect(fetch.mock.calls).toHaveLength(2);
  const keys = fetch.mock.calls.map(([url, init]) => {
    expect(url).toBe(path);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      rideId,
      category: "lost_item",
      content: "留在後座",
      lostItemDescription: "藍色錢包",
      contactConsent: true,
    });
    return new Headers(init?.headers).get("idempotency-key");
  });
  expect(keys[0]).toMatch(/^complaint-/);
  expect(keys[1]).toBe(keys[0]);
});

it.each(["service", "fare", "other"])(
  "does not send lost-item details after switching to %s",
  async (categoryName) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ data: { complaintId } }));
    vi.stubGlobal("fetch", fetch);
    const { category, item, details, submit } = openLostItem();
    fireEvent.change(item, { target: { value: "先前填寫的物件" } });
    fireEvent.change(category, { target: { value: categoryName } });
    fireEvent.change(details, { target: { value: "其他補充" } });
    expect(screen.queryByRole("textbox", { name: /遺失物描述/ })).toBeNull();
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await screen.findByTestId("passenger-complaint-id");
    expect(fetch.mock.calls).toHaveLength(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(path);
    expect(JSON.parse(String(init?.body))).toEqual({
      rideId,
      category: categoryName,
      content: "其他補充",
      contactConsent: false,
    });
  },
);
