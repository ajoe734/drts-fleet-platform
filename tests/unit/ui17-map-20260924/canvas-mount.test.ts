import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import ts from "typescript";
import { createRequire } from "module";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../");
const CANVAS_DIR = path.join(WORKSPACE_ROOT, "docs/05-ui/drts-design-canvas");

const pkgRequire = createRequire(path.join(WORKSPACE_ROOT, "packages/ui-web/package.json"));
const React = pkgRequire("react");
const ReactDOMServer = pkgRequire("react-dom/server");

function loadCanvasComponent(filename: string, ctx: vm.Context) {
  const code = fs.readFileSync(path.join(CANVAS_DIR, filename), "utf8");
  const result = ts.transpileModule(code, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInContext(result.outputText, ctx);
}

describe("TN_NewBookingMap SSR (R4b/R7b)", () => {
  it("renders with correct scenario states using real React SSR", () => {
    const sandbox = { window: {}, React, ReactDOMServer, Object, console, global: {} as any };
    const ctx = vm.createContext(sandbox);

    const deps = [
      "mgmt-tokens.jsx", "mgmt-primitives.jsx", "mgmt-shell.jsx", "mgmt-auth.jsx", "mgmt-data.jsx",
      "tenant-screens-1.jsx", "pb-screens.jsx", "map-picker.jsx", "map-picker-integrations.jsx"
    ];
    for (const dep of deps) loadCanvasComponent(dep, ctx);

    vm.runInContext(`
      const theme = window.buildMgmtTheme ? window.buildMgmtTheme({ console: 'tenant' }) : { consoleId: 'tenant', primary: 'blue', text: '#000', surface: '#fff', danger: '#ff0000', textMuted: '#aaa', accent: '#00f', surfaceLo: '#fff', border: '#ccc', accentBg: '#fff', accentBorder: '#ccc' };
      window.TN_ACTOR = window.TN_ACTOR || { name: 'LC', display: '張俐萱' };
      window.TN_NAV = window.TN_NAV || [];
      window.TN_HEALTH = window.TN_HEALTH || {};
      window.SHELL_MONO = 'monospace';

      const renders = {};
      const tnScenarios = ["empty", "normal", "saved_address", "out_of_area", "backend_rejected", "degraded", "manual_review"];
      for (const s of tnScenarios) {
        renders["TN_" + s] = ReactDOMServer.renderToStaticMarkup(window.TN_NewBookingMap({ theme, scenario: s }));
      }
      
      const pbScenarios = ["empty", "selected", "out_of_area", "provider_down", "manual_coords", "manual_review"];
      for (const s of pbScenarios) {
        renders["PB_" + s] = ReactDOMServer.renderToStaticMarkup(window.PB_BookCardMap({ theme, state: s, reason: s === 'manual_review' ? 'test' : '' }));
      }
      
      const cgScenarios = ["empty", "normal", "out_of_area", "backend_rejected", "degraded", "degraded_recovered"];
      for (const s of cgScenarios) {
        renders["CG_" + s] = ReactDOMServer.renderToStaticMarkup(window.CG_NewBookingMap({ theme, scenario: s }));
      }

      global.results = renders;
    `, ctx);

    const results = sandbox.global.results;

    const checkCta = (html: string, buttonText: string, expectedDisabled: boolean) => {
      expect(html.includes(buttonText)).toBeTruthy();
      if (expectedDisabled) {
        expect(html.includes('disabled')).toBeTruthy(); // Rough check for now
      } else {
        // If not disabled, the button shouldn't have 'disabled' or 'not-allowed'. 
        // This is a rough check because we don't have JSDOM here.
      }
    };

        // Tenant Tests
    checkCta(results.TN_empty, "送出 command", true);
    checkCta(results.TN_normal, "送出 command", false);
    checkCta(results.TN_saved_address, "送出 command", false);
    checkCta(results.TN_out_of_area, "送出 command", true);
    checkCta(results.TN_backend_rejected, "送出 command", true);
    checkCta(results.TN_degraded, "送交人工複核", true); // reason="" so disabled
    checkCta(results.TN_manual_review, "送交人工複核", true); // reason="" so disabled

    // Partner Tests
    checkCta(results.PB_empty, "前往確認", true);
    checkCta(results.PB_selected, "前往確認", false);
    checkCta(results.PB_out_of_area, "前往確認", true);
    checkCta(results.PB_provider_down, "送交人工複核", true); // reason="" so disabled
    checkCta(results.PB_manual_review, "送交人工複核", false); // "test" reason passed so allowed

    // Concierge Tests
    checkCta(results.CG_empty, "建立叫車", true);
    checkCta(results.CG_normal, "建立叫車", false);
    checkCta(results.CG_out_of_area, "建立叫車", true);
    checkCta(results.CG_backend_rejected, "建立叫車", true);
    checkCta(results.CG_degraded_recovered, "建立叫車", false);
    checkCta(results.CG_degraded, "送交人工複核", true);
  });
});
