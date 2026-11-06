import { resolve } from "node:path";
import { vi } from "vitest";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

// The existing UI loader defaults to standard decorators; Nest's accepted
// backend tsconfig uses legacy decorators. Only match that compiler option.
vi.mock("typescript", async (importOriginal) => {
  const original = await importOriginal<{
    default: typeof import("typescript");
  }>();
  const compiler = original.default;
  return {
    ...original,
    default: {
      ...compiler,
      transpileModule: (
        source: string,
        options?: import("typescript").TranspileOptions,
      ) =>
        compiler.transpileModule(source, {
          ...options,
          fileName:
            process.env.C067_FROZEN_COMPILE_FILE === "backend"
              ? "frozen.ts"
              : "frozen.tsx",
          compilerOptions: {
            ...options?.compilerOptions,
            experimentalDecorators: true,
            emitDecoratorMetadata: false,
          },
        }),
    },
  };
});

type Incident = {
  incidentId: string;
  relatedOrderId: string | null;
  relatedDriverId: string | null;
  status: string;
  assignedTo: string | null;
  [key: string]: unknown;
};
type Entry = { incidentId: string; action: string; note: string };
type IncidentControllerPort = {
  createIncident(
    command: object,
    requestId: string,
    identity: object,
  ): Promise<{ data: Incident }> | { data: Incident };
  updateIncident(
    id: string,
    command: object,
  ): Promise<{ data: Incident }> | { data: Incident };
  getIncident(
    id: string,
  ): Promise<{ data: { item: Incident } }> | { data: { item: Incident } };
  getTimeline(
    id: string,
  ): Promise<{ data: { items: Entry[] } }> | { data: { items: Entry[] } };
};
type SqlPort = {
  database(): object;
  rows: { timelines: Map<string, Entry> };
  failTimeline: boolean;
  calls: Array<{ text: string }>;
};
type FleetAttribution = {
  resolveOrderDriverFleetAttribution(id: string | null): Promise<unknown>;
  resolveIncidentDriverFleetAttribution(
    id: string | null,
    at: string | null,
  ): Promise<unknown>;
};
type FleetPort = {
  listCases(fleetId: string): Promise<Array<{ id: string; type: string }>>;
  getCaseDetail(
    fleetId: string,
    caseId: string,
  ): Promise<{
    caseDetail: { id: string; type: string; relatedOrder: string | null };
  }>;
  getCaseTimeline(
    fleetId: string,
    caseId: string,
  ): Promise<Array<{ attachments?: Array<{ attachmentId?: string }> }>>;
  createAttachmentUploadUrl(
    fleetId: string,
    caseId: string,
    actorId: string,
    command: object,
  ): Promise<{
    attachmentId: string;
    objectKey: string;
    headers: Record<string, string>;
  }>;
  uploadAttachmentContent(
    fleetId: string,
    caseId: string,
    objectKey: string,
    stream: AsyncIterable<Uint8Array>,
    contentType: string,
  ): Promise<unknown>;
  confirmAttachmentUpload(
    fleetId: string,
    caseId: string,
    actorId: string,
    command: object,
  ): Promise<{ attachmentId: string }>;
  getAttachmentReadUrl(
    fleetId: string,
    caseId: string,
    attachmentId: string,
  ): Promise<{ downloadUrl: string }>;
  verifyAndGetAttachmentForDownload(
    fleetId: string,
    caseId: string,
    attachmentId: string,
    expiresAt: number,
    sig: string,
  ): Promise<{ fileContent: Buffer }>;
  submitReply(
    fleetId: string,
    caseId: string,
    actorId: string,
    command: object,
  ): Promise<{ replyId: string; [key: string]: unknown }>;
};
export async function actualOriginalFlow(
  options: {
    durable?: boolean;
    driverOnly?: boolean;
    missing?: boolean;
    ambiguous?: boolean;
    sharedDb?: SqlPort;
    withStorage?: boolean;
  } = {},
) {
  process.env.C067_FROZEN_COMPILE_FILE = "backend";
  try {
    const root = resolve("apps/api");
    const originalLoader = createUiModuleLoader(root);
    const contracts = originalLoader<object>(
      resolve("packages/contracts/src/iam-policy-catalog.ts"),
    );
    const authLoad = createUiModuleLoader(root, {
      "@drts/contracts": contracts,
    });
    const decorators = authLoad<object>(
      resolve(root, "src/common/auth/auth.decorators.ts"),
    );
    const load = createUiModuleLoader(root, {
      "../../common/auth": decorators,
      "@drts/contracts": contracts,
      "./fleet-document-storage.service": {
        FleetDocumentStorageService: class {},
        MAX_FLEET_DOCUMENT_BYTES: 10 * 1024 * 1024,
      },
    });
    const { IncidentService } = load<{
      IncidentService: new (...args: unknown[]) => object;
    }>(resolve(root, "src/modules/incident/incident.service.ts"));
    const { IncidentController } = load<{
      IncidentController: new (...args: unknown[]) => IncidentControllerPort;
    }>(resolve(root, "src/modules/incident/incident.controller.ts"));
    const { FleetPartnerCaseService } = load<{
      FleetPartnerCaseService: new (...args: unknown[]) => FleetPort;
    }>(
      resolve(root, "src/modules/fleet-partner/fleet-partner-case.service.ts"),
    );
    const { ApiRequestError } = load<{
      ApiRequestError: new (
        status: number,
        code: string,
        message: string,
      ) => Error;
    }>(resolve(root, "src/common/api-envelope.ts"));
    const { IncidentRepository } = load<{
      IncidentRepository: new (...args: unknown[]) => object;
    }>(resolve(root, "src/modules/incident/incident.repository.ts"));
    const { SqlTransport } = load<{ SqlTransport: new () => SqlPort }>(
      resolve(
        "tests/unit/incident-suppression-canonical-dispatch-flow-20261015/sql-transport.ts",
      ),
    );
    const db = options.sharedDb ?? new SqlTransport();
    const auditIO = { recordAuditLog: vi.fn() };
    const incidents = new IncidentService(
      auditIO,
      options.durable ? new IncidentRepository(db.database()) : undefined,
    );
    const complaintsIO = {
      refreshSettlementCases: async () => {},
      listComplaintCasesForFleetOps: async () => [],
      getComplaintCaseForOps: async () => {
        throw new ApiRequestError(
          404,
          "NOT_FOUND",
          "No separate complaint was created for this original incident",
        );
      },
    };
    const { FleetPartnerService } = load<{
      FleetPartnerService: new (...args: unknown[]) => FleetAttribution;
    }>(resolve(root, "src/modules/fleet-partner/fleet-partner.service.ts"));
    const affiliations = options.missing
      ? []
      : [
          {
            affiliationId: "unit-affiliation",
            driverId: "unit-original-driver-C067",
            fleetPartnerId: "unit-original-fleet-C067",
            affiliationType: "managed_by",
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveUntil: null,
          },
          ...(options.ambiguous
            ? [
                {
                  affiliationId: "unit-ambiguous-affiliation",
                  driverId: "unit-original-driver-C067",
                  fleetPartnerId: "unit-second-fleet",
                  affiliationType: "managed_by",
                  effectiveFrom: "2026-01-01T00:00:00.000Z",
                  effectiveUntil: null,
                },
              ]
            : []),
        ];
    const attributionIO = new FleetPartnerService(
      {},
      {
        prepareOrderAction: async () => {},
        getDriverTasksForOrder: () => [
          {
            status: "completed",
            driverId: "unit-original-driver-C067",
            completedAt: "2026-10-29T00:00:00.000Z",
          },
        ],
      },
      {
        listDrivers: () => [
          {
            driverId: "unit-original-driver-C067",
            name: "Unit real source driver",
          },
        ],
      },
      {
        isEnabled: () => true,
        loadDriverAffiliations: async () => affiliations,
      },
    );
    let storage: object = { getCaseRecords: async () => [] };
    let byteStream: (bytes: Buffer) => AsyncIterable<Uint8Array> =
      async function* (bytes) {
        yield bytes;
      };
    if (options.withStorage) {
      const documentExports = load<object>(
        resolve(root, "src/common/document-artifacts/index.ts"),
      );
      const storageLoad = createUiModuleLoader(root, {
        "@drts/contracts": contracts,
        "../../common/document-artifacts": documentExports,
        "../../../apps/api/src/common/document-artifacts": documentExports,
      });
      const fixture = storageLoad<{
        fleetStorageFixture: () => { storage: object };
        byteStream: (bytes: Buffer) => AsyncIterable<Uint8Array>;
      }>(resolve("tests/unit/helpers/fleet-document-fixture.ts"));
      storage = fixture.fleetStorageFixture().storage;
      byteStream = fixture.byteStream;
    }
    const fleet = new FleetPartnerCaseService(
      complaintsIO,
      attributionIO,
      auditIO,
      storage,
      undefined,
      incidents,
    );
    const ops = new IncidentController(incidents, complaintsIO);
    const created = await ops.createIncident(
      {
        category: "vehicle_damage",
        severity: "medium",
        title: "Unit original vehicle incident",
        description: "Socket-free original incident producer fixture",
        ...(options.driverOnly
          ? {}
          : { relatedOrderId: "unit-original-order-C067" }),
        occurredAt: "2026-10-29T00:00:00.000Z",
        relatedDriverId: "unit-original-driver-C067",
        reportedBy: "unit-original-driver-C067",
      },
      "unit-C067-create",
      {
        realm: "driver",
        actorType: "driver",
        actorId: "unit-original-driver-C067",
        roles: ["driver"],
        scopes: [],
        tenantId: null,
      },
    );
    const makeReplica = () => {
      const replicaIncident = new IncidentService(
        auditIO,
        new IncidentRepository(db.database()),
      );
      return {
        ops: new IncidentController(replicaIncident, complaintsIO),
        fleet: new FleetPartnerCaseService(
          complaintsIO,
          attributionIO,
          auditIO,
          storage,
          undefined,
          replicaIncident,
        ),
      };
    };
    return {
      ops,
      fleet,
      created: created.data,
      attributionIO,
      auditIO,
      db,
      makeReplica,
      byteStream,
    };
  } finally {
    delete process.env.C067_FROZEN_COMPILE_FILE;
  }
}
