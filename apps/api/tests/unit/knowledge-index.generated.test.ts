import { describe, expect, it } from "vitest";

import {
  buildKnowledgeIndex,
  serializeKnowledgeIndex,
} from "../../src/modules/assistant/knowledge/knowledge-index.builder";
import { GENERATED_KNOWLEDGE_INDEX } from "../../src/modules/assistant/knowledge/knowledge-index.generated";

describe("knowledge index generated artifact", () => {
  it("matches the deterministic builder output", () => {
    const rebuiltIndex = buildKnowledgeIndex();

    expect(serializeKnowledgeIndex(rebuiltIndex)).toBe(
      serializeKnowledgeIndex(GENERATED_KNOWLEDGE_INDEX),
    );
  });
});
