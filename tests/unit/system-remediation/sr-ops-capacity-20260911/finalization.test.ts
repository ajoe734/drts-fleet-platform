import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  describeCapacityFailure,
  finalizeCapacityRun,
} from "../../../../tools/system-remediation/ops-capacity/finalization.mjs";
import {
  assertAcceptancePassed,
  readBackOwnedOrders,
  readBackReportJobs,
} from "../../../../tools/system-remediation/ops-capacity/durable-readback.mjs";
import { runWithCapacityPolling } from "../../../../tools/system-remediation/ops-capacity/observations.mjs";

// Reuse the actual gate fixture, including all owned evidence and SLO fields.
// This remains synthetic boundary input, never a hosted capacity receipt.
function validFixture() {
  const path = new URL("./acceptance-gate.test.ts", import.meta.url);
  const tree = ts.createSourceFile(
    path.pathname,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let initializer: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === "validAcceptance"
    )
      initializer = node.initializer?.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (!initializer) throw new Error("Missing original validAcceptance fixture");
  const source = ts.transpileModule(`(${initializer})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return structuredClone(vm.runInNewContext(source));
}

describe("actual capacity diagnostic finalization", () => {
  it("accepts complete evidence through the real gate after independent cleanup", async () => {
    const payload = validFixture();
    const events: string[] = [];
    const result = await finalizeCapacityRun<Record<string, unknown>>({
      execute: async () => {
        events.push("producer joined");
      },
      collect: async () => {
        events.push("readbacks");
        return payload;
      },
      cleanup: [
        { stage: "app.close", run: () => events.push("app.close") },
        { stage: "pool.end", run: () => events.push("pool.end") },
      ],
      validate: assertAcceptancePassed,
      write: (data, failures) => {
        expect(failures).toEqual([]);
        assertAcceptancePassed({
          ...data,
          diagnostics: { acceptance: "established", failures: [] },
        });
        events.push("write");
      },
    });
    expect(result).toBe(payload);
    expect(events).toEqual([
      "producer joined",
      "readbacks",
      "app.close",
      "pool.end",
      "write",
    ]);
  });

  it("retains joined producer/observer, independent SQL, gate, cleanup and write errors", async () => {
    const producer = new Error("producer rejected");
    const observer = new Error("observer rejected");
    const sql = new Error("booking SQL unavailable");
    const close = new Error("app close failed");
    const end = new Error("pool end failed");
    const write = new Error("diagnostic disk failed");
    const queries: string[] = [];
    const pool = {
      async query<R>(statement: string): Promise<{ rows: R[] }> {
        queries.push(statement);
        if (queries.length === 1) throw sql;
        return { rows: [] };
      },
    };
    let writtenFailures: unknown;
    const result = await finalizeCapacityRun({
      execute: () =>
        runWithCapacityPolling(
          async () => {
            throw producer;
          },
          async () => {
            throw observer;
          },
        ),
      collect: async (attempt) => ({
        summary: null,
        booking: await attempt("booking-readback", () =>
          readBackOwnedOrders(pool, ["booking-owned"]),
        ),
        dispatch: await attempt("dispatch-readback", () =>
          readBackOwnedOrders(pool, ["dispatch-owned"]),
        ),
        report: await attempt("report-readback", () =>
          readBackReportJobs(pool, ["report-owned"]),
        ),
      }),
      cleanup: [
        {
          stage: "app.close",
          run: () => {
            throw close;
          },
        },
        {
          stage: "pool.end",
          run: () => {
            throw end;
          },
        },
      ],
      validate: assertAcceptancePassed,
      write: (payload, failures) => {
        expect(payload).toEqual({
          summary: null,
          booking: null,
          dispatch: [],
          report: [],
        });
        writtenFailures = failures.map(({ stage, error }) => ({
          stage,
          ...describeCapacityFailure(error),
        }));
        throw write;
      },
    }).catch((error: AggregateError) => error);
    expect(queries).toHaveLength(3);
    expect(queries[2]).toContain("admin.phase1_report_jobs");
    expect(result).toBeInstanceOf(AggregateError);
    const errors = (result as AggregateError).errors;
    expect(errors[0].errors).toEqual([producer, observer]);
    expect(errors.slice(1, 4)).toEqual([sql, close, end]);
    expect(errors[4].message).toBe("Missing workload summary");
    expect(errors[5]).toBe(write);
    expect(writtenFailures).toMatchObject([
      {
        stage: "workload",
        errors: [{ message: producer.message }, { message: observer.message }],
      },
      { stage: "booking-readback", message: sql.message },
      { stage: "app.close", message: close.message },
      { stage: "pool.end", message: end.message },
      { stage: "acceptance", message: "Missing workload summary" },
    ]);
  });

  it("writes a minimal failed diagnostic when collection itself fails", async () => {
    const collect = new Error("unreadable evidence");
    let written = false;
    await expect(
      finalizeCapacityRun({
        execute: async () => {},
        collect: async () => {
          throw collect;
        },
        cleanup: [],
        validate: assertAcceptancePassed,
        write: (payload, failures) => {
          expect(payload).toBeNull();
          expect(failures[0]?.error).toBe(collect);
          written = true;
        },
      }),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(written).toBe(true);
  });

  it("rejects a saved green summary with a cleanup/observer diagnostic failure", () => {
    for (const diagnostics of [
      { acceptance: "not_established", failures: [] },
      {
        acceptance: "established",
        failures: [{ stage: "app.close", message: "failed" }],
      },
      { acceptance: "established" },
    ])
      expect(() =>
        assertAcceptancePassed({ ...validFixture(), diagnostics }),
      ).toThrow(/diagnostic\/cleanup/);
  });

  it("preserves falsy producer and observer rejections", async () => {
    await expect(
      runWithCapacityPolling(
        async () => {
          throw undefined;
        },
        async () => {
          throw null;
        },
      ),
    ).rejects.toMatchObject({ errors: [undefined, null] });
    await expect(
      finalizeCapacityRun({
        execute: async () => {
          throw null;
        },
        collect: async () => ({}),
        cleanup: [],
        validate: () => {},
        write: () => {},
      }),
    ).rejects.toBeNull();
  });
});
