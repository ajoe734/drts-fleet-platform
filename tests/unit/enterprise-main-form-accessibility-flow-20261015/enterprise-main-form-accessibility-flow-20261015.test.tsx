// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEnterpriseBookingDraft,
  formatDefaultPlacard,
  type EnterpriseBookingDraftForm,
} from "../../../apps/enterprise-dispatch-web/lib/enterprise-booking-draft";
import {
  getEnterpriseAddresses,
  getEnterpriseCostCenters,
  getEnterprisePassengers,
} from "../../../apps/enterprise-dispatch-web/lib/enterprise-fixtures";
import {
  t as translate,
  type Locale,
  type TranslationKey,
} from "../../../apps/enterprise-dispatch-web/lib/translations";
import * as uiTokens from "@drts/ui-tokens";
import { tenantEnterpriseTheme } from "../../../apps/enterprise-dispatch-web/components/booking-form/theme";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/enterprise-dispatch-web");

function mountBookingForm(
  locale: Locale = "zh",
  draftOverrides: Partial<EnterpriseBookingDraftForm> = {},
  bookingId?: string,
) {
  let activeLocale: Locale = locale;
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, activeLocale);

  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-tokens": uiTokens,
    "next/link": {
      __esModule: true,
      default: ({
        href,
        children,
        ...rest
      }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
        React.createElement("a", { href, ...rest }, children),
    },
    "@/lib/i18n": {
      useTranslation: () => ({
        locale: activeLocale,
        setLocale: (next: Locale) => {
          activeLocale = next;
        },
        t: tr,
      }),
    },
  });

  const { EnterpriseBookingForm } = load<{
    EnterpriseBookingForm: React.ComponentType<{
      initialDraft: EnterpriseBookingDraftForm;
      passengers: string[];
      addresses: string[];
      costCenters: string[];
      bookingId?: string;
    }>;
  }>(resolve(appRoot, "components/booking-form/enterprise-booking-form.tsx"));

  const baseDraft = createEnterpriseBookingDraft(
    locale,
    { entry: "self" },
    new Date("2026-10-15T06:00:00.000Z"),
  );
  const initialDraft: EnterpriseBookingDraftForm = {
    ...baseDraft,
    reservationDate: "2026-10-16",
    reservationTime: "14:00",
    ...draftOverrides,
  };

  const rendered = render(
    <EnterpriseBookingForm
      initialDraft={initialDraft}
      passengers={getEnterprisePassengers(locale)}
      addresses={getEnterpriseAddresses(locale)}
      costCenters={getEnterpriseCostCenters(locale)}
      {...(bookingId ? { bookingId } : {})}
    />,
  );

  return { ...rendered, tr, initialDraft };
}

describe("ENTERPRISE-MAIN-FORM-ACCESSIBILITY-FLOW-20261015 — Mounted EnterpriseBookingForm Accessibility Wiring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-15 14:00:00 Asia/Taipei (+08:00) = 2026-10-15T06:00:00.000Z
    vi.setSystemTime(new Date("2026-10-15T06:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("C120-F1: enterprise-form_actual-accessible-names-and-descriptions", () => {
    it("wires unique, stable IDs and HTML label associations to all mounted editable, select, and textarea controls in zh and en", () => {
      for (const locale of ["zh", "en"] as const) {
        cleanup();
        const { container, tr } = mountBookingForm(locale, {
          passengerMode: "other",
          passenger: "Sato Kenji",
        });

        const expectedFields: Array<{
          id: string;
          label: string;
          tag: "INPUT" | "SELECT" | "TEXTAREA";
          required: boolean;
          describedById?: string;
          expectedDescriptionText?: string;
          inputMode?: string;
        }> = [
          {
            id: "enterprise-booking-passenger",
            label: tr("new.passenger.choose"),
            tag: "INPUT",
            required: true,
            describedById: "enterprise-booking-passenger-hint",
            expectedDescriptionText: tr("new.passenger.chooseHint"),
          },
          {
            id: "enterprise-booking-placard",
            label:
              locale === "zh" ? "舉牌姓名 placard" : "Placard Welcome Name",
            tag: "INPUT",
            required: false,
            describedById: "enterprise-booking-placard-hint",
            expectedDescriptionText:
              locale === "zh"
                ? "司機接送時手持舉牌顯示的文字"
                : "Name displayed on the welcome placard",
          },
          {
            id: "enterprise-booking-pickup",
            label: tr("new.field.pickup"),
            tag: "INPUT",
            required: true,
          },
          {
            id: "enterprise-booking-dropoff",
            label: tr("new.field.dropoff"),
            tag: "INPUT",
            required: true,
          },
          {
            id: "enterprise-booking-date",
            label: tr("new.field.window"),
            tag: "INPUT",
            required: true,
          },
          {
            id: "enterprise-booking-time",
            label: tr("new.field.time"),
            tag: "INPUT",
            required: true,
          },
          {
            id: "enterprise-booking-terminal",
            label: tr("new.airport.terminal"),
            tag: "INPUT",
            required: false,
            describedById: "enterprise-booking-airport-hint",
            expectedDescriptionText: tr("new.airport.hint"),
          },
          {
            id: "enterprise-booking-flight",
            label: tr("new.airport.flight"),
            tag: "INPUT",
            required: false,
            describedById: "enterprise-booking-airport-hint",
            expectedDescriptionText: tr("new.airport.hint"),
          },
          {
            id: "enterprise-booking-luggage",
            label: tr("new.airport.luggage"),
            tag: "INPUT",
            required: false,
            describedById: "enterprise-booking-airport-hint",
            expectedDescriptionText: tr("new.airport.hint"),
            inputMode: "numeric",
          },
          {
            id: "enterprise-booking-cost-center",
            label: tr("new.field.costCenter"),
            tag: "SELECT",
            required: true,
            describedById: "enterprise-booking-cost-center-hint",
            expectedDescriptionText: tr("new.costCenter.hint"),
          },
          {
            id: "enterprise-booking-booked-by",
            label: tr("new.field.bookedBy"),
            tag: "INPUT",
            required: false,
          },
          {
            id: "enterprise-booking-contact",
            label: tr("new.field.contact"),
            tag: "INPUT",
            required: true,
            inputMode: "tel",
          },
          {
            id: "enterprise-booking-notes",
            label: tr("new.field.notes"),
            tag: "TEXTAREA",
            required: false,
          },
        ];

        const seenIds = new Set<string>();
        for (const spec of expectedFields) {
          const control = screen.getByLabelText(spec.label, {
            exact: false,
          }) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

          expect(control.tagName).toBe(spec.tag);
          expect(control.id).toBe(spec.id);
          expect(seenIds.has(control.id)).toBe(false);
          seenIds.add(control.id);

          // Native HTML label linkage (label.htmlFor === control.id & label.control === control)
          expect(control.labels?.length).toBe(1);
          const labelEl = control.labels?.[0];
          expect(labelEl?.htmlFor).toBe(spec.id);
          expect(labelEl?.control).toBe(control);
          expect(labelEl?.textContent).toContain(spec.label);

          expect(control.required).toBe(spec.required);
          if (spec.inputMode) {
            expect(control.getAttribute("inputmode")).toBe(spec.inputMode);
          }

          if (spec.describedById && spec.expectedDescriptionText) {
            expect(control.getAttribute("aria-describedby")).toBe(
              spec.describedById,
            );
            const descEl = container.querySelector(`#${spec.describedById}`);
            expect(descEl).not.toBeNull();
            expect(descEl?.textContent).toContain(spec.expectedDescriptionText);
          }
        }

        // Verify zero unbound <label> elements exist in the mounted form
        const allLabels = [...container.querySelectorAll("label")];
        expect(allLabels.length).toBeGreaterThan(0);
        for (const label of allLabels) {
          expect(label.htmlFor).toBeTruthy();
          expect(label.control).not.toBeNull();
        }
      }
    });

    it("preserves native radio option accessible names and translated radiogroup labels", () => {
      const { tr } = mountBookingForm("zh");

      expect(
        screen.getByRole("radiogroup", { name: tr("new.field.passenger") }),
      ).toBeTruthy();
      expect(
        screen.getByRole("radiogroup", { name: tr("new.airport.direction") }),
      ).toBeTruthy();
      expect(
        screen.getByRole("radiogroup", { name: tr("new.policy.vehicle") }),
      ).toBeTruthy();

      const selfRadio = screen.getByRole("radio", {
        name: tr("new.passenger.self"),
      }) as HTMLInputElement;
      const otherRadio = screen.getByRole("radio", {
        name: tr("new.passenger.other"),
      }) as HTMLInputElement;
      const outboundRadio = screen.getByRole("radio", {
        name: tr("new.airport.outbound"),
      }) as HTMLInputElement;
      const inboundRadio = screen.getByRole("radio", {
        name: tr("new.airport.inbound"),
      }) as HTMLInputElement;
      const sedanRadio = screen.getByRole("radio", {
        name: tr("fixture.vehicle.standard"),
      }) as HTMLInputElement;
      const businessRadio = screen.getByRole("radio", {
        name: tr("fixture.vehicle.business"),
      }) as HTMLInputElement;
      const vanRadio = screen.getByRole("radio", {
        name: tr("fixture.vehicle.van"),
      }) as HTMLInputElement;

      expect(selfRadio.id).toBe("enterprise-booking-passenger-mode-self");
      expect(otherRadio.id).toBe("enterprise-booking-passenger-mode-other");
      expect(outboundRadio.id).toBe(
        "enterprise-booking-airport-direction-dropoff",
      );
      expect(inboundRadio.id).toBe(
        "enterprise-booking-airport-direction-pickup",
      );
      expect(sedanRadio.id).toBe("enterprise-booking-vehicle-preference-sedan");
      expect(businessRadio.id).toBe(
        "enterprise-booking-vehicle-preference-business",
      );
      expect(vanRadio.id).toBe("enterprise-booking-vehicle-preference-van");
    });
  });

  describe("C120-F2: enterprise-form_actual-keyboard-visible-focus-and-native-selection", () => {
    it("removes outline:none suppression and applies visible focus indicators on editable inputs, selects, and textareas", () => {
      const { container } = mountBookingForm("zh", {
        passengerMode: "other",
      });

      const controls = [
        ...container.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input:not([type="radio"]), select, textarea'),
      ];
      expect(controls.length).toBe(13);

      for (const control of controls) {
        // Never suppress outline with inline outline: none
        expect(control.style.outline).not.toBe("none");

        const shell = control.closest(
          ".ent-booking-input-shell",
        ) as HTMLElement;
        expect(shell).not.toBeNull();
        expect(shell.getAttribute("data-focused")).toBe("false");
        expect(shell.style.boxShadow).toBe("none");

        fireEvent.focus(control);
        expect(control.getAttribute("data-focus-visible")).toBe("true");
        expect(control.style.outline).toContain("2px solid");
        expect(window.getComputedStyle(control).outlineStyle).not.toBe("none");
        expect(shell.getAttribute("data-focused")).toBe("true");
        expect(shell.style.boxShadow).toContain("0 0 0 3px");

        fireEvent.blur(control);
        expect(control.getAttribute("data-focus-visible")).toBe("false");
        expect(shell.getAttribute("data-focused")).toBe("false");
        expect(shell.style.boxShadow).toBe("none");
      }
    });

    it("provides distinct visible keyboard focus on both selected and unselected native radio options without hijacking native Tab/radio behavior", () => {
      const { tr } = mountBookingForm("zh", { passengerMode: "self" });

      const selfRadio = screen.getByRole("radio", {
        name: tr("new.passenger.self"),
      }) as HTMLInputElement;
      const otherRadio = screen.getByRole("radio", {
        name: tr("new.passenger.other"),
      }) as HTMLInputElement;

      // Native radio inputs do not set custom negative tabIndex
      expect(selfRadio.getAttribute("tabindex")).toBeNull();
      expect(otherRadio.getAttribute("tabindex")).toBeNull();

      const selfPill = selfRadio.parentElement?.querySelector(
        ".ent-booking-radio-option",
      ) as HTMLElement;
      const otherPill = otherRadio.parentElement?.querySelector(
        ".ent-booking-radio-option",
      ) as HTMLElement;
      expect(selfPill).not.toBeNull();
      expect(otherPill).not.toBeNull();

      // Unfocused states: selected vs unselected
      expect(selfPill.getAttribute("data-checked")).toBe("true");
      expect(selfPill.getAttribute("data-focused")).toBe("false");
      expect(selfPill.style.outline).toBe("none");
      expect(otherPill.getAttribute("data-checked")).toBe("false");
      expect(otherPill.getAttribute("data-focused")).toBe("false");
      expect(otherPill.style.outline).toBe("none");

      // Focus selected radio option: focus ring is distinct from selected-only state
      fireEvent.focus(selfRadio);
      expect(selfPill.getAttribute("data-checked")).toBe("true");
      expect(selfPill.getAttribute("data-focused")).toBe("true");
      expect(selfPill.style.outline).toContain("2px solid");
      expect(selfPill.style.boxShadow).toContain("0 0 0 3px");
      fireEvent.blur(selfRadio);
      expect(selfPill.getAttribute("data-focused")).toBe("false");

      // Focus unselected radio option: focus ring is visible without requiring selection
      fireEvent.focus(otherRadio);
      expect(otherPill.getAttribute("data-checked")).toBe("false");
      expect(otherPill.getAttribute("data-focused")).toBe("true");
      expect(otherPill.style.outline).toContain("2px solid");
      expect(otherPill.style.boxShadow).toContain("0 0 0 3px");

      // Native radio selection activates delegate passenger input
      fireEvent.click(otherRadio);
      expect(otherRadio.checked).toBe(true);
      expect(selfRadio.checked).toBe(false);
      expect(otherPill.getAttribute("data-checked")).toBe("true");
      expect(
        screen.getByLabelText(tr("new.passenger.choose"), { exact: false }),
      ).toBeTruthy();
    });

    it("provides scoped focus stylesheet without off-token hardcoded hex colors", () => {
      const cssPath = resolve(
        appRoot,
        "components/booking-form/enterprise-booking-form-accessibility.css",
      );
      expect(existsSync(cssPath)).toBe(true);
      const css = readFileSync(cssPath, "utf8");
      expect(css).toContain(".ent-booking-input-shell:focus-within");
      expect(css).toContain(".ent-booking-control:focus-visible");
      expect(css).toContain(".ent-booking-radio-input:focus-visible");
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    });
  });

  describe("C120-F3: enterprise-form_actual-validation-announcement-and-recovery", () => {
    it("exposes a single non-duplicated alert and field recovery description on past and too-soon transitions, and cleans up stale failure state on valid recovery", () => {
      const { container, tr } = mountBookingForm("zh", {
        reservationDate: "2026-10-16",
        reservationTime: "14:00",
      });

      const dateInput = container.querySelector(
        'input[type="date"]',
      ) as HTMLInputElement;
      const timeInput = container.querySelector(
        'input[type="time"]',
      ) as HTMLInputElement;
      const reviewLink = container.querySelector(
        '[data-drt-intent="enterprise-review"]',
      ) as HTMLAnchorElement;

      // 1. Initial valid state
      expect(screen.queryByRole("alert")).toBeNull();
      expect(dateInput.getAttribute("aria-invalid")).toBeNull();
      expect(timeInput.getAttribute("aria-invalid")).toBeNull();
      expect(dateInput.getAttribute("aria-describedby")).toBeNull();
      expect(timeInput.getAttribute("aria-describedby")).toBeNull();
      expect(reviewLink.getAttribute("aria-disabled")).toBe("false");

      // 2. Transition to past date (2026-10-14 vs system time 2026-10-15 14:00 Taipei)
      fireEvent.change(dateInput, { target: { value: "2026-10-14" } });

      expect(dateInput.getAttribute("aria-invalid")).toBe("true");
      expect(timeInput.getAttribute("aria-invalid")).toBe("true");

      // Strictly 1 alert (non-duplicated) and field recovery description connected
      const pastAlerts = screen.getAllByRole("alert");
      expect(pastAlerts).toHaveLength(1);
      expect(dateInput.getAttribute("aria-describedby")).toBe(
        "enterprise-booking-window-error",
      );
      expect(timeInput.getAttribute("aria-describedby")).toBe(
        "enterprise-booking-window-error",
      );
      expect(
        screen.getByLabelText(tr("new.field.window"), { exact: false }),
      ).toBe(dateInput);
      expect(
        screen.getByLabelText(tr("new.field.time"), { exact: false }),
      ).toBe(timeInput);
      const alertEl = pastAlerts[0]!;
      expect(alertEl.id).toBe("enterprise-booking-window-error");
      expect(alertEl.getAttribute("aria-live")).toBe("assertive");
      expect(alertEl.getAttribute("aria-atomic")).toBe("true");
      expect(alertEl.textContent).toContain("用車時間不能為過去時間");
      expect(alertEl.textContent).toContain(
        "最早可預約時間為 2026-10-15 14:15",
      );

      // Aside visual error reminder is hidden from assistive tech to prevent duplicate announcement
      const asideReminder = container.querySelector(
        '[data-testid="enterprise-booking-aside-time-error"]',
      );
      expect(asideReminder?.getAttribute("aria-hidden")).toBe("true");

      // Review link is blocked while invalid
      expect(reviewLink.getAttribute("aria-disabled")).toBe("true");
      const blockedClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      reviewLink.dispatchEvent(blockedClick);
      expect(blockedClick.defaultPrevented).toBe(true);

      // 3. Transition from past to too-soon (2026-10-15 14:10 < 14:15 minimum lead time)
      fireEvent.change(dateInput, { target: { value: "2026-10-15" } });
      fireEvent.change(timeInput, { target: { value: "14:10" } });

      const tooSoonAlerts = screen.getAllByRole("alert");
      expect(tooSoonAlerts).toHaveLength(1);
      expect(tooSoonAlerts[0]!.id).toBe("enterprise-booking-window-error");
      expect(tooSoonAlerts[0]!.textContent).toContain("未達最短提前預約時間");
      expect(tooSoonAlerts[0]!.textContent).toContain("預約需至少提前 15 分鐘");
      expect(tooSoonAlerts[0]!.textContent).toContain(
        "最早可預約時間為 2026-10-15 14:15",
      );
      expect(dateInput.getAttribute("aria-invalid")).toBe("true");
      expect(timeInput.getAttribute("aria-invalid")).toBe("true");
      expect(reviewLink.getAttribute("aria-disabled")).toBe("true");

      // 4. Recover to valid future window (2026-10-15 14:30 >= 14:15)
      fireEvent.change(timeInput, { target: { value: "14:30" } });

      expect(screen.queryByRole("alert")).toBeNull();
      expect(
        container.querySelector("#enterprise-booking-window-error"),
      ).toBeNull();
      expect(dateInput.getAttribute("aria-invalid")).toBeNull();
      expect(timeInput.getAttribute("aria-invalid")).toBeNull();
      expect(dateInput.getAttribute("aria-describedby")).toBeNull();
      expect(timeInput.getAttribute("aria-describedby")).toBeNull();
      expect(reviewLink.getAttribute("aria-disabled")).toBe("false");
      expect(reviewLink.getAttribute("href")).toContain("date=2026-10-15");
      expect(reviewLink.getAttribute("href")).toContain("time=14%3A30");
    });
  });

  describe("Preserved business behavior: placard sync, address chip targeting, cost center serialization, and realm theme", () => {
    it("preserves placard synchronization, custom placard retention, address target focus, and review serialization", () => {
      const { container, tr } = mountBookingForm(
        "zh",
        {
          passengerMode: "other",
          passenger: "王大同",
          placard: formatDefaultPlacard("王大同"),
        },
        "EB-9001",
      );

      const passengerInput = screen.getByLabelText(tr("new.passenger.choose"), {
        exact: false,
      }) as HTMLInputElement;
      const placardInput = screen.getByLabelText("舉牌姓名 placard", {
        exact: false,
      }) as HTMLInputElement;
      const pickupInput = screen.getByLabelText(tr("new.field.pickup"), {
        exact: false,
      }) as HTMLInputElement;
      const dropoffInput = screen.getByLabelText(tr("new.field.dropoff"), {
        exact: false,
      }) as HTMLInputElement;

      expect(placardInput.value).toBe("王大同 様");

      // Editing passenger updates placard while not customized
      fireEvent.change(passengerInput, { target: { value: "陳思妤" } });
      expect(placardInput.value).toBe("陳思妤 様");

      // Customizing placard locks it from automatic passenger overwrite
      fireEvent.change(placardInput, {
        target: { value: "VIP 陳總經理" },
      });
      fireEvent.change(passengerInput, { target: { value: "林宜君" } });
      expect(placardInput.value).toBe("VIP 陳總經理");

      // Focusing dropoff then clicking an address chip populates dropoff instead of pickup
      const initialPickup = pickupInput.value;
      const addresses = getEnterpriseAddresses("zh");
      const targetAddress = addresses[addresses.length - 1]!;
      fireEvent.focus(dropoffInput);
      const addressButton = screen.getByRole("button", { name: targetAddress });
      fireEvent.click(addressButton);
      expect(dropoffInput.value).toBe(targetAddress);
      expect(pickupInput.value).toBe(initialPickup);

      const reviewLink = container.querySelector(
        '[data-drt-intent="enterprise-review"]',
      ) as HTMLAnchorElement;
      const reviewUrl = new URL(
        reviewLink.getAttribute("href") ?? "",
        "https://drts.local",
      );
      expect(reviewUrl.searchParams.get("bookingId")).toBe("EB-9001");
      expect(reviewUrl.searchParams.get("placard")).toBe("VIP 陳總經理");
      expect(tenantEnterpriseTheme.primary).toBe("#0F766E");
    });

    it("drives English locale date/time validation announcement and recovery and preserves review submit polite errors", () => {
      const { container, tr } = mountBookingForm("en", {
        reservationDate: "2026-10-16",
        reservationTime: "14:00",
      });

      const dateInput = screen.getByLabelText(tr("new.field.window"), {
        exact: false,
      }) as HTMLInputElement;
      const timeInput = screen.getByLabelText(tr("new.field.time"), {
        exact: false,
      }) as HTMLInputElement;

      fireEvent.change(dateInput, { target: { value: "2026-10-14" } });
      const pastAlerts = screen.getAllByRole("alert");
      expect(pastAlerts).toHaveLength(1);
      expect(pastAlerts[0]!.textContent).toContain("Reservation Time In Past");
      expect(pastAlerts[0]!.textContent).toContain(
        "Earliest bookable time is 2026-10-15 14:15",
      );

      fireEvent.change(dateInput, { target: { value: "2026-10-15" } });
      fireEvent.change(timeInput, { target: { value: "14:10" } });
      const tooSoonAlerts = screen.getAllByRole("alert");
      expect(tooSoonAlerts).toHaveLength(1);
      expect(tooSoonAlerts[0]!.textContent).toContain(
        "Advance Lead Time Not Met",
      );

      fireEvent.change(timeInput, { target: { value: "14:45" } });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(
        container.querySelector("#enterprise-booking-window-error"),
      ).toBeNull();
      expect(dateInput.getAttribute("aria-invalid")).toBeNull();
      expect(timeInput.getAttribute("aria-invalid")).toBeNull();

      // Verify existing review submit polite error remains intact in booking-submit-button.tsx
      const submitButtonSource = readFileSync(
        resolve(appRoot, "app/bookings/review/booking-submit-button.tsx"),
        "utf8",
      );
      expect(submitButtonSource).toContain('aria-live="polite"');
      expect(submitButtonSource).toContain(
        'data-testid="enterprise-booking-submit-error"',
      );
    });

    it("drives cost center select, airport controls, bookedBy, contact, vehicle radio, and notes into serialized review href", () => {
      const { container, tr } = mountBookingForm("zh", {
        passengerMode: "self",
      });

      const costCenters = getEnterpriseCostCenters("zh");
      const secondCostCenter = costCenters[1]!;
      const secondCode =
        secondCostCenter.split("·")[0]?.trim() ?? secondCostCenter;

      const costCenterSelect = screen.getByLabelText(
        tr("new.field.costCenter"),
        { exact: false },
      ) as HTMLSelectElement;
      fireEvent.change(costCenterSelect, { target: { value: secondCode } });

      const inboundRadio = screen.getByRole("radio", {
        name: tr("new.airport.inbound"),
      });
      fireEvent.click(inboundRadio);

      fireEvent.change(
        screen.getByLabelText(tr("new.airport.terminal"), { exact: false }),
        { target: { value: "T2" } },
      );
      fireEvent.change(
        screen.getByLabelText(tr("new.airport.flight"), { exact: false }),
        { target: { value: "BR198" } },
      );
      fireEvent.change(
        screen.getByLabelText(tr("new.airport.luggage"), { exact: false }),
        { target: { value: "4 件" } },
      );
      fireEvent.change(
        screen.getByLabelText(tr("new.field.bookedBy"), { exact: false }),
        { target: { value: "張雅筑" } },
      );
      fireEvent.change(
        screen.getByLabelText(tr("new.field.contact"), { exact: false }),
        { target: { value: "0912-345-678" } },
      );
      fireEvent.click(
        screen.getByRole("radio", { name: tr("fixture.vehicle.van") }),
      );
      fireEvent.change(
        screen.getByLabelText(tr("new.field.notes"), { exact: false }),
        { target: { value: "請準備兒童安全座椅" } },
      );

      const reviewLink = container.querySelector(
        '[data-drt-intent="enterprise-review"]',
      ) as HTMLAnchorElement;
      const reviewUrl = new URL(
        reviewLink.getAttribute("href") ?? "",
        "https://drts.local",
      );
      expect(reviewUrl.searchParams.get("cc")).toBe(secondCode);
      expect(reviewUrl.searchParams.get("ccLabel")).toBe(secondCostCenter);
      expect(reviewUrl.searchParams.get("dir")).toBe("pickup");
      expect(reviewUrl.searchParams.get("terminal")).toBe("T2");
      expect(reviewUrl.searchParams.get("flight")).toBe("BR198");
      expect(reviewUrl.searchParams.get("luggage")).toBe("4 件");
      expect(reviewUrl.searchParams.get("bookedBy")).toBe("張雅筑");
      expect(reviewUrl.searchParams.get("passenger")).toBe("張雅筑");
      expect(reviewUrl.searchParams.get("placard")).toBe("張雅筑 様");
      expect(reviewUrl.searchParams.get("contact")).toBe("0912-345-678");
      expect(reviewUrl.searchParams.get("vehicle")).toBe("van");
      expect(reviewUrl.searchParams.get("notes")).toBe("請準備兒童安全座椅");
    });
  });
});
