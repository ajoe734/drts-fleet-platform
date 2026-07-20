import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadApprovedKnowledgeDocuments,
  resolveKnowledgeRepositoryRoot,
} from "../../src/modules/platform-admin-assistant/knowledge/knowledge.module";

describe("PlatformAdminAssistantKnowledgeModule", () => {
  it("finds the repo root from the knowledge module path instead of process cwd", () => {
    const expectedRepositoryRoot = resolve(__dirname, "../../../..");
    const repositoryRoot = resolveKnowledgeRepositoryRoot(
      resolve(
        expectedRepositoryRoot,
        "apps/api/src/modules/platform-admin-assistant/knowledge",
      ),
    );

    expect(repositoryRoot).toBe(expectedRepositoryRoot);
  });

  it("loads approved knowledge docs from the resolved repository root", () => {
    const repositoryRoot = resolve(__dirname, "../../../..");
    const documents = loadApprovedKnowledgeDocuments(
      resolveKnowledgeRepositoryRoot(
        resolve(
          repositoryRoot,
          "apps/api/src/modules/platform-admin-assistant/knowledge",
        ),
      ),
    );

    expect(documents.length).toBeGreaterThan(0);
    expect(
      documents.some(
        (document) =>
          document.sourcePath ===
            "docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md" &&
          document.content.includes("Platform Admin Agentic Assistant"),
      ),
    ).toBe(true);
  });
});
