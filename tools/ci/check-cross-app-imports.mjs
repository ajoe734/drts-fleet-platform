#!/usr/bin/env node
// Apps are built in isolation with packages/. Resolve relative module references
// lexically, including missing targets, so a monorepo checkout cannot hide leaks.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.argv[2] ?? ".");
const ignored = new Set(["node_modules", "dist", "build", "coverage"]);
const sourceExtensions = /\.(?:[cm]?[jt]sx?|css|scss|sass|less)$/;
const violations = [];
let scanned = 0;

function checkReference(file, sourceApp, specifier, line) {
  if (!/^\.{1,2}[/\\]/.test(specifier)) return;
  const target = path.resolve(
    path.dirname(file),
    specifier.replaceAll("\\", "/").split(/[?#]/)[0],
  );
  const [directory, targetApp] = path.relative(root, target).split(path.sep);
  if (directory === "apps" && targetApp && targetApp !== sourceApp) {
    violations.push(
      `${path.relative(root, file)}:${line}: ${JSON.stringify(specifier)} crosses from ${sourceApp} to ${targetApp}`,
    );
  }
}

// A literal prefix can already identify a foreign app in a dynamic import.
function literalPrefix(node) {
  if (!node) return { text: "", complete: false };
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return literalPrefix(node.expression);
  }
  if (ts.isStringLiteralLike(node)) return { text: node.text, complete: true };
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const part = literalPrefix(span.expression);
      text += part.text;
      if (!part.complete) return { text, complete: false };
      text += span.literal.text;
    }
    return { text, complete: true };
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = literalPrefix(node.left);
    if (!left.complete) return left;
    const right = literalPrefix(node.right);
    return { text: left.text + right.text, complete: right.complete };
  }
  return { text: "", complete: false };
}

function scan(file, sourceApp) {
  scanned += 1;
  const text = readFileSync(file, "utf8");
  if (/\.(css|scss|sass|less)$/.test(file)) {
    const uncommented = text.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      comment.replace(/[^\n]/g, " "),
    );
    const references =
      /@(?:import|use|forward)\s+(?:["']([^"']+)["']|url\(\s*(?:["']([^"']+)["']|([^"'()\s]+))\s*\))/gi;
    for (const match of uncommented.matchAll(references)) {
      checkReference(
        file,
        sourceApp,
        match[1] ?? match[2] ?? match[3],
        text.slice(0, match.index).split("\n").length,
      );
    }
    return;
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    let reference;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      reference = node.moduleSpecifier;
    } else if (ts.isExternalModuleReference(node)) {
      reference = node.expression;
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      reference = node.argument.literal;
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require") ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "require" &&
          callee.name.text === "resolve")
      ) {
        reference = node.arguments[0];
      }
    }
    const specifier = literalPrefix(reference).text;
    if (specifier) {
      const { line } = source.getLineAndCharacterOfPosition(
        reference.getStart(source),
      );
      checkReference(file, sourceApp, specifier, line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function walk(directory, sourceApp) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, sourceApp);
    else if (entry.isFile() && sourceExtensions.test(entry.name))
      scan(file, sourceApp);
  }
}

for (const app of readdirSync(path.join(root, "apps"), {
  withFileTypes: true,
})) {
  if (app.isDirectory() && !app.name.startsWith(".")) {
    walk(path.join(root, "apps", app.name), app.name);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  console.error(
    "Move shared code into packages/ and import its workspace package.",
  );
  process.exitCode = 1;
} else {
  console.log(`Cross-app import guard passed (${scanned} source files).`);
}
