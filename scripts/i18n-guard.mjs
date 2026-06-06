#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const cwd = process.cwd();

const DEFAULT_TARGETS = [
  {
    file: "apps/ops-console-web/lib/translations.ts",
    kind: "translations",
  },
  {
    file: "apps/platform-admin-web/lib/translations.ts",
    kind: "translations",
  },
  {
    file: "apps/ops-console-web/lib/localized-labels.ts",
    kind: "localized-labels",
  },
  {
    file: "apps/platform-admin-web/lib/localized-labels.ts",
    kind: "localized-labels",
  },
];

function readSourceFile(relativePath) {
  const absolutePath = path.resolve(cwd, relativePath);
  const sourceText = fs.readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    sourceFile: ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  };
}

function findVariableObjectLiteral(sourceFile, variableName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === variableName &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        return declaration.initializer;
      }
    }
  }
  return null;
}

function getPropertyNameText(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function collectObjectKeys(objectLiteral) {
  const keys = new Set();
  for (const property of objectLiteral.properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }
    const key = getPropertyNameText(property.name);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function compareLocaleKeys(file, sourceFile, violations) {
  const enObject = findVariableObjectLiteral(sourceFile, "en");
  const zhObject = findVariableObjectLiteral(sourceFile, "zh");

  if (!enObject || !zhObject) {
    violations.push(`${file}: missing top-level en/zh translation objects`);
    return;
  }

  const enKeys = collectObjectKeys(enObject);
  const zhKeys = collectObjectKeys(zhObject);

  for (const key of [...enKeys].sort()) {
    if (!zhKeys.has(key)) {
      violations.push(`${file}: missing zh translation for key "${key}"`);
    }
  }

  for (const key of [...zhKeys].sort()) {
    if (!enKeys.has(key)) {
      violations.push(`${file}: missing en translation for key "${key}"`);
    }
  }
}

function validateLocalizedLabelsObject(
  file,
  objectName,
  objectLiteral,
  violations,
) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const key = getPropertyNameText(property.name) ?? "<unknown>";
    if (!ts.isObjectLiteralExpression(property.initializer)) {
      violations.push(
        `${file}: ${objectName}.${key} is not a localized object literal`,
      );
      continue;
    }

    const nestedKeys = collectObjectKeys(property.initializer);
    if (!nestedKeys.has("en")) {
      violations.push(`${file}: ${objectName}.${key} missing en label`);
    }
    if (!nestedKeys.has("zh")) {
      violations.push(`${file}: ${objectName}.${key} missing zh label`);
    }
  }
}

function compareLocalizedLabelCoverage(file, sourceFile, violations) {
  for (const objectName of ["UI_LABELS", "CODE_LABELS"]) {
    const objectLiteral = findVariableObjectLiteral(sourceFile, objectName);
    if (!objectLiteral) {
      violations.push(`${file}: missing ${objectName} object`);
      continue;
    }
    validateLocalizedLabelsObject(file, objectName, objectLiteral, violations);
  }
}

function parseTargets(argv) {
  if (argv.length === 0) {
    return DEFAULT_TARGETS;
  }

  return argv.map((entry) => {
    const normalized = entry.trim();
    if (normalized.endsWith("translations.ts")) {
      return { file: normalized, kind: "translations" };
    }
    if (normalized.endsWith("localized-labels.ts")) {
      return { file: normalized, kind: "localized-labels" };
    }
    throw new Error(
      `Unsupported target "${entry}". Expected translations.ts or localized-labels.ts`,
    );
  });
}

function main() {
  const targets = parseTargets(process.argv.slice(2));
  const violations = [];

  for (const target of targets) {
    const { sourceFile } = readSourceFile(target.file);
    if (target.kind === "translations") {
      compareLocaleKeys(target.file, sourceFile, violations);
      continue;
    }
    compareLocalizedLabelCoverage(target.file, sourceFile, violations);
  }

  if (violations.length > 0) {
    console.error("i18n guard violations:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`i18n guard passed for ${targets.length} file(s).`);
}

main();
