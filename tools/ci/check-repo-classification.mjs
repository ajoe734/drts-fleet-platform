#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const manifestPath = path.join(repoRoot, "repo-classification.json");

function fail(message) {
  console.error(`[classification:error] ${message}`);
  process.exitCode = 1;
}

function loadManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion: ${manifest.schemaVersion}`);
  }

  const knownClassifications = new Set(
    Object.keys(manifest.classifications ?? {}),
  );
  manifest.compiledRules = (manifest.rules ?? []).map((rule) => {
    if (!knownClassifications.has(rule.classification)) {
      throw new Error(
        `rule ${rule.id} uses unknown classification ${rule.classification}`,
      );
    }
    return { ...rule, regex: new RegExp(rule.pattern) };
  });
  return manifest;
}

function repositoryFiles() {
  const trackedOutput = execFileSync("git", ["ls-files", "--cached", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const migrationOutput = execFileSync(
    "git",
    [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "operations",
      "runtime",
      "tools",
      "repo-classification.json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return [
    ...new Set([...trackedOutput.split("\0"), ...migrationOutput.split("\0")]),
  ]
    .filter((file) => file && existsSync(path.join(repoRoot, file)))
    .sort();
}

function classify(file, rules) {
  return rules.find((rule) => rule.regex.test(file));
}

function validateCoverage(manifest, files) {
  const knownClassifications = new Set(
    Object.keys(manifest.classifications ?? {}),
  );
  const counts = new Map();
  const classificationsByFile = new Map();

  for (const file of files) {
    const rule = classify(file, manifest.compiledRules);
    if (!rule) {
      // Naming only the file sent three separate changes red in one day --
      // .prettierignore, then two new workflows -- because nothing connected
      // "I added a file" to "a regex in repo-classification.json has to learn
      // about it". Say where to go and what the choice means.
      fail(
        `unclassified tracked file: ${file}\n` +
          `    Add a rule for it in repo-classification.json (rules are first-match,\n` +
          `    so put a specific rule above a general one). Pick the classification by\n` +
          `    what breaks if CI skips it: ${[...knownClassifications].join(", ")}.`,
      );
      continue;
    }
    classificationsByFile.set(file, rule.classification);
    counts.set(rule.classification, (counts.get(rule.classification) ?? 0) + 1);
  }

  for (const classification of Object.keys(manifest.classifications)) {
    console.log(
      `[classification] ${classification}: ${counts.get(classification) ?? 0}`,
    );
  }
  return classificationsByFile;
}

function validateDeployables(manifest) {
  const seenPaths = new Set();
  const seenNames = new Set();
  for (const deployable of manifest.activeDeployables ?? []) {
    if (seenPaths.has(deployable.path)) {
      fail(`duplicate deployable path: ${deployable.path}`);
    }
    if (seenNames.has(deployable.name)) {
      fail(`duplicate deployable name: ${deployable.name}`);
    }
    seenPaths.add(deployable.path);
    seenNames.add(deployable.name);

    if (!existsSync(path.join(repoRoot, deployable.path))) {
      fail(`active deployable path does not exist: ${deployable.path}`);
      continue;
    }
    const rule = classify(`${deployable.path}/`, manifest.compiledRules);
    if (
      !rule ||
      rule.classification !== "product_runtime" ||
      rule.status !== "active"
    ) {
      fail(
        `active deployable is not classified as active product_runtime: ${deployable.path}`,
      );
    }
  }
}

function validateRemovableSidecar(manifest, classificationsByFile) {
  const policy = manifest.lifecyclePolicy?.developmentSidecar;
  if (!policy?.requireProductIndependence) {
    return;
  }
  const removable = policy.removalPaths ?? [];
  const allowed = new Set(policy.classifications ?? []);
  for (const [file, classification] of classificationsByFile) {
    if (
      !removable.some(
        (prefix) => file === prefix || file.startsWith(`${prefix}/`),
      )
    ) {
      continue;
    }
    if (!allowed.has(classification)) {
      fail(`removable sidecar path contains ${classification} file: ${file}`);
    }
  }
  for (const deployable of manifest.activeDeployables ?? []) {
    if (
      removable.some(
        (prefix) =>
          deployable.path === prefix ||
          deployable.path.startsWith(`${prefix}/`),
      )
    ) {
      fail(`active deployable is inside removable sidecar: ${deployable.path}`);
    }
  }
}

function validateRuntimeDependencies(manifest, classificationsByFile) {
  const forbidden = new Set(
    manifest.dependencyPolicy?.forbiddenRuntimePackages ?? [],
  );
  const internalPackages = new Map();

  for (const [file, classification] of classificationsByFile) {
    if (!file.startsWith("packages/") || !file.endsWith("/package.json")) {
      continue;
    }
    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, file), "utf8"),
    );
    if (packageJson.name) {
      internalPackages.set(packageJson.name, { classification, file });
    }
  }

  for (const [file, classification] of classificationsByFile) {
    if (
      classification !== "product_runtime" ||
      !file.endsWith("/package.json")
    ) {
      continue;
    }
    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, file), "utf8"),
    );
    for (const section of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const dependency of Object.keys(packageJson[section] ?? {})) {
        if (forbidden.has(dependency)) {
          fail(
            `${file} has forbidden runtime dependency ${dependency} in ${section}`,
          );
        }
        const internalPackage = internalPackages.get(dependency);
        if (
          internalPackage &&
          internalPackage.classification !== "product_runtime"
        ) {
          fail(
            `${file} depends on ${internalPackage.classification} package ${dependency} in ${section}`,
          );
        }
      }
    }
  }
}

const sourceExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

function resolveRelativeImport(sourceFile, specifier, files) {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceFile), specifier),
  );
  const candidates = [base];
  for (const extension of sourceExtensions) {
    candidates.push(`${base}${extension}`);
    candidates.push(`${base}/index${extension}`);
  }
  return candidates.find((candidate) => files.has(candidate));
}

function validateSourceDependencies(manifest, classificationsByFile) {
  const files = new Set(classificationsByFile.keys());
  const allowedTargets = new Set(
    manifest.dependencyPolicy?.runtimeMayDependOn ?? ["product_runtime"],
  );

  const importPatterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];
  for (const [file, classification] of classificationsByFile) {
    if (
      classification !== "product_runtime" ||
      !sourceExtensions.includes(path.extname(file))
    ) {
      continue;
    }
    const absoluteFile = path.join(repoRoot, file);
    if (!existsSync(absoluteFile)) {
      continue;
    }
    const content = readFileSync(absoluteFile, "utf8");
    for (const importPattern of importPatterns) {
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) {
          continue;
        }
        const target = resolveRelativeImport(file, specifier, files);
        if (!target) {
          continue;
        }
        const targetClassification = classificationsByFile.get(target);
        if (!allowedTargets.has(targetClassification)) {
          fail(`${file} imports ${targetClassification} file ${target}`);
        }
      }
    }
  }
}

function dockerCopySources(line) {
  const stripped = line.replace(/\s+#.*$/, "").trim();
  if (!/^(?:COPY|ADD)\s+/i.test(stripped)) {
    return [];
  }
  const expression = stripped.replace(/^(?:COPY|ADD)\s+/i, "");
  if (expression.startsWith("[")) {
    try {
      return JSON.parse(expression).slice(0, -1);
    } catch {
      return [];
    }
  }
  return expression
    .split(/\s+/)
    .filter((token) => !token.startsWith("--"))
    .slice(0, -1);
}

function validateDockerBoundaries(manifest, files) {
  const forbidden = manifest.dockerPolicy?.forbiddenCopyPrefixes ?? [];
  for (const file of files.filter((candidate) =>
    path.basename(candidate).startsWith("Dockerfile"),
  )) {
    const absoluteFile = path.join(repoRoot, file);
    if (!existsSync(absoluteFile)) {
      continue;
    }
    const lines = readFileSync(absoluteFile, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const source of dockerCopySources(line)) {
        const normalized = source.replace(/^\.\//, "").replace(/\/$/, "");
        if (
          forbidden.some(
            (prefix) =>
              normalized === prefix || normalized.startsWith(`${prefix}/`),
          )
        ) {
          fail(
            `${file}:${index + 1} copies forbidden development path ${source}`,
          );
        }
      }
    });
  }
}

function main() {
  const manifest = loadManifest();
  const files = repositoryFiles();
  const classificationsByFile = validateCoverage(manifest, files);
  validateDeployables(manifest);
  validateRemovableSidecar(manifest, classificationsByFile);
  validateRuntimeDependencies(manifest, classificationsByFile);
  validateSourceDependencies(manifest, classificationsByFile);
  validateDockerBoundaries(manifest, files);

  if (process.exitCode) {
    return;
  }
  console.log(`[classification:ok] validated ${files.length} repository files`);
}

main();
