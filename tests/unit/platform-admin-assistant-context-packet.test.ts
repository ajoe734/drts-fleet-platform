/**
 * Unit evidence for PA-AI-CTX-001 — Platform Admin assistant context mesh v2.
 *
 * Verifies the bounded, privacy-filtered context packet builder + serializer:
 *   - the packet merges deterministic route context with page-owned snapshot
 *     (visible tables, on-screen forms, selected rows, available actions),
 *   - it is built ONLY from route/query/page state (no DOM scraping),
 *   - secret/sensitive form values are never serialized,
 *   - bounds (tables/columns/rows/fields/errors/actions/preview) are enforced,
 *   - the serialized text keeps the byte-stable route-context header and appends
 *     page/form sections only when populated.
 */

import { describe, expect, it } from "vitest";

import {
  ASSISTANT_CONTEXT_LIMITS,
  buildAssistantContextPacket,
  serializeAssistantContextPacket,
} from "../../apps/platform-admin-web/components/assistant/route-context";
import {
  ASSISTANT_CONTEXT_SCHEMA,
  type PageContextSnapshot,
} from "../../apps/platform-admin-web/components/assistant/assistant-types";

describe("buildAssistantContextPacket — route layer", () => {
  it("produces a v2 packet from route + query with no page snapshot", () => {
    const packet = buildAssistantContextPacket("/payments", "?tenantId=tnt-7");

    expect(packet.schema).toBe(ASSISTANT_CONTEXT_SCHEMA);
    expect(packet.schema).toBe("platform_admin_assistant_context.v2");
    expect(packet.route.routeKey).toBe("payments");
    expect(packet.route.activeTab).toBe("tenant-invoices");
    expect(packet.route.refreshTier).toBe("slow");
    expect(packet.page.visibleEntityRefs).toContainEqual({
      kind: "tenant",
      id: "tnt-7",
      source: "query",
    });
    // No page-owned snapshot ⇒ empty page collections + false provenance.
    expect(packet.page.visibleTables).toEqual([]);
    expect(packet.forms).toEqual([]);
    expect(packet.page.availableActions).toEqual([]);
    expect(packet.generatedFrom).toMatchObject({
      route: true,
      query: true,
      pageTables: false,
      pageForms: false,
      pageActions: false,
    });
  });

  it("carries route warnings into page.visibleWarnings", () => {
    const packet = buildAssistantContextPacket("/feature-flags");
    expect(packet.page.visibleWarnings.map((w) => w.code)).toContain(
      "platform_write_authority",
    );
  });
});

describe("buildAssistantContextPacket — page snapshot", () => {
  const snapshot: PageContextSnapshot = {
    activeTab: "settlement-matrix",
    selection: [
      {
        kind: "tenant",
        id: "tnt-1",
        label: "Acme Co",
        source: "page-selection",
      },
    ],
    tables: [
      {
        tableId: "tenants",
        title: "Tenants",
        totalRowCount: 12,
        visibleRowCount: 3,
        activeFilter: "pilot",
        rowEntityKind: "tenant",
        columns: [
          { key: "tenant", label: "TENANT" },
          { key: "stage", label: "STAGE" },
        ],
        sampleRows: [
          {
            kind: "tenant",
            id: "tnt-1",
            label: "Acme Co",
            source: "page-selection",
          },
        ],
      },
    ],
    forms: [
      {
        formId: "tenant-create-form",
        title: "Create tenant",
        dirty: true,
        submitting: false,
        fields: [
          {
            name: "name",
            kind: "text",
            required: true,
            filled: true,
            valuePreview: "Acme Co",
          },
          { name: "code", kind: "text", required: true, filled: false },
          {
            name: "apiKey",
            kind: "secret",
            filled: true,
            valuePreview: "sk-live-SHOULD-NOT-LEAK",
          },
        ],
        validationErrors: [
          { field: "code", code: "required", message: "Code is required" },
        ],
      },
    ],
    availableActions: [
      {
        id: "create_tenant",
        label: "Create tenant",
        risk: "medium",
        enabled: true,
        requiresConfirmation: true,
      },
      {
        id: "export_tenants",
        label: "Export",
        risk: "low",
        enabled: false,
        disabledReasonCode: "no_visible_rows",
      },
    ],
  };

  it("folds the page snapshot into the packet and flags provenance", () => {
    const packet = buildAssistantContextPacket(
      "/payments",
      undefined,
      snapshot,
      { rawPrompt: "幫我建立租戶", locale: "zh" },
    );

    expect(packet.route.activeTab).toBe("settlement-matrix");
    expect(packet.page.selectedRecords).toEqual([
      {
        kind: "tenant",
        id: "tnt-1",
        label: "Acme Co",
        source: "page-selection",
      },
    ]);
    expect(packet.page.visibleTables[0]?.visibleRowCount).toBe(3);
    expect(packet.forms[0]?.validationErrors[0]?.field).toBe("code");
    expect(packet.userIntent).toEqual({
      rawPrompt: "幫我建立租戶",
      locale: "zh",
    });
    expect(packet.generatedFrom).toMatchObject({
      pageSelection: true,
      pageTables: true,
      pageForms: true,
      pageActions: true,
    });
  });

  it("never serializes a secret field value", () => {
    const packet = buildAssistantContextPacket(
      "/payments",
      undefined,
      snapshot,
    );
    const apiKeyField = packet.forms[0]?.fields.find(
      (f) => f.name === "apiKey",
    );
    expect(apiKeyField?.sensitive).toBe(true);
    expect(apiKeyField?.valuePreview).toBeUndefined();
    expect(apiKeyField?.filled).toBe(true);

    const serialized = serializeAssistantContextPacket(packet, "en");
    expect(serialized).not.toContain("sk-live-SHOULD-NOT-LEAK");
    expect(serialized).toContain("apiKey=filled(redacted)");
  });

  it("truncates an over-long, non-sensitive value preview", () => {
    const long = "x".repeat(ASSISTANT_CONTEXT_LIMITS.maxValuePreview + 50);
    const packet = buildAssistantContextPacket("/payments", undefined, {
      forms: [
        {
          formId: "f",
          dirty: true,
          fields: [
            {
              name: "notes",
              kind: "textarea",
              filled: true,
              valuePreview: long,
            },
          ],
          validationErrors: [],
        },
      ],
    });
    const preview = packet.forms[0]?.fields[0]?.valuePreview ?? "";
    expect(preview.length).toBe(ASSISTANT_CONTEXT_LIMITS.maxValuePreview);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("enforces bounds on tables, sample rows, fields, errors, and actions", () => {
    const big: PageContextSnapshot = {
      tables: Array.from(
        { length: ASSISTANT_CONTEXT_LIMITS.maxTables + 4 },
        (_, i) => ({
          tableId: `t${i}`,
          visibleRowCount: 100,
          sampleRows: Array.from(
            { length: ASSISTANT_CONTEXT_LIMITS.maxSampleRows + 5 },
            (_, r) => ({
              kind: "tenant" as const,
              id: `r${r}`,
              source: "page-selection" as const,
            }),
          ),
          columns: Array.from(
            { length: ASSISTANT_CONTEXT_LIMITS.maxTableColumns + 5 },
            (_, c) => ({ key: `c${c}` }),
          ),
        }),
      ),
      forms: Array.from(
        { length: ASSISTANT_CONTEXT_LIMITS.maxForms + 4 },
        (_, i) => ({
          formId: `f${i}`,
          dirty: false,
          fields: Array.from(
            { length: ASSISTANT_CONTEXT_LIMITS.maxFormFields + 5 },
            (_, f) => ({ name: `field${f}`, filled: false }),
          ),
          validationErrors: Array.from(
            { length: ASSISTANT_CONTEXT_LIMITS.maxValidationErrors + 5 },
            (_, e) => ({ message: `err${e}` }),
          ),
        }),
      ),
      availableActions: Array.from(
        { length: ASSISTANT_CONTEXT_LIMITS.maxActions + 5 },
        (_, a) => ({ id: `a${a}`, label: `Action ${a}`, enabled: true }),
      ),
    };

    const packet = buildAssistantContextPacket("/", undefined, big);
    expect(packet.page.visibleTables).toHaveLength(
      ASSISTANT_CONTEXT_LIMITS.maxTables,
    );
    expect(packet.page.visibleTables[0]?.sampleRows).toHaveLength(
      ASSISTANT_CONTEXT_LIMITS.maxSampleRows,
    );
    expect(packet.page.visibleTables[0]?.columns).toHaveLength(
      ASSISTANT_CONTEXT_LIMITS.maxTableColumns,
    );
    expect(packet.forms).toHaveLength(ASSISTANT_CONTEXT_LIMITS.maxForms);
    expect(packet.forms[0]?.fields).toHaveLength(
      ASSISTANT_CONTEXT_LIMITS.maxFormFields,
    );
    expect(packet.forms[0]?.validationErrors).toHaveLength(
      ASSISTANT_CONTEXT_LIMITS.maxValidationErrors,
    );
    expect(packet.page.availableActions).toHaveLength(
      ASSISTANT_CONTEXT_LIMITS.maxActions,
    );
  });
});

describe("serializeAssistantContextPacket", () => {
  it("keeps the byte-stable route-context header for backward compatibility", () => {
    const packet = buildAssistantContextPacket("/payments", "?tenantId=tnt-7");
    const text = serializeAssistantContextPacket(packet, "en");
    const lines = text.split("\n");
    expect(lines[0]).toBe("[Platform Admin route context]");
    expect(lines[1]).toBe("Path: /payments");
    expect(lines).toContain("Active tab: tenant-invoices");
    expect(lines).toContain("Refresh tier: slow");
    expect(text).toContain("Visible entities: tenant:tnt-7");
    // With no page snapshot, the v2 sections are omitted entirely.
    expect(text).not.toContain("[Page context]");
    expect(text).not.toContain("[Forms]");
  });

  it("appends page + form sections, with table counts and action risk tags", () => {
    const packet = buildAssistantContextPacket("/payments", undefined, {
      tables: [
        {
          tableId: "tenants",
          title: "Tenants",
          totalRowCount: 12,
          visibleRowCount: 3,
          activeFilter: "pilot",
          columns: [{ key: "tenant", label: "TENANT" }],
        },
      ],
      selection: [
        {
          kind: "tenant",
          id: "tnt-1",
          label: "Acme Co",
          source: "page-selection",
        },
      ],
      forms: [
        {
          formId: "tenant-create-form",
          title: "Create tenant",
          dirty: true,
          fields: [
            { name: "name", filled: true, valuePreview: "Acme Co" },
            { name: "code", required: true, filled: false },
          ],
          validationErrors: [{ field: "code", message: "Code is required" }],
        },
      ],
      availableActions: [
        {
          id: "create_tenant",
          label: "Create tenant",
          risk: "medium",
          enabled: true,
          requiresConfirmation: true,
        },
        {
          id: "export_tenants",
          label: "Export",
          risk: "low",
          enabled: false,
          disabledReasonCode: "no_visible_rows",
        },
      ],
    });
    const text = serializeAssistantContextPacket(packet, "en");

    expect(text).toContain("[Page context]");
    expect(text).toContain(
      "Visible tables: Tenants (3/12 rows; columns: TENANT; filter: pilot)",
    );
    expect(text).toContain("Selected records: tenant:tnt-1 (Acme Co)");
    expect(text).toContain("Create tenant [medium, requires confirmation]");
    expect(text).toContain("Export [low, disabled:no_visible_rows]");
    expect(text).toContain("[Forms]");
    expect(text).toContain(
      'Create tenant (dirty): name=filled "Acme Co", code=empty(required)',
    );
    expect(text).toContain("errors: code: Code is required");
  });
});
