import { execFileSync } from "node:child_process";
import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

// Rerun the committed regressions against published source without changing
// any worktree or mocking the implementation under test.
const sourceSha = process.env.PAX_WEB_SHELL_SOURCE_SHA;
if (sourceSha && !/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error("PAX_WEB_SHELL_SOURCE_SHA must be a full commit SHA");
}
const repoRoot = path.resolve(__dirname, "../../..");
const productionFiles = new Set([
  "packages/passenger-client/src/client.ts",
  "apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts",
]);

export default mergeConfig(
  rootConfig,
  defineConfig({
    plugins: [
      {
        name: "pax-web-shell-historical-source",
        enforce: "pre",
        load(id) {
          const relativePath = path
            .relative(repoRoot, id.split("?")[0] ?? id)
            .split(path.sep)
            .join("/");
          if (!sourceSha || !productionFiles.has(relativePath)) return null;
          return execFileSync("git", ["show", `${sourceSha}:${relativePath}`], {
            cwd: repoRoot,
            encoding: "utf8",
          });
        },
      },
    ],
  }),
);
