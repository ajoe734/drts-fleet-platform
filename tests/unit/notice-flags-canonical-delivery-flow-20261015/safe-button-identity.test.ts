// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeFile = "tests/e2e/deterministic-route-suite.spec.ts";

/** Execute the actual caller and safety predicate, without importing Playwright
 * test registration or starting a browser/server. Only Page/Locator/ElementHandle
 * and Playwright's count assertion are modeled over real DOM elements. This
 * proves selection identity under controlled insertion, not hosted timing. */
function loadActualHelper() {
  const reference = process.env.NOTICE_SAFE_BUTTON_REF;
  const source = reference
    ? execFileSync("git", ["show", `${reference}:${routeFile}`], {
        encoding: "utf8",
      })
    : readFileSync(routeFile, "utf8");
  const ast = ts.createSourceFile(
    routeFile,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const names = ["destructiveControl", "closeOpenDialog", "exerciseSafeButton"];
  const entries = names.map((name) => {
    const entry = ast.statements.find((statement) => {
      if (ts.isFunctionDeclaration(statement))
        return statement.name?.text === name;
      return (
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) => declaration.name.getText(ast) === name,
        )
      );
    });
    if (!entry) throw new Error(`Missing actual helper dependency: ${name}`);
    return entry.getText(ast);
  });
  const { outputText } = ts.transpileModule(entries.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const countExpectation = (subject: { count(): Promise<number> }) => ({
    toHaveCount: async (count: number) => {
      expect(await subject.count()).toBe(count);
    },
  });
  return new Function("expect", `${outputText}\nreturn exerciseSafeButton;`)(
    countExpectation,
  ) as (page: ReturnType<typeof pageBoundary>["page"]) => Promise<void>;
}

type ClickOptions = {
  trial?: boolean;
  timeout?: number;
  noWaitAfter?: boolean;
};

function pageBoundary(
  options: {
    afterTrial?: () => Promise<void>;
    rejectRealClick?: Error;
  } = {},
) {
  const clicks: Element[] = [];
  const trials: Element[] = [];
  const attempts: ClickOptions[] = [];
  class Controls {
    constructor(private readonly select: () => Element[]) {}
    async count() {
      return this.select().length;
    }
    first() {
      return this.nth(0);
    }
    nth(index: number) {
      // Locator indices resolve again on every operation, as in the old caller.
      return new Controls(() => this.select().slice(index, index + 1));
    }
    async elementHandles() {
      // An ElementHandle retains the selected DOM node across async boundaries.
      return this.select().map((element) => new Controls(() => [element]));
    }
    element() {
      const element = this.select()[0];
      if (!element?.isConnected) throw new Error("Element is detached");
      return element;
    }
    async getAttribute(name: string) {
      return this.element().getAttribute(name);
    }
    async innerText() {
      return this.element().textContent ?? "";
    }
    async isVisible() {
      return !this.element().hasAttribute("hidden");
    }
    async isEnabled() {
      return !this.element().hasAttribute("disabled");
    }
    async click(clickOptions: ClickOptions) {
      attempts.push(clickOptions);
      const element = this.element();
      if (!(await this.isVisible()) || !(await this.isEnabled()))
        throw new Error(`Control is not actionable: ${element.textContent}`);
      if (element.hasAttribute("data-trial-reject"))
        throw new Error("Trial actionability rejected");
      if (clickOptions.trial) {
        trials.push(element);
        await options.afterTrial?.();
        return;
      }
      if (options.rejectRealClick) throw options.rejectRealClick;
      clicks.push(element);
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }
  const page = {
    locator: (selector: string) =>
      new Controls(() => Array.from(document.querySelectorAll(selector))),
    getByRole: (role: string) =>
      new Controls(() =>
        Array.from(document.querySelectorAll(`[role="${role}"]`)),
      ),
    keyboard: { press: vi.fn(async () => {}) },
    waitForTimeout: vi.fn(async () => {}),
  };
  return { page, clicks, trials, attempts };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function main() {
  return document.querySelector("main")!;
}

describe("actual deterministic route safe-button caller", () => {
  beforeEach(() => {
    document.body.innerHTML = "<main><button>Refresh</button></main>";
  });

  it("exercises a stable safe page with the original trial and real-click options", async () => {
    const boundary = pageBoundary();
    const refresh = main().firstElementChild;
    const listener = vi.fn();
    refresh!.addEventListener("click", listener);
    await loadActualHelper()(boundary.page);
    expect(boundary.trials).toEqual([refresh]);
    expect(boundary.clicks).toEqual([refresh]);
    expect(listener).toHaveBeenCalledOnce();
    expect(boundary.attempts).toEqual([
      { trial: true, timeout: 1_500 },
      { timeout: 3_000, noWaitAfter: true },
    ]);
    expect(boundary.page.keyboard.press).toHaveBeenCalledWith("Escape");
    expect(boundary.page.waitForTimeout).toHaveBeenCalledWith(50);
  });

  it("retains existing disabled read notices and still exercises the enabled page control", async () => {
    main().insertAdjacentHTML("afterbegin", "<button disabled>已讀</button>");
    const refresh = main().lastElementChild;
    const boundary = pageBoundary();
    await loadActualHelper()(boundary.page);
    expect(boundary.clicks).toEqual([refresh]);
    expect(main().querySelector("button[disabled]")?.textContent).toBe("已讀");
  });

  it.each([
    ["disabled notice", "<button disabled>已讀</button>"],
    ["destructive control", "<button>Delete</button>"],
  ])(
    "cannot rebind the checked target after deferred %s insertion",
    async (_label, inserted) => {
      const trialReached = deferred();
      const resume = deferred();
      const refresh = main().firstElementChild;
      const boundary = pageBoundary({
        afterTrial: async () => {
          trialReached.resolve();
          await resume.promise;
        },
      });
      const running = loadActualHelper()(boundary.page);
      await trialReached.promise;
      main().insertAdjacentHTML("afterbegin", inserted);
      resume.resolve();
      await running;
      expect(boundary.trials).toEqual([refresh]);
      expect(boundary.clicks).toEqual([refresh]);
      expect(main().children).toHaveLength(2);
    },
  );

  it("keeps name, destructive, visibility, enabled and trial rejection checks", async () => {
    main().innerHTML = `
      <button></button><button>Delete</button><button aria-label="Delete">Refresh</button>
      <button hidden>Hidden</button><button disabled>Disabled</button>
      <button data-trial-reject>Covered</button><button>Refresh</button>`;
    const refresh = main().lastElementChild;
    const boundary = pageBoundary();
    await loadActualHelper()(boundary.page);
    expect(boundary.trials).toEqual([refresh]);
    expect(boundary.clicks).toEqual([refresh]);
    expect(boundary.attempts).toHaveLength(3);
  });

  it("continues to exercise a legitimate enabled notice read control", async () => {
    main().innerHTML = "<button>標記已讀</button><button>Refresh</button>";
    const read = main().firstElementChild;
    const boundary = pageBoundary();
    await loadActualHelper()(boundary.page);
    expect(boundary.clicks).toEqual([read]);
  });

  it("propagates real click rejection after a successful trial", async () => {
    const rejection = new Error("Real click rejected");
    const boundary = pageBoundary({ rejectRealClick: rejection });
    await expect(loadActualHelper()(boundary.page)).rejects.toBe(rejection);
    expect(boundary.trials).toHaveLength(1);
    expect(boundary.clicks).toEqual([]);
    expect(boundary.page.keyboard.press).not.toHaveBeenCalled();
  });
});
