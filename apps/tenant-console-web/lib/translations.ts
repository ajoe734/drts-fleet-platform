export type Locale = "en" | "zh";

const en = {
  "app.title": "Tenant Console",
  "app.description": "Tenant administration workspace for DRTS Phase 1.",
  "shell.breadcrumb.home": "Home",
  "shell.search": "Search bookings, passengers, statements, reports...",
  "shell.brand.sub": "TENANT CONSOLE",
  "shell.context": "YAMATO Business Group",
  "shell.env": "production",
  "shell.identity.actor": "Yamato",
  "shell.language.en": "English",
  "shell.language.zh": "繁體中文",
  "shell.language.switch": "Switch language",
  "shell.health.notChecked": "not checked",
  "shell.health.checking": "API checking",
  "shell.health.healthy": "API healthy",
  "shell.health.degraded": "API degraded",
  "shell.health.down": "API down",
  "shell.health.lastChecked": "last checked",
  "shell.nav.aria": "Tenant Console navigation",
  "shell.nav.workspace": "Workspace",
  "shell.nav.directory": "Directory",
  "shell.nav.access": "Access",
  "shell.nav.notifications": "Notifications & SLA",
  "shell.nav.finance": "Finance & governance",
  "shell.nav.integration": "Integration",
  "shell.nav.system": "System",

  "nav.home": "Home",
  "nav.bookings": "Bookings",
  "nav.newBooking": "New booking",
  "nav.passengers": "Passengers",
  "nav.addresses": "Address book",
  "nav.costCenters": "Cost centers",
  "nav.rules": "Approval & quota",
  "nav.users": "People & roles",
  "nav.notifications": "Notifications",
  "nav.sla": "SLA",
  "nav.billing": "Billing overview",
  "nav.invoices": "Invoices",
  "nav.reports": "Reports",
  "nav.apiKeys": "API keys",
  "nav.webhooks": "Webhooks",
  "nav.integrationGovernance": "Integration governance",
  "nav.featureFlags": "Feature flags",
  "nav.settings": "Tenant settings",
  "nav.audit": "Audit",

  "dashboard.hero.eyebrow": "Workspace",
  "dashboard.hero.title":
    "Tenant operations, billing, and readiness in one workspace",
  "dashboard.hero.description":
    "The home route now matches the handoff packet: KPI cards, active-booking queue, finance snapshot, statement visibility, and integration reminders from backend-owned read models.",
  "dashboard.kpi.inProgress": "In progress",
  "dashboard.kpi.todayCompleted": "Completed today",
  "dashboard.kpi.mtdUsage": "Month-to-date usage",
  "dashboard.kpi.currentInvoice": "Current invoice",
  "dashboard.section.activeBookings": "Active bookings",
  "dashboard.section.activeBookingsSub":
    "Current fulfillment queue, not a launcher-only summary.",
  "dashboard.section.finance": "Finance snapshot",
  "dashboard.section.financeSub":
    "Invoice, statement, and notification posture stay visible on the home lane.",
  "dashboard.section.integration": "Integration reminders",
  "dashboard.section.integrationSub":
    "Checklist and governance signals stay backend-owned.",
  "dashboard.col.booking": "Booking",
  "dashboard.col.passenger": "Passenger",
  "dashboard.col.window": "Window",
  "dashboard.col.status": "Status",
  "dashboard.col.amount": "Amount",
  "dashboard.col.period": "Period",
  "dashboard.col.driver": "Driver",
  "dashboard.empty.activeBookings":
    "No active bookings are currently in progress.",
  "dashboard.empty.statements":
    "No tenant-visible statements are available in the current snapshot.",
  "dashboard.link.openBookings": "Open bookings",
  "dashboard.link.newBooking": "Create booking",
  "dashboard.link.openBilling": "Open billing overview",
  "dashboard.link.openGovernance": "Open integration governance",

  "bookingDetail.tab.overview": "Overview",
  "bookingDetail.tab.timeline": "Timeline",
  "bookingDetail.tab.billing": "Billing",
  "bookingDetail.tab.audit": "Audit links",
  "bookingDetail.section.trip": "Trip summary",
  "bookingDetail.section.tripSub":
    "Service, passenger, route, cost center, and editability remain together.",
  "bookingDetail.section.timeline": "Cross-actor timeline",
  "bookingDetail.section.timelineSub":
    "Tenant, ops, platform, and system actions remain visible on the same screen.",
  "bookingDetail.section.billing": "Billing and statements",
  "bookingDetail.section.billingSub":
    "Related invoices and tenant-visible statements render without inventing settlement truth.",
  "bookingDetail.section.audit": "Deep links and audit scope",
  "bookingDetail.section.auditSub":
    "Open the tenant audit subset or rule lane when follow-up is needed.",
  "bookingDetail.empty.relatedInvoices":
    "No related invoices were returned for this booking.",
  "bookingDetail.empty.relatedStatements":
    "No tenant statements reference this booking period yet.",
  "bookingDetail.label.relatedInvoices": "Related invoices",
  "bookingDetail.label.relatedStatements": "Tenant-visible statements",
  "bookingDetail.label.readOnlyReason": "Read-only reason",
  "bookingDetail.label.editableUntil": "Editable until",
  "bookingDetail.label.approval": "Approval posture",

  "bookingCommand.reason.pastEditableUntil":
    "The tenant edit window has closed.",
  "bookingCommand.reason.pastCancelableUntil":
    "The tenant cancel window has closed.",
  "bookingCommand.reason.bookingTerminal":
    "Completed or cancelled bookings are read-only.",
  "bookingCommand.reason.onTripLocked":
    "On-trip bookings cannot be changed from the tenant surface.",
  "bookingCommand.reason.approvalPending":
    "This booking must wait for approval before it can be changed again.",
  "bookingCommand.reason.approvalNotRetryable":
    "This detail page has no retryable approval step.",
  "bookingCommand.reason.backend": "Backend reason: {code}",
  "bookingCommand.error.unknownUpdate": "Unknown update failure.",
  "bookingCommand.error.unknownCancel": "Unknown cancel failure.",
  "bookingCommand.receipt.updateCompleted":
    "Update completed at {time} · audit visible from the tenant audit lane.",
  "bookingCommand.receipt.cancelCompleted":
    "Cancellation completed at {time} · audit visible from the tenant audit lane.",
  "bookingCommand.panel.title": "Allowed tenant actions",
  "bookingCommand.panel.description":
    "Every CTA on this panel is driven by the booking action descriptors. Disabled actions stay visible with a reason instead of disappearing.",
  "bookingCommand.action.update": "Update booking",
  "bookingCommand.action.cancel": "Cancel booking",
  "bookingCommand.action.resubmitApproval": "Resubmit approval",
  "bookingCommand.action.viewAudit": "View audit",
  "bookingCommand.note.editableUntil": "Editable until {value}{relative}.",
  "bookingCommand.note.cancelableUntil": "Cancelable until {value}.",
  "bookingCommand.modal.close": "Close",
  "bookingCommand.field.pickupAddress": "Pickup address",
  "bookingCommand.field.dropoffAddress": "Dropoff address",
  "bookingCommand.field.notes": "Notes",
  "bookingCommand.field.costCenter": "Cost center",
  "bookingCommand.field.vehiclePreference": "Vehicle preference",
  "bookingCommand.field.cancelReason": "Cancel reason",
  "bookingCommand.submit.saving": "Saving...",
  "bookingCommand.submit.save": "Save changes",
  "bookingCommand.submit.cancelling": "Cancelling...",
  "bookingCommand.submit.confirmCancel": "Confirm cancel",

  "integrationGovernance.error.unknown": "Unknown integration readiness error.",
  "integrationGovernance.subsystem.apiKeys.label": "API keys",
  "integrationGovernance.subsystem.apiKeys.fallback":
    "Active keys, expiring keys, and missing scope coverage.",
  "integrationGovernance.subsystem.webhooks.label": "Webhooks",
  "integrationGovernance.subsystem.webhooks.fallback":
    "Endpoint count, delivery failure rate, and engine availability.",
  "integrationGovernance.subsystem.notifications.label": "Notification routes",
  "integrationGovernance.subsystem.notifications.fallback":
    "Configured channels across inbox, email, and webhook.",
  "integrationGovernance.subsystem.sla.label": "SLA profile",
  "integrationGovernance.subsystem.sla.fallback":
    "Wait, arrival, and completion thresholds are evaluated.",
  "integrationGovernance.subsystem.reports.label": "Report availability",
  "integrationGovernance.subsystem.reports.fallback":
    "Runnable jobs and report artifact availability.",
  "integrationGovernance.subsystem.modules.label": "Module enablement",
  "integrationGovernance.subsystem.modules.fallback":
    "Tenant-facing module posture and visibility state.",
  "integrationGovernance.subsystem.partnerEntries.label": "Partner entries",
  "integrationGovernance.subsystem.partnerEntries.fallback":
    "Partner-linked ingress posture when entries exist.",
  "integrationGovernance.subsystem.partnerEntries.emptyBody":
    "This tenant has no partner entry yet, so the lane stays distinct.",
  "integrationGovernance.missing.notProvisioned":
    "This subsystem has not been provisioned for the tenant yet.",
  "integrationGovernance.missing.payload":
    "The aggregated payload did not return this subsystem. Verify upstream readiness evidence.",
  "integrationGovernance.empty.noData.title": "No readiness data yet",
  "integrationGovernance.empty.noData.body":
    "The tenant route is live, but no aggregated readiness snapshot has been published yet.",
  "integrationGovernance.empty.noData.action": "Start with API keys",
  "integrationGovernance.empty.notProvisioned.title":
    "First-time setup required",
  "integrationGovernance.empty.notProvisioned.body":
    "The tenant exists but one or more integration lanes still require first-time provisioning.",
  "integrationGovernance.empty.notProvisioned.action": "Set up webhook",
  "integrationGovernance.empty.fetchFailed.title": "Snapshot fetch failed",
  "integrationGovernance.empty.fetchFailed.body":
    "The aggregated readiness endpoint did not return a usable payload for this request.",
  "integrationGovernance.empty.fetchFailed.action": "Retry snapshot",
  "integrationGovernance.empty.permissionDenied.title":
    "Access is read-restricted",
  "integrationGovernance.empty.permissionDenied.body":
    "The current actor can land on the route shell but cannot read the readiness summary.",
  "integrationGovernance.empty.permissionDenied.action": "Review tenant roles",
  "integrationGovernance.empty.externalUnavailable.title":
    "External dependency unavailable",
  "integrationGovernance.empty.externalUnavailable.body":
    "One or more upstream integrations that feed the aggregated view are degraded or offline.",
  "integrationGovernance.empty.externalUnavailable.action":
    "Inspect delivery posture",
  "integrationGovernance.empty.filteredEmpty.title":
    "Current filter returns nothing",
  "integrationGovernance.empty.filteredEmpty.body":
    "The route is healthy, but the current filter leaves no subsystem cards in the result set.",
  "integrationGovernance.empty.filteredEmpty.action": "Clear filters",
  "integrationGovernance.empty.driverNotEligible.title":
    "Driver-only empty reason",
  "integrationGovernance.empty.driverNotEligible.body":
    "This global empty reason should never be used to drive tenant integration governance.",
  "integrationGovernance.empty.driverNotEligible.action": "Back to readiness",
  "integrationGovernance.status.ready": "ready",
  "integrationGovernance.status.partial": "partial",
  "integrationGovernance.status.blocked": "blocked",
  "integrationGovernance.status.notProvisioned": "not provisioned",
  "integrationGovernance.action.issueApiKey": "Issue API key",
  "integrationGovernance.action.createWebhook": "Set up webhook",
  "integrationGovernance.action.updateNotifications": "Configure notifications",
  "integrationGovernance.action.updateSla": "Configure SLA",
  "integrationGovernance.action.createReport": "Create report job",
  "integrationGovernance.action.unavailable": "Unavailable: {reason}",
  "integrationGovernance.state.ready.label": "Fully ready",
  "integrationGovernance.state.ready.body":
    "All seven integration lanes report green from the aggregated snapshot.",
  "integrationGovernance.state.firstSetup.label": "First-time setup",
  "integrationGovernance.state.firstSetup.body":
    "The tenant exists, but every tracked lane still requires first-time setup.",
  "integrationGovernance.state.partial.label": "Partially ready",
  "integrationGovernance.state.partial.body":
    "Some subsystem lanes remain yellow or red, so follow-up actions stay visible.",
  "integrationGovernance.crossApp.tenantGovernance":
    "Open tenant governance in Platform Admin",
  "integrationGovernance.crossApp.webhookAudit":
    "Open webhook-linked audit lane in Ops Console",
  "integrationGovernance.crossApp.partnerOwnership":
    "Inspect partner entry ownership in Platform Admin",
  "integrationGovernance.crossApp.configure":
    "Configure {envVar} to activate this deep link.",
  "integrationGovernance.preview.current": "Current variant",
  "integrationGovernance.preview.preview": "Preview this empty state",
  "integrationGovernance.tile.notProvisionedHint":
    "Distinct from `no_data`: this lane is intentionally present but not provisioned yet.",
  "integrationGovernance.tile.partnerHint":
    "Partner-linked investigations remain cross-app and hand off to Platform Admin.",
  "integrationGovernance.tile.openModule": "Open module",
  "integrationGovernance.tile.inspect": "Inspect ->",
  "integrationGovernance.header.title": "Integration readiness",
  "integrationGovernance.header.subtitle":
    "aggregated readiness · from GET /api/tenant/integration-governance/readiness (Q-TEN10 · single aggregated endpoint, not 6+ queries)",
  "integrationGovernance.header.t5": "T5 slow",
  "integrationGovernance.header.readyCount": "{ready} of {total} ready",
  "integrationGovernance.header.noSnapshot": "No snapshot",
  "integrationGovernance.banner.title":
    "This page fetches data through 1 aggregated endpoint · not 6+ parallel queries",
  "integrationGovernance.banner.body":
    "UI must not orchestrate unrelated queries. Actionable CTAs come from backend action descriptors, and refresh tier stays tenant slow (T5).",
  "integrationGovernance.empty.returnLive": "Return to live snapshot",
  "integrationGovernance.coverage.title": "EmptyReason coverage",
  "integrationGovernance.coverage.body":
    "Reviewers can preview all six tenant-relevant empty states from this route with ?emptyReason=<reason>.",
  "integrationGovernance.coverage.supported":
    "supported · no_data / not_provisioned / fetch_failed / permission_denied / external_unavailable / filtered_empty",
  "integrationGovernance.refreshTier.title": "Refresh tier",
  "integrationGovernance.refreshTier.emptyBody":
    "This screen remains on T5 tenant-slow cadence even when the current route is rendering an empty variant.",
  "integrationGovernance.refreshTier.snapshotBody":
    "Packet §5.16 puts this route on T5. The page keeps that cadence explicit instead of pretending the summary is real-time.",
  "integrationGovernance.refreshTier.cadence": "cadence · T5 / tenant slow",
  "integrationGovernance.refreshTier.computedAt": "computedAt · {value}",
  "integrationGovernance.board.title": "Aggregated readiness board",
  "integrationGovernance.board.body":
    "Seven subsystem lanes render from one readiness payload. Drill targets stay module-specific, and quick CTAs only appear when backend returns an action descriptor.",
  "integrationGovernance.board.subsystemLanes": "7 subsystem lanes",
  "integrationGovernance.board.snapshot": "snapshot {value}",
  "integrationGovernance.board.noFollowup": "No follow-up action",
  "integrationGovernance.crossApp.title": "Cross-app drill targets",
  "integrationGovernance.crossApp.body":
    "When the next investigation step belongs to another app, the route deep-links out in a new tab instead of inventing a local mirror.",
  "integrationGovernance.qa.title": "QA variants",
  "integrationGovernance.qa.body":
    "This route still exposes the six tenant-relevant `EmptyReason` previews for review coverage.",

  "newBooking.program.creditCard": "Credit-card airport transfer",
  "newBooking.program.enterprise": "Enterprise dispatch",
  "newBooking.programSection.title": "Program-specific fields",
  "newBooking.programSection.creditCardSub":
    "Card / insurance programs need benefit linkage and airport-trip metadata.",
  "newBooking.programSection.enterpriseSub":
    "Enterprise dispatch keeps cost center, approval, and onsite handoff fields primary.",
  "newBooking.programField.benefitReference": "Benefit reference",
  "newBooking.programField.direction": "Airport direction",
  "newBooking.programField.flightNo": "Flight number",
  "newBooking.programField.terminal": "Terminal",
  "newBooking.programField.luggageCount": "Luggage count",
  "newBooking.programField.vehiclePreference": "Vehicle preference",
  "newBooking.programField.costCenter": "Cost center",
  "newBooking.programField.bookedByName": "Booked by name",
  "newBooking.programField.bookedByEmail": "Booked by email",
  "newBooking.programField.onsiteContact": "Onsite contact",
  "newBooking.programField.onsitePhone": "Onsite phone",
  "newBooking.programHint.creditCard":
    "Use this mode when the booking must retain issuer / sponsor references for downstream finance and audit.",
  "newBooking.programHint.enterprise":
    "Use this mode when the booking must carry tenant cost-center and approval metadata through billing and reporting.",

  "partner.shell.navAria": "Partner navigation",
  "partner.shell.badge": "Partner mode",
  "partner.shell.entrySlug": "Entry slug",
  "partner.shell.program": "program",
  "partner.shell.bank": "bank",
  "partner.shell.eligibility.none":
    "No eligibility check required for this entry.",
  "partner.shell.eligibility.bankCard":
    "Inline card verification required before booking.",
  "partner.shell.eligibility.reference":
    "Reference token verification required before booking.",
  "partner.shell.identity": "Identity",
  "partner.shell.actor": "Actor",
  "partner.shell.authMode": "Auth mode",
  "partner.shell.sessionValidUntil": "Session valid until",
  "partner.shell.signingOut": "Signing out...",
  "partner.shell.signOut": "Sign out partner",
  "partner.shell.topbarEyebrow": "Constrained partner shell",
  "partner.shell.workspaceTitle": "Partner workspace",
  "partner.shell.workspaceDescription":
    "Partner workspace exposes only entry-scoped eligibility and booking creation.",
  "partner.shell.authority": "Authority: `/api/tenant/*`",
  "partner.shell.noTenantAdminNav": "No tenant-admin nav exposed",
  "partner.public.title": "Partner sign-in",
  "partner.public.description":
    "Repo-local partner booking entry. Submit your entry slug and partner API key to start a backend-issued bootstrap session.",
  "partner.public.footer":
    "Partner mode is constrained: it never exposes tenant-admin governance, users, audit, API keys, webhooks, or settings.",
  "partner.nav.start.label": "Start",
  "partner.nav.start.note":
    "Entry summary, allowed actions, and partner-safe boundaries.",
  "partner.nav.eligibility.label": "Eligibility",
  "partner.nav.eligibility.note":
    "Verify rider eligibility for this entry before booking creation.",
  "partner.nav.bookingNew.label": "New booking",
  "partner.nav.bookingNew.note":
    "Create a partner-tagged booking using verified eligibility.",
  "partner.login.formAria": "Partner sign-in",
  "partner.login.entrySlug": "Entry slug",
  "partner.login.apiKey": "Partner API key",
  "partner.login.entrySlugPlaceholder": "e.g. acme-airport-vip",
  "partner.login.apiKeyPlaceholder": "Provided by platform admin",
  "partner.login.errorFailed": "Partner sign-in failed (HTTP {status}).",
  "partner.login.errorUnknown": "Unknown sign-in failure.",
  "partner.login.submitting": "Starting partner session...",
  "partner.login.submit": "Start partner session",
  "partner.login.callout.title":
    "Partner credentials are issued by platform admin",
  "partner.login.callout.description":
    "Each entry has a slug and one or more API keys. Treat the API key as a shared secret; rotate it in platform-admin if it leaks.",
  "partner.login.callout.entrySlug":
    "Entry slug is the public identifier the partner uses to reach this booking surface.",
  "partner.login.callout.apiKey":
    "API key is the bootstrap secret. Backend verifies it and issues a bearer token scoped to entry, eligibility, and booking-create only.",
  "partner.login.callout.boundary":
    "Partner mode never inherits tenant-admin authority. Users, audit, integrations, and settings are not available in this surface.",
  "partner.login.backHome": "Back to tenant-admin home",
  "partner.start.hero.eyebrow": "Partner workspace",
  "partner.start.hero.title": "{name} is signed in.",
  "partner.start.hero.description":
    "Partner mode only exposes eligibility verification and partner-tagged booking creation. Tenant governance is intentionally hidden from this interface.",
  "partner.start.entry.kicker": "Entry",
  "partner.start.entry.title": "Entry registration snapshot",
  "partner.start.entry.description":
    "Backend-issued entry record. Partner mode reads this record but never edits it.",
  "partner.start.field.displayName": "Display name",
  "partner.start.field.slug": "Slug",
  "partner.start.field.partnerCode": "Partner code",
  "partner.start.field.program": "Program",
  "partner.start.field.bank": "Bank",
  "partner.start.field.subtype": "Service subtype",
  "partner.start.field.authMode": "Auth mode",
  "partner.start.field.status": "Status",
  "partner.start.eligibility.kicker": "Eligibility",
  "partner.start.eligibility.requiredTitle":
    "Eligibility verification required",
  "partner.start.eligibility.notRequiredTitle":
    "Eligibility check not required",
  "partner.start.eligibility.requiredDescription":
    "Run the eligibility check first; only an `eligible` decision unlocks partner booking creation.",
  "partner.start.eligibility.notRequiredDescription":
    "This entry is configured with `eligibility_mode = none`. Booking creation is allowed without an eligibility verification.",
  "partner.start.eligibility.mode": "Eligibility mode",
  "partner.start.eligibility.open": "Open eligibility verification",
  "partner.start.eligibility.skip": "Skip to booking creation",
  "partner.start.booking.kicker": "Booking",
  "partner.start.booking.title": "Partner-tagged booking creation",
  "partner.start.booking.description":
    "Bookings created here are stamped with `partnerEntrySlug`; verified bookings are also stamped with `eligibilityVerificationId` so downstream audit and billing retain the partner source.",
  "partner.start.booking.subtypeFixed":
    "Service subtype is fixed by the entry record.",
  "partner.start.booking.backendOwnsFare":
    "Fare authority stays backend-owned; partner mode does not set fares.",
  "partner.start.booking.negativeStops":
    "Negative paths (denied, ineligible, or degraded) stop before create.",
  "partner.start.booking.open": "Open booking create",
  "partner.start.boundary.kicker": "Boundary",
  "partner.start.boundary.title": "What partner mode cannot access",
  "partner.start.boundary.description":
    "The shell has no navigation for these pages; the route boundary remains visible and explicit.",
  "partner.start.boundary.users": "No tenant users or role assignment.",
  "partner.start.boundary.admin":
    "No API keys, webhooks, audit log, or settings.",
  "partner.start.boundary.billing":
    "No tenant billing or integration readiness.",
  "partner.start.boundary.ops":
    "No fulfillment override or dispatch authority.",
  "partner.start.inactive.title": "Entry status flagged",
  "partner.start.inactive.description":
    'Entry status is "{status}". Booking creation will fail until platform admin reactivates the entry.',
  "partner.eligibility.hero.eyebrow": "Eligibility",
  "partner.eligibility.hero.title":
    "Verify rider eligibility for this partner entry.",
  "partner.eligibility.hero.description":
    "The verification record returned here is the authority gate for partner booking creation. Only an `eligible` decision unlocks booking.",
  "partner.eligibility.none.title": "No eligibility check required",
  "partner.eligibility.none.description":
    "This entry is configured with `eligibility_mode = none`. Booking creation accepts the partner caller without verification.",
  "partner.eligibility.inline.title": "Inline card verification",
  "partner.eligibility.inline.description":
    "Card last 4 and cardholder name are required. The backend hashes the reference; raw card data is never persisted on this surface.",
  "partner.eligibility.reference.title": "Reference-token verification",
  "partner.eligibility.reference.description":
    "Reference token and benefit reference are required. Optional flight number helps the issuer reference lookup pattern.",
  "partner.eligibility.negative.title": "Negative paths are explicit",
  "partner.eligibility.negative.description":
    "Verification records may resolve as `eligible`, `ineligible`, or `manual_review`. The two negative outcomes never silently enter booking creation.",
  "partner.eligibility.negative.eligible":
    "eligible: booking create unlocks with the verification id stamped on the booking.",
  "partner.eligibility.negative.ineligible":
    "ineligible: booking is denied; the partner sees the issuer reason code and may not retry without changing inputs.",
  "partner.eligibility.negative.manualReview":
    "manual_review: booking is held in degraded mode; ops review is required before the rider can travel under benefit.",
  "partner.eligibility.formAria": "Partner eligibility verification",
  "partner.eligibility.form.cardLast4": "Card last 4",
  "partner.eligibility.form.cardholderName": "Cardholder name",
  "partner.eligibility.form.referenceToken": "Reference token",
  "partner.eligibility.form.benefitReference": "Benefit reference",
  "partner.eligibility.form.flightNoOptional": "Flight number (optional)",
  "partner.eligibility.form.errorFailed":
    "Verification failed (HTTP {status}).",
  "partner.eligibility.form.errorUnknown": "Unknown verification failure.",
  "partner.eligibility.form.submitting": "Verifying eligibility...",
  "partner.eligibility.form.submit": "Verify eligibility",
  "partner.eligibility.status.eligible.heading": "Eligibility approved",
  "partner.eligibility.status.eligible.guidance":
    "Booking creation is unlocked. The verification id will be stamped on the booking automatically.",
  "partner.eligibility.status.ineligible.heading": "Eligibility denied",
  "partner.eligibility.status.ineligible.guidance":
    "Booking creation stays blocked. Ask the rider to provide a valid reference or contact partner support.",
  "partner.eligibility.status.manualReview.heading": "Manual review required",
  "partner.eligibility.status.manualReview.guidance":
    "Booking creation stays blocked until ops resolves the manual review queue item for this verification.",
  "partner.eligibility.result.verificationId": "Verification id",
  "partner.eligibility.result.decisionSource": "Decision source",
  "partner.eligibility.result.reasonCode": "Reason code",
  "partner.eligibility.result.adapter": "Adapter",
  "partner.eligibility.result.attempts": "Attempts",
  "partner.eligibility.result.verifiedAt": "Verified at",
  "partner.eligibility.result.continue": "Continue to booking create",
  "partner.bookingNew.hero.eyebrow": "New booking",
  "partner.bookingNew.hero.title": "Create a partner-tagged booking.",
  "partner.bookingNew.hero.description":
    "Enter pickup, dropoff, reservation window, passenger contact, and optional notes. Backend stamps `partnerEntrySlug`; verified bookings also receive `eligibilityVerificationId`.",
  "partner.bookingNew.blocked.title": "Booking creation blocked",
  "partner.bookingNew.blocked.description":
    'Entry status is "{status}". Contact platform admin before creating partner bookings.',
  "partner.bookingNew.requiresEligibility.title": "Eligibility required",
  "partner.bookingNew.requiresEligibility.description":
    "This entry requires an eligibility verification id before booking creation. Run eligibility verification first, then continue.",
  "partner.bookingNew.service.kicker": "Service",
  "partner.bookingNew.service.title": "Subtype fixed by entry: {subtype}",
  "partner.bookingNew.service.description":
    "The service subtype is owned by partner entry registration and cannot be edited here. Fare authority is backend-only.",
  "partner.bookingNew.negative.title": "Negative paths do not enter create",
  "partner.bookingNew.negative.description":
    "If backend rejects the booking with `partner_entry_inactive`, `eligibility_required`, `eligibility_ineligible`, or `eligibility_manual_review`, the interface returns the rejection reason and never falls back to the tenant-admin path.",
  "partner.bookingForm.aria": "Partner booking create",
  "partner.bookingForm.errorFailed": "Booking create failed (HTTP {status}).",
  "partner.bookingForm.errorUnknown": "Unknown booking failure.",
  "partner.bookingForm.section.pickup": "Pickup",
  "partner.bookingForm.section.dropoff": "Dropoff",
  "partner.bookingForm.section.reservation": "Reservation window",
  "partner.bookingForm.section.passenger": "Passenger",
  "partner.bookingForm.section.optional": "Optional context",
  "partner.bookingForm.section.eligibility": "Eligibility binding",
  "partner.bookingForm.pickupAddress": "Pickup address",
  "partner.bookingForm.pickupLat": "Pickup latitude",
  "partner.bookingForm.pickupLng": "Pickup longitude",
  "partner.bookingForm.dropoffAddress": "Dropoff address",
  "partner.bookingForm.dropoffLat": "Dropoff latitude",
  "partner.bookingForm.dropoffLng": "Dropoff longitude",
  "partner.bookingForm.windowStart": "Window start",
  "partner.bookingForm.windowEnd": "Window end",
  "partner.bookingForm.passengerName": "Passenger name",
  "partner.bookingForm.passengerPhone": "Passenger phone",
  "partner.bookingForm.benefitReference": "Benefit reference",
  "partner.bookingForm.flightNo": "Flight number",
  "partner.bookingForm.terminal": "Terminal",
  "partner.bookingForm.notes": "Notes",
  "partner.bookingForm.eligibilityRequired":
    "Eligibility verification id (required)",
  "partner.bookingForm.eligibilityOptional":
    "Eligibility verification id (optional)",
  "partner.bookingForm.creating": "Creating booking...",
  "partner.bookingForm.create": "Create booking",
  "partner.bookingConfirm.hero.eyebrow": "Booking confirmed",
  "partner.bookingConfirm.hero.title": "Booking {bookingId} created.",
  "partner.bookingConfirm.hero.description":
    "The partner caller can use this confirmation as the acceptance proof. Changes in this interface only happen through tenant-allowed commands.",
  "partner.bookingConfirm.identity.kicker": "Identity",
  "partner.bookingConfirm.identity.title": "Partner source recorded",
  "partner.bookingConfirm.identity.description":
    "This booking now carries partner source. Downstream audit, billing, and reporting retain the entry slug.",
  "partner.bookingConfirm.field.bookingId": "Booking id",
  "partner.bookingConfirm.field.orderId": "Order id",
  "partner.bookingConfirm.field.status": "Booking status",
  "partner.bookingConfirm.field.subtype": "Service subtype",
  "partner.bookingConfirm.field.window": "Reservation window",
  "partner.bookingConfirm.field.pickup": "Pickup",
  "partner.bookingConfirm.field.dropoff": "Dropoff",
  "partner.bookingConfirm.field.passenger": "Passenger",
  "partner.bookingConfirm.subtypeMismatch": "subtype mismatch",
  "partner.bookingConfirm.callout.title":
    "What partner mode can and cannot do next",
  "partner.bookingConfirm.callout.description":
    "The partner interface stops at booking creation. Update and cancel commands belong to tenant admin or ops authority.",
  "partner.bookingConfirm.callout.showConfirmation":
    "The partner may show this confirmation to the rider.",
  "partner.bookingConfirm.callout.noEdit":
    "The partner cannot edit, cancel, or override bookings from this interface.",
  "partner.bookingConfirm.callout.contact":
    "For changes, contact tenant admin or ops with the booking id.",
  "partner.bookingConfirm.createAnother": "Create another booking",
  "partner.bookingConfirm.backWorkspace": "Back to partner workspace",

  "billing.title": "Billing overview",
  "billing.subtitle":
    "Billing profile, current usage, invoices, and statements",
  "billing.section.profile": "Billing profile",
  "billing.section.invoices": "Recent invoices",
  "billing.section.statements": "Tenant-visible statements",
  "billing.section.statementsSub":
    "Statements render from `/api/tenant/statements` and stay read-only.",
  "billing.empty.statements": "No statements are available for this period.",
  "billing.col.statement": "Statement",
  "billing.col.gross": "Gross",
  "billing.col.serviceFee": "Service fee",
  "billing.col.subsidy": "Subsidy",
  "billing.col.net": "Net",
  "billing.col.payoutStatus": "Payout",
} as const;

const zh: Record<keyof typeof en, string> = {
  "app.title": "租戶後台",
  "app.description": "DRTS Phase 1 租戶管理工作台。",
  "shell.breadcrumb.home": "首頁",
  "shell.search": "搜尋叫車、乘客、對帳單、報表…",
  "shell.brand.sub": "租戶後台",
  "shell.context": "YAMATO 大和商務集團",
  "shell.env": "production",
  "shell.identity.actor": "大和",
  "shell.language.en": "English",
  "shell.language.zh": "繁體中文",
  "shell.language.switch": "切換語系",
  "shell.health.notChecked": "尚未檢查",
  "shell.health.checking": "API 檢查中",
  "shell.health.healthy": "API 正常",
  "shell.health.degraded": "API 降級",
  "shell.health.down": "API 中斷",
  "shell.health.lastChecked": "最近檢查",
  "shell.nav.aria": "租戶後台導覽",
  "shell.nav.workspace": "工作面",
  "shell.nav.directory": "資料維護",
  "shell.nav.access": "帳號與權限",
  "shell.nav.notifications": "通知與 SLA",
  "shell.nav.finance": "帳務與治理",
  "shell.nav.integration": "整合",
  "shell.nav.system": "系統",

  "nav.home": "首頁",
  "nav.bookings": "訂單",
  "nav.newBooking": "新增訂單",
  "nav.passengers": "乘客",
  "nav.addresses": "地址簿",
  "nav.costCenters": "成本中心",
  "nav.rules": "審批與配額",
  "nav.users": "人員與角色",
  "nav.notifications": "通知",
  "nav.sla": "SLA",
  "nav.billing": "帳務概覽",
  "nav.invoices": "發票",
  "nav.reports": "報表",
  "nav.apiKeys": "API 金鑰",
  "nav.webhooks": "Webhook",
  "nav.integrationGovernance": "整合就緒度",
  "nav.featureFlags": "功能旗標",
  "nav.settings": "租戶設定",
  "nav.audit": "稽核",

  "dashboard.hero.eyebrow": "工作面",
  "dashboard.hero.title": "把租戶營運、帳務與整合狀態收斂到同一個工作面",
  "dashboard.hero.description":
    "首頁現在對齊 handoff packet：KPI 卡片、進行中訂單、帳務快照、statement 可見性，以及來自後端讀模型的整合提醒。",
  "dashboard.kpi.inProgress": "進行中",
  "dashboard.kpi.todayCompleted": "今日完成",
  "dashboard.kpi.mtdUsage": "本月用量",
  "dashboard.kpi.currentInvoice": "當期帳單",
  "dashboard.section.activeBookings": "進行中訂單",
  "dashboard.section.activeBookingsSub":
    "這裡是執行中的履約佇列，不是只有入口卡片。",
  "dashboard.section.finance": "財務快照",
  "dashboard.section.financeSub":
    "發票、statement 與通知狀態留在首頁即可看到。",
  "dashboard.section.integration": "整合提醒",
  "dashboard.section.integrationSub":
    "checklist 與 readiness 狀態都保持後端權威。",
  "dashboard.col.booking": "訂單",
  "dashboard.col.passenger": "乘客",
  "dashboard.col.window": "時窗",
  "dashboard.col.status": "狀態",
  "dashboard.col.amount": "金額",
  "dashboard.col.period": "期別",
  "dashboard.col.driver": "司機",
  "dashboard.empty.activeBookings": "目前沒有進行中的訂單。",
  "dashboard.empty.statements": "目前快照沒有 tenant 可見的 statements。",
  "dashboard.link.openBookings": "查看訂單",
  "dashboard.link.newBooking": "建立叫車",
  "dashboard.link.openBilling": "前往帳務概覽",
  "dashboard.link.openGovernance": "前往整合就緒度",

  "bookingDetail.tab.overview": "總覽",
  "bookingDetail.tab.timeline": "活動",
  "bookingDetail.tab.billing": "帳務",
  "bookingDetail.tab.audit": "稽核連結",
  "bookingDetail.section.trip": "行程摘要",
  "bookingDetail.section.tripSub":
    "服務類型、乘客、路線、成本中心與可編輯性放在同一區。",
  "bookingDetail.section.timeline": "跨 actor 時間線",
  "bookingDetail.section.timelineSub":
    "同一頁看 tenant、ops、platform 與 system 的事件。",
  "bookingDetail.section.billing": "帳務與 statements",
  "bookingDetail.section.billingSub":
    "相關 invoice 與 tenant 可見 statement 同頁呈現，不在 client 假算結算真相。",
  "bookingDetail.section.audit": "深連結與稽核範圍",
  "bookingDetail.section.auditSub":
    "需要追查時可直接跳 audit subset 或 approval rules。",
  "bookingDetail.empty.relatedInvoices": "這筆訂單目前沒有對應的發票資料。",
  "bookingDetail.empty.relatedStatements":
    "這筆訂單所在期別目前沒有對應的 tenant statements。",
  "bookingDetail.label.relatedInvoices": "相關發票",
  "bookingDetail.label.relatedStatements": "租戶可見 statements",
  "bookingDetail.label.readOnlyReason": "唯讀原因",
  "bookingDetail.label.editableUntil": "可編輯截止",
  "bookingDetail.label.approval": "審批狀態",

  "bookingCommand.reason.pastEditableUntil": "租戶編輯時窗已關閉。",
  "bookingCommand.reason.pastCancelableUntil": "租戶取消時窗已關閉。",
  "bookingCommand.reason.bookingTerminal": "已完成或已取消的訂單為唯讀。",
  "bookingCommand.reason.onTripLocked": "行程中的訂單無法從租戶端變更。",
  "bookingCommand.reason.approvalPending": "此訂單需待審批結果才能再次變更。",
  "bookingCommand.reason.approvalNotRetryable":
    "此明細頁沒有可重試的審批流程步驟。",
  "bookingCommand.reason.backend": "後端原因：{code}",
  "bookingCommand.error.unknownUpdate": "未知的更新失敗。",
  "bookingCommand.error.unknownCancel": "未知的取消失敗。",
  "bookingCommand.receipt.updateCompleted":
    "更新已於 {time} 完成 · 可從租戶稽核路徑查看 audit。",
  "bookingCommand.receipt.cancelCompleted":
    "取消已於 {time} 完成 · 可從租戶稽核路徑查看 audit。",
  "bookingCommand.panel.title": "允許的租戶操作",
  "bookingCommand.panel.description":
    "此面板上的每個 CTA 都由 booking action descriptors 驅動；停用動作會保留並顯示原因，而不是直接消失。",
  "bookingCommand.action.update": "更新訂單",
  "bookingCommand.action.cancel": "取消訂單",
  "bookingCommand.action.resubmitApproval": "重新送審",
  "bookingCommand.action.viewAudit": "查看稽核",
  "bookingCommand.note.editableUntil": "可編輯至 {value}{relative}。",
  "bookingCommand.note.cancelableUntil": "可取消至 {value}。",
  "bookingCommand.modal.close": "關閉",
  "bookingCommand.field.pickupAddress": "上車地址",
  "bookingCommand.field.dropoffAddress": "下車地址",
  "bookingCommand.field.notes": "備註",
  "bookingCommand.field.costCenter": "成本中心",
  "bookingCommand.field.vehiclePreference": "車輛偏好",
  "bookingCommand.field.cancelReason": "取消原因",
  "bookingCommand.submit.saving": "儲存中...",
  "bookingCommand.submit.save": "儲存變更",
  "bookingCommand.submit.cancelling": "取消中...",
  "bookingCommand.submit.confirmCancel": "確認取消",

  "integrationGovernance.error.unknown": "未知的整合就緒度錯誤。",
  "integrationGovernance.subsystem.apiKeys.label": "API 金鑰",
  "integrationGovernance.subsystem.apiKeys.fallback":
    "啟用金鑰、即將到期金鑰與缺少的 scope 覆蓋。",
  "integrationGovernance.subsystem.webhooks.label": "Webhook",
  "integrationGovernance.subsystem.webhooks.fallback":
    "Endpoint 數量、投遞失敗率與引擎可用性。",
  "integrationGovernance.subsystem.notifications.label": "通知路由",
  "integrationGovernance.subsystem.notifications.fallback":
    "Inbox、email 與 webhook 的已設定通道。",
  "integrationGovernance.subsystem.sla.label": "SLA 設定檔",
  "integrationGovernance.subsystem.sla.fallback":
    "等待、抵達與完成門檻會一起評估。",
  "integrationGovernance.subsystem.reports.label": "報表可用性",
  "integrationGovernance.subsystem.reports.fallback":
    "可執行工作與報表產物可用性。",
  "integrationGovernance.subsystem.modules.label": "模組啟用",
  "integrationGovernance.subsystem.modules.fallback":
    "租戶可見模組姿態與顯示狀態。",
  "integrationGovernance.subsystem.partnerEntries.label": "合作夥伴 entries",
  "integrationGovernance.subsystem.partnerEntries.fallback":
    "存在 entries 時的合作夥伴入口姿態。",
  "integrationGovernance.subsystem.partnerEntries.emptyBody":
    "此租戶尚未建立 partner entry，因此此 lane 會保持獨立狀態。",
  "integrationGovernance.missing.notProvisioned":
    "此子系統尚未為租戶 provision。",
  "integrationGovernance.missing.payload":
    "聚合 payload 未回傳此子系統。請確認上游 readiness evidence。",
  "integrationGovernance.empty.noData.title": "尚無就緒度資料",
  "integrationGovernance.empty.noData.body":
    "租戶路由已上線，但尚未發布聚合 readiness snapshot。",
  "integrationGovernance.empty.noData.action": "先建立 API 金鑰",
  "integrationGovernance.empty.notProvisioned.title": "需要首次設定",
  "integrationGovernance.empty.notProvisioned.body":
    "租戶已存在，但一個或多個整合 lane 仍需要首次 provision。",
  "integrationGovernance.empty.notProvisioned.action": "設定 Webhook",
  "integrationGovernance.empty.fetchFailed.title": "Snapshot 讀取失敗",
  "integrationGovernance.empty.fetchFailed.body":
    "聚合 readiness endpoint 這次未回傳可用 payload。",
  "integrationGovernance.empty.fetchFailed.action": "重新讀取 snapshot",
  "integrationGovernance.empty.permissionDenied.title": "讀取權限受限",
  "integrationGovernance.empty.permissionDenied.body":
    "目前 actor 可以進入 route shell，但無法讀取 readiness summary。",
  "integrationGovernance.empty.permissionDenied.action": "檢查租戶角色",
  "integrationGovernance.empty.externalUnavailable.title": "外部依賴不可用",
  "integrationGovernance.empty.externalUnavailable.body":
    "一個或多個提供聚合視圖的上游整合正在降級或離線。",
  "integrationGovernance.empty.externalUnavailable.action": "檢查投遞姿態",
  "integrationGovernance.empty.filteredEmpty.title": "目前篩選無結果",
  "integrationGovernance.empty.filteredEmpty.body":
    "路由本身正常，但目前篩選條件讓結果沒有任何 subsystem card。",
  "integrationGovernance.empty.filteredEmpty.action": "清除篩選",
  "integrationGovernance.empty.driverNotEligible.title":
    "Driver-only empty reason",
  "integrationGovernance.empty.driverNotEligible.body":
    "此全域 empty reason 不應用來驅動租戶整合治理。",
  "integrationGovernance.empty.driverNotEligible.action": "回就緒度",
  "integrationGovernance.status.ready": "就緒",
  "integrationGovernance.status.partial": "部分就緒",
  "integrationGovernance.status.blocked": "封鎖",
  "integrationGovernance.status.notProvisioned": "尚未 provision",
  "integrationGovernance.action.issueApiKey": "核發 API 金鑰",
  "integrationGovernance.action.createWebhook": "設定 Webhook",
  "integrationGovernance.action.updateNotifications": "設定通知",
  "integrationGovernance.action.updateSla": "設定 SLA",
  "integrationGovernance.action.createReport": "建立報表工作",
  "integrationGovernance.action.unavailable": "不可用：{reason}",
  "integrationGovernance.state.ready.label": "完全就緒",
  "integrationGovernance.state.ready.body":
    "七個整合 lane 都由聚合 snapshot 回報為綠燈。",
  "integrationGovernance.state.firstSetup.label": "首次設定",
  "integrationGovernance.state.firstSetup.body":
    "租戶已存在，但每個追蹤 lane 仍需要首次設定。",
  "integrationGovernance.state.partial.label": "部分就緒",
  "integrationGovernance.state.partial.body":
    "部分 subsystem lane 仍是黃燈或紅燈，因此 follow-up action 會保留可見。",
  "integrationGovernance.crossApp.tenantGovernance":
    "在 Platform Admin 開啟租戶治理",
  "integrationGovernance.crossApp.webhookAudit":
    "在 Ops Console 開啟 webhook-linked audit lane",
  "integrationGovernance.crossApp.partnerOwnership":
    "在 Platform Admin 檢查 partner entry ownership",
  "integrationGovernance.crossApp.configure": "設定 {envVar} 以啟用此深連結。",
  "integrationGovernance.preview.current": "目前變體",
  "integrationGovernance.preview.preview": "預覽此 empty state",
  "integrationGovernance.tile.notProvisionedHint":
    "與 `no_data` 不同：此 lane 是刻意存在，但尚未 provision。",
  "integrationGovernance.tile.partnerHint":
    "Partner-linked 調查維持跨 app，並交接到 Platform Admin。",
  "integrationGovernance.tile.openModule": "開啟模組",
  "integrationGovernance.tile.inspect": "檢查 ->",
  "integrationGovernance.header.title": "整合就緒度",
  "integrationGovernance.header.subtitle":
    "aggregated readiness · 來自 GET /api/tenant/integration-governance/readiness (Q-TEN10 · 單一聚合 endpoint，非 6+ 個查詢)",
  "integrationGovernance.header.t5": "T5 slow",
  "integrationGovernance.header.readyCount": "{ready} / {total} 就緒",
  "integrationGovernance.header.noSnapshot": "尚無 snapshot",
  "integrationGovernance.banner.title":
    "本頁透過 1 個 aggregated endpoint 拉資料 · 不是 6+ 個並行查詢",
  "integrationGovernance.banner.body":
    "UI 不應 orchestrate 多個無關 query。可操作 CTA 來自 backend 回傳的 action descriptor，refresh tier 固定為 tenant slow (T5)。",
  "integrationGovernance.empty.returnLive": "回到 live snapshot",
  "integrationGovernance.coverage.title": "EmptyReason 覆蓋",
  "integrationGovernance.coverage.body":
    "Reviewer 可透過 ?emptyReason=<reason> 從此路由預覽六種 tenant-relevant empty state。",
  "integrationGovernance.coverage.supported":
    "supported · no_data / not_provisioned / fetch_failed / permission_denied / external_unavailable / filtered_empty",
  "integrationGovernance.refreshTier.title": "Refresh tier",
  "integrationGovernance.refreshTier.emptyBody":
    "即使目前路由正在渲染 empty variant，此畫面仍維持 T5 tenant-slow cadence。",
  "integrationGovernance.refreshTier.snapshotBody":
    "Packet §5.16 將此路由放在 T5。頁面明確呈現 cadence，而不是假裝 summary 是 real-time。",
  "integrationGovernance.refreshTier.cadence": "cadence · T5 / tenant slow",
  "integrationGovernance.refreshTier.computedAt": "computedAt · {value}",
  "integrationGovernance.board.title": "聚合就緒度看板",
  "integrationGovernance.board.body":
    "七個 subsystem lane 由單一 readiness payload 渲染。Drill target 維持模組專屬，quick CTA 只在後端回傳 action descriptor 時出現。",
  "integrationGovernance.board.subsystemLanes": "7 個 subsystem lane",
  "integrationGovernance.board.snapshot": "snapshot {value}",
  "integrationGovernance.board.noFollowup": "無 follow-up action",
  "integrationGovernance.crossApp.title": "跨 app drill targets",
  "integrationGovernance.crossApp.body":
    "當下一步調查屬於其他 app，路由會以新分頁 deep-link 出去，而不是在本地假做 mirror。",
  "integrationGovernance.qa.title": "QA variants",
  "integrationGovernance.qa.body":
    "此路由仍暴露六種 tenant-relevant `EmptyReason` preview，供 review coverage 使用。",

  "newBooking.program.creditCard": "信用卡／保險機場接送",
  "newBooking.program.enterprise": "企業派車",
  "newBooking.programSection.title": "方案專屬欄位",
  "newBooking.programSection.creditCardSub":
    "卡友／保險方案需要 benefit linkage 與機場旅程欄位。",
  "newBooking.programSection.enterpriseSub":
    "企業派車以成本中心、審批與現場交接欄位為主。",
  "newBooking.programField.benefitReference": "方案參考碼",
  "newBooking.programField.direction": "機場方向",
  "newBooking.programField.flightNo": "航班號碼",
  "newBooking.programField.terminal": "航廈",
  "newBooking.programField.luggageCount": "行李件數",
  "newBooking.programField.vehiclePreference": "車型偏好",
  "newBooking.programField.costCenter": "成本中心",
  "newBooking.programField.bookedByName": "代訂人姓名",
  "newBooking.programField.bookedByEmail": "代訂人 Email",
  "newBooking.programField.onsiteContact": "現場聯絡人",
  "newBooking.programField.onsitePhone": "現場電話",
  "newBooking.programHint.creditCard":
    "當訂單需要保留 issuer / sponsor 參考以供後續財務與 audit 追蹤時，請使用這個模式。",
  "newBooking.programHint.enterprise":
    "當訂單需要把成本中心與審批 metadata 帶入 billing / reporting 時，請使用這個模式。",

  "partner.shell.navAria": "合作夥伴導覽",
  "partner.shell.badge": "合作夥伴模式",
  "partner.shell.entrySlug": "Entry slug",
  "partner.shell.program": "方案",
  "partner.shell.bank": "銀行",
  "partner.shell.eligibility.none": "此 entry 不需要資格檢查。",
  "partner.shell.eligibility.bankCard": "建立訂單前需要完成卡片內嵌驗證。",
  "partner.shell.eligibility.reference": "建立訂單前需要完成參照 token 驗證。",
  "partner.shell.identity": "身分",
  "partner.shell.actor": "Actor",
  "partner.shell.authMode": "授權模式",
  "partner.shell.sessionValidUntil": "Session 有效至",
  "partner.shell.signingOut": "登出中...",
  "partner.shell.signOut": "登出合作夥伴",
  "partner.shell.topbarEyebrow": "受限合作夥伴外殼",
  "partner.shell.workspaceTitle": "合作夥伴工作區",
  "partner.shell.workspaceDescription":
    "合作夥伴工作區只開放 entry 範圍內的資格驗證與建立訂單。",
  "partner.shell.authority": "權限來源：`/api/tenant/*`",
  "partner.shell.noTenantAdminNav": "未暴露租戶管理導覽",
  "partner.public.title": "合作夥伴登入",
  "partner.public.description":
    "Repo-local 合作夥伴叫車入口。提交 entry slug 與合作夥伴 API 金鑰後，後端會核發 bootstrap session。",
  "partner.public.footer":
    "合作夥伴模式是受限介面：不暴露租戶治理、使用者、稽核、API 金鑰、Webhook 或設定。",
  "partner.nav.start.label": "開始",
  "partner.nav.start.note": "Entry 摘要、允許動作與合作夥伴安全邊界。",
  "partner.nav.eligibility.label": "資格",
  "partner.nav.eligibility.note": "建立訂單前，先驗證此 entry 的乘客資格。",
  "partner.nav.bookingNew.label": "新增訂單",
  "partner.nav.bookingNew.note": "使用已驗證資格建立合作夥伴標記訂單。",
  "partner.login.formAria": "合作夥伴登入",
  "partner.login.entrySlug": "Entry slug",
  "partner.login.apiKey": "合作夥伴 API 金鑰",
  "partner.login.entrySlugPlaceholder": "例如 acme-airport-vip",
  "partner.login.apiKeyPlaceholder": "由平台管理員提供",
  "partner.login.errorFailed": "合作夥伴登入失敗（HTTP {status}）。",
  "partner.login.errorUnknown": "未知的登入失敗。",
  "partner.login.submitting": "正在建立合作夥伴 session...",
  "partner.login.submit": "開始合作夥伴 session",
  "partner.login.callout.title": "合作夥伴憑證由平台管理員核發",
  "partner.login.callout.description":
    "每個 entry 都有一個 slug 與一個以上的 API 金鑰。請將 API 金鑰視為共用密鑰；若外洩請透過 platform-admin 輪替。",
  "partner.login.callout.entrySlug":
    "Entry slug 是合作夥伴進入此叫車介面的公開識別碼。",
  "partner.login.callout.apiKey":
    "API key 是 bootstrap secret。後端驗證後會核發 bearer token，權限只限 entry、資格驗證與建立訂單。",
  "partner.login.callout.boundary":
    "合作夥伴模式不會繼承租戶管理權限；此介面沒有使用者、稽核、整合或設定存取。",
  "partner.login.backHome": "回租戶管理首頁",
  "partner.start.hero.eyebrow": "合作夥伴工作區",
  "partner.start.hero.title": "{name} 已登入。",
  "partner.start.hero.description":
    "合作夥伴模式僅開放資格驗證與合作夥伴標記訂單建立。租戶治理刻意不出現在此介面。",
  "partner.start.entry.kicker": "Entry",
  "partner.start.entry.title": "Entry 註冊快照",
  "partner.start.entry.description":
    "後端核發的 entry 紀錄。合作夥伴模式只讀取，不會編輯。",
  "partner.start.field.displayName": "顯示名稱",
  "partner.start.field.slug": "Slug",
  "partner.start.field.partnerCode": "合作夥伴代碼",
  "partner.start.field.program": "方案",
  "partner.start.field.bank": "銀行",
  "partner.start.field.subtype": "服務子類型",
  "partner.start.field.authMode": "授權模式",
  "partner.start.field.status": "狀態",
  "partner.start.eligibility.kicker": "資格",
  "partner.start.eligibility.requiredTitle": "需要資格驗證",
  "partner.start.eligibility.notRequiredTitle": "不需要資格檢查",
  "partner.start.eligibility.requiredDescription":
    "請先執行資格驗證；只有 `eligible` 判定會解鎖合作夥伴建立訂單。",
  "partner.start.eligibility.notRequiredDescription":
    "此 entry 設定為 `eligibility_mode = none`。建立訂單時不需要 eligibility verification。",
  "partner.start.eligibility.mode": "資格模式",
  "partner.start.eligibility.open": "開啟資格驗證",
  "partner.start.eligibility.skip": "略過並建立訂單",
  "partner.start.booking.kicker": "訂單",
  "partner.start.booking.title": "合作夥伴標記訂單建立",
  "partner.start.booking.description":
    "從此介面建立的訂單會標記 `partnerEntrySlug`；通過驗證時也會標記 `eligibilityVerificationId`，讓下游稽核與帳務保留合作夥伴來源。",
  "partner.start.booking.subtypeFixed": "服務子類型由 entry 紀錄固定。",
  "partner.start.booking.backendOwnsFare":
    "報價權限由後端擁有；合作夥伴模式不設定車資。",
  "partner.start.booking.negativeStops":
    "負向路徑（拒絕、不符合資格或降級）都會在建立前停止。",
  "partner.start.booking.open": "開啟建立訂單",
  "partner.start.boundary.kicker": "邊界",
  "partner.start.boundary.title": "合作夥伴模式不能存取什麼",
  "partner.start.boundary.description":
    "外殼沒有這些頁面的導覽項目；路由邊界會清楚呈現。",
  "partner.start.boundary.users": "無租戶使用者或角色指派。",
  "partner.start.boundary.admin": "無 API 金鑰、Webhook、稽核紀錄或設定。",
  "partner.start.boundary.billing": "無租戶帳務或整合就緒度。",
  "partner.start.boundary.ops": "無履約覆寫或派遣權限。",
  "partner.start.inactive.title": "Entry 狀態已標記",
  "partner.start.inactive.description":
    "Entry 狀態為「{status}」。在 platform admin 重新啟用前，建立訂單會失敗。",
  "partner.eligibility.hero.eyebrow": "資格",
  "partner.eligibility.hero.title": "驗證此合作夥伴 entry 的乘客資格。",
  "partner.eligibility.hero.description":
    "這裡回傳的驗證紀錄是合作夥伴建立訂單的權威關卡。只有 `eligible` 判定才會解鎖訂單。",
  "partner.eligibility.none.title": "不需資格檢查",
  "partner.eligibility.none.description":
    "此 entry 設定為 `eligibility_mode = none`。建立訂單時會直接接受合作夥伴來電者，無需驗證。",
  "partner.eligibility.inline.title": "卡片內嵌驗證",
  "partner.eligibility.inline.description":
    "需要卡號末四碼與持卡人姓名。後端會雜湊參照資料；此介面不會保存原始卡片資料。",
  "partner.eligibility.reference.title": "參照 token 驗證",
  "partner.eligibility.reference.description":
    "需要 reference token 與福利參照。選填航班編號可協助 issuer 參照查找。",
  "partner.eligibility.negative.title": "負向路徑是明確的",
  "partner.eligibility.negative.description":
    "驗證紀錄可能判定為 `eligible`、`ineligible` 或 `manual_review`。兩種負向結果都不會默默進入建立訂單。",
  "partner.eligibility.negative.eligible":
    "eligible：解鎖建立訂單，並將 verification id 標記到訂單。",
  "partner.eligibility.negative.ineligible":
    "ineligible：拒絕建立訂單；合作夥伴會看到 issuer reason code，且必須更換輸入後才能重試。",
  "partner.eligibility.negative.manualReview":
    "manual_review：訂單會停留在降級模式；乘客使用權益前需要 ops 審核。",
  "partner.eligibility.formAria": "合作夥伴資格驗證",
  "partner.eligibility.form.cardLast4": "卡號末四碼",
  "partner.eligibility.form.cardholderName": "持卡人姓名",
  "partner.eligibility.form.referenceToken": "參照 token",
  "partner.eligibility.form.benefitReference": "福利參照",
  "partner.eligibility.form.flightNoOptional": "航班編號（選填）",
  "partner.eligibility.form.errorFailed": "資格驗證失敗（HTTP {status}）。",
  "partner.eligibility.form.errorUnknown": "未知的資格驗證失敗。",
  "partner.eligibility.form.submitting": "資格驗證中...",
  "partner.eligibility.form.submit": "驗證資格",
  "partner.eligibility.status.eligible.heading": "資格已通過",
  "partner.eligibility.status.eligible.guidance":
    "已解鎖建立訂單。verification id 會自動標記到訂單。",
  "partner.eligibility.status.ineligible.heading": "資格未通過",
  "partner.eligibility.status.ineligible.guidance":
    "建立訂單仍會封鎖。請乘客提供有效參照，或聯絡合作夥伴支援。",
  "partner.eligibility.status.manualReview.heading": "需要人工審核",
  "partner.eligibility.status.manualReview.guidance":
    "建立訂單仍會封鎖，直到 ops 處理此驗證的人工審核項目。",
  "partner.eligibility.result.verificationId": "驗證 id",
  "partner.eligibility.result.decisionSource": "判定來源",
  "partner.eligibility.result.reasonCode": "原因代碼",
  "partner.eligibility.result.adapter": "Adapter",
  "partner.eligibility.result.attempts": "嘗試次數",
  "partner.eligibility.result.verifiedAt": "驗證時間",
  "partner.eligibility.result.continue": "繼續建立訂單",
  "partner.bookingNew.hero.eyebrow": "新增訂單",
  "partner.bookingNew.hero.title": "建立合作夥伴標記訂單。",
  "partner.bookingNew.hero.description":
    "需要填寫上車、下車、預約時窗、乘客聯絡方式與選填備註。後端會自動標記 `partnerEntrySlug`；通過驗證時也會標記 `eligibilityVerificationId`。",
  "partner.bookingNew.blocked.title": "建立訂單已封鎖",
  "partner.bookingNew.blocked.description":
    "Entry 狀態為「{status}」。建立合作夥伴訂單前，請先聯絡 platform admin。",
  "partner.bookingNew.requiresEligibility.title": "需要資格驗證",
  "partner.bookingNew.requiresEligibility.description":
    "此 entry 在建立訂單前需要 eligibility verification id。請先執行資格驗證再繼續。",
  "partner.bookingNew.service.kicker": "服務",
  "partner.bookingNew.service.title": "Entry 固定服務子類型：{subtype}",
  "partner.bookingNew.service.description":
    "服務子類型由合作夥伴 entry 註冊擁有，無法從此介面編輯。報價權限僅由後端管理。",
  "partner.bookingNew.negative.title": "負向路徑不會進入建立",
  "partner.bookingNew.negative.description":
    "若後端以 `partner_entry_inactive`、`eligibility_required`、`eligibility_ineligible` 或 `eligibility_manual_review` 拒絕訂單，介面會回傳拒絕原因，且不會默默回退到租戶管理路徑。",
  "partner.bookingForm.aria": "合作夥伴建立訂單",
  "partner.bookingForm.errorFailed": "建立訂單失敗（HTTP {status}）。",
  "partner.bookingForm.errorUnknown": "未知的建立訂單失敗。",
  "partner.bookingForm.section.pickup": "上車",
  "partner.bookingForm.section.dropoff": "下車",
  "partner.bookingForm.section.reservation": "預約時窗",
  "partner.bookingForm.section.passenger": "乘客",
  "partner.bookingForm.section.optional": "選填資訊",
  "partner.bookingForm.section.eligibility": "資格綁定",
  "partner.bookingForm.pickupAddress": "上車地址",
  "partner.bookingForm.pickupLat": "上車緯度",
  "partner.bookingForm.pickupLng": "上車經度",
  "partner.bookingForm.dropoffAddress": "下車地址",
  "partner.bookingForm.dropoffLat": "下車緯度",
  "partner.bookingForm.dropoffLng": "下車經度",
  "partner.bookingForm.windowStart": "時窗開始",
  "partner.bookingForm.windowEnd": "時窗結束",
  "partner.bookingForm.passengerName": "乘客姓名",
  "partner.bookingForm.passengerPhone": "乘客電話",
  "partner.bookingForm.benefitReference": "福利參照",
  "partner.bookingForm.flightNo": "航班編號",
  "partner.bookingForm.terminal": "航廈",
  "partner.bookingForm.notes": "備註",
  "partner.bookingForm.eligibilityRequired":
    "Eligibility verification id（必填）",
  "partner.bookingForm.eligibilityOptional":
    "Eligibility verification id（選填）",
  "partner.bookingForm.creating": "建立訂單中...",
  "partner.bookingForm.create": "建立訂單",
  "partner.bookingConfirm.hero.eyebrow": "訂單已確認",
  "partner.bookingConfirm.hero.title": "Booking {bookingId} 已建立。",
  "partner.bookingConfirm.hero.description":
    "合作夥伴來電者可用此確認作為受理證明。此介面的變更僅透過租戶允許的命令執行。",
  "partner.bookingConfirm.identity.kicker": "身分",
  "partner.bookingConfirm.identity.title": "已記錄合作夥伴來源",
  "partner.bookingConfirm.identity.description":
    "此訂單現已帶有合作夥伴來源。下游稽核、帳務與報表都會保留 entry slug。",
  "partner.bookingConfirm.field.bookingId": "訂單 id",
  "partner.bookingConfirm.field.orderId": "單號 id",
  "partner.bookingConfirm.field.status": "訂單狀態",
  "partner.bookingConfirm.field.subtype": "服務子類型",
  "partner.bookingConfirm.field.window": "預約時窗",
  "partner.bookingConfirm.field.pickup": "上車",
  "partner.bookingConfirm.field.dropoff": "下車",
  "partner.bookingConfirm.field.passenger": "乘客",
  "partner.bookingConfirm.subtypeMismatch": "服務子類型不一致",
  "partner.bookingConfirm.callout.title": "合作夥伴模式接下來能與不能做什麼",
  "partner.bookingConfirm.callout.description":
    "合作夥伴介面止於建立訂單。更新與取消命令屬於租戶管理或 ops 權限。",
  "partner.bookingConfirm.callout.showConfirmation":
    "合作夥伴可向乘客出示此確認。",
  "partner.bookingConfirm.callout.noEdit":
    "合作夥伴無法從此介面編輯、取消或覆寫訂單。",
  "partner.bookingConfirm.callout.contact":
    "如需變更，請持訂單 id 聯絡租戶管理員或 ops。",
  "partner.bookingConfirm.createAnother": "再建立一筆訂單",
  "partner.bookingConfirm.backWorkspace": "回合作夥伴工作區",

  "billing.title": "帳務概覽",
  "billing.subtitle": "計費檔案、當期用量、發票與 statements",
  "billing.section.profile": "Billing profile",
  "billing.section.invoices": "近期發票",
  "billing.section.statements": "租戶可見 statements",
  "billing.section.statementsSub":
    "由 `/api/tenant/statements` 讀取，畫面僅做只讀呈現。",
  "billing.empty.statements": "這個期別目前沒有 statements。",
  "billing.col.statement": "Statement",
  "billing.col.gross": "毛額",
  "billing.col.serviceFee": "服務費",
  "billing.col.subsidy": "補貼",
  "billing.col.net": "淨額",
  "billing.col.payoutStatus": "撥付狀態",
};

export const translations = { en, zh } as const;
export type TranslationKey = keyof typeof en;

export function t(
  key: TranslationKey | string,
  locale: Locale = "zh",
  params?: Record<string, string | number>,
): string {
  const scoped = translations[locale] as Record<string, string>;
  const fallback = en as Record<string, string>;
  const template = scoped[key] ?? fallback[key] ?? key;
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((result, [name, value]) => {
    return result.replaceAll(`{${name}}`, String(value));
  }, template);
}
