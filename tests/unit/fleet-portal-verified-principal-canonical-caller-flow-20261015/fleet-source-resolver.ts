import { resolve, sep } from "node:path";
import type { Plugin } from "vitest/config";

/** Keep the real Fleet app's module boundaries when root CI mounts its callers. */
export function fleetSourceResolver(root: string): Plugin {
  const fleetRoot = resolve(root, "apps/fleet-partner-portal-web");
  const tenantRoot = resolve(root, "apps/tenant-console-web");
  const platformI18n = resolve(root, "apps/platform-admin-web/lib/i18n.tsx");
  const marker = resolve(
    root,
    "tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/server-only.ts",
  );
  return {
    name: "fleet-portal-real-source-test-resolver",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer?.startsWith(`${fleetRoot}${sep}`)) return null;
      if (source === "server-only") return marker;

      // Vite's alias plugin precedes user plugins, including enforce:pre.
      // Root aliases may already have expanded the Fleet app's @/ imports.
      const relative = source.startsWith("@/")
        ? source.slice(2)
        : source.startsWith(`${tenantRoot}${sep}`)
          ? source.slice(tenantRoot.length + 1)
          : source === platformI18n
            ? "lib/i18n.tsx"
            : null;
      if (relative === null) return null;
      return this.resolve(resolve(fleetRoot, relative), importer, {
        skipSelf: true,
      });
    },
  };
}
