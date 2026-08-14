#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = process.cwd();
const APPS = [
  "apps/referral-embed-web",
  "apps/concierge-portal-web",
  "apps/tenant-console-web",
  "apps/ops-console-web",
  "apps/platform-admin-web",
  "apps/enterprise-dispatch-web",
  "apps/partner-booking-web",
  "apps/fleet-partner-portal-web",
  "apps/channel-partner-portal-web",
  "apps/bank-console-web",
];
const TARGET_DIRS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const JSX_COPY_ATTRS = new Set(["placeholder", "title", "alt", "aria-label"]);
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const LATIN_PATTERN = /[A-Za-z]/;
const LOCALE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const MACHINE_TOKEN_PATTERN =
  /^(?:[A-Za-z_][\w./:-]*|\/[\w/-]+|[A-Z0-9_-]{2,}|Q-[A-Z0-9-]+)$/;
const DEFAULT_BASELINE_PATH = path.join(ROOT, "i18n-guard-baseline.json");

function parseArgs(argv) {
  const options = {
    baselinePath: DEFAULT_BASELINE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--baseline") {
      const nextArg = argv[index + 1];
      if (!nextArg) {
        throw new Error("--baseline requires a file path.");
      }
      options.baselinePath = path.resolve(ROOT, nextArg);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node tools/ci/i18n-guard.mjs [--baseline path]

Scans all guarded web apps for inline user-facing copy.
Known temporary exemptions live in ${path.relative(ROOT, DEFAULT_BASELINE_PATH)}.

Baseline format:
{
  "version": 1,
  "exemptions": [
    {
      "path": "apps/example-web/app/page.tsx",
      "rules": ["jsx-text"],
      "reason": "Fixture-backed demo surface pending remediation."
    }
  ]
}`);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function walkFiles(dirPath, files) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension) || entry.name === "translations.ts") {
      continue;
    }

    files.push(fullPath);
  }
}

function getFiles() {
  const files = [];

  for (const appPath of APPS) {
    for (const dirName of TARGET_DIRS) {
      walkFiles(path.join(ROOT, appPath, dirName), files);
    }
  }

  return files.sort();
}

function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return `${line + 1}:${character + 1}`;
}

function getNodeText(sourceFile, node) {
  return node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 140);
}

function unwrapExpression(node) {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }

  return node;
}

function isTextLiteral(node) {
  if (!node) {
    return false;
  }

  const valueNode = unwrapExpression(node);
  return (
    ts.isStringLiteral(valueNode) ||
    ts.isNoSubstitutionTemplateLiteral(valueNode) ||
    ts.isTemplateExpression(valueNode)
  );
}

function getLiteralText(node) {
  const valueNode = unwrapExpression(node);

  if (
    ts.isStringLiteral(valueNode) ||
    ts.isNoSubstitutionTemplateLiteral(valueNode)
  ) {
    return valueNode.text;
  }

  if (ts.isTemplateExpression(valueNode)) {
    return valueNode.getText();
  }

  return "";
}

function hasHumanText(text) {
  return LATIN_PATTERN.test(text) || CJK_PATTERN.test(text);
}

function isLikelyDisplayText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (LOCALE_TAG_PATTERN.test(trimmed) || MACHINE_TOKEN_PATTERN.test(trimmed)) {
    return false;
  }

  if (CJK_PATTERN.test(trimmed)) {
    return true;
  }

  return /[A-Za-z]{2,}(?:[\s./:-]+[A-Za-z0-9]{2,})+/.test(trimmed);
}

function propertyNameText(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return "";
}

function isLocaleCondition(node, sourceFile) {
  const text = node.getText(sourceFile);
  return /\blocale\b/.test(text) && /(===|!==)/.test(text);
}

function report(violations, sourceFile, node, rule, detail) {
  violations.push({
    file: path.relative(ROOT, sourceFile.fileName),
    location: getLineAndColumn(sourceFile, node),
    rule,
    detail,
    snippet: getNodeText(sourceFile, node),
  });
}

function checkNode(sourceFile, node, violations) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === "tx") {
      report(
        violations,
        sourceFile,
        node,
        "tx-helper",
        "Avoid inline tx helper usage; move copy into translations.ts and resolve with t(...).",
      );
    }
  }

  if (
    ts.isConditionalExpression(node) &&
    isLocaleCondition(node.condition, sourceFile)
  ) {
    const trueText = getLiteralText(node.whenTrue);
    const falseText = getLiteralText(node.whenFalse);
    if (isLikelyDisplayText(trueText) || isLikelyDisplayText(falseText)) {
      report(
        violations,
        sourceFile,
        node,
        "locale-ternary-copy",
        "Avoid locale-based inline copy ternaries; move strings into translations.ts.",
      );
    }
  }

  if (ts.isObjectLiteralExpression(node)) {
    const keys = new Set();

    for (const property of node.properties) {
      if (
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)
      ) {
        const name = propertyNameText(property.name);
        if (name) {
          keys.add(name);
        }
      }
    }

    if (keys.has("en") && keys.has("zh")) {
      report(
        violations,
        sourceFile,
        node,
        "inline-bilingual-map",
        "Avoid inline { en, zh } maps; place bilingual copy in translations.ts.",
      );
    }
  }

  if (ts.isJsxText(node)) {
    const text = node.getText(sourceFile).trim();
    if (text && isLikelyDisplayText(text)) {
      report(
        violations,
        sourceFile,
        node,
        "jsx-text",
        "Inline JSX text should come from translations.ts.",
      );
    }
  }

  if (
    ts.isJsxAttribute(node) &&
    JSX_COPY_ATTRS.has(node.name.text) &&
    node.initializer &&
    ts.isStringLiteral(node.initializer)
  ) {
    if (isLikelyDisplayText(node.initializer.text)) {
      report(
        violations,
        sourceFile,
        node,
        "jsx-copy-attribute",
        `Inline ${node.name.text} text should come from translations.ts.`,
      );
    }
  }

  ts.forEachChild(node, (child) => checkNode(sourceFile, child, violations));
}

function scanFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = [];

  checkNode(sourceFile, sourceFile, violations);
  return violations;
}

function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return { exemptions: [], path: baselinePath };
  }

  const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.exemptions)
  ) {
    throw new Error(
      `Invalid baseline file at ${path.relative(ROOT, baselinePath)}: expected { exemptions: [] }.`,
    );
  }

  const exemptions = parsed.exemptions.map((entry, index) => {
    if (!entry || typeof entry !== "object" || typeof entry.path !== "string") {
      throw new Error(
        `Invalid baseline entry #${index + 1}: each exemption requires a string "path".`,
      );
    }

    if (
      entry.rules !== undefined &&
      (!Array.isArray(entry.rules) ||
        entry.rules.some((rule) => typeof rule !== "string"))
    ) {
      throw new Error(
        `Invalid baseline entry for ${entry.path}: "rules" must be an array of strings.`,
      );
    }

    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      throw new Error(
        `Invalid baseline entry for ${entry.path}: "reason" is required.`,
      );
    }

    return {
      path: entry.path,
      rules: entry.rules ? new Set(entry.rules) : null,
      reason: entry.reason.trim(),
    };
  });

  return { exemptions, path: baselinePath };
}

function splitViolations(violations, baseline) {
  const active = [];
  const exempted = [];

  for (const violation of violations) {
    const match = baseline.exemptions.find((entry) => {
      if (entry.path !== violation.file) {
        return false;
      }

      return !entry.rules || entry.rules.has(violation.rule);
    });

    if (match) {
      exempted.push({ ...violation, reason: match.reason });
      continue;
    }

    active.push(violation);
  }

  return { active, exempted };
}

let options;

try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`i18n-guard: ${error.message}`);
  process.exit(2);
}

const files = getFiles();
const violations = files.flatMap((filePath) => scanFile(filePath));

let baseline;

try {
  baseline = loadBaseline(options.baselinePath);
} catch (error) {
  console.error(`i18n-guard: ${error.message}`);
  process.exit(2);
}

const { active: activeViolations, exempted: exemptedViolations } =
  splitViolations(violations, baseline);

if (activeViolations.length === 0) {
  console.log(
    `i18n-guard: OK (${files.length} files scanned across ${APPS.length} apps, ${exemptedViolations.length} exemption(s) from ${path.relative(ROOT, baseline.path)})`,
  );
  process.exit(0);
}

console.error(
  `i18n-guard: ${activeViolations.length} violation(s) across ${files.length} files (${exemptedViolations.length} exempted)`,
);

for (const violation of activeViolations) {
  console.error(
    `${violation.file}:${violation.location} [${violation.rule}] ${violation.detail}`,
  );
  console.error(`  ${violation.snippet}`);
}

process.exit(1);
