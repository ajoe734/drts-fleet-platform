import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const base = process.env.BASE_SHA ?? "1fba7476925bb29e6f2eeff7acbeb0ba16d0afb4";
const git = (...args) => execFileSync("git", args, { cwd: root });
const original = (file) => git("show", `${base}:${file}`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const changed = git("diff", "--name-only", base)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard")
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
for (const file of [...changed, ...untracked]) {
  assert.ok(
    file === "apps/api/src/common/throttling/key-scoped-throttler.storage.ts" ||
      file === "apps/api/src/app.module.ts" ||
      file.startsWith("tests/unit/sr-api-throttle-key-isolation-20261013/") ||
      file ===
        "docs/04-uat/system-remediation-20260906/api-throttle-key-isolation-20261013.md",
    `Unallocated change: ${file}`,
  );
}
const modulePath = "apps/api/src/app.module.ts";
const expectedModule = original(modulePath)
  .toString()
  .replace(
    'import { BootstrapThrottlerGuard } from "./common/throttling/bootstrap-throttler.guard";\n',
    'import { BootstrapThrottlerGuard } from "./common/throttling/bootstrap-throttler.guard";\nimport { KeyScopedThrottlerStorage } from "./common/throttling/key-scoped-throttler.storage";\n',
  )
  .replace(
    "    ThrottlerModule.forRoot([...GLOBAL_RATE_LIMIT]),",
    "    ThrottlerModule.forRoot({\n      throttlers: [...GLOBAL_RATE_LIMIT],\n      storage: new KeyScopedThrottlerStorage(),\n    }),",
  );
assert.equal(
  readFileSync(resolve(root, modulePath), "utf8"),
  expectedModule,
  "AppModule changed beyond two authorized locations",
);
const tracked = git("ls-tree", "-r", "--name-only", base)
  .toString()
  .trim()
  .split("\n");
const readonly = tracked.filter(
  (file) =>
    (file.startsWith("apps/api/src/") && file !== modulePath) ||
    file === "pnpm-lock.yaml" ||
    file.endsWith("package.json") ||
    file.startsWith("tools/system-remediation/ops-capacity/") ||
    file === "tools/system-remediation/ops-proof/capacity.mjs" ||
    file.startsWith(
      "tests/unit/system-remediation/sr-ops-capacity-20260911/",
    ) ||
    file.startsWith(
      "tests/integration/system-remediation/sr-ops-capacity-20260911/",
    ) ||
    file === ".github/workflows/ops-capacity-acceptance.yml" ||
    file === "tsconfig.base.json" ||
    file === "tsconfig.json" ||
    file === "apps/api/tsconfig.json",
);
const sources = {};
for (const file of readonly) {
  const oldHash = hash(original(file));
  const newHash = hash(readFileSync(resolve(root, file)));
  assert.equal(newHash, oldHash, `Read-only source changed: ${file}`);
  sources[file] = { oldSha256: oldHash, newSha256: newHash };
}
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
assert.equal(apiRequire("@nestjs/throttler/package.json").version, "6.5.0");
const dependencies = {};
for (const [file, expected] of [
  [
    "throttler.service.js",
    "5850f253b1a2719c7ed0a38597552d050e0e9accd24a33fd475bc9d52bf7680b",
  ],
  [
    "throttler.guard.js",
    "f96d6921052ace949a5643d9e0787ac63088fbc2972bc7a55abb1b5a829b1d72",
  ],
]) {
  const path = apiRequire.resolve(`@nestjs/throttler/dist/${file}`);
  const digest = hash(readFileSync(path));
  assert.equal(digest, expected, "Frozen dependency bytes changed");
  dependencies[file] = { path, sha256: digest };
}
const evidence = resolve(root, ".local/sr-api-throttle-key-isolation-20261013");
mkdirSync(evidence, { recursive: true });
writeFileSync(
  resolve(evidence, "scope-hashes.json"),
  JSON.stringify(
    {
      base,
      head: git("rev-parse", "HEAD").toString().trim(),
      changed,
      untracked,
      moduleOnlyAuthorizedLocations: true,
      sources,
      dependencies,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS: ${readonly.length} read-only source hashes; AppModule only two authorized locations; frozen 6.5.0 guard/storage bytes intact`,
);
