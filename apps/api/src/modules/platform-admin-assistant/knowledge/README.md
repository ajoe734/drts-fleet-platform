# Platform Admin Assistant — Knowledge Retrieval (PA-AI-BE-002)

Approved-doc retrieval with citations for the Platform Admin LLM assistant.

## What this slice does

- Indexes **only** approved source paths (`approved-sources.ts`). Anything else
  is refused (`indexDocument` throws) or skipped (`indexDocuments`).
- Splits documents into heading-delimited sections so citations can carry a
  `sourcePath` **and** an optional `section`.
- Returns either a **grounded** result (ranked hits + de-duplicated citations +
  untrusted context blocks) or an **uncertain / help-search** result when no
  approved source supports the question — it never fabricates.
- Treats all indexed/tool content as **untrusted**: `prompt-injection.ts`
  detects injection signals and `wrapUntrustedContent` neutralizes
  delimiter/role-marker breakouts before content is embedded in a prompt.

## What this slice does NOT do

- It does not call an LLM provider. Generation belongs to the provider
  abstraction (**PA-AI-BE-001**) and gateway config (**PA-AI-CONFIG-001**). This
  layer only decides what is grounded and returns cited, untrusted context.
- It does not wire into `app.module.ts`. `PlatformAdminAssistantKnowledgeModule`
  is exported for the top-level assistant module (BE-001) to import.

## Provenance note (read before editing `approved-sources.ts`)

The assistant plan's "approved source paths" section (plan §5.1, the doc
`docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md`)
is authored under **PA-AI-BE-001** and is **not yet landed on `dev`**. The
acceptance item "Read §§5.1; 7.2; 7.3 of the plan" therefore could not be read
literally. The approved-source allowlist here is derived from this task's brief
(中文說明: "限定 Platform Admin assistant 文件、handoff、contracts、topology") and
its `supporting_references` / `primary_authorities`. **When the plan §5.1 list
lands, reconcile `APPROVED_SOURCES` against it.**
