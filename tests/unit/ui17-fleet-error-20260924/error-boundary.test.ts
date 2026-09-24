import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../apps/fleet-partner-portal-web/middleware";
import { POST } from "../../../apps/fleet-partner-portal-web/app/api/auth/[...auth]/route";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { statSync, readFileSync } from "node:fs";
import ts from "typescript";

const appRoot = resolve("apps/fleet-partner-portal-web");
const realRequire = createRequire(resolve(appRoot, "package.json"));
const react = realRequire("react") as any;
const { renderToStaticMarkup } = realRequire("react-dom/server") as any;

let currentStates: any[] = [];
let stateCursor = 0;

const mockReact = {
  ...react,
  useState: (initial: any) => {
    const cursor = stateCursor++;
    if (currentStates[cursor] === undefined) {
      currentStates[cursor] = typeof initial === "function" ? initial() : initial;
    }
    const setter = (val: any) => {
      currentStates[cursor] = typeof val === "function" ? val(currentStates[cursor]) : val;
    };
    return [currentStates[cursor], setter];
  },
  useEffect: (cb: any) => { cb(); },
  useContext: (ctx: any) => ctx._currentValue || { locale: "zh", setLocale: () => {} },
  useCallback: (cb: any) => cb,
  useMemo: (cb: any) => cb(),
};

function createCustomUiModuleLoader(appRoot: string, mocks: any = {}) {
  const cache = new Map();
  function load(path: string) {
    const file = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`].find(p => {
      try { return statSync(p).isFile(); } catch { return false; }
    });
    if (!file) throw new Error(`Missing test module: ${path}`);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (id: string) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith(".css")) return {};
      if (id.startsWith("@/")) return load(resolve(appRoot, id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      if (id.startsWith("@drts/")) {
         return load(resolve(appRoot, "../../packages", id.split("/")[1]!, "src"));
      }
      return createRequire(file)(id);
    };
    new Function("require", "module", "exports", output)(requireLocal, module, module.exports);
    return module.exports;
  }
  return load;
}

const load = createCustomUiModuleLoader(appRoot, {
  react: mockReact,
});
const FleetPortalError = load(resolve(appRoot, "app/error.tsx")).default;

function findButtonWithText(node: any, text: string): any {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const res = findButtonWithText(c, text);
      if (res) return res;
    }
    return null;
  }
  if (node.props) {
    if (node.props.children) {
      let isMatch = false;
      const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
      if (children.some((c: any) => typeof c === "string" && c.includes(text))) isMatch = true;
      if (isMatch && node.props.onClick) return node;
      const res = findButtonWithText(node.props.children, text);
      if (res) return res;
    }
  }
  return null;
}

describe("UI17-FLEET-ERROR-20260924 component rendering and interactions", () => {
  it("renders generic error gracefully and allows retry", () => {
    stateCursor = 0; currentStates = [];
    const error = new Error("Some generic error");
    let resetCalled = false;
    const tree = FleetPortalError({ error, reset: () => { resetCalled = true; } });
    
    // Interactions
    const retryBtn = findButtonWithText(tree, "重試");
    expect(retryBtn).toBeDefined();
    expect(retryBtn.props.onClick).toBeDefined();
    retryBtn.props.onClick();
    expect(resetCalled).toBe(true);
    
    // Back to dashboard
    global.window = { location: { href: "" } } as any;
    const dashboardBtn = findButtonWithText(tree, "回");
    expect(dashboardBtn).toBeDefined();
    dashboardBtn.props.onClick();
    expect(global.window.location.href).toBe("/dashboard");

    // Static markup checks
    stateCursor = 0;
    const markup = renderToStaticMarkup(react.createElement(FleetPortalError, { error, reset: () => {} }));
    expect(markup).toContain("頁面發生錯誤");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("Some generic error");
  });

  it("renders scope error, shows logout button and recovers via middleware", async () => {
    stateCursor = 0; currentStates = [];
    const error = new Error("Missing fleet scope configuration");
    const tree = FleetPortalError({ error, reset: () => {} });
    
    const logoutBtn = findButtonWithText(tree, "登出");
    expect(logoutBtn).toBeDefined();
    expect(logoutBtn.props.onClick).toBeDefined();

    // Mock fetch for interaction
    let fetchCalled = false;
    global.document = { cookie: "drts_csrf=csrf-123" } as any;
    global.window = { location: { href: "" } } as any;
    global.fetch = async (url: any, opts: any) => {
      fetchCalled = true;
      // Call actual middleware / route to fulfill requirement
      const nextReq = new NextRequest("http://localhost" + url, {
        method: opts.method,
        headers: new Headers({
          cookie: global.document.cookie,
          "x-csrf-token": opts.headers["x-csrf-token"],
        }),
      });
      const midRes = await middleware(nextReq);
      if (midRes.status === 403) return { ok: false, status: 403 } as any;
      const routeRes = await POST(nextReq, { params: Promise.resolve({ auth: ["logout"] }) });
      return { ok: routeRes.status === 200, status: routeRes.status } as any;
    };

    // Trigger logout
    await logoutBtn.props.onClick();
    expect(fetchCalled).toBe(true);
    expect(global.window.location.href).toBe("/");
    
    // Static markup checks
    stateCursor = 0;
    const markup = renderToStaticMarkup(react.createElement(FleetPortalError, { error, reset: () => {} }));
    expect(markup).toContain("缺少車隊身分");
    expect(markup).toContain("登出");
  });
  
  it("handles duplicate clicks and 403 network rejection with retry", async () => {
    stateCursor = 0; currentStates = [];
    const error = new Error("Missing fleet scope configuration");
    let fetchCalls = 0;
    global.document = { cookie: "drts_csrf=csrf-wrong" } as any; // Invalid CSRF
    global.window = { location: { href: "" } } as any;
    global.fetch = async () => {
      fetchCalls++;
      // Return 403 explicitly to test rejection
      return { ok: false, status: 403 } as any;
    };
    
    let tree = FleetPortalError({ error, reset: () => {} });
    const logoutBtn = findButtonWithText(tree, "登出");
    
    // Start the click but don't await yet
    const p1 = logoutBtn.props.onClick();
    
    // While pending, if we re-render the tree, the button should be disabled
    stateCursor = 0;
    const pendingTree = FleetPortalError({ error, reset: () => {} });
    const pendingBtn = findButtonWithText(pendingTree, "登出");
    expect(pendingBtn.props.disabled).toBe(true);

    // Now wait for the fetch to reject
    await p1;
    
    // Should only call fetch once!
    expect(fetchCalls).toBe(1);
    
    // State should now show logout error. We must re-render to check!
    stateCursor = 0;
    tree = FleetPortalError({ error, reset: () => {} });
    
    // logoutError triggers `t("error.generic.badge") - t("actions.retry")`
    // We check that our tree has the generic badge text "頁面發生錯誤"
    expect(JSON.stringify(tree)).toContain("頁面發生錯誤");
    expect(JSON.stringify(tree)).toContain("重試");
  });
});

describe("UI17-FLEET-ERROR-20260924 auth logic", () => {
  it("logout route and middleware handle CSRF and session success", async () => {
    const successReq = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: new Headers({
        cookie: "drts_session=sesh; drts_csrf=csrf-123",
        "x-csrf-token": "csrf-123",
      }),
    });
    const midResSuccess = await middleware(successReq);
    expect(midResSuccess.headers.get("x-drts-candidate-sha")).toBeDefined();
    const routeRes = await POST(successReq, {
      params: Promise.resolve({ auth: ["logout"] }),
    });
    expect(routeRes.status).toBe(200);
    const setCookie = routeRes.headers.get("set-cookie") || "";
    expect(setCookie).toContain("drts_session=;");
  });

  it("logout route and middleware handle 403 on invalid CSRF", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: new Headers({
        cookie: "drts_session=sesh; drts_csrf=csrf-123",
        "x-csrf-token": "wrong",
      }),
    });
    const midRes = await middleware(req);
    expect(midRes.status).toBe(403);
    const body = await midRes.json();
    expect(body.error).toBe("CSRF_TOKEN_INVALID");
  });
});
