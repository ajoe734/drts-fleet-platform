import { describe, expect, it } from "vitest";

import {
  APPROVED_SOURCES,
  indexDocument,
  indexDocuments,
  isApprovedSourcePath,
  normalizeSourcePath,
} from "../../src/modules/platform-admin-assistant/knowledge";
import { PlatformAdminAssistantKnowledgeService } from "../../src/modules/platform-admin-assistant/knowledge/knowledge-retrieval.service";
import type {
  GroundedRetrieval,
  KnowledgeSourceDocument,
  UncertainRetrieval,
} from "../../src/modules/platform-admin-assistant/knowledge/knowledge.types";

const PLAN_PATH =
  "docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md";
const CONTRACT_PATH =
  "docs/02-architecture/ui-authority-actions-contract-20260524.md";
const TOPOLOGY_PATH =
  "docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md";

const CANVAS_PATH = "docs/05-ui/drts-design-canvas/Platform Admin.html";

const FIXTURE_DOCS: KnowledgeSourceDocument[] = [
  {
    sourcePath: PLAN_PATH,
    content: [
      "# Platform Admin LLM Assistant Plan",
      "",
      "## 5.1 Approved source paths",
      "The assistant may only ground answers in approved Platform Admin sources.",
      "Knowledge retrieval indexes the assistant plan, design handoff, contracts,",
      "and shell topology documents.",
      "",
      "## 7.2 Citations",
      "Every grounded answer must include a citation with a sourcePath and an",
      "optional section heading.",
      "",
      "## 7.3 Uncertainty handling",
      "If no approved source supports the question the assistant returns an",
      "uncertainty or help-search response instead of fabricating an answer.",
    ].join("\n"),
  },
  {
    // Mirrors the real design-canvas corpus, which is authored in zh-TW.
    sourcePath: CANVAS_PATH,
    content: [
      "# 平台治理控制平面",
      "",
      "## 02 · 租戶治理",
      "租戶治理頁面保留 /tenants 與 /tenant-governance 兩個 route。",
      "",
      "## 03 · 合作夥伴 + 平台人員",
      "合作夥伴清單顯示 readiness 與 credentials。",
    ].join("\n"),
  },
  {
    sourcePath: CONTRACT_PATH,
    content: [
      "# UI Authority Actions Contract",
      "",
      "## Approval workflow",
      "Platform admins can approve, nudge, and acknowledge breach for approval",
      "requests. Each authority action is gated by the control plane identity.",
    ].join("\n"),
  },
  {
    sourcePath: TOPOLOGY_PATH,
    content: [
      "# Cross App Navigation Shell Topology",
      "",
      "## Shell routes",
      "The platform admin shell hosts payments inside the admin shell route.",
    ].join("\n"),
  },
];

function buildService(): PlatformAdminAssistantKnowledgeService {
  const service = new PlatformAdminAssistantKnowledgeService();
  service.loadDocuments(FIXTURE_DOCS);
  return service;
}

describe("approved-source allowlist (acceptance: only approved paths indexed)", () => {
  it("accepts every declared approved source path", () => {
    for (const source of APPROVED_SOURCES) {
      expect(isApprovedSourcePath(source.sourcePath)).toBe(true);
    }
  });

  it("rejects paths outside the allowlist", () => {
    expect(isApprovedSourcePath("docs/05-ui/some-other-doc.md")).toBe(false);
    expect(
      isApprovedSourcePath("packages/control-plane-auth/src/index.ts"),
    ).toBe(false);
    expect(isApprovedSourcePath("")).toBe(false);
    expect(isApprovedSourcePath("../../../etc/passwd")).toBe(false);
  });

  it("normalizes leading ./ and / but never matches traversal paths", () => {
    expect(normalizeSourcePath(`./${PLAN_PATH}`)).toBe(PLAN_PATH);
    expect(normalizeSourcePath(`/${PLAN_PATH}`)).toBe(PLAN_PATH);
    expect(isApprovedSourcePath(`./${PLAN_PATH}`)).toBe(true);
    expect(isApprovedSourcePath(`docs/../${PLAN_PATH}`)).toBe(false);
  });

  it("throws when indexing a non-approved document", () => {
    expect(() =>
      indexDocument({ sourcePath: "docs/not-approved.md", content: "hi" }),
    ).toThrow(/non-approved/i);
  });

  it("skips (does not index) non-approved docs in a batch", () => {
    const { chunks, skipped } = indexDocuments([
      ...FIXTURE_DOCS,
      { sourcePath: "docs/rogue.md", content: "secret data" },
    ]);
    expect(skipped).toEqual(["docs/rogue.md"]);
    expect(
      chunks.every((chunk) => isApprovedSourcePath(chunk.sourcePath)),
    ).toBe(true);
  });
});

describe("section-aware indexing", () => {
  it("splits markdown headings into citable sections", () => {
    const chunks = indexDocument(FIXTURE_DOCS[0]);
    const sections = chunks.map((chunk) => chunk.section);
    expect(sections).toContain("5.1 Approved source paths");
    expect(sections).toContain("7.2 Citations");
    expect(sections).toContain("7.3 Uncertainty handling");
  });
});

describe("grounded retrieval with citations (acceptance: sourcePath + section)", () => {
  it("returns citations carrying sourcePath and the matching section", () => {
    const service = buildService();
    const result = service.answer({
      question: "How are citations attached to a grounded answer?",
    });

    expect(result.kind).toBe("grounded");
    const grounded = result as GroundedRetrieval;
    expect(grounded.citations.length).toBeGreaterThan(0);

    const top = grounded.citations[0];
    expect(top.sourcePath).toBe(PLAN_PATH);
    expect(top.section).toBe("7.2 Citations");
    // Every citation must declare a sourcePath; section is optional but typed.
    for (const citation of grounded.citations) {
      expect(typeof citation.sourcePath).toBe("string");
      expect(citation.sourcePath.length).toBeGreaterThan(0);
      expect(
        citation.section === null || typeof citation.section === "string",
      ).toBe(true);
    }
  });

  it("ranks the most relevant approved source first", () => {
    const service = buildService();
    const result = service.answer({
      question: "Which shell route hosts payments in the platform admin shell?",
    }) as GroundedRetrieval;

    expect(result.kind).toBe("grounded");
    expect(result.hits[0].chunk.sourcePath).toBe(TOPOLOGY_PATH);
    expect(result.hits[0].chunk.section).toBe("Shell routes");
  });

  it("provides untrusted context blocks aligned to citations", () => {
    const service = buildService();
    const result = service.answer({
      question: "approve nudge acknowledge breach approval requests authority",
    }) as GroundedRetrieval;

    expect(result.kind).toBe("grounded");
    expect(result.untrustedContext.length).toBe(result.hits.length);
    for (const block of result.untrustedContext) {
      expect(block.text).toContain("UNTRUSTED_DOCUMENT");
      expect(block.text).toContain(block.sourcePath);
    }
  });
});

describe("uncertainty / help-search (acceptance: no fabrication)", () => {
  it("returns an uncertain result when nothing matches", () => {
    const service = buildService();
    const result = service.answer({
      question: "quantum teleportation latency budget for warp drives",
    });

    expect(result.kind).toBe("uncertain");
    const uncertain = result as UncertainRetrieval;
    expect(uncertain.reason).toBe("no_match");
    expect(uncertain.message).toMatch(/couldn't find|not confident/i);
    // Suggestions point at approved sources only — never fabricated answers.
    for (const suggestion of uncertain.suggestedSources) {
      expect(isApprovedSourcePath(suggestion.sourcePath)).toBe(true);
    }
  });

  it("returns below_confidence when match coverage is too low", () => {
    const service = new PlatformAdminAssistantKnowledgeService({
      minConfidence: 0.95,
    });
    service.loadDocuments(FIXTURE_DOCS);
    const result = service.answer({
      question: "citations approval payments topology identity workflow extras",
    });
    expect(result.kind).toBe("uncertain");
    expect((result as UncertainRetrieval).reason).toBe("below_confidence");
  });

  it("treats an empty / stopword-only question as uncertain, never grounded", () => {
    const service = buildService();
    expect(service.answer({ question: "" }).kind).toBe("uncertain");
    expect(service.answer({ question: "the a of to" }).kind).toBe("uncertain");
  });
});

describe("Chinese-language retrieval (acceptance: zh corpus is searchable)", () => {
  it("grounds a Traditional Chinese question in the matching zh section", () => {
    const service = buildService();
    const result = service.answer({
      question: "租戶治理頁面保留哪些 route？",
    });

    expect(result.kind).toBe("grounded");
    const grounded = result as GroundedRetrieval;
    expect(grounded.hits[0].chunk.sourcePath).toBe(CANVAS_PATH);
    expect(grounded.hits[0].chunk.section).toBe("02 · 租戶治理");
    expect(grounded.citations[0].sourcePath).toBe(CANVAS_PATH);
  });

  it("matches a multi-character zh term embedded among Latin/markup", () => {
    const service = buildService();
    const result = service.answer({
      question: "合作夥伴",
    }) as GroundedRetrieval;

    expect(result.kind).toBe("grounded");
    expect(result.hits[0].chunk.section).toBe("03 · 合作夥伴 + 平台人員");
  });

  it("still returns uncertainty for an unrelated zh question (no fabrication)", () => {
    const service = buildService();
    const result = service.answer({ question: "量子傳送延遲預算是多少？" });
    expect(result.kind).toBe("uncertain");
  });
});

describe("category filtering", () => {
  it("restricts retrieval to requested categories", () => {
    const service = buildService();
    const result = service.answer({
      question: "approval workflow authority action",
      categories: ["topology"],
    });
    // The approval-workflow answer lives in a ui_contract doc, not topology.
    expect(result.kind).toBe("uncertain");
  });
});
