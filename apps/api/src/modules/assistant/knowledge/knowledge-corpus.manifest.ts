export type KnowledgeChunkStrategy = "markdown_headings" | "ops_canvas";

export interface KnowledgeCorpusDocumentManifest {
  documentId: string;
  title: string;
  path: string;
  version: string;
  strategy: KnowledgeChunkStrategy;
  headingPrefixes?: string[];
}

export const KNOWLEDGE_CORPUS_MANIFEST: KnowledgeCorpusDocumentManifest[] = [
  {
    documentId: "ops-console-handoff-packet",
    title: "Ops Console Design Handoff Packet",
    path: "docs/05-ui/ops-console-design-handoff-packet-20260525.md",
    version: "2026-05-25",
    strategy: "markdown_headings",
    headingPrefixes: ["5."],
  },
  {
    documentId: "ops-console-system-answers",
    title: "System Design Answers Across Apps",
    path: "docs/05-ui/system-design-answers-all-apps-20260524.md",
    version: "2026-05-24",
    strategy: "markdown_headings",
    headingPrefixes: ["Q-X", "Q-OPS"],
  },
  {
    documentId: "ops-console-canvas",
    title: "Ops Console Design Canvas",
    path: "docs/05-ui/drts-design-canvas/Ops Console.html",
    version: "v0.6",
    strategy: "ops_canvas",
  },
  {
    documentId: "operational-glossary",
    title: "Operational Glossary And Copy Audit",
    path: "docs/03-runbooks/operational-glossary-and-copy-audit.md",
    version: "2026-04-30",
    strategy: "markdown_headings",
  },
  {
    documentId: "operator-routing-runbook",
    title: "Phase 1 Operator Routing Runbook",
    path: "docs/03-runbooks/phase1-operator-routing-runbook.md",
    version: "2026-05-01",
    strategy: "markdown_headings",
  },
  {
    documentId: "incident-recovery-runbook",
    title: "Incident Escalation Service Recovery Runbook",
    path: "docs/03-runbooks/incident-escalation-service-recovery-runbook.md",
    version: "2026-04-30",
    strategy: "markdown_headings",
  },
  {
    documentId: "observability-alert-runbook",
    title: "Operational Observability Alert Runbook",
    path: "docs/03-runbooks/operational-observability-alert-runbook.md",
    version: "2026-05-01",
    strategy: "markdown_headings",
  },
  {
    documentId: "sla-degradation-runbook",
    title: "Operational SLA Degradation Runbook",
    path: "docs/03-runbooks/operational-sla-degradation-runbook.md",
    version: "2026-05-01",
    strategy: "markdown_headings",
  },
];
