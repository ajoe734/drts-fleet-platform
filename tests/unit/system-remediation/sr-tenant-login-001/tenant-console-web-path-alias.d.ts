// apps/tenant-console-web/middleware.ts imports from the "@/lib/auth/constants"
// path alias, which is only registered in that app's own tsconfig
// (apps/tenant-console-web/tsconfig.json). The root tsconfig used by
// `pnpm typecheck:root` has no such mapping, so once this task's test file
// pulls middleware.ts into the root TS program it fails with TS2307. Rather
// than touch middleware.ts (out of this task's write_scopes), re-declare the
// subset of that module middleware.ts actually imports so the root program
// can typecheck it. Runtime resolution is unaffected: vitest.config.ts
// already aliases "@" to apps/tenant-console-web for the actual test run,
// and apps/tenant-console-web's own tsconfig/build resolve "@/*" natively.
declare module "@/lib/auth/constants" {
  export const TENANT_SESSION_COOKIE_NAME: string;
  export const TENANT_LOGIN_PATH: string;
  export const PUBLIC_AUTH_PATHS: readonly string[];
}
