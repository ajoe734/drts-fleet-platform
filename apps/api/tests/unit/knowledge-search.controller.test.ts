import { describe, expect, it, vi } from "vitest";

import { KnowledgeSearchController } from "../../src/modules/assistant/knowledge/knowledge-search.controller";

describe("KnowledgeSearchController", () => {
  it("wraps knowledge search in the standard success envelope", () => {
    const knowledgeSearch = {
      search: vi.fn(() => ({
        corpusVersion: "2026-06-02",
        query: "approval queue",
        totalHits: 1,
        snippets: [],
      })),
    };
    const controller = new KnowledgeSearchController(knowledgeSearch as never);

    const response = controller.search(
      "approval queue",
      "2",
      "req-knowledge-001",
    );

    expect(knowledgeSearch.search).toHaveBeenCalledWith("approval queue", 2);
    expect(response).toEqual({
      data: {
        corpusVersion: "2026-06-02",
        query: "approval queue",
        totalHits: 1,
        snippets: [],
      },
      meta: {
        requestId: "req-knowledge-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("rejects missing queries", () => {
    const controller = new KnowledgeSearchController({ search: vi.fn() } as never);

    expect(() => controller.search("  ", undefined, "req-knowledge-002")).toThrow(
      "query parameter q is required",
    );
  });
});
