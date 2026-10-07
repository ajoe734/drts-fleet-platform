import { expect, type Page } from "@playwright/test";
import type { Locale, Step } from "./model";

export async function keyboardSteps(page: Page, steps: Step[]) {
  for (const step of steps) {
    if (step.kind === "tab") {
      let reached = false;
      for (let i = 0; i < step.max; i++) {
        await page.keyboard.press("Tab");
        reached = await page.locator(step.target).evaluate(el => el === document.activeElement);
        if (reached) break;
      }
      expect(reached, "keyboard target not reachable").toBe(true);
    } else if (step.kind === "press") await page.keyboard.press(step.key);
    else if (step.kind === "type") await page.keyboard.insertText(step.text);
    else if (step.kind === "focus") await expect(page.locator(step.target)).toBeFocused();
    else await expect(page.locator(step.target)).toHaveText(step.text);
  }
}

export async function measurePage(page: Page, locale: Locale, translationKeys: string[]) {
  await expect(page.locator("main, [role=main]")).toHaveCount(1);
  await expect(page.locator("h1, [role=heading][aria-level='1']").first()).toBeVisible();
  // Deliberately a bounded DOM/keyboard probe, not an axe/WCAG conformance claim.
  const controls = page.locator("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=combobox]");
  for (let i = 0; i < await controls.count(); i++) {
    const control = controls.nth(i);
    if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
  }
  const metrics = await page.evaluate(({ locale, translationKeys }) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const ids = [...document.querySelectorAll("[id]")].map(el => el.id);
    const positiveTabIndex = [...document.querySelectorAll<HTMLElement>("[tabindex]")].filter(el => visible(el) && el.tabIndex > 0).length;
    const text = document.body.innerText;
    const rawKeys = translationKeys.filter(key => text.split(/\s+/).includes(key));
    const rawIcons = [...document.querySelectorAll(".material-icons, .material-symbols-outlined, .material-symbols-rounded")].filter(el => visible(el) && (getComputedStyle(el).fontFamily.includes("Arial") || document.fonts.status !== "loaded")).length;
    const clippedControls = [...document.querySelectorAll<HTMLElement>("input, select, textarea, button, a[href]")].filter(el => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1;
    }).length;
    const language = document.documentElement.lang;
    return {
      duplicateIds: ids.length - new Set(ids).size, positiveTabIndex,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      clippedControls, rawKeys: rawKeys.length, rawIcons,
      localeMatches: locale === "zh-TW" ? /^(zh|zh-TW|zh-Hant)$/i.test(language) : /^en(?:-US)?$/i.test(language),
      machineTextLeaks: /\b(?:NaN|undefined|IDEMPOTENCY_[A-Z_]+|AUTH_SCOPE_DENIED)\b|\[object Object\]/.test(text),
    };
  }, { locale, translationKeys });
  expect(metrics).toEqual({ duplicateIds: 0, positiveTabIndex: 0, overflow: expect.any(Number), clippedControls: 0, rawKeys: 0, rawIcons: 0, localeMatches: true, machineTextLeaks: false });
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  return metrics;
}

export async function measureKeyboard(page: Page) {
  const tabbables = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[tabindex]")].filter(el => {
    const r = el.getBoundingClientRect();
    return el.tabIndex >= 0 && !el.matches(":disabled,[type=hidden]") && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }).length);
  expect(tabbables, "tab audit bound exceeded; split page into reviewed state recipes").toBeLessThanOrEqual(200);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const focus: Array<{ tag: string; indicator: boolean; visible: boolean }> = [];
  for (let i = 0; i < tabbables; i++) {
    await page.keyboard.press("Tab");
    const sample = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const indicator = el.matches(":focus-visible") && ((parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none" && !["transparent", "rgba(0, 0, 0, 0)"].includes(style.outlineColor)) || style.boxShadow !== "none");
      return { tag: el.tagName, indicator, visible: el !== document.body && r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 };
    });
    focus.push(sample);
    expect(sample.indicator, "focus has no measurable outline/shadow; manual assessment also required").toBe(true);
    expect(sample.visible, "focused control clipped/outside viewport").toBe(true);
  }
  return focus;
}

export async function measureContrast(page: Page) {
  // Only opaque, solid foreground/background pairs. Images, alpha, gradients,
  // anti-aliasing and focus/component contrast stay in the required manual gate.
  const result = await page.evaluate(() => {
    const rgb = (value: string) => {
      const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
      return match ? match.slice(1).map(Number) : null;
    };
    const lum = (values: number[]) => values.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let measured = 0; let unmeasured = 0; let failed = 0; let minimum = 21;
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) || !el.getClientRects().length) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden") continue;
      const fg = rgb(style.color);
      let current: HTMLElement | null = el; let bg: number[] | null = null; let unsupported = false;
      while (current) {
        const s = getComputedStyle(current);
        if (Number(s.opacity) !== 1 || s.backgroundImage !== "none" || s.filter !== "none" || s.mixBlendMode !== "normal") unsupported = true;
        if (!bg && s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") {
          bg = rgb(s.backgroundColor);
          if (!bg) unsupported = true;
        }
        current = current.parentElement;
      }
      if (!fg || !bg || unsupported) { unmeasured++; continue; }
      const a = lum(fg); const b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      measured++; minimum = Math.min(minimum, ratio);
      if (ratio < (large ? 3 : 4.5)) failed++;
    }
    return { measured, unmeasured, failed, minimum };
  });
  expect(result.failed, "opaque text contrast below measured threshold").toBe(0);
  return result;
}
