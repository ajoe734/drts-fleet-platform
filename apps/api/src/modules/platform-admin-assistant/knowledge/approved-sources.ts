import type {
  ApprovedSource,
  KnowledgeSourceCategory,
} from "./knowledge.types";

/**
 * Approved knowledge sources for the Platform Admin assistant.
 *
 * Provenance: the assistant plan's "approved source paths" section (plan §5.1)
 * is authored under PA-AI-BE-001 and is not yet landed on `dev`. Until it
 * lands, this allowlist is derived from PA-AI-BE-002's task brief — the 中文說明
 * scopes the corpus to "Platform Admin assistant 文件、handoff、contracts、
 * topology" — and from the brief's `supporting_references` /
 * `primary_authorities`. When the plan §5.1 list lands, reconcile this constant
 * against it (it is the single chokepoint, see {@link isApprovedSourcePath}).
 *
 * Excluded on purpose: `packages/control-plane-auth/src/index.ts` is a
 * supporting reference for *identity binding* (PA-AI-BE-001), not an approved
 * knowledge document, so it is not part of the retrievable corpus.
 *
 * Strictness: matching is by exact normalized path, not directory prefix, so a
 * new file dropped next to an approved one is NOT silently indexed.
 */
export const APPROVED_SOURCES: readonly ApprovedSource[] = [
  {
    sourcePath:
      "docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md",
    category: "assistant_plan",
    label: "Platform Admin LLM Assistant — Design & Development Plan",
  },
  {
    sourcePath:
      "docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md",
    category: "architecture_plan",
    label: "Platform Admin Agentic Assistant Architecture Plan",
  },
  {
    sourcePath: "docs/05-ui/platform-admin-design-handoff-packet-20260525.md",
    category: "design_handoff",
    label: "Platform Admin — Design Handoff Packet",
  },
  {
    sourcePath: "docs/05-ui/platform-admin-body-parity-audit-20260602.md",
    category: "audit",
    label: "Platform Admin — Body Parity Audit",
  },
  {
    sourcePath: "docs/05-ui/drts-design-canvas/Platform Admin.html",
    category: "design_canvas",
    label: "Platform Admin — Design Canvas",
  },
  {
    sourcePath:
      "docs/02-architecture/ui-authority-actions-contract-20260524.md",
    category: "ui_contract",
    label: "UI Authority & Actions Contract",
  },
  {
    sourcePath:
      "docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md",
    category: "topology",
    label: "Cross-App Navigation & Shell Topology",
  },
  {
    sourcePath:
      "docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md",
    category: "state_machine",
    label: "Platform Admin Control-Plane State Machines",
  },
  {
    sourcePath: "docs/04-api/ui-functional-contracts-20260524.md",
    category: "ui_contract",
    label: "UI Functional Contracts",
  },
  {
    sourcePath:
      "docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md",
    category: "runbook",
    label: "System Design Pack Implementation Runbook",
  },
] as const;

/**
 * Normalize a candidate path for comparison: trim, strip a leading `./` or `/`,
 * and collapse backslashes to POSIX separators. Path traversal segments are
 * intentionally NOT resolved away — a path containing `..` can never match an
 * entry in the allowlist and is therefore rejected.
 */
export function normalizeSourcePath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

const APPROVED_PATH_SET: ReadonlySet<string> = new Set(
  APPROVED_SOURCES.map((source) => normalizeSourcePath(source.sourcePath)),
);

/**
 * The single authority on whether a path may be indexed. Returns true only for
 * an exact match against an approved source path.
 */
export function isApprovedSourcePath(rawPath: string): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return false;
  }
  return APPROVED_PATH_SET.has(normalizeSourcePath(rawPath));
}

/** Look up the approved-source descriptor for a path, if approved. */
export function getApprovedSource(rawPath: string): ApprovedSource | undefined {
  const normalized = normalizeSourcePath(rawPath);
  return APPROVED_SOURCES.find(
    (source) => normalizeSourcePath(source.sourcePath) === normalized,
  );
}

/** All approved paths in a category, used for help/search suggestions. */
export function approvedSourcesByCategory(
  category: KnowledgeSourceCategory,
): ApprovedSource[] {
  return APPROVED_SOURCES.filter((source) => source.category === category);
}
