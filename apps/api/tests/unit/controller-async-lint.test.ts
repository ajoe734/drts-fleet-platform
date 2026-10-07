import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const apiRoot = fileURLToPath(new URL("../..", import.meta.url));
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const controllerFile = `${apiRoot}/src/modules/billing-settlement/billing-settlement.controller.ts`;

describe.each([apiRoot, root])("controller async lint from %s", (cwd) => {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: `${cwd}/eslint.config.mjs`,
  });

  async function lint(body: string) {
    const [result] = await eslint.lintText(
      `
      import { Post } from "@nestjs/common";
      import { toApiSuccessEnvelope as wrap } from "../../common/api-envelope";
      async function load() { return { id: "record" }; }
      export class ExampleController {
        @Post("example")
        async handle() { ${body} }
      }
    `,
      { filePath: controllerFile },
    );
    expect(result.fatalErrorCount).toBe(0);
    return result.messages.filter((message) => message.severity === 2);
  }

  it.each([
    "return wrap(load());",
    "const data = load(); return wrap(data);",
    "return { data: { items: [load()] } };",
    "const data = Math.random() ? load() : { id: 'record' }; return wrap(data);",
    "return Promise.resolve(wrap(load()));",
    "return wrap({ then: (_resolve: (value: string) => void) => {} });",
  ])(
    "rejects unresolved response values: %s",
    async (body) => {
      expect(await lint(body)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "api-async/no-promise-in-response",
          }),
        ]),
      );
    },
    30_000,
  );

  it.each([
    "return wrap(await load());",
    "return load().then(data => wrap(data));",
    "return Promise.resolve(wrap({ id: 'record' }));",
    "return wrap(await Promise.all([load(), load()]));",
  ])(
    "allows resolved responses and returned Promise chains: %s",
    async (body) => {
      expect(await lint(body)).toEqual([]);
    },
  );

  it("rejects ignored asynchronous service calls", async () => {
    expect(await lint("load(); return wrap({ ok: true });")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "@typescript-eslint/no-floating-promises",
        }),
      ]),
    );
  });

  it("rejects Promise conditions", async () => {
    expect(
      await lint("if (load()) return wrap({ ok: true }); return wrap(null);"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "@typescript-eslint/no-misused-promises",
        }),
      ]),
    );
  });
});
