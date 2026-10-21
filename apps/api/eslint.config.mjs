import { fileURLToPath } from "node:url";
import baseConfig from "../../packages/eslint-config/base.mjs";

// no-floating-promises cannot detect Promise values consumed by generic sync
// wrappers. Inspect response types too, allowing Nest to await the outer Promise
// while rejecting unresolved values inside the serialized response.
const noPromiseInResponse = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      nestedPromise:
        "Await the Promise at response{{path}} before returning the response.",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();

    function findPromise(type, location, seen = new Set()) {
      if (seen.has(type)) return null;
      seen.add(type);
      if (type.isUnionOrIntersection()) {
        for (const part of type.types) {
          const found = findPromise(part, location, seen);
          if (found !== null) return found;
        }
      }
      const awaited = checker.getAwaitedType(type);
      if (awaited && awaited !== type) return "";
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type) {
        return findPromise(constraint, location, seen);
      }
      // Function values are not evaluated by JSON serialization.
      if (type.getCallSignatures().length) return null;
      for (const index of checker.getIndexInfosOfType(type)) {
        const found = findPromise(index.type, location, seen);
        if (found !== null) return `[item]${found}`;
      }
      for (const property of type.getProperties()) {
        const found = findPromise(
          checker.getTypeOfSymbolAtLocation(property, location),
          location,
          seen,
        );
        if (found !== null) return `.${property.name}${found}`;
      }
      return null;
    }

    return {
      ReturnStatement(node) {
        if (!node.argument) return;
        let method = node.parent;
        while (method && method.type !== "MethodDefinition")
          method = method.parent;
        // Private service accessors are not HTTP responses. Check route handlers
        // (including their callbacks); their inferred types also cover helpers.
        if (
          !method?.decorators.some(
            ({ expression }) =>
              expression.type === "CallExpression" &&
              expression.callee.type === "Identifier" &&
              [
                "Get",
                "Post",
                "Put",
                "Patch",
                "Delete",
                "Head",
                "Options",
                "All",
              ].includes(expression.callee.name),
          )
        )
          return;
        const expression = services.esTreeNodeToTSNodeMap.get(node.argument);
        const type = checker.getTypeAtLocation(expression);
        // A directly returned Promise is handled by Nest (or its caller).
        const response = checker.getAwaitedType(type) ?? type;
        const path = findPromise(response, expression);
        if (path !== null) {
          context.report({
            node: node.argument,
            messageId: "nestedPromise",
            data: { path },
          });
        }
      },
    };
  },
};

// Reused by the root config so pre-commit/root ESLint and package/CI ESLint
// enforce the same rules. Tests and non-controller code keep the base config.
export const controllerAsyncConfig = {
  files: ["src/**/*.controller.ts"],
  languageOptions: {
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  plugins: {
    "api-async": { rules: { "no-promise-in-response": noPromiseInResponse } },
  },
  rules: {
    "@typescript-eslint/no-floating-promises": [
      "error",
      { ignoreVoid: false, checkThenables: true },
    ],
    "@typescript-eslint/no-misused-promises": "error",
    "api-async/no-promise-in-response": "error",
  },
};

export default [...baseConfig, controllerAsyncConfig];
