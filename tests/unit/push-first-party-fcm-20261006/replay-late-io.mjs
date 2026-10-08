// Replay the current regression against exact historical production source,
// without resetting a worktree. No servers, databases or real network sends.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const ref = process.argv[2] || "a10e0b23032a2ae1176f59f02660dedd25dd7fdf";
if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error("Supply a full commit SHA");
const sourcePaths = [
  "apps/api/src/modules/multi-taxi/fcm-push.provider.ts",
  "apps/api/src/modules/multi-taxi/first-party-notification.transport.ts",
  "apps/api/src/modules/multi-taxi/multi-taxi.repository.ts",
  "apps/api/src/modules/multi-taxi/multi-taxi.service.ts",
  "apps/api/src/common/google-cloud/google-cloud-object-client.ts",
];
const testPath = "tests/unit/push-first-party-fcm-20261006/late-io.test.ts";
const scratch = path.join(
  root,
  ".local/push-first-party-fcm-late-io-20261008",
  `replay-${ref}`,
);
fs.mkdirSync(scratch, { recursive: true });
const dependencyLink = path.join(scratch, "node_modules");
if (!fs.existsSync(dependencyLink))
  fs.symlinkSync(
    path.join(root, "apps/api/node_modules"),
    dependencyLink,
    "dir",
  );
const extracted = new Map(
  sourcePaths.map((p) => [
    path.join(root, p),
    path.join(scratch, path.basename(p)),
  ]),
);
function rewriteImports(source, originalPath) {
  return source.replace(
    /((?:from|import)\s*["'])(\.[^"']+)(["'])/g,
    (_, prefix, relative, quote) => {
      const resolved = path.resolve(root, path.dirname(originalPath), relative);
      return prefix + (extracted.get(resolved + ".ts") || resolved) + quote;
    },
  );
}
const blobs = {};
for (const p of sourcePaths) {
  const source = execFileSync("git", ["show", `${ref}:${p}`], {
    cwd: root,
    encoding: "utf8",
  });
  blobs[p] = execFileSync("git", ["rev-parse", `${ref}:${p}`], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  fs.writeFileSync(
    extracted.get(path.join(root, p)),
    rewriteImports(source, p),
  );
}
const copiedTest = path.join(scratch, "late-io.test.ts");
fs.writeFileSync(
  copiedTest,
  rewriteImports(fs.readFileSync(path.join(root, testPath), "utf8"), testPath),
);
const configPath = path.join(scratch, "vitest.config.mts");
fs.writeFileSync(
  configPath,
  `import base from ${JSON.stringify(path.join(root, "vitest.config.ts"))};\nexport default { ...base, test: { ...base.test, include: [${JSON.stringify(path.relative(root, copiedTest))}] } };\n`,
);
fs.writeFileSync(
  path.join(scratch, "sources.json"),
  JSON.stringify(
    {
      sourceCommit: ref,
      regressionCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      blobs,
      mockedBoundaries: ["database rows", "metadata HTTP", "FCM HTTP"],
      actualNetworkCalls: 0,
    },
    null,
    2,
  ),
);
const logPath = path.join(scratch, "vitest.log");
const fd = fs.openSync(logPath, "w");
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", configPath],
  { cwd: root, stdio: ["ignore", fd, fd] },
);
fs.closeSync(fd);
fs.writeFileSync(
  path.join(scratch, "exit-code.txt"),
  String(result.status ?? 1) + "\n",
);
process.stdout.write(fs.readFileSync(logPath, "utf8"));
process.exitCode = result.status ?? 1;
