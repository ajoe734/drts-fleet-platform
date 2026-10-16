import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import * as apiClient from "../../../packages/api-client/src";
import * as contracts from "@drts/contracts";

export type ReactLike = {
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown;
  act: (callback: () => void | Promise<void>) => Promise<void>;
};

export type RootLike = {
  render: (element: unknown) => void;
  unmount: () => void;
};

export type LoadedPaymentDetailModules = {
  React: ReactLike;
  createRoot: (container: Element) => RootLike;
  PaymentExceptionDetail: unknown;
  LanguageProvider: unknown;
  paymentExceptionCopy: (locale: "en" | "zh", key: string) => string;
};

/**
 * Transpiles and loads the production PaymentExceptionDetail component and its
 * platform-admin-web @/ and @drts/ui-web dependencies directly from source
 * using platform-admin-web's module resolution context.
 */
export function loadPaymentDetailModules(): LoadedPaymentDetailModules {
  const appRoot = resolve("apps/platform-admin-web");
  const uiWebRoot = resolve("packages/ui-web/src");
  const uiTokensRoot = resolve("packages/ui-tokens/src");
  const appRequire = createRequire(resolve(appRoot, "package.json"));
  const React = appRequire("react") as ReactLike;
  const jsxRuntime = appRequire("react/jsx-runtime") as unknown;
  const { createRoot } = appRequire("react-dom/client") as {
    createRoot: (container: Element) => RootLike;
  };
  const cache = new Map<string, { exports: unknown }>();

  function load(targetPath: string): unknown {
    const file = [
      targetPath,
      `${targetPath}.ts`,
      `${targetPath}.tsx`,
      resolve(targetPath, "index.ts"),
      resolve(targetPath, "index.tsx"),
    ].find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (!file) {
      throw new Error(`Missing production module: ${targetPath}`);
    }
    if (cache.has(file)) {
      return cache.get(file)!.exports;
    }

    const moduleRecord = { exports: {} };
    cache.set(file, moduleRecord);

    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;

    const requireLocal = (id: string): unknown => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsxRuntime;
      if (id === "@drts/ui-web") return load(resolve(uiWebRoot, "index.tsx"));
      if (id === "@drts/ui-web/canvas-tokens") {
        return load(resolve(uiWebRoot, "canvas-tokens.ts"));
      }
      if (id === "@drts/ui-tokens") {
        return load(resolve(uiTokensRoot, "index.ts"));
      }
      if (id === "@drts/api-client") return apiClient;
      if (id === "@drts/contracts") return contracts;
      if (id === "next/navigation") {
        return {
          useRouter: () => ({
            refresh: () => {},
            push: () => {},
            replace: () => {},
          }),
        };
      }
      if (id.startsWith("@/")) {
        return load(resolve(appRoot, id.slice(2)));
      }
      if (id.startsWith(".")) {
        return load(resolve(dirname(file), id));
      }
      return appRequire(id);
    };

    new Function("exports", "require", "module", output)(
      moduleRecord.exports,
      requireLocal,
      moduleRecord,
    );
    return moduleRecord.exports;
  }

  const detailModule = load(
    resolve(appRoot, "app/payments/[orderId]/payment-exception-detail.tsx"),
  ) as {
    PaymentExceptionDetail: unknown;
  };
  const i18nModule = load(resolve(appRoot, "lib/i18n.tsx")) as {
    LanguageProvider: unknown;
  };
  const translationsModule = load(
    resolve(appRoot, "app/payments/[orderId]/translations.ts"),
  ) as {
    paymentExceptionCopy: (locale: "en" | "zh", key: string) => string;
  };

  return {
    React,
    createRoot,
    PaymentExceptionDetail: detailModule.PaymentExceptionDetail,
    LanguageProvider: i18nModule.LanguageProvider,
    paymentExceptionCopy: translationsModule.paymentExceptionCopy,
  };
}
