import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import ts from "typescript";
import { createRequire } from "module";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../");
const CANVAS_DIR = path.join(WORKSPACE_ROOT, "docs/05-ui/drts-design-canvas");

const pkgRequire = createRequire(
  path.join(WORKSPACE_ROOT, "packages/ui-web/package.json"),
);
const React = pkgRequire("react");
const ReactDOMServer = pkgRequire("react-dom/server");

function loadCanvasComponent(filename: string, ctx: vm.Context) {
  const code = fs.readFileSync(path.join(CANVAS_DIR, filename), "utf8");
  const result = ts.transpileModule(code, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInContext(result.outputText, ctx);
}

describe("Canvas SSR Integrations", () => {
  it("renders with correct scenario states using real React SSR", () => {
    const sandbox = {
      window: {},
      React,
      ReactDOMServer,
      Object,
      console,
      global: {} as any,
    };
    const ctx = vm.createContext(sandbox);

    const deps = [
      "mgmt-tokens.jsx",
      "mgmt-primitives.jsx",
      "mgmt-shell.jsx",
      "mgmt-auth.jsx",
      "mgmt-data.jsx",
      "tenant-screens-1.jsx",
      "pb-screens.jsx",
      "map-picker.jsx",
      "map-picker-integrations.jsx",
    ];
    for (const dep of deps) loadCanvasComponent(dep, ctx);

    vm.runInContext(
      `
      const theme = window.buildMgmtTheme ? window.buildMgmtTheme({ console: 'tenant' }) : { consoleId: 'tenant', primary: 'blue', text: '#000', surface: '#fff', danger: '#ff0000', textMuted: '#aaa', accent: '#00f', surfaceLo: '#fff', border: '#ccc', accentBg: '#fff', accentBorder: '#ccc' };
      window.TN_ACTOR = window.TN_ACTOR || { name: 'LC', display: '張俐萱' };
      window.TN_NAV = window.TN_NAV || [];
      window.TN_HEALTH = window.TN_HEALTH || {};
      window.SHELL_MONO = 'monospace';
      window.PB_MONO = 'monospace';
      window.PROGRAMS = { card: { primary: 'blue', accentBg: '#fff', accent: '#ccc' } };

      const renders = {};

      // TN Scenarios
      renders.TN_empty = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, pick: 'empty', drop: 'empty' }));
      renders.TN_normal = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, pick: 'selected', drop: 'selected' }));
      renders.TN_saved_address = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, pick: 'saved_pin', drop: 'saved_pin' }));
      renders.TN_out_of_area = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, pick: 'selected', drop: 'out_of_area' }));
      renders.TN_backend_rejected = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, pick: 'selected', drop: 'candidates' }));
      renders.TN_degraded = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, degraded: true }));
      renders.TN_manual_review = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, pick: 'manual_review', drop: 'selected' }));

      // PB Scenarios
      renders.PB_empty = ReactDOMServer.renderToStaticMarkup(window.PB_BookCardMap({ state: 'empty', drop: 'empty' }));
      renders.PB_selected = ReactDOMServer.renderToStaticMarkup(window.PB_BookCardMap({ state: 'selected', drop: 'selected' }));
      renders.PB_out_of_area = ReactDOMServer.renderToStaticMarkup(window.PB_BookCardMap({ state: 'selected', drop: 'out_of_area' }));
      renders.PB_provider_down = ReactDOMServer.renderToStaticMarkup(window.PB_BookCardMap({ state: 'provider_down', drop: 'provider_down', gate: 'dispatch_manual_review_required' }));
      renders.PB_manual_review = ReactDOMServer.renderToStaticMarkup(window.PB_BookCardMap({ state: 'manual_review', drop: 'selected', gate: 'dispatch_manual_review_required' }));

      // CG Scenarios
      renders.CG_empty = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, pick: 'empty', drop: 'empty' }));
      renders.CG_normal = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, pick: 'selected', drop: 'selected' }));
      renders.CG_out_of_area = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, pick: 'selected', drop: 'out_of_area' }));
      renders.CG_backend_rejected = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, pick: 'selected', drop: 'candidates' }));
      renders.CG_degraded_recovered = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, success: true }));
      renders.CG_degraded = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, degraded: true }));

      global.results = renders;
    `,
      ctx,
    );

    const results = sandbox.global.results;

    const checkCta = (
      name: string,
      html: string,
      buttonText: string,
      expectedDisabled: boolean,
    ) => {
      if (!html.includes(buttonText)) {
        throw new Error(
          `[${name}] CTA '${buttonText}' not found in HTML:\n${html}`,
        );
      }
      const buttonRegex = new RegExp(
        `<button[^>]*>[\\s\\S]*?${buttonText}[\\s\\S]*?</button>`,
        "i",
      );
      const match = html.match(buttonRegex);
      if (!match) {
        throw new Error(
          `[${name}] button tag with '${buttonText}' not found in HTML:\n${html.substring(html.indexOf(buttonText) - 100, html.indexOf(buttonText) + 100)}`,
        );
      }
      const buttonHtml = match[0];
      if (expectedDisabled) {
        expect(buttonHtml.includes("disabled")).toBeTruthy();
      } else {
        expect(buttonHtml.includes("disabled")).toBeFalsy();
      }
    };

    // Tenant Tests
    checkCta("TN_empty", results.TN_empty, "送出 command", true);
    checkCta("TN_normal", results.TN_normal, "送出 command", false);
    checkCta(
      "TN_saved_address",
      results.TN_saved_address,
      "送出 command",
      false,
    );
    checkCta("TN_out_of_area", results.TN_out_of_area, "送出 command", true);
    checkCta(
      "TN_backend_rejected",
      results.TN_backend_rejected,
      "送出 command",
      true,
    );
    checkCta("TN_degraded", results.TN_degraded, "送交人工複核", false);
    checkCta(
      "TN_manual_review",
      results.TN_manual_review,
      "送交人工複核",
      false,
    );

    // Partner Tests
    checkCta("PB_empty", results.PB_empty, "請先選定上下車地點", true);
    checkCta("PB_selected", results.PB_selected, "前往確認", false);
    checkCta(
      "PB_out_of_area",
      results.PB_out_of_area,
      "不在服務範圍 · 請更換地點",
      true,
    );
    checkCta(
      "PB_provider_down",
      results.PB_provider_down,
      "送交人工複核",
      false,
    );
    checkCta(
      "PB_manual_review",
      results.PB_manual_review,
      "送交人工複核",
      false,
    );

    // Concierge Tests
    checkCta("CG_empty", results.CG_empty, "建立叫車", true);
    checkCta("CG_normal", results.CG_normal, "建立叫車", false);
    checkCta("CG_out_of_area", results.CG_out_of_area, "建立叫車", true);
    checkCta(
      "CG_backend_rejected",
      results.CG_backend_rejected,
      "建立叫車",
      true,
    );
    checkCta(
      "CG_degraded_recovered",
      results.CG_degraded_recovered,
      "再建一筆",
      false,
    );
    checkCta("CG_degraded", results.CG_degraded, "送交人工複核", false);
  });
});
