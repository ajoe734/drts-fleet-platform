import { describe, it, beforeAll } from "vitest"; describe("test", () => { beforeAll(() => { throw new Error("test"); }); it("works", () => {}); });
