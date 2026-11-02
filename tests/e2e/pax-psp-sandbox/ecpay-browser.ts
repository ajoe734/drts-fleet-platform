/**
 * Browser helpers that act only inside documents owned by the ECPay WEB JS
 * SDK: its card-entry markup and the Stage 3D verification page.
 *
 * The add-card widget (sdk-1.0.0.js) is not isolated in a cross-origin
 * iframe — it calls `$("#ECPayPayment").html(responseHtml)` and injects its
 * form directly into the host page's own DOM (confirmed from the live Stage
 * script), then loads `actions.bindcard.min.js` to wire it up. So the
 * eligible card-entry frame is either a genuine ecpay.com.tw-hosted iframe
 * (if ECPay ever changes this) or the page's own main frame when the SDK
 * marker (`#ECPayPayment .ecpay-JsType`) is present — never an arbitrary
 * frame. The Stage 3D verification step, by contrast, is a real navigation
 * to an ECPay/issuer page, so `completeStageThreeD` keeps scanning every
 * frame. The SDK DOM is owned by ECPay and not contractually documented, so
 * fields are located by attribute heuristics; on a miss, a value-free
 * inventory of controls is written to the artifact so the selector can be
 * corrected from real evidence.
 */
import type { Frame, Locator, Page } from "@playwright/test";
import { STAGE_TEST_CARD, type Redactor, writeJsonArtifact } from "./evidence";

export interface ControlDescriptor {
  frameHost: string;
  index: number;
  tag: string;
  type: string;
  id: string;
  name: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  maxLength: number;
  label: string;
  text: string;
  visible: boolean;
  optionCount: number;
}

const CONTROL_SELECTOR = "input, select, button, textarea, a[role=button]";

export async function describeControls(
  frame: Frame,
): Promise<ControlDescriptor[]> {
  const host = (() => {
    try {
      return new URL(frame.url()).host;
    } catch {
      return "";
    }
  })();
  try {
    const raw = await frame.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).map(
        (node, index) => {
          const el = node as HTMLInputElement & HTMLSelectElement;
          const labelEl =
            (el.id &&
              document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
            el.closest("label");
          const rect = el.getBoundingClientRect();
          const isTextual = el.tagName === "BUTTON" || el.tagName === "A";
          return {
            index,
            tag: el.tagName.toLowerCase(),
            type: (el.getAttribute("type") ?? "").toLowerCase(),
            id: el.id ?? "",
            name: el.getAttribute("name") ?? "",
            placeholder: el.getAttribute("placeholder") ?? "",
            ariaLabel: el.getAttribute("aria-label") ?? "",
            autocomplete: el.getAttribute("autocomplete") ?? "",
            maxLength: Number(el.getAttribute("maxlength") ?? -1),
            label: (labelEl?.textContent ?? "").trim().slice(0, 40),
            // Visible captions only for buttons/links; never input values.
            text: isTextual ? (el.textContent ?? "").trim().slice(0, 40) : "",
            visible: rect.width > 0 && rect.height > 0,
            optionCount: el.tagName === "SELECT" ? el.options.length : 0,
          };
        },
      );
    }, CONTROL_SELECTOR);
    return raw.map((entry) => ({ frameHost: host, ...entry }));
  } catch {
    return [];
  }
}

function haystack(control: ControlDescriptor): string {
  return [
    control.id,
    control.name,
    control.placeholder,
    control.ariaLabel,
    control.autocomplete,
    control.label,
  ]
    .join(" ")
    .toLowerCase();
}

const CARD_NUMBER =
  /card.?no|cardnum|card_?number|cc-number|ccno|卡號|信用卡號/;
const CVV =
  /cvv|cvc|cvn|cid\b|security|check.?code|安全碼|末三碼|檢查碼|驗證碼/;
const EXPIRY_COMBINED = /mm\s*\/\s*yy|expir|valid|有效|cc-exp$|cc-exp\s/;
const EXPIRY_MONTH = /month|\bmm\b|月|cc-exp-month/;
const EXPIRY_YEAR = /year|\byy\b|年|cc-exp-year/;

export function isEcpayFrame(frame: Frame): boolean {
  try {
    return /(^|\.)ecpay\.com\.tw$/.test(new URL(frame.url()).hostname);
  } catch {
    return false;
  }
}

/**
 * True for a genuine ecpay.com.tw iframe, or for the page's own main frame
 * once the SDK has injected its widget markup into `#ECPayPayment` (the
 * `.ecpay-JsType` marker element the SDK's own `actions.bindcard.min.js`
 * loader keys off). Never true for a main frame that has not been written to
 * by the SDK, so unrelated host-page controls are never in scope.
 */
async function isEligibleCardFrame(page: Page, frame: Frame): Promise<boolean> {
  if (isEcpayFrame(frame)) return true;
  if (frame !== page.mainFrame()) return false;
  try {
    return await frame.evaluate(
      () => document.querySelector("#ECPayPayment .ecpay-JsType") !== null,
    );
  } catch {
    return false;
  }
}

function controlLocator(frame: Frame, control: ControlDescriptor): Locator {
  return frame.locator(CONTROL_SELECTOR).nth(control.index);
}

async function typeInto(locator: Locator, value: string): Promise<void> {
  await locator.click();
  await locator.pressSequentially(value, { delay: 60 });
}

async function chooseOption(
  locator: Locator,
  candidates: string[],
): Promise<void> {
  for (const candidate of candidates) {
    try {
      await locator.selectOption(candidate, { timeout: 2_000 });
      return;
    } catch {
      // try next representation (value vs label, MM vs M, YYYY vs YY)
    }
  }
  throw new Error("expiry_option_not_selectable");
}

export function futureExpiry(now = new Date()): {
  mm: string;
  yy: string;
  yyyy: string;
} {
  // Same month, three years ahead: always in the future, never near rollover.
  const year = now.getUTCFullYear() + 3;
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return { mm, yy: String(year).slice(-2), yyyy: String(year) };
}

/**
 * Waits for the SDK iframe and fills the Stage test card. Returns the
 * value-free control inventory of the frame that was used.
 */
export async function fillStageCard(
  page: Page,
  redactor: Redactor,
  timeoutMs = 60_000,
): Promise<{ frameHost: string; layout: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastInventory: ControlDescriptor[] = [];
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (!(await isEligibleCardFrame(page, frame))) continue;
      const controls = (await describeControls(frame)).filter(
        (control) =>
          control.visible && control.tag !== "button" && control.tag !== "a",
      );
      if (controls.length) lastInventory = controls;
      const cardFields = controls.filter(
        (c) => c.tag === "input" && CARD_NUMBER.test(haystack(c)),
      );
      const cvvField = controls.find(
        (c) =>
          c.tag === "input" &&
          CVV.test(haystack(c)) &&
          !CARD_NUMBER.test(haystack(c)),
      );
      const combined = controls.find(
        (c) =>
          c.tag === "input" &&
          EXPIRY_COMBINED.test(haystack(c)) &&
          !CVV.test(haystack(c)) &&
          !CARD_NUMBER.test(haystack(c)),
      );
      const month = controls.find(
        (c) =>
          EXPIRY_MONTH.test(haystack(c)) &&
          !CARD_NUMBER.test(haystack(c)) &&
          c !== combined,
      );
      const year = controls.find(
        (c) =>
          EXPIRY_YEAR.test(haystack(c)) &&
          !CARD_NUMBER.test(haystack(c)) &&
          c !== combined &&
          c !== month,
      );
      if (!cardFields.length || !cvvField || (!combined && !(month && year)))
        continue;

      const expiry = futureExpiry();
      // Card number: one field, or four 4-digit segments.
      if (
        cardFields.length >= 4 &&
        cardFields.slice(0, 4).every((c) => c.maxLength === 4)
      ) {
        for (let i = 0; i < 4; i += 1) {
          await typeInto(
            controlLocator(frame, cardFields[i]!),
            STAGE_TEST_CARD.number.slice(i * 4, i * 4 + 4),
          );
        }
      } else {
        await typeInto(
          controlLocator(frame, cardFields[0]!),
          STAGE_TEST_CARD.number,
        );
      }
      let layout = "card+combined-expiry+cvv";
      if (combined) {
        const locator = controlLocator(frame, combined);
        await typeInto(locator, `${expiry.mm}${expiry.yy}`);
        const typed = (await locator.inputValue()).replace(/\D/g, "");
        if (typed !== `${expiry.mm}${expiry.yy}`) {
          await locator.fill("");
          await typeInto(locator, `${expiry.mm}/${expiry.yy}`);
        }
      } else {
        layout = "card+month+year+cvv";
        for (const [control, candidates] of [
          [month!, [expiry.mm, String(Number(expiry.mm))]],
          [year!, [expiry.yyyy, expiry.yy]],
        ] as const) {
          const locator = controlLocator(frame, control);
          if (control.tag === "select")
            await chooseOption(locator, [...candidates]);
          else await typeInto(locator, candidates[0]);
        }
      }
      await typeInto(controlLocator(frame, cvvField), STAGE_TEST_CARD.cvv);
      return { frameHost: cvvField.frameHost, layout };
    }
    await page.waitForTimeout(1_000);
  }
  writeJsonArtifact(redactor, "sdk-controls.json", lastInventory);
  throw new Error("ecpay_sdk_card_fields_not_found");
}

const OTP_FIELD =
  /otp|sms|簡訊|驗證碼|動態密碼|passcode|password|\bcode\b|密碼/;
const SUBMIT_TEXT =
  /確認|送出|提交|submit|confirm|驗證|verify|下一步|next|ok\b/i;
const SEND_OTP_TEXT = /發送|取得|寄送|send|get\s*otp|重新發送/i;

/** Enters the fixed Stage OTP on the 3D page (top document or any frame). */
export async function completeStageThreeD(
  page: Page,
  redactor: Redactor,
  timeoutMs = 90_000,
): Promise<{ frameHost: string; sentOtpRequest: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let sentOtpRequest = false;
  let inventory: ControlDescriptor[] = [];
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const controls = (await describeControls(frame)).filter((c) => c.visible);
      if (!controls.length) continue;
      inventory = controls;
      const textInputs = controls.filter(
        (c) =>
          c.tag === "input" &&
          ["", "text", "tel", "number", "password"].includes(c.type),
      );
      const otp =
        textInputs.find((c) => OTP_FIELD.test(haystack(c))) ??
        (textInputs.length === 1 ? textInputs[0] : undefined);
      const buttons = controls.filter(
        (c) =>
          c.tag === "button" ||
          c.tag === "a" ||
          (c.tag === "input" && ["submit", "button"].includes(c.type)),
      );
      const captionOf = (c: ControlDescriptor) =>
        `${c.text} ${c.ariaLabel} ${c.name} ${c.id}`;
      if (!otp) {
        const sendButton = buttons.find((c) =>
          SEND_OTP_TEXT.test(captionOf(c)),
        );
        if (sendButton && !sentOtpRequest) {
          await controlLocator(frame, sendButton).click();
          sentOtpRequest = true;
        }
        continue;
      }
      await typeInto(controlLocator(frame, otp), STAGE_TEST_CARD.otp);
      const submit =
        buttons.find(
          (c) =>
            SUBMIT_TEXT.test(captionOf(c)) && !SEND_OTP_TEXT.test(captionOf(c)),
        ) ?? buttons.find((c) => c.type === "submit");
      if (submit) await controlLocator(frame, submit).click();
      else await controlLocator(frame, otp).press("Enter");
      return { frameHost: otp.frameHost, sentOtpRequest };
    }
    await page.waitForTimeout(1_000);
  }
  writeJsonArtifact(redactor, "three-d-controls.json", inventory);
  throw new Error("ecpay_stage_3d_otp_field_not_found");
}

/** True when any frame's visible text shows the full test card number. */
export async function pageShowsFullCardNumber(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const text = await frame.evaluate(() => document.body?.innerText ?? "");
      if (text.replace(/[\s-]/g, "").includes(STAGE_TEST_CARD.number))
        return true;
    } catch {
      // Detached/cross-navigation frame: treat as unknown → caller masks.
      return true;
    }
  }
  return false;
}
