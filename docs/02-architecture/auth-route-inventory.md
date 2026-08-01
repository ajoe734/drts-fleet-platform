# API Route Inventory

Canonical inventory for `IAM-P0-003`. This file is derived from controller decorators plus the auth policy catalog and is checked in CI.

- Total routes: 629
- Open routes: 20
- Protected routes: 609
- Canonical open-route entries: 20

## Open Routes

| Method | Path | Rate Limit | Data Exposure | Description |
| --- | --- | --- | --- | --- |
| GET | `/health` | `RATE_LIMIT_SKIP_DEFAULT` | Service status and dependency health summary only. | API liveness and dependency health probe |
| GET | `/identity/context` | `OPEN_ROUTE_RATE_LIMIT` | Resolved caller identity envelope only; no secret material. | Anonymous-safe identity context probe |
| GET | `/tenant/roles` | `READ_HEAVY_RATE_LIMIT` | Role catalog metadata only; no tenant membership state. | Tenant role catalog bootstrap read |
| POST | `/auth/driver/device/register` | `OPEN_ROUTE_RATE_LIMIT` | Short-lived device provisioning session only. | Driver device registration exchange |
| POST | `/auth/driver/device/refresh` | `OPEN_ROUTE_RATE_LIMIT` | Short-lived refreshed device session only. | Driver device refresh exchange |
| POST | `/auth/partner/bootstrap-session` | `OPEN_ROUTE_RATE_LIMIT` | Partner bootstrap session envelope only. | Partner bootstrap session exchange |
| POST | `/auth/tenant/bootstrap-session` | `OPEN_ROUTE_RATE_LIMIT` | Tenant bootstrap session envelope only. | Tenant bootstrap session exchange |
| POST | `/multi-taxi/rides` | `OPEN_ROUTE_RATE_LIMIT` | Created ride handoff details for the presented request only. | Passenger ride creation handoff |
| GET | `/partner/entries` | `READ_HEAVY_RATE_LIMIT` | Public partner entry catalog fields only. | Partner entry catalog lookup |
| GET | `/partner/entries/:entrySlug` | `READ_HEAVY_RATE_LIMIT` | Public partner entry detail fields only. | Partner entry detail lookup |
| POST | `/partner/ingress/handoff` | `OPEN_ROUTE_RATE_LIMIT` | Short-lived ingress handoff session only. | Partner ingress handoff exchange |
| POST | `/partner/ingress/referral-embed-handoff` | `OPEN_ROUTE_RATE_LIMIT` | Short-lived referral embed session only. | Referral embed handoff creation |
| POST | `/partner/ingress/referral-embed-handoff/consent` | `OPEN_ROUTE_RATE_LIMIT` | Consent receipt only. | Referral embed consent recording |
| POST | `/partner/ingress/referral-embed-handoff/consume` | `OPEN_ROUTE_RATE_LIMIT` | Single-use referral embed session material only. | Referral embed session consumption |
| GET | `/passenger-rides/:accessToken` | `OPEN_ROUTE_RATE_LIMIT` | Ride status and passenger-facing trip details for one token. | Passenger ride detail lookup by access token |
| GET | `/passenger-rides/:accessToken/events` | `OPEN_ROUTE_RATE_LIMIT` | Passenger-facing ride event stream for one token. | Passenger ride live event stream by access token |
| POST | `/passenger-rides/:accessToken/cancel` | `OPEN_ROUTE_RATE_LIMIT` | Cancellation result for one passenger ride token. | Passenger ride cancellation by access token |
| POST | `/passenger-rides/:accessToken/contact` | `OPEN_ROUTE_RATE_LIMIT` | Passenger-facing contact handoff result only. | Passenger ride contact handoff |
| POST | `/passenger-rides/:accessToken/ratings` | `OPEN_ROUTE_RATE_LIMIT` | Rating acknowledgement only. | Passenger ride rating submission |
| GET | `/passenger-rides/:accessToken/receipt` | `OPEN_ROUTE_RATE_LIMIT` | Passenger-facing receipt fields for one token. | Passenger ride receipt lookup by access token |

## Full Inventory

| Method | Path | Classification | Auth Source | Controller | Handler |
| --- | --- | --- | --- | --- | --- |
| GET | `/accident-cases` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | listAccidentCases |
| POST | `/accident-cases` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | createAccidentCase |
| GET | `/accident-cases/:caseId` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | getAccidentCase |
| POST | `/accident-cases/:caseId/bundles` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | generateInvestigationBundle |
| GET | `/accident-cases/:caseId/external-documents` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | listExternalDocuments |
| POST | `/accident-cases/:caseId/external-documents` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | importExternalDocument |
| GET | `/accident-cases/:caseId/timeline` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | getTimeline |
| POST | `/accident-cases/:caseId/timeline-facts` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | addTimelineFact |
| POST | `/accident-cases/:caseId/transitions` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | transitionAccidentCase |
| GET | `/accident-cases/evidence-discrepancies` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | listEvidenceDiscrepancyCases |
| GET | `/accident-cases/takeover-correlations` | protected | policy catalog + decorators | apps/api/src/modules/accident-investigation/accident-investigation.controller.ts#AccidentInvestigationController | listCorrelatedTakeoverCases |
| POST | `/admin/drivers/:driverId/fleet-affiliations` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | createDriverFleetAffiliation |
| GET | `/admin/flags` | protected | policy catalog | apps/api/src/modules/feature-flags/feature-flags.controller.ts#FeatureFlagsController | getAllFlags |
| GET | `/admin/flags/:key` | protected | policy catalog | apps/api/src/modules/feature-flags/feature-flags.controller.ts#FeatureFlagsController | getFlag |
| PATCH | `/admin/flags/:key` | protected | policy catalog | apps/api/src/modules/feature-flags/feature-flags.controller.ts#FeatureFlagsController | updateFlag |
| GET | `/admin/flags/:key/enabled` | protected | policy catalog | apps/api/src/modules/feature-flags/feature-flags.controller.ts#FeatureFlagsController | checkFlagEnabled |
| POST | `/admin/flags/:key/tenant-overrides` | protected | policy catalog | apps/api/src/modules/feature-flags/feature-flags.controller.ts#FeatureFlagsController | upsertTenantOverride |
| GET | `/admin/fleet-partners` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listFleetPartners |
| POST | `/admin/fleet-partners` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | createFleetPartner |
| GET | `/admin/fleet-partners/:fleetPartnerId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getFleetPartner |
| PUT | `/admin/fleet-partners/:fleetPartnerId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | updateFleetPartner |
| GET | `/admin/fleet-partners/:fleetPartnerId/drivers` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listFleetPartnerDrivers |
| GET | `/admin/fleet-partners/:fleetPartnerId/revenue-share-rules` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listRevenueShareRules |
| POST | `/admin/fleet-partners/:fleetPartnerId/revenue-share-rules` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | createRevenueShareRule |
| DELETE | `/admin/fleet-partners/:fleetPartnerId/revenue-share-rules/:ruleId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | deleteRevenueShareRule |
| GET | `/admin/fleet-partners/:fleetPartnerId/revenue-share-rules/:ruleId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getRevenueShareRule |
| PUT | `/admin/fleet-partners/:fleetPartnerId/revenue-share-rules/:ruleId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | updateRevenueShareRule |
| GET | `/admin/fleet-partners/:fleetPartnerId/statements` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listAdminFleetPartnerStatements |
| GET | `/admin/sandbox-governance/approval-documents` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listApprovalDocuments |
| POST | `/admin/sandbox-governance/approval-documents` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | createApprovalDocument |
| DELETE | `/admin/sandbox-governance/approval-documents/:documentId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | archiveApprovalDocument |
| GET | `/admin/sandbox-governance/approval-documents/:documentId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | getApprovalDocument |
| PATCH | `/admin/sandbox-governance/approval-documents/:documentId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | uploadApprovalDocumentVersion |
| POST | `/admin/sandbox-governance/approval-documents/:documentId/rollback/:versionId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | rollbackApprovalDocumentVersion |
| POST | `/admin/sandbox-governance/approval-documents/:documentId/versions/:versionId/publish` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | publishApprovalDocumentVersion |
| GET | `/admin/sandbox-governance/experiments` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listExperiments |
| POST | `/admin/sandbox-governance/experiments` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | createExperiment |
| DELETE | `/admin/sandbox-governance/experiments/:experimentId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | archiveExperiment |
| GET | `/admin/sandbox-governance/experiments/:experimentId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | getExperiment |
| PATCH | `/admin/sandbox-governance/experiments/:experimentId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | updateExperiment |
| POST | `/admin/sandbox-governance/experiments/:experimentId/compliance-snapshot` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | generateComplianceSnapshot |
| POST | `/admin/sandbox-governance/experiments/:experimentId/resume-authorizations` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | resumeExperimentAuthorizations |
| POST | `/admin/sandbox-governance/experiments/:experimentId/rollback/:versionId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | rollbackExperimentVersion |
| POST | `/admin/sandbox-governance/experiments/:experimentId/suspend` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | suspendExperimentAuthorizations |
| POST | `/admin/sandbox-governance/experiments/:experimentId/versions/:versionId/publish` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | publishExperimentVersion |
| GET | `/admin/sandbox-governance/jurisdictions` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listJurisdictions |
| POST | `/admin/sandbox-governance/jurisdictions` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | createJurisdiction |
| DELETE | `/admin/sandbox-governance/jurisdictions/:jurisdictionId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | archiveJurisdiction |
| GET | `/admin/sandbox-governance/jurisdictions/:jurisdictionId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | getJurisdiction |
| PATCH | `/admin/sandbox-governance/jurisdictions/:jurisdictionId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | updateJurisdiction |
| POST | `/admin/sandbox-governance/jurisdictions/:jurisdictionId/rollback/:versionId` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | rollbackJurisdictionVersion |
| POST | `/admin/sandbox-governance/jurisdictions/:jurisdictionId/versions/:versionId/publish` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | publishJurisdictionVersion |
| GET | `/admin/sandbox-governance/operating-areas` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listOperatingAreas |
| PUT | `/admin/sandbox-governance/operating-areas` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | updateOperatingAreas |
| POST | `/admin/sandbox-governance/operating-areas/:areaId/versions/:version/publish` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | publishOperatingArea |
| POST | `/admin/sandbox-governance/operating-areas/:areaId/versions/:version/retire` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | retireOperatingArea |
| POST | `/admin/sandbox-governance/operating-areas/:areaId/versions/:version/submit-review` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | submitOperatingAreaForReview |
| POST | `/admin/sandbox-governance/operating-areas/drafts` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | createOperatingAreaDraft |
| GET | `/admin/sandbox-governance/operating-areas/geojson` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | exportOperatingAreasGeoJson |
| POST | `/admin/sandbox-governance/pickup-dropoff-zones/:areaId/versions/:version/publish` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | publishPickupDropoffZone |
| POST | `/admin/sandbox-governance/pickup-dropoff-zones/:areaId/versions/:version/retire` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | retirePickupDropoffZone |
| POST | `/admin/sandbox-governance/pickup-dropoff-zones/:areaId/versions/:version/submit-review` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | submitPickupDropoffZoneForReview |
| POST | `/admin/sandbox-governance/pickup-dropoff-zones/drafts` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | createPickupDropoffZoneDraft |
| GET | `/admin/sandbox-governance/pickup-dropoff-zones/geojson` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | exportPickupDropoffZonesGeoJson |
| GET | `/admin/sandbox-governance/routes` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listRoutes |
| PUT | `/admin/sandbox-governance/routes` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | updateRoutes |
| POST | `/admin/sandbox-governance/routes/:routeId/versions/:version/publish` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | publishRoute |
| POST | `/admin/sandbox-governance/routes/:routeId/versions/:version/retire` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | retireRoute |
| POST | `/admin/sandbox-governance/routes/:routeId/versions/:version/submit-review` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | submitRouteForReview |
| POST | `/admin/sandbox-governance/routes/drafts` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | createRouteDraft |
| GET | `/admin/sandbox-governance/routes/geojson` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | exportRoutesGeoJson |
| GET | `/admin/sandbox-governance/safety-operator-qualifications` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listSafetyOperatorQualifications |
| PUT | `/admin/sandbox-governance/safety-operator-qualifications` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | updateSafetyOperatorQualifications |
| POST | `/admin/sandbox-governance/validate-point` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | validatePoint |
| POST | `/admin/sandbox-governance/validate-route` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | validateRoute |
| GET | `/admin/sandbox-governance/vehicle-enrollments` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | listVehicleEnrollments |
| PUT | `/admin/sandbox-governance/vehicle-enrollments` | protected | policy catalog | apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts#SandboxGovernanceController | updateVehicleEnrollments |
| GET | `/admin/service-products` | protected | policy catalog | apps/api/src/modules/service-product/service-product.controller.ts#ServiceProductController | listServiceProducts |
| POST | `/admin/service-products` | protected | policy catalog | apps/api/src/modules/service-product/service-product.controller.ts#ServiceProductController | createServiceProduct |
| PUT | `/admin/service-products/:serviceProductId` | protected | policy catalog | apps/api/src/modules/service-product/service-product.controller.ts#ServiceProductController | updateServiceProduct |
| GET | `/admin/service-products/runtime-policies` | protected | policy catalog | apps/api/src/modules/service-product/service-product.controller.ts#ServiceProductController | listRuntimePolicies |
| PUT | `/admin/service-products/runtime-policies/:runtimeProfileCode/:serviceProductCode` | protected | policy catalog | apps/api/src/modules/service-product/service-product.controller.ts#ServiceProductController | upsertRuntimePolicy |
| GET | `/admin/supply-review/submissions` | protected | policy catalog + decorators | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listSupplyReviewSubmissions |
| GET | `/admin/supply-review/submissions/:submissionId` | protected | policy catalog + decorators | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getSupplyReviewSubmission |
| POST | `/admin/supply-review/submissions/:submissionId/approve` | protected | policy catalog + decorators | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | approveSupplySubmission |
| POST | `/admin/supply-review/submissions/:submissionId/reject` | protected | policy catalog + decorators | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | rejectSupplySubmission |
| POST | `/admin/supply-review/submissions/:submissionId/request-revision` | protected | policy catalog + decorators | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | requestSupplyRevision |
| POST | `/admin/supply-review/submissions/:submissionId/start` | protected | policy catalog + decorators | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | startSupplyReview |
| GET | `/admin/tenant-governance/summary` | protected | policy catalog | apps/api/src/modules/platform-admin/tenant-governance.controller.ts#PlatformTenantGovernanceController | listSummary |
| GET | `/admin/vehicle-eligibility-matrix` | protected | policy catalog | apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.controller.ts#VehicleEligibilityController | listMatrix |
| PUT | `/admin/vehicle-eligibility-matrix` | protected | policy catalog | apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.controller.ts#VehicleEligibilityController | updateMatrix |
| POST | `/assistant/conversations` | protected | policy catalog + decorators | apps/api/src/modules/assistant/assistant.controller.ts#AssistantController | createConversation |
| POST | `/assistant/conversations/:conversationId/messages` | protected | policy catalog + decorators | apps/api/src/modules/assistant/assistant.controller.ts#AssistantController | createMessage |
| POST | `/assistant/tools/:toolName` | protected | policy catalog + decorators | apps/api/src/modules/assistant/assistant.controller.ts#AssistantController | invokeTool |
| POST | `/assistant/tools/propose-action` | protected | policy catalog + decorators | apps/api/src/modules/assistant/assistant.controller.ts#AssistantController | proposeAction |
| GET | `/assistant/tools/runtime-definition` | protected | policy catalog + decorators | apps/api/src/modules/assistant/assistant.controller.ts#AssistantController | getRuntimeDefinition |
| GET | `/audit` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | listAuditLogs |
| GET | `/audit/deletion-exceptions` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | listEvidenceDeletionExceptions |
| POST | `/audit/deletion-exceptions` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | registerEvidenceDeletionException |
| POST | `/audit/deletion-exceptions/:exceptionId/resolve` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | resolveEvidenceDeletionException |
| GET | `/audit/evidence-governance/:family/:subjectId` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | getEvidenceSubjectGovernance |
| GET | `/audit/evidence-policies` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | listEvidencePolicies |
| GET | `/audit/evidence-policies/:family` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | getEvidencePolicy |
| GET | `/audit/legal-holds` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | listEvidenceLegalHolds |
| POST | `/audit/legal-holds` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | placeEvidenceLegalHold |
| POST | `/audit/legal-holds/:holdId/release` | protected | policy catalog + decorators | apps/api/src/modules/audit-notification/audit.controller.ts#AuditController | releaseEvidenceLegalHold |
| POST | `/auth/driver/device/refresh` | open | open-route inventory | apps/api/src/modules/auth/auth.controller.ts#AuthController | refreshDriverDeviceSession |
| POST | `/auth/driver/device/register` | open | open-route inventory | apps/api/src/modules/auth/auth.controller.ts#AuthController | issueDriverDeviceSession |
| POST | `/auth/driver/device/revoke` | protected | policy catalog | apps/api/src/modules/auth/auth.controller.ts#AuthController | revokeDriverDeviceSession |
| POST | `/auth/partner/bootstrap-session` | open | open-route inventory | apps/api/src/modules/auth/auth.controller.ts#AuthController | issuePartnerBootstrapSession |
| POST | `/auth/tenant/bootstrap-session` | open | open-route inventory | apps/api/src/modules/auth/auth.controller.ts#AuthController | issueTenantBootstrapSession |
| POST | `/auth/token` | protected | policy catalog | apps/api/src/modules/auth/auth.controller.ts#AuthController | issueToken |
| POST | `/call-center/multi-taxi/rides` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | createCallCenterRide |
| POST | `/call-center/orders` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | createCallCenterOrder |
| GET | `/callcenter/callbacks` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | listCallbackTasks |
| POST | `/callcenter/callbacks/:callbackTaskId/complete` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | completeCallbackTask |
| GET | `/callcenter/sessions` | protected | policy catalog + decorators | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | listCallSessions |
| POST | `/callcenter/sessions` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | openCallSession |
| GET | `/callcenter/sessions/:callId` | protected | policy catalog + decorators | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | getCallSession |
| POST | `/callcenter/sessions/:callId/announce-identity` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | announceAgentIdentity |
| POST | `/callcenter/sessions/:callId/callbacks` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | createCallbackTask |
| POST | `/callcenter/sessions/:callId/close` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | closeCallSession |
| POST | `/callcenter/sessions/:callId/eta` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | quoteCallEta |
| POST | `/callcenter/sessions/:callId/link-order` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | linkCallOrder |
| POST | `/callcenter/sessions/:callId/recording-callback` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | attachRecordingCallback |
| POST | `/callcenter/sessions/:callId/transfer-to-complaint` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | transferCallToComplaint |
| POST | `/callcenter/sessions/:callId/transfer-to-incident` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | transferCallToIncident |
| POST | `/callcenter/webhooks/sandbox` | protected | policy catalog | apps/api/src/modules/callcenter/callcenter.controller.ts#CallcenterController | ingestSandboxWebhook |
| GET | `/complaints` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | listComplaintCases |
| POST | `/complaints` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | createComplaintCase |
| GET | `/complaints/:caseNo` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | getComplaintCase |
| POST | `/complaints/:caseNo/assign` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | assignComplaintCase |
| POST | `/complaints/:caseNo/close` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | closeComplaintCase |
| POST | `/complaints/:caseNo/escalate-to-incident` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | escalateToIncident |
| GET | `/complaints/:caseNo/export` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | getComplaintExportView |
| POST | `/complaints/:caseNo/link-incident` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | linkIncident |
| POST | `/complaints/:caseNo/notes` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | addComplaintCaseNote |
| POST | `/complaints/:caseNo/reopen` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | reopenComplaintCase |
| POST | `/complaints/:caseNo/resolve` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | resolveComplaintCase |
| POST | `/complaints/:caseNo/sla-breach` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | markComplaintSlaBreach |
| GET | `/complaints/:caseNo/timeline` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | getComplaintTimeline |
| POST | `/complaints/evaluate-sla-breach` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | evaluateAllSlaBreach |
| GET | `/complaints/resolution-codes/:category` | protected | policy catalog | apps/api/src/modules/complaint/complaint.controller.ts#ComplaintController | getValidResolutionCodes |
| POST | `/dispatch/assign` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | assignDispatch |
| GET | `/dispatch/queue` | protected | policy catalog + decorators | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listQueueEntries |
| GET | `/dispatch/queue/:queueEntryId` | protected | policy catalog + decorators | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | getQueueEntry |
| POST | `/dispatch/queue/check-in` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | queueCheckIn |
| POST | `/dispatch/queue/check-out` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | queueCheckOut |
| POST | `/dispatch/reassign` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | reassignDispatch |
| GET | `/dispatch/tasks` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listDispatchJobs |
| GET | `/dispatch/tasks/:dispatchJobId/candidates` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listDispatchCandidates |
| GET | `/driver-fee-plans` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listDriverFeePlans |
| POST | `/driver-fee-plans/publish` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | publishDriverFeePlan |
| GET | `/driver-settings` | protected | policy catalog | apps/api/src/modules/driver-settings/driver-settings.controller.ts#DriverSettingsController | listAll |
| GET | `/driver-settings/:driverId` | protected | policy catalog | apps/api/src/modules/driver-settings/driver-settings.controller.ts#DriverSettingsController | getSettings |
| PATCH | `/driver-settings/:driverId` | protected | policy catalog | apps/api/src/modules/driver-settings/driver-settings.controller.ts#DriverSettingsController | updateSettings |
| GET | `/driver-statements` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listDriverStatements |
| GET | `/driver-statements/:statementId` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getDriverStatement |
| POST | `/driver-statements/generate` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | generateDriverStatements |
| POST | `/driver/forwarded-orders/:taskId/accept` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | acceptForwardedOrder |
| POST | `/driver/forwarded-orders/:taskId/reject` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | rejectForwardedOrder |
| POST | `/driver/location-heartbeats/batch` | protected | policy catalog | apps/api/src/modules/regulatory-registry/driver-heartbeat.controller.ts#DriverHeartbeatController | recordHeartbeatBatch |
| GET | `/driver/profile` | protected | policy catalog | apps/api/src/modules/driver-profile/driver-profile.controller.ts#DriverProfileController | getProfile |
| PATCH | `/driver/profile` | protected | policy catalog | apps/api/src/modules/driver-profile/driver-profile.controller.ts#DriverProfileController | updateProfile |
| POST | `/driver/profile` | protected | policy catalog | apps/api/src/modules/driver-profile/driver-profile.controller.ts#DriverProfileController | createProfile |
| POST | `/driver/sos-events` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#DriverSosController | submitSosEvent |
| GET | `/driver/sos-events/:sosEventId/attachments` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#DriverSosController | listAttachments |
| POST | `/driver/sos-events/:sosEventId/attachments/:attachmentId/retry-scan` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#DriverSosController | retryAttachmentScan |
| POST | `/driver/sos-events/:sosEventId/attachments/confirm` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#DriverSosController | confirmAttachmentUpload |
| POST | `/driver/sos-events/:sosEventId/attachments/upload-intents` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#DriverSosController | createAttachmentUploadIntent |
| GET | `/driver/task-events` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | streamDriverTaskEvents |
| GET | `/driver/task-views` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | listDriverTaskViews |
| GET | `/driver/task-views/:taskId` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | getDriverTaskView |
| GET | `/driver/tasks` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listDriverTasks |
| GET | `/driver/tasks/:taskId` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | getDriverTask |
| POST | `/driver/tasks/:taskId/accept` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | acceptDriverTask |
| POST | `/driver/tasks/:taskId/arrived_pickup` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | arrivePickup |
| POST | `/driver/tasks/:taskId/complete` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | completeDriverTask |
| POST | `/driver/tasks/:taskId/depart` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | departDriverTask |
| POST | `/driver/tasks/:taskId/reject` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | rejectDriverTask |
| POST | `/driver/tasks/:taskId/start` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | startDriverTask |
| GET | `/driver/tracking-status` | protected | policy catalog | apps/api/src/modules/regulatory-registry/driver-heartbeat.controller.ts#DriverHeartbeatController | getTrackingStatus |
| GET | `/filing-packages` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | listFilingPackages |
| GET | `/filing-packages/:packageId` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | getFilingPackage |
| POST | `/filing-packages/generate` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | generateFilingPackage |
| GET | `/fleet-partner/dashboard` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getPortalDashboard |
| GET | `/fleet-partner/drivers` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listPortalDrivers |
| GET | `/fleet-partner/quality-metrics` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getPortalQualityMetrics |
| GET | `/fleet-partner/readiness` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listPortalReadiness |
| GET | `/fleet-partner/readiness/drivers/:driverId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getPortalDriverReadiness |
| GET | `/fleet-partner/readiness/vehicles/:vehicleId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getPortalVehicleReadiness |
| GET | `/fleet-partner/statements` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listPortalFleetPartnerStatements |
| GET | `/fleet-partner/supply-submissions` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listSupplySubmissions |
| GET | `/fleet-partner/supply-submissions/:submissionId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | getSupplySubmissionDetail |
| DELETE | `/fleet-partner/supply-submissions/:submissionId/documents/:documentId` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | deleteSupplyDocument |
| POST | `/fleet-partner/supply-submissions/:submissionId/documents/confirm` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | confirmSupplyDocumentUpload |
| POST | `/fleet-partner/supply-submissions/:submissionId/documents/upload-url` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | createSupplyDocumentUploadUrl |
| PUT | `/fleet-partner/supply-submissions/:submissionId/driver` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | updateDriverSupplySubmission |
| POST | `/fleet-partner/supply-submissions/:submissionId/submit` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | submitSupplySubmission |
| PUT | `/fleet-partner/supply-submissions/:submissionId/vehicle` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | updateVehicleSupplySubmission |
| POST | `/fleet-partner/supply-submissions/:submissionId/withdraw` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | withdrawSupplySubmission |
| POST | `/fleet-partner/supply-submissions/drivers` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | createDriverSupplySubmission |
| POST | `/fleet-partner/supply-submissions/vehicles` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | createVehicleSupplySubmission |
| GET | `/fleet-partner/trips` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listPortalTrips |
| GET | `/fleet-partner/vehicles` | protected | policy catalog | apps/api/src/modules/fleet-partner/fleet-partner.controller.ts#FleetPartnerController | listPortalVehicles |
| GET | `/forwarder/adapters/health` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | listAdapterHealth |
| GET | `/forwarder/orders` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | listForwardedOrders |
| POST | `/forwarder/orders/:orderId/accept` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | relayDriverAccept |
| POST | `/forwarder/orders/:orderId/broadcast` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | broadcastOrder |
| POST | `/forwarder/orders/:orderId/manual-fallback` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | engageManualFallback |
| POST | `/forwarder/orders/:orderId/reconciliation/complete` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | completeReconciliation |
| POST | `/forwarder/orders/:orderId/sync-failed` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | reportSyncFailure |
| POST | `/forwarder/orders/:orderId/sync-status` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | syncNativeStatus |
| POST | `/forwarder/orders/inbound` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | ingestInboundOrder |
| GET | `/forwarder/orders/sync-errors` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | listSyncErrors |
| GET | `/forwarder/reconciliation-issues` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | listReconciliationIssues |
| GET | `/forwarder/reconciliation-jobs` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | listReconciliationJobs |
| POST | `/forwarder/webhooks/grab-taiwan` | protected | policy catalog | apps/api/src/modules/forwarder/forwarder.controller.ts#ForwarderController | ingestGrabTaiwanWebhook |
| GET | `/geo/health` | protected | policy catalog | apps/api/src/modules/geo/geo.controller.ts#GeoController | health |
| POST | `/geo/resolve` | protected | policy catalog | apps/api/src/modules/geo/geo.controller.ts#GeoController | resolve |
| POST | `/geo/reverse` | protected | policy catalog | apps/api/src/modules/geo/geo.controller.ts#GeoController | reverse |
| POST | `/geo/route` | protected | policy catalog | apps/api/src/modules/geo/geo.controller.ts#GeoController | route |
| GET | `/geo/search` | protected | policy catalog | apps/api/src/modules/geo/geo.controller.ts#GeoController | search |
| GET | `/health` | open | open-route inventory | apps/api/src/health/health.controller.ts#HealthController | getHealth |
| GET | `/identity/context` | open | open-route inventory | apps/api/src/modules/identity/identity.controller.ts#IdentityController | getContext |
| GET | `/incidents` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | listIncidents |
| POST | `/incidents` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | createIncident |
| GET | `/incidents/:incidentId` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | getIncident |
| PATCH | `/incidents/:incidentId` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | updateIncident |
| POST | `/incidents/:incidentId/link-complaint` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | linkComplaint |
| POST | `/incidents/:incidentId/matching-suppression/extend` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | extendMatchingSuppression |
| GET | `/incidents/:incidentId/service-recovery` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | getServiceRecoveryActions |
| POST | `/incidents/:incidentId/service-recovery` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | recordServiceRecoveryAction |
| GET | `/incidents/:incidentId/timeline` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | getTimeline |
| POST | `/incidents/from-dispatch-exception` | protected | policy catalog | apps/api/src/modules/incident/incident.controller.ts#IncidentController | createFromDispatchException |
| GET | `/maintenance` | protected | policy catalog | apps/api/src/modules/maintenance/maintenance.controller.ts#MaintenanceController | listMaintenanceLogs |
| POST | `/maintenance` | protected | policy catalog | apps/api/src/modules/maintenance/maintenance.controller.ts#MaintenanceController | createMaintenanceLog |
| DELETE | `/maintenance/:maintenanceId` | protected | policy catalog | apps/api/src/modules/maintenance/maintenance.controller.ts#MaintenanceController | deleteMaintenanceLog |
| GET | `/maintenance/:maintenanceId` | protected | policy catalog | apps/api/src/modules/maintenance/maintenance.controller.ts#MaintenanceController | getMaintenanceLog |
| PATCH | `/maintenance/:maintenanceId` | protected | policy catalog | apps/api/src/modules/maintenance/maintenance.controller.ts#MaintenanceController | updateMaintenanceLog |
| POST | `/maintenance/:maintenanceId/update` | protected | policy catalog | apps/api/src/modules/maintenance/maintenance.controller.ts#MaintenanceController | updateMaintenanceLogAlias |
| POST | `/multi-taxi/dispatch/queue/check-in` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | queueCheckIn |
| POST | `/multi-taxi/dispatch/queue/check-out` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | queueCheckOut |
| POST | `/multi-taxi/rides` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | createRide |
| GET | `/notifications` | protected | policy catalog | apps/api/src/modules/audit-notification/notifications.controller.ts#NotificationsController | listNotifications |
| POST | `/notifications/read` | protected | policy catalog | apps/api/src/modules/audit-notification/notifications.controller.ts#NotificationsController | markNotificationsRead |
| GET | `/operational-observability` | protected | policy catalog + decorators | apps/api/src/modules/operational-observability/operational-observability.controller.ts#OperationalObservabilityController | getSnapshot |
| GET | `/ops/approval-requests` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listOpsPendingApprovalRequests |
| POST | `/ops/approval-requests/:approvalRequestId/acknowledge-breach` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | acknowledgeOpsApprovalRequestBreach |
| POST | `/ops/approval-requests/:approvalRequestId/approve` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | approveOpsApprovalRequest |
| POST | `/ops/approval-requests/:approvalRequestId/escalate` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | escalateOpsApprovalRequest |
| POST | `/ops/approval-requests/:approvalRequestId/nudge` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | nudgeOpsApprovalRequest |
| POST | `/ops/approval-requests/:approvalRequestId/reject` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | rejectOpsApprovalRequest |
| GET | `/ops/dispatch-events` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | streamOpsDispatchEvents |
| POST | `/ops/driver-sos/alerts/rendered` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#OpsDriverSosController | recordAlertsRendered |
| GET | `/ops/driver-sos/metrics/alert-latency` | protected | policy catalog + decorators | apps/api/src/modules/driver-sos/driver-sos.controller.ts#OpsDriverSosController | getAlertLatencySummary |
| GET | `/ops/drivers/:driverId/tracking-status` | protected | policy catalog | apps/api/src/modules/regulatory-registry/ops-driver-tracking.controller.ts#OpsDriverTrackingController | getDriverTrackingStatus |
| GET | `/ops/partner/eligibility/reviews` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPartnerEligibilityReviewQueue |
| POST | `/ops/partner/eligibility/reviews/resolve` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | resolvePartnerEligibilityReview |
| GET | `/orders` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listOrders |
| POST | `/orders` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | createOwnedOrder |
| GET | `/orders/:orderId` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | getOrder |
| POST | `/orders/:orderId/approve-override` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | approveExceptionOverride |
| POST | `/orders/:orderId/dispatch` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | dispatchOrder |
| POST | `/orders/:orderId/dispatch-timeout` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | handleDispatchTimeout |
| GET | `/orders/:orderId/dispatch-trace` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listOrderDispatchTrace |
| POST | `/orders/:orderId/manual-fare-override` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | applyManualFareOverride |
| POST | `/orders/:orderId/redispatch` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | redispatchOrder |
| POST | `/orders/:orderId/reject-override` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | rejectExceptionOverride |
| POST | `/orders/:orderId/request-override` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | requestExceptionOverride |
| POST | `/orders/:orderId/resolve-exception-hold` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | resolveExceptionHold |
| POST | `/orders/:orderId/resolve-no-supply` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | resolveNoSupply |
| POST | `/partner/bookings` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | createPartnerBooking |
| GET | `/partner/bookings/:bookingId` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | getPartnerBooking |
| GET | `/partner/eligibility/:eligibilityVerificationId` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getPartnerEligibilityVerification |
| POST | `/partner/eligibility/verify` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | verifyPartnerEligibility |
| GET | `/partner/entries` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPartnerEntries |
| GET | `/partner/entries/:entrySlug` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getPartnerEntry |
| POST | `/partner/ingress/handoff` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | issuePartnerIngressHandoff |
| POST | `/partner/ingress/referral-embed-handoff` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | issueReferralEmbedHandoffArtifact |
| POST | `/partner/ingress/referral-embed-handoff/consent` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | recordReferralEmbedConsent |
| POST | `/partner/ingress/referral-embed-handoff/consume` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | consumeReferralEmbedHandoffArtifact |
| GET | `/partner/orders/:orderId` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | getPartnerOrder |
| GET | `/partner/referral/dashboard` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getPartnerReferralDashboard |
| GET | `/partner/referral/revenue` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPartnerReferralRevenue |
| GET | `/partner/referral/statements` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPartnerReferralStatements |
| GET | `/partner/referral/statements/:period` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getPartnerReferralStatement |
| GET | `/partner/referral/usage` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPartnerReferralUsage |
| GET | `/passenger-rides/:accessToken` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getPassengerRide |
| POST | `/passenger-rides/:accessToken/cancel` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | cancelPassengerRide |
| POST | `/passenger-rides/:accessToken/contact` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getPassengerContact |
| GET | `/passenger-rides/:accessToken/events` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | streamPassengerRide |
| POST | `/passenger-rides/:accessToken/ratings` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | submitPassengerRating |
| GET | `/passenger-rides/:accessToken/receipt` | open | open-route inventory | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getPassengerReceipt |
| POST | `/passenger/orders/:orderId/cancel` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | cancelOwnedOrder |
| GET | `/payment-exceptions/:orderId` | protected | policy catalog + decorators | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getMultiTaxiPaymentException |
| POST | `/payment-exceptions/:orderId/actions/:action` | protected | policy catalog + decorators | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | executeMultiTaxiPaymentRecovery |
| GET | `/platform-admin/assistant/sessions` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | listSessions |
| POST | `/platform-admin/assistant/sessions` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | createSession |
| POST | `/platform-admin/assistant/sessions/:sessionId/actions/execute` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | executeAction |
| POST | `/platform-admin/assistant/sessions/:sessionId/actions/preview` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | previewAction |
| POST | `/platform-admin/assistant/sessions/:sessionId/dev/dispatch-packets` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | submitDispatchPacket |
| GET | `/platform-admin/assistant/sessions/:sessionId/dev/tasks/:taskId/status` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | getTaskRuntimeStatus |
| GET | `/platform-admin/assistant/sessions/:sessionId/development-artifacts` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | listDevelopmentArtifacts |
| POST | `/platform-admin/assistant/sessions/:sessionId/development-artifacts` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | generateDevelopmentArtifacts |
| GET | `/platform-admin/assistant/sessions/:sessionId/messages` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | listMessages |
| POST | `/platform-admin/assistant/sessions/:sessionId/messages` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | createMessage |
| GET | `/platform-admin/assistant/sessions/:sessionId/plans` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | listPlans |
| POST | `/platform-admin/assistant/sessions/:sessionId/tools/execute` | protected | policy catalog | apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.controller.ts#PlatformAdminAssistantController | executeReadTool |
| GET | `/platform-admin/compliance/evidence-discrepancies` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | listEvidenceDiscrepancies |
| GET | `/platform-admin/compliance/regulator-cases` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts#PlatformAdminRegulatorCasesController | listCases |
| GET | `/platform-admin/compliance/regulator-cases/:caseId` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts#PlatformAdminRegulatorCasesController | getCase |
| GET | `/platform-admin/compliance/regulator-cases/:caseId/access-logs` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts#PlatformAdminRegulatorCasesController | listCaseAccessLogs |
| GET | `/platform-admin/compliance/regulator-cases/:caseId/exports` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts#PlatformAdminRegulatorCasesController | listCaseExports |
| POST | `/platform-admin/compliance/regulator-cases/:caseId/exports` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts#PlatformAdminRegulatorCasesController | requestCaseExport |
| GET | `/platform-admin/compliance/takeover-reviews` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | listTakeoverReviews |
| GET | `/platform-admin/evidence/exports` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | listControlledExports |
| POST | `/platform-admin/evidence/exports/:exportRequestId/approve` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | approveControlledExport |
| POST | `/platform-admin/evidence/exports/request` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | requestControlledExport |
| GET | `/platform-admin/evidence/legal-holds` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | listLegalHolds |
| POST | `/platform-admin/evidence/legal-holds` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | placeLegalHold |
| POST | `/platform-admin/evidence/legal-holds/:holdId/release-approve` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | approveLegalHoldRelease |
| POST | `/platform-admin/evidence/legal-holds/:holdId/release-request` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | requestLegalHoldRelease |
| GET | `/platform-admin/evidence/manifests/:manifestId` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | getEvidenceManifest |
| GET | `/platform-admin/investigations` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | listInvestigations |
| GET | `/platform-admin/investigations/:caseId` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | getInvestigation |
| GET | `/platform-admin/investigations/:caseId/timeline` | protected | policy catalog + decorators | apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts#PlatformAdminComplianceController | getInvestigationTimeline |
| GET | `/platform-admin/invoices` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | listPlatformInvoices |
| GET | `/platform-admin/maintenance-mode` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | getMaintenanceMode |
| POST | `/platform-admin/maintenance-mode` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | setMaintenanceMode |
| GET | `/platform-admin/multi-taxi-rating-authorities/:driverId` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getDriverRatingAuthority |
| GET | `/platform-admin/multi-taxi-ratings` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | listPassengerRatingReviews |
| GET | `/platform-admin/multi-taxi-ratings/:ratingId` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getPassengerRatingReview |
| POST | `/platform-admin/multi-taxi-ratings/:ratingId/invalidate` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | invalidatePassengerRating |
| GET | `/platform-admin/multi-taxi-trip-records` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | listTripOperationalRecords |
| GET | `/platform-admin/multi-taxi-trip-records/export` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | exportTripOperationalRecords |
| POST | `/platform-admin/multi-taxi-trip-records/export-jobs` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | createTripOperationalExportJob |
| GET | `/platform-admin/multi-taxi-trip-records/export-jobs/:jobId` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getTripOperationalExportJob |
| GET | `/platform-admin/multi-taxi-trip-records/export-jobs/:jobId/download` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | downloadTripOperationalExport |
| POST | `/platform-admin/multi-taxi-trip-records/export-jobs/preview` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | previewTripOperationalExport |
| GET | `/platform-admin/multi-taxi/authorizations` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | listAuthorizations |
| POST | `/platform-admin/multi-taxi/authorizations` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | createAuthorization |
| GET | `/platform-admin/multi-taxi/authorizations/:authorizationId` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | getAuthorization |
| PUT | `/platform-admin/multi-taxi/authorizations/:authorizationId` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | updateAuthorization |
| POST | `/platform-admin/multi-taxi/authorizations/:authorizationId/activate` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | activateAuthorization |
| POST | `/platform-admin/multi-taxi/authorizations/:authorizationId/suspend` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | suspendAuthorization |
| GET | `/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | listAuthorizedVehicles |
| POST | `/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles` | protected | policy catalog + decorators | apps/api/src/modules/multi-taxi/multi-taxi.controller.ts#MultiTaxiController | addAuthorizedVehicle |
| GET | `/platform-admin/multi-taxi/certificates` | protected | policy catalog + decorators | apps/api/src/modules/certificate-support/certificate-support.controller.ts#CertificateSupportController | list |
| GET | `/platform-admin/multi-taxi/certificates/:certificateId` | protected | policy catalog + decorators | apps/api/src/modules/certificate-support/certificate-support.controller.ts#CertificateSupportController | get |
| POST | `/platform-admin/multi-taxi/certificates/:certificateId/actions/regenerate` | protected | policy catalog + decorators | apps/api/src/modules/certificate-support/certificate-support.controller.ts#CertificateSupportController | regenerate |
| GET | `/platform-admin/multi-taxi/certificates/:certificateId/artifacts/html` | protected | policy catalog + decorators | apps/api/src/modules/certificate-support/certificate-support.controller.ts#CertificateSupportController | getHtmlArtifact |
| GET | `/platform-admin/multi-taxi/certificates/:certificateId/artifacts/pdf` | protected | policy catalog + decorators | apps/api/src/modules/certificate-support/certificate-support.controller.ts#CertificateSupportController | getPdfArtifact |
| GET | `/platform-admin/notices` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | listPlatformNotices |
| POST | `/platform-admin/notices` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | createPlatformNotice |
| POST | `/platform-admin/notices/:noticeId/resolve` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | resolveNotice |
| GET | `/platform-admin/partner-entries` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPlatformPartnerEntries |
| POST | `/platform-admin/partner-entries` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | createPlatformPartnerEntry |
| POST | `/platform-admin/partner-entries/:entrySlug` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | updatePlatformPartnerEntry |
| POST | `/platform-admin/partner-entries/:entrySlug/activate` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | activatePlatformPartnerEntry |
| GET | `/platform-admin/partner-entries/:entrySlug/credentials` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPlatformPartnerIngressCredentials |
| POST | `/platform-admin/partner-entries/:entrySlug/credentials/:keyId/revoke` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | revokePlatformPartnerIngressCredential |
| POST | `/platform-admin/partner-entries/:entrySlug/credentials/issue` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | issuePlatformPartnerIngressCredential |
| POST | `/platform-admin/partner-entries/:entrySlug/deactivate` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | deactivatePlatformPartnerEntry |
| POST | `/platform-admin/partner-entries/:entrySlug/revoke` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | revokePlatformPartnerEntry |
| GET | `/platform-admin/placards` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | listPlacardVersions |
| POST | `/platform-admin/placards` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | generatePlacardVersion |
| POST | `/platform-admin/placards/:placardVersionId/publish` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | publishPlacardVersion |
| GET | `/platform-admin/pricing-rules` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | listPlatformPricingRules |
| POST | `/platform-admin/pricing-rules` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | createPlatformPricingRule |
| POST | `/platform-admin/pricing-rules/:ruleId/publish` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | publishPlatformPricingRule |
| GET | `/platform-admin/public-info` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | listPublicInfoVersions |
| POST | `/platform-admin/public-info` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | createPublicInfoVersion |
| DELETE | `/platform-admin/public-info/:versionId` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | deleteDraftPublicInfoVersion |
| POST | `/platform-admin/public-info/:versionId/publish` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | publishPublicInfoVersion |
| GET | `/platform-admin/referral-rates` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listReferralRevenueShareRules |
| POST | `/platform-admin/referral-rates` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | upsertReferralRevenueShareRule |
| GET | `/platform-admin/regulatory-reports` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller.ts#PlatformAdminRegulatoryReportingController | listReports |
| POST | `/platform-admin/regulatory-reports/:reportId/submit` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller.ts#PlatformAdminRegulatoryReportingController | submitReport |
| GET | `/platform-admin/tenants` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | list |
| POST | `/platform-admin/tenants` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | create |
| GET | `/platform-admin/tenants/:tenantId` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | getTenant |
| POST | `/platform-admin/tenants/:tenantId/activate` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | activate |
| POST | `/platform-admin/tenants/:tenantId/onboarding` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | updateOnboarding |
| POST | `/platform-admin/tenants/:tenantId/roles/acknowledge` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | acknowledgeRole |
| POST | `/platform-admin/tenants/:tenantId/roles/invite` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | inviteRole |
| POST | `/platform-admin/tenants/:tenantId/rollback-hold` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | rollbackHold |
| POST | `/platform-admin/tenants/:tenantId/rollout` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | setRolloutStage |
| POST | `/platform-admin/tenants/:tenantId/settings` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | updateSettings |
| POST | `/platform-admin/tenants/:tenantId/suspend` | protected | policy catalog | apps/api/src/modules/platform-admin/tenants.controller.ts#TenantsController | suspend |
| GET | `/platform-admin/users` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | listPlatformAdminUsers |
| POST | `/platform-admin/users` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | createPlatformAdminUser |
| POST | `/platform-admin/users/:userId/role` | protected | policy catalog | apps/api/src/modules/platform-admin/platform-admin.controller.ts#PlatformAdminController | updatePlatformAdminUserRole |
| GET | `/platform-earnings/by-platform` | protected | policy catalog + decorators | apps/api/src/modules/platform-earnings/platform-earnings.controller.ts#PlatformEarningsController | getByPlatform |
| GET | `/platform-earnings/summary` | protected | policy catalog + decorators | apps/api/src/modules/platform-earnings/platform-earnings.controller.ts#PlatformEarningsController | getSummary |
| GET | `/platform-presence` | protected | policy catalog + decorators | apps/api/src/modules/platform-presence/platform-presence.controller.ts#PlatformPresenceController | getSummary |
| POST | `/platform-presence/offline` | protected | policy catalog + decorators | apps/api/src/modules/platform-presence/platform-presence.controller.ts#PlatformPresenceController | setOffline |
| POST | `/platform-presence/online` | protected | policy catalog + decorators | apps/api/src/modules/platform-presence/platform-presence.controller.ts#PlatformPresenceController | setOnline |
| GET | `/product-rule/catalog` | protected | policy catalog | apps/api/src/modules/product-rule/product-rule.controller.ts#ProductRuleController | getCatalog |
| GET | `/product-rule/fare-anomalies` | protected | policy catalog + decorators | apps/api/src/modules/product-rule/fare-anomaly.controller.ts#FareAnomalyController | list |
| GET | `/product-rule/fare-anomalies/:quoteSnapshotId` | protected | policy catalog + decorators | apps/api/src/modules/product-rule/fare-anomaly.controller.ts#FareAnomalyController | get |
| POST | `/product-rule/fare-anomalies/:quoteSnapshotId/actions/retry-quote` | protected | policy catalog + decorators | apps/api/src/modules/product-rule/fare-anomaly.controller.ts#FareAnomalyController | retryQuote |
| GET | `/regulatory-registry/contracts` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listContracts |
| POST | `/regulatory-registry/contracts` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | createContract |
| POST | `/regulatory-registry/contracts/:contractId/activate` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | activateContract |
| GET | `/regulatory-registry/driver-eta` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | getDriverEta |
| POST | `/regulatory-registry/driver-location` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | recordDriverLocation |
| GET | `/regulatory-registry/driver-locations` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listDriverLocations |
| GET | `/regulatory-registry/drivers` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listDrivers |
| POST | `/regulatory-registry/drivers` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | createDriver |
| POST | `/regulatory-registry/drivers/:driverId/lifecycle` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | updateDriverLifecycle |
| GET | `/regulatory-registry/drivers/:driverId/registration-credential` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | getDriverPublicRegistrationCredential |
| POST | `/regulatory-registry/drivers/:driverId/work-state` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | updateDriverWorkState |
| GET | `/regulatory-registry/exclusivities` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listExclusivities |
| POST | `/regulatory-registry/exclusivities/:vehicleId/approve` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | approveExclusivity |
| POST | `/regulatory-registry/exclusivities/:vehicleId/reject` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | rejectExclusivity |
| POST | `/regulatory-registry/exclusivities/:vehicleId/submit-review` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | submitExclusivityReview |
| GET | `/regulatory-registry/passenger-runtime-profiles/:code` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | getPassengerRuntimeProfile |
| GET | `/regulatory-registry/policies` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listPolicies |
| POST | `/regulatory-registry/policies` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | createInsurancePolicy |
| POST | `/regulatory-registry/policies/:policyId/activate` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | activateInsurancePolicy |
| GET | `/regulatory-registry/policies/expiring` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listExpiringPolicies |
| GET | `/regulatory-registry/summary` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | getSummary |
| GET | `/regulatory-registry/vehicles` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | listVehicles |
| POST | `/regulatory-registry/vehicles/:vehicleId/compliance` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | updateVehicleCompliance |
| GET | `/regulatory-registry/vehicles/:vehicleId/disclosure-profile` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | getVehiclePassengerDisclosureProfile |
| POST | `/regulatory-registry/vehicles/:vehicleId/offboarding` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | initiateVehicleOffboarding |
| POST | `/regulatory-registry/vehicles/:vehicleId/offboarding/complete-debranding` | protected | policy catalog | apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts#RegulatoryRegistryController | completeVehicleDebranding |
| GET | `/regulatory/experiments/:experimentId/compliance-summary` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | getComplianceSummary |
| GET | `/regulatory/experiments/:experimentId/kpi-dashboard` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | getKpiDashboard |
| POST | `/regulatory/experiments/:experimentId/resume-dossiers` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | generateResumeAuthorizationDossier |
| GET | `/regulatory/notifications` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | listNotifications |
| POST | `/regulatory/notifications` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | createNotification |
| GET | `/regulatory/notifications/:notificationId` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | getNotification |
| POST | `/regulatory/notifications/:notificationId/acknowledge` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | acknowledgeNotification |
| POST | `/regulatory/notifications/:notificationId/approve` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | approveReview |
| POST | `/regulatory/notifications/:notificationId/submit` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | submitNotification |
| POST | `/regulatory/notifications/:notificationId/submit-review` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | submitReview |
| GET | `/regulatory/reports/jobs` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | listReportJobs |
| POST | `/regulatory/reports/jobs` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | createReportJob |
| GET | `/regulatory/reports/jobs/:jobId` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | getReportJob |
| GET | `/regulatory/resume-dossiers/:dossierId` | protected | policy catalog + decorators | apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts#RegulatoryReportingController | getResumeAuthorizationDossier |
| GET | `/reimbursements` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listReimbursementBatches |
| GET | `/reimbursements/:batchId` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getReimbursementBatch |
| POST | `/reimbursements/:batchId/approve` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | approveReimbursementBatch |
| POST | `/reimbursements/:batchId/pay` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | markReimbursementPaid |
| GET | `/reports/:jobId` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | getReportJob |
| GET | `/reports/daily-dispatch-records` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | listDailyDispatchRecords |
| POST | `/reports/daily-dispatch-records/rebuild` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | rebuildDailyDispatchRecords |
| GET | `/reports/dispatchable-supply-snapshots` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | listDispatchableSupplySnapshots |
| POST | `/reports/dispatchable-supply-snapshots/rebuild` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | rebuildDispatchableSupplySnapshots |
| GET | `/reports/jobs` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | listReportJobs |
| POST | `/reports/jobs` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | createReportJob |
| GET | `/reports/monthly-operations-summaries` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | listMonthlyOperationsSummaries |
| POST | `/reports/monthly-operations-summaries/rebuild` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | rebuildMonthlyOperationsSummaries |
| GET | `/reports/operations-summary/preview` | protected | policy catalog + decorators | apps/api/src/modules/reporting/reporting.controller.ts#ReportingController | previewSixMonthOperationsSummary |
| GET | `/roc/alerts` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | listAlerts |
| POST | `/roc/alerts/:alertId/ack` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | ackAlert |
| POST | `/roc/alerts/:alertId/assign` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | assignAlert |
| POST | `/roc/alerts/:alertId/fallback-to-human` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | fallbackToHuman |
| POST | `/roc/alerts/:alertId/notify` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | notify |
| POST | `/roc/alerts/:alertId/open-incident` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | openIncident |
| POST | `/roc/alerts/:alertId/operational-hold` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | operationalHold |
| POST | `/roc/alerts/:alertId/request-safety-action` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | requestSafetyAction |
| POST | `/roc/alerts/:alertId/resolve` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | resolve |
| POST | `/roc/alerts/:alertId/start-evidence-freeze` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | startEvidenceFreeze |
| POST | `/roc/alerts/:alertId/stop-new-dispatch` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | stopNewDispatch |
| GET | `/roc/overview` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | getOverview |
| GET | `/roc/provider-health` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | getProviderHealth |
| GET | `/roc/takeovers` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | listTakeovers |
| GET | `/roc/trips` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | listTrips |
| GET | `/roc/vehicles` | protected | policy catalog + decorators | apps/api/src/modules/roc-operations/roc-operations.controller.ts#RocOperationsController | listVehicles |
| GET | `/safety-operator/assignments` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | listAssignments |
| POST | `/safety-operator/assignments` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | createAssignment |
| POST | `/safety-operator/assignments/:assignmentId/engage` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | engageAssignment |
| POST | `/safety-operator/assignments/:assignmentId/release` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | releaseAssignment |
| GET | `/safety-operator/pre-trip-checklists` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | listPreTripChecklists |
| POST | `/safety-operator/pre-trip-checklists` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | submitPreTripChecklist |
| GET | `/safety-operator/qualification` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | checkQualification |
| GET | `/safety-operator/shifts` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | listShifts |
| POST | `/safety-operator/shifts/:shiftId/end` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | endShift |
| POST | `/safety-operator/shifts/start` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | startShift |
| GET | `/safety-operator/takeover-reports` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | listTakeoverReports |
| POST | `/safety-operator/takeover-reports` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | submitTakeoverReport |
| GET | `/safety-operator/trip-closeouts` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | listTripCloseouts |
| POST | `/safety-operator/trip-closeouts` | protected | policy catalog + decorators | apps/api/src/modules/safety-operator/safety-operator.controller.ts#SafetyOperatorController | createTripCloseout |
| POST | `/sandbox/dispatch/evaluate` | protected | policy catalog | apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts#SandboxDispatchGateController | evaluate |
| POST | `/sandbox/dispatch/manual-release` | protected | policy catalog | apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts#SandboxDispatchGateController | manualRelease |
| GET | `/sandbox/dispatch/passenger-disclosure/catalog` | protected | policy catalog | apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts#SandboxDispatchGateController | listPassengerDisclosureCatalog |
| POST | `/sandbox/dispatch/passenger-disclosure/catalog` | protected | policy catalog | apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts#SandboxDispatchGateController | upsertPassengerDisclosureCatalogEntry |
| POST | `/sandbox/dispatch/passenger-disclosure/policies` | protected | policy catalog | apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts#SandboxDispatchGateController | upsertPassengerDisclosurePolicy |
| GET | `/sandbox/dispatch/passenger-disclosure/policies/:policyId` | protected | policy catalog | apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts#SandboxDispatchGateController | getPassengerDisclosurePolicy |
| GET | `/security-events` | protected | policy catalog + decorators | apps/api/src/modules/security-events/security-events.controller.ts#SecurityEventsController | listSecurityEvents |
| GET | `/security-events/matrix` | protected | policy catalog + decorators | apps/api/src/modules/security-events/security-events.controller.ts#SecurityEventsController | listSecurityEventMatrix |
| GET | `/service-area/admin/geojson` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | exportAdminGeoJson |
| POST | `/service-area/admin/service-areas` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | createServiceArea |
| POST | `/service-area/admin/service-areas/:serviceAreaId/publish` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | publishServiceArea |
| POST | `/service-area/admin/service-areas/:serviceAreaId/retire` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | retireServiceArea |
| POST | `/service-area/admin/service-areas/:serviceAreaId/submit-review` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | submitServiceAreaForReview |
| POST | `/service-area/admin/service-areas/:serviceAreaId/update` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | updateServiceArea |
| POST | `/service-area/admin/stop-policies` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | createStopPolicy |
| POST | `/service-area/admin/stop-policies/:stopPolicyId/publish` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | publishStopPolicy |
| POST | `/service-area/admin/stop-policies/:stopPolicyId/retire` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | retireStopPolicy |
| POST | `/service-area/admin/stop-policies/:stopPolicyId/submit-review` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | submitStopPolicyForReview |
| POST | `/service-area/admin/stop-policies/:stopPolicyId/update` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | updateStopPolicy |
| GET | `/service-area/definitions` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | listDefinitions |
| POST | `/service-area/evaluate` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | evaluateServiceArea |
| GET | `/service-area/geojson` | protected | policy catalog | apps/api/src/modules/service-area/service-area.controller.ts#ServiceAreaController | exportOperationalGeoJson |
| GET | `/settlement/invoices` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listPlatformInvoices |
| GET | `/settlement/matrix` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listSettlementMatrix |
| GET | `/settlement/reconciliation-issues` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listReconciliationIssues |
| POST | `/settlement/reconciliation-issues` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | createReconciliationIssue |
| POST | `/settlement/reconciliation-issues/:issueId/assign` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | assignReconciliationIssue |
| POST | `/settlement/reconciliation-issues/:issueId/comment` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | addReconciliationIssueComment |
| POST | `/settlement/reconciliation-issues/:issueId/reopen` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | reopenReconciliationIssue |
| POST | `/settlement/reconciliation-issues/:issueId/resolve` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | resolveReconciliationIssue |
| GET | `/shift-attendance/attendance` | protected | policy catalog | apps/api/src/modules/shift-attendance/shift-attendance.controller.ts#ShiftAttendanceController | listAttendance |
| POST | `/shift-attendance/clock-in` | protected | policy catalog | apps/api/src/modules/shift-attendance/shift-attendance.controller.ts#ShiftAttendanceController | clockIn |
| POST | `/shift-attendance/clock-out` | protected | policy catalog | apps/api/src/modules/shift-attendance/shift-attendance.controller.ts#ShiftAttendanceController | clockOut |
| GET | `/shift-attendance/shifts` | protected | policy catalog | apps/api/src/modules/shift-attendance/shift-attendance.controller.ts#ShiftAttendanceController | listShifts |
| GET | `/shift-attendance/shifts/:shiftId` | protected | policy catalog | apps/api/src/modules/shift-attendance/shift-attendance.controller.ts#ShiftAttendanceController | getShift |
| POST | `/shift-attendance/shifts/:shiftId/abandon` | protected | policy catalog | apps/api/src/modules/shift-attendance/shift-attendance.controller.ts#ShiftAttendanceController | abandonShift |
| GET | `/system/foundation/manifest` | protected | policy catalog | apps/api/src/modules/foundation/foundation.controller.ts#FoundationController | getManifest |
| GET | `/tenant-partner/summary` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getSummary |
| GET | `/tenant/addresses` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listAddresses |
| POST | `/tenant/addresses` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | upsertAddress |
| GET | `/tenant/addresses/export-view` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listAddressExportView |
| GET | `/tenant/api-keys` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listApiKeys |
| POST | `/tenant/api-keys` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | issueApiKey |
| POST | `/tenant/api-keys/:apiKeyId/revoke` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | revokeApiKey |
| POST | `/tenant/api-keys/:apiKeyId/rotate` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | rotateApiKey |
| GET | `/tenant/approval-requests` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listApprovalRequests |
| GET | `/tenant/approval-requests/:approvalRequestId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getApprovalRequest |
| POST | `/tenant/approval-requests/:approvalRequestId/approve` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | approveApprovalRequest |
| POST | `/tenant/approval-requests/:approvalRequestId/escalate` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | escalateApprovalRequest |
| POST | `/tenant/approval-requests/:approvalRequestId/reject` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | rejectApprovalRequest |
| POST | `/tenant/approval-requests/process-timeouts` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | runApprovalTimeoutCronStub |
| GET | `/tenant/approval-rules` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listApprovalRules |
| POST | `/tenant/approval-rules` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | upsertApprovalRule |
| GET | `/tenant/approval-rules/:ruleId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getApprovalRule |
| PUT | `/tenant/approval-rules/:ruleId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | updateApprovalRule |
| POST | `/tenant/approval-rules/:ruleId/disable` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | disableApprovalRule |
| POST | `/tenant/approval-rules/evaluate` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | evaluateApprovalRules |
| POST | `/tenant/approval-rules/reorder` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | reorderApprovalRules |
| GET | `/tenant/audit` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantAudit |
| GET | `/tenant/billing/profile` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getTenantBillingProfile |
| POST | `/tenant/billing/profile` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | updateTenantBillingProfile |
| GET | `/tenant/bookings` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | listTenantBookings |
| POST | `/tenant/bookings` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | createTenantBooking |
| GET | `/tenant/bookings/:bookingId` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | getTenantBooking |
| PUT | `/tenant/bookings/:bookingId` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | updateTenantBooking |
| POST | `/tenant/bookings/:bookingId/cancel` | protected | policy catalog | apps/api/src/modules/owned-mobility/owned-mobility.controller.ts#OwnedMobilityController | cancelTenantBooking |
| GET | `/tenant/contracts` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantContracts |
| GET | `/tenant/contracts/:contractId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantContract |
| GET | `/tenant/cost-centers` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listCostCenters |
| POST | `/tenant/cost-centers` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | upsertCostCenter |
| GET | `/tenant/cost-centers/:code` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getCostCenter |
| GET | `/tenant/cost-centers/:code/quota` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getCostCenterQuotaSummary |
| GET | `/tenant/cost-centers/coverage` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getCostCenterCoverage |
| POST | `/tenant/cost-centers/disable` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | disableCostCenter |
| GET | `/tenant/dashboard` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantDashboard |
| GET | `/tenant/integration-governance` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantIntegrationGovernancePackage |
| GET | `/tenant/invoices` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listTenantInvoices |
| GET | `/tenant/invoices/:invoiceId` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getTenantInvoice |
| POST | `/tenant/invoices/generate` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | generateTenantInvoice |
| GET | `/tenant/notifications` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantNotifications |
| POST | `/tenant/notifications` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | updateTenantNotifications |
| GET | `/tenant/notifications/feed` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantNotificationFeed |
| GET | `/tenant/orders` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantOrders |
| GET | `/tenant/orders/:orderId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantOrder |
| GET | `/tenant/passengers` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listPassengers |
| POST | `/tenant/passengers` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | upsertPassenger |
| GET | `/tenant/payables/line-items` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listTenantPayableLineItems |
| GET | `/tenant/payables/summary` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getTenantPayablesSummary |
| GET | `/tenant/program-usage` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantProgramUsage |
| GET | `/tenant/quotas` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantQuotaSummary |
| GET | `/tenant/quotas/ledger` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantQuotaLedger |
| POST | `/tenant/quotas/policies` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | upsertTenantQuotaPolicy |
| POST | `/tenant/quotas/preview` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | previewTenantBookingQuotaImpact |
| GET | `/tenant/reports/:jobId` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | getTenantReportJob |
| GET | `/tenant/reports/jobs` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | listTenantReportJobs |
| POST | `/tenant/reports/jobs` | protected | policy catalog + decorators | apps/api/src/modules/reporting-filing/reporting-filing.controller.ts#ReportingFilingController | createTenantReportJob |
| GET | `/tenant/roles` | open | open-route inventory | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantRoles |
| GET | `/tenant/service-programs` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantServicePrograms |
| GET | `/tenant/service-programs/:programId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getTenantServiceProgram |
| GET | `/tenant/settlement-statements` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listTenantSettlementStatements |
| GET | `/tenant/settlement-statements/:period` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | getTenantSettlementStatement |
| GET | `/tenant/sla` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getSlaProfile |
| POST | `/tenant/sla` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | updateSlaProfile |
| POST | `/tenant/sla/recalculate` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | recalculateSlaBookings |
| GET | `/tenant/sla/view` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | getSlaProfileView |
| GET | `/tenant/statements` | protected | policy catalog | apps/api/src/modules/billing-settlement/billing-settlement.controller.ts#BillingSettlementController | listTenantStatements |
| GET | `/tenant/trips` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantTrips |
| GET | `/tenant/users` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listTenantUsers |
| POST | `/tenant/users` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | createTenantUser |
| POST | `/tenant/users/:userId/role` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | updateTenantRole |
| GET | `/tenant/webhooks` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listWebhookEndpoints |
| POST | `/tenant/webhooks` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | createWebhookEndpoint |
| DELETE | `/tenant/webhooks/:webhookId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | deleteWebhookEndpoint |
| POST | `/tenant/webhooks/:webhookId` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | updateWebhookEndpoint |
| GET | `/tenant/webhooks/:webhookId/deliveries` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listWebhookDeliveriesByEndpoint |
| POST | `/tenant/webhooks/:webhookId/deliveries/:deliveryId/retry` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | retryWebhookDelivery |
| POST | `/tenant/webhooks/:webhookId/rotate-secret` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | rotateWebhookSecret |
| GET | `/tenant/webhooks/deliveries` | protected | policy catalog + decorators | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | listWebhookDeliveries |
| POST | `/tenant/webhooks/test` | protected | policy catalog | apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#TenantPartnerController | sendTestWebhook |
| POST | `/tesla-integration/commands` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | issueCommand |
| GET | `/tesla-integration/commands/:commandId` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | getCommandReceipt |
| POST | `/tesla-integration/oauth/session` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | beginOAuth |
| POST | `/tesla-integration/oauth/token/refresh` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | refreshOAuth |
| POST | `/tesla-integration/oauth/token/revoke` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | revokeOAuth |
| GET | `/tesla-integration/regions` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | listRegions |
| GET | `/tesla-integration/telemetry/:vehicleId/projection` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | getTelemetryProjection |
| GET | `/tesla-integration/telemetry/:vehicleId/public-sample` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | getPublicTelemetrySample |
| GET | `/tesla-integration/telemetry/:vehicleId/status` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | getTelemetryStatus |
| POST | `/tesla-integration/telemetry/configure` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | configureTelemetry |
| POST | `/tesla-integration/vehicles/bind` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | bindVehicle |
| GET | `/tesla-integration/vehicles/bindings` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | listBindings |
| GET | `/tesla-integration/vehicles/discover` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | discoverVehicles |
| POST | `/tesla-integration/virtual-key/pairing` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | pairVirtualKey |
| GET | `/tesla-integration/virtual-key/pairing/:vehicleId` | protected | policy catalog | apps/api/src/modules/tesla-integration/tesla-integration.controller.ts#TeslaIntegrationController | getVirtualKeyStatus |
| GET | `/vehicle-evidence/bookmarks` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | listBookmarks |
| POST | `/vehicle-evidence/bookmarks` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | bookmarkEvent |
| GET | `/vehicle-evidence/recorders` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | listRecorders |
| POST | `/vehicle-evidence/recorders` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | registerRecorder |
| GET | `/vehicle-evidence/recorders/:recorderId/health` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | getRecorderHealth |
| POST | `/vehicle-evidence/recorders/:recorderId/health` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | updateRecorderHealth |
| GET | `/vehicle-evidence/segments` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | listSegmentIndex |
| GET | `/vehicle-evidence/signals/no-new-dispatch/:vehicleId` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | getNoNewDispatchSignal |
| POST | `/vehicle-evidence/uploads/:artifactId/retry` | protected | policy catalog + decorators | apps/api/src/modules/vehicle-evidence/vehicle-evidence.controller.ts#VehicleEvidenceController | retryUpload |
