import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  cases,
  automatedChecks,
  recipeKey,
  type CaseEvidence,
  type Deployment,
  type Inventory,
  type Plan,
  type Session,
} from "./model";
import { hash, sourceAt } from "./inventory";
import { expectedFormat, isolatedHeaders } from "./guards";
import {
  keyboardSteps,
  measureContrast,
  measureKeyboard,
  measurePage,
} from "./browser-checks";
import {
  output,
  readJson,
  required,
  writeJson,
  reviewedApplicability,
} from "./runner";

const inventory = readJson<Inventory>(`${output}/inventory.json`);
const deployment = readJson<Deployment>(`${output}/deployment-before.json`);
const binding = readJson<{
  harnessSha: string;
  runId: string;
  planHash: string;
}>(`${output}/binding.json`);
const plan = readJson<Plan>(required("GLOBAL_UX_PLAN"));
const applicability = reviewedApplicability(binding.harnessSha, inventory);
expect(hash(readFileSync(required("GLOBAL_UX_PLAN")))).toBe(binding.planHash);
const sessions = readJson<Session[]>(required("GLOBAL_UX_SESSIONS"));
const tokens = readJson<Record<string, string>>(required("GLOBAL_UX_TOKENS"));
function tokenFor(target: string): string {
  const token = tokens[target];
  const expiry = token
    ? (
        JSON.parse(
          Buffer.from(token.split(".")[1]!, "base64url").toString(),
        ) as { exp: number }
      ).exp
    : 0;
  if (expiry * 1000 < Date.now() + 600_000)
    tokens[target] = execFileSync(
      "gcloud",
      [
        "auth",
        "print-identity-token",
        `--audiences=${target}`,
        `--impersonate-service-account=${required("GLOBAL_UX_INVOKER_SA")}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  return tokens[target]!;
}
const getField = (value: unknown, field: string): unknown =>
  field
    .split(".")
    .reduce<unknown>(
      (v, key) =>
        v && typeof v === "object"
          ? (v as Record<string, unknown>)[key]
          : undefined,
      value,
    );
const keys = new Map(
  inventory.surfaces.map((s) => {
    try {
      return [
        s.app,
        [
          ...sourceAt(
            inventory.runtimeSha,
            `apps/${s.app}/lib/translations.ts`,
          ).matchAll(/"([a-zA-Z][\w.-]*\.[\w.-]+)"\s*:/g),
        ].map((m) => m[1]!),
      ] as const;
    } catch {
      throw new Error(`Translation source requires reviewed adapter: ${s.app}`);
    }
  }),
);

for (const c of cases(inventory)) {
  test(c.id, async ({ browser }) => {
    const id = hash(c.id);
    const row: CaseEvidence = {
      id: c.id,
      ...binding,
      runtimeSha: inventory.runtimeSha,
      source: c.screen.source,
      sourceBlob: c.screen.sourceBlob,
      route: c.screen.route,
      role: c.role,
      locale: c.locale,
      width: c.width,
      status: "blocked",
      checks: [],
      consoleErrors: 0,
    };
    const recipe = plan.recipes[recipeKey(c)];
    let stage = "recipe-missing";
    let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      const decision = applicability.find((rule) => rule.key === recipeKey(c));
      if (decision) {
        row.status = "not_applicable";
        row.reason = decision.decisionRef;
        return;
      }
      if (!recipe) throw new Error("missing reviewed fixture recipe");
      const session = sessions.find(
        (s) => s.app === c.screen.app && s.role === c.role,
      )!;
      row.sessionKind = session.kind;
      const target = deployment.services.find(
        (s) => s.app === c.screen.app,
      )!.origin;
      const token = tokenFor(target);
      row.route = recipe.route;
      stage = "identity-readback";
      context = await browser.newContext({
        storageState: session.storageState,
        locale: c.locale,
        timezoneId: "Asia/Taipei",
        viewport: { width: c.width, height: c.width === 390 ? 844 : 960 },
        serviceWorkers: "block",
      });
      const identity = await context.request.get(
        new URL(session.identity.path, target).href,
        {
          headers: isolatedHeaders(target, target, token, {}),
          maxRedirects: 0,
        },
      );
      expect(identity.status()).toBe(200);
      expect(identity.headers()["x-drts-candidate-sha"]).toBe(
        inventory.runtimeSha,
      );
      const identityBody: unknown = await identity.json();
      expect(getField(identityBody, session.identity.subjectPath)).toBe(
        session.identity.expectedSubject,
      );
      const roles = getField(identityBody, session.identity.rolePath);
      expect(Array.isArray(roles) ? roles : [roles]).toContain(c.role);
      if (c.state === "expired" || c.state === "permission") {
        stage = "negative-session-variant-missing";
        expect(session.variants?.[c.state]).toBeDefined();
      }
      const variant = session.variants?.[c.state];
      if (variant) {
        await context.close();
        context = await browser.newContext({
          storageState: variant,
          locale: c.locale,
          timezoneId: "Asia/Taipei",
          viewport: { width: c.width, height: c.width === 390 ? 844 : 960 },
          serviceWorkers: "block",
        });
      }
      const shortLocale = c.locale === "zh-TW" ? "zh" : "en";
      await context.addCookies([
        {
          name: "drts-locale-v2",
          value: shortLocale,
          url: target,
          secure: true,
          sameSite: "Lax",
        },
      ]);
      await context.addInitScript(
        ({ target, shortLocale }) => {
          if (location.origin === target)
            localStorage.setItem("drts-locale-v2", shortLocale);
        },
        { target, shortLocale },
      );
      await context.route("**/*", async (route) => {
        try {
          const request = route.request();
          // One-origin context: cross-app navigations need their own reviewed case/session.
          if (
            request.isNavigationRequest() &&
            new URL(request.url()).origin !== target
          )
            return route.abort("blockedbyclient");
          const headers = isolatedHeaders(
            request.url(),
            target,
            token,
            request.headers(),
          );
          // Header overrides on route.continue can survive redirects. Fetch one
          // hop only, then let the browser issue a freshly intercepted request.
          const response = await route.fetch({ headers, maxRedirects: 0 });
          await route.fulfill({ response });
        } catch {
          await route.abort("failed").catch(() => {});
        }
      });
      const page = await context.newPage();
      let errors = 0;
      page.on("pageerror", () => errors++);
      page.on("console", (msg) => {
        if (msg.type() === "error") errors++;
      });
      let staleResponses = 0;
      page.on("response", (response) => {
        if (
          new URL(response.url()).origin === target &&
          ["document", "fetch", "xhr"].includes(
            response.request().resourceType(),
          )
        ) {
          if (
            response.headers()["x-drts-candidate-sha"] !== inventory.runtimeSha
          )
            staleResponses++;
        }
      });
      stage = "navigation-runtime-sha";
      const url = new URL(recipe.route, target);
      if (c.screen.app === "bank-console-web")
        url.searchParams.set("locale", shortLocale);
      const response = await page.goto(url.href, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(recipe.expectedStatus);
      expect(response?.headers()["x-drts-candidate-sha"]).toBe(
        inventory.runtimeSha,
      );
      await expect(page.locator(recipe.ready)).toBeVisible();
      stage = "state-keyboard-recipe";
      await keyboardSteps(page, recipe.steps[c.locale]);
      const final = new URL(page.url());
      expect(final.origin).toBe(target);
      expect(
        final.pathname +
          (c.screen.route.includes("?screen=")
            ? `?screen=${final.searchParams.get("screen")}`
            : ""),
      ).toBe(recipe.finalPath);
      await expect(page.locator(recipe.stateProof.selector)).toHaveText(
        recipe.stateProof.text[c.locale],
      );
      if (c.state === "loading")
        await expect(
          page.locator("[aria-busy=true], [role=progressbar]").first(),
        ).toBeVisible();
      if (c.state === "validation") {
        await expect(
          page.locator("[role=alert], [aria-live=assertive], :invalid").first(),
        ).toBeVisible();
        expect(recipe.steps[c.locale].some((s) => s.kind === "focus")).toBe(
          true,
        );
      }
      if (recipe.dialog) {
        stage = "dialog-focus-return";
        await keyboardSteps(page, [
          { kind: "tab", target: recipe.dialog.trigger, max: 200 },
          { kind: "press", key: "Enter" },
        ]);
        const dialog = page.locator(recipe.dialog.selector);
        await expect(dialog).toBeVisible();
        expect(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
        ).toBe(true);
        const count = await dialog
          .locator("a[href],button,input,select,textarea,[tabindex]")
          .count();
        for (let i = 0; i <= count + 1; i++) {
          await page.keyboard.press("Tab");
          expect(
            await dialog.evaluate((el) => el.contains(document.activeElement)),
          ).toBe(true);
        }
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page.locator(recipe.dialog.returnTo)).toBeFocused();
      }
      stage = "semantics-locale-responsive";
      const metrics = await measurePage(
        page,
        c.locale,
        keys.get(c.screen.app)!,
      );
      stage = "keyboard-focus";
      const focus = await measureKeyboard(page);
      stage = "contrast";
      const contrast = await measureContrast(page);
      stage = "locale-format-probes";
      for (const probe of recipe.formats[c.locale])
        await expect(page.locator(probe.selector)).toHaveText(
          expectedFormat(probe.kind, probe.value, c.locale, probe.options),
        );
      stage = "console-and-runtime-stability";
      row.consoleErrors = errors;
      expect(errors).toBe(0);
      expect(staleResponses).toBe(0);
      stage = "safe-screenshot";
      const screenshot = `screenshots/${id}.png`;
      const destination = path.join(
        required("GLOBAL_UX_ARTIFACT_ROOT"),
        screenshot,
      );
      mkdirSync(path.dirname(destination), { recursive: true });
      const bytes = await page.screenshot({
        fullPage: true,
        mask: recipe.mask.map((selector) => page.locator(selector)),
      });
      writeFileSync(destination, bytes);
      row.screenshot = screenshot;
      row.screenshotHash = hash(bytes);
      writeJson(`${output}/measurements/${id}.json`, {
        metrics,
        focus,
        contrast,
        tool: "Playwright Chromium DOM/computed-style probes; not full WCAG",
        manual: "pending",
      });
      row.checks = [...automatedChecks];
      row.status = "passed";
    } catch {
      row.status = stage.endsWith("missing") ? "blocked" : "failed";
      row.reason = stage; // Never serialize Playwright errors (may include DOM text/secrets).
      throw new Error(`Global UX case ${id}: ${stage}; see sanitized evidence`);
    } finally {
      writeJson(`${output}/cases/${id}.json`, row);
      await context?.close();
    }
  });
}
