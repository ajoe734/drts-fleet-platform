import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { restoreSupplyDraft } from "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-supply";

// Execute the production hook with deterministic hook/storage lifecycle adapters.
function harness() {
  const source = readFileSync(
    "apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx",
    "utf8",
  );
  const hook = source.slice(
    source.indexOf("const supplyDraftMemory ="),
    source.indexOf("export function NewDriverSubmissionForm"),
  );
  const stored = new Map<string, string>();
  let failWrite = false;
  let failRemove = false;
  let states: unknown[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const listeners = new Map<string, (event: { persisted: boolean }) => void>();
  const useDraft = runInNewContext(
    ts.transpileModule(`${hook}\nuseSupplyDraft;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      restoreSupplyDraft,
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (next: unknown) => {
            states[index] =
              typeof next === "function" ? next(states[index]) : next;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
      useEffect: (effect: () => void) => effects.push(effect),
      window: {
        sessionStorage: {
          getItem: (key: string) => stored.get(key) ?? null,
          setItem: (key: string, value: string) => {
            if (failWrite) throw new Error("QuotaExceededError");
            stored.set(key, value);
          },
          removeItem: (key: string) => {
            if (failRemove) throw new Error("SecurityError");
            stored.delete(key);
          },
        },
        addEventListener: (
          type: string,
          listener: (event: { persisted: boolean }) => void,
        ) => listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
      },
    },
  ) as (
    key: string,
    initial: { name: string },
  ) => {
    setForm: (value: { name: string }) => void;
    clearDraft: () => void;
  };
  return {
    stored,
    failWrites: () => {
      failWrite = true;
    },
    failRemoves: () => {
      failRemove = true;
    },
    name: () => (states[0] as { name: string }).name,
    pageShow: () => listeners.get("pageshow")?.({ persisted: true }),
    mount: (key = "driver") => {
      states = [];
      cursor = 0;
      effects = [];
      const result = useDraft(key, { name: "" });
      effects.forEach((effect) => effect());
      return result;
    },
  };
}

describe("supply draft storage failure recovery", () => {
  it("restores persisted input on first mount", () => {
    const h = harness();
    h.stored.set("driver", JSON.stringify({ name: "old" }));
    h.mount();
    expect(h.name()).toBe("old");
  });

  it("keeps latest edits on SPA remount and BFCache return after a failed write", () => {
    const h = harness();
    h.stored.set("driver", JSON.stringify({ name: "old" }));
    const draft = h.mount();
    h.failWrites();
    draft.setForm({ name: "latest" });
    expect(JSON.parse(h.stored.get("driver")!).name).toBe("old");
    h.mount();
    expect(h.name()).toBe("latest");
    h.pageShow();
    expect(h.name()).toBe("latest");
    h.mount("vehicle");
    expect(h.name()).toBe("");
  });

  it("does not resurrect a cleared draft when storage removal fails", () => {
    const h = harness();
    const draft = h.mount();
    draft.setForm({ name: "submitted" });
    h.failRemoves();
    draft.clearDraft();
    h.mount();
    expect(h.name()).toBe("");
    h.pageShow();
    expect(h.name()).toBe("");
  });
});
