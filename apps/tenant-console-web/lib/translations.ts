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

  "bookingList.format.minutes": "{count}m",
  "bookingList.format.unknown": "Unknown",
  "bookingList.format.minutesAgo": "{value} ago",
  "bookingList.format.hoursAgo": "{count}h ago",
  "bookingList.format.daysAgo": "{count}d ago",
  "bookingList.format.ended": "closed",
  "bookingList.format.remainingMinutes": "{value} left",
  "bookingList.format.remainingHoursMinutes": "{hours}h {minutes}m left",
  "bookingList.actionDisabled.editWindowPassed": "Edit window has closed",
  "bookingList.actionDisabled.cancelWindowPassed": "Cancel window has closed",
  "bookingList.actionDisabled.workflowLocked":
    "The workflow no longer accepts tenant changes",
  "bookingList.actionDisabled.default": "Unavailable",
  "bookingList.action.openDetail": "Open detail",
  "bookingList.action.update": "Edit",
  "bookingList.action.cancel": "Cancel",
  "bookingList.action.create": "Create booking",
  "bookingList.action.openOpsApproval": "Ops approval",
  "bookingList.action.openOpsDispatch": "Ops dispatch",
  "bookingList.action.openIntegrationGovernance": "Integration readiness",
  "bookingList.action.resetFilters": "Reset filters",
  "bookingList.crossApp.approval": "Open ops approval queue",
  "bookingList.crossApp.dispatch": "Open ops dispatch queue",
  "bookingList.sla.risk": "SLA risk",
  "bookingList.sla.riskDetail":
    "Redispatch is required to protect this reservation window.",
  "bookingList.sla.watch": "SLA watch",
  "bookingList.sla.watchDetail": "Pickup window opens in {value}.",
  "bookingList.sla.none": "No SLA warning is currently published.",
  "bookingList.subtype.creditCardAirport": "Airport transfer",
  "bookingList.subtype.enterprise": "Enterprise dispatch",
  "bookingList.serviceBucket.businessDispatch": "Business dispatch",
  "bookingList.source.forwarded": "Forwarded authority",
  "bookingList.source.external": "Externally fulfilled",
  "bookingList.source.owned": "DRTS operated",
  "bookingList.value.noCostCenter": "No cost center",
  "bookingList.empty.notProvisioned.title":
    "Tenant setup is not provisioned yet",
  "bookingList.empty.notProvisioned.description":
    "Bookings stay unavailable until tenant governance and downstream integration setup are complete for this workspace.",
  "bookingList.empty.permissionDenied.title":
    "You do not have permission to view bookings",
  "bookingList.empty.permissionDenied.description":
    "The tenant actor can enter the interface, but this role context is not authorized to access the booking ledger.",
  "bookingList.empty.externalUnavailable.title":
    "Booking data is temporarily unavailable",
  "bookingList.empty.externalUnavailable.description":
    "An upstream dependency did not respond in time. Refresh this page, and escalate through ops if the delay continues.",
  "bookingList.empty.fetchFailed.title": "Booking list failed to load",
  "bookingList.empty.fetchFailed.description":
    "The page could not obtain a valid tenant booking snapshot. Refresh, then check service health if it continues.",
  "bookingList.empty.filteredEmpty.title":
    "No bookings match the current filters",
  "bookingList.empty.filteredEmpty.description":
    "Try widening the reservation date range, clearing status chips, or returning to all service buckets.",
  "bookingList.empty.noData.title":
    "This tenant does not have any bookings yet",
  "bookingList.empty.noData.description":
    "This looks like a new tenant workspace. Create the first booking or wait for upstream import to populate the ledger.",
  "bookingList.error.unknown": "Unknown booking error.",
  "bookingList.window.to": "to {value}",
  "bookingList.pill.age": "Age {value}",
  "bookingList.pill.updated": "Updated {value}",
  "bookingList.pill.editable": "Editable {value}",
  "bookingList.pill.approval": "approval {state}",
  "bookingList.tab.all": "All",
  "bookingList.tab.live": "In progress",
  "bookingList.tab.reserve": "Reserved",
  "bookingList.tab.approval": "Pending approval",
  "bookingList.tab.done": "Completed",
  "bookingList.tab.cancel": "Cancelled",
  "bookingList.column.booking": "Booking",
  "bookingList.column.type": "Type",
  "bookingList.column.route": "Pickup -> drop-off",
  "bookingList.column.window": "Window",
  "bookingList.column.passenger": "Passenger",
  "bookingList.column.status": "Status",
  "bookingList.header.title": "Bookings",
  "bookingList.header.subtitle":
    "All bookings this month · in-progress and completed included",
  "bookingList.header.filter": "Filter",
  "bookingList.header.export": "Export",
  "bookingList.header.exportDisabled": "Export is not available yet",
  "bookingList.banner.degraded": "Tenant booking snapshot is degraded",
  "bookingList.filter.title": "Filters",
  "bookingList.filter.subtitle":
    "Search by booking, order, or passenger, then narrow by status, service bucket, and reservation date range.",
  "bookingList.filter.search": "Search",
  "bookingList.filter.searchPlaceholder": "Booking, order, passenger",
  "bookingList.filter.serviceBucket": "Service bucket",
  "bookingList.filter.allBuckets": "All buckets",
  "bookingList.filter.from": "From",
  "bookingList.filter.to": "To",
  "bookingList.filter.pageSize": "Page size",
  "bookingList.filter.apply": "Apply filters",
  "bookingList.filter.reset": "Reset",
  "bookingList.table.title": "Bookings · {shown} shown / {total} matched",
  "bookingList.table.subtitle":
    "Page {page} of {totalPages} · snapshot {snapshot}",
  "bookingList.footer.apiPage":
    "API page {page} · snapshot size {pageSize} · total {total}",
  "bookingList.pagination.previous": "Previous page",
  "bookingList.pagination.next": "Next page",

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
  "bookingDetail.hero.eyebrow": "Booking detail",
  "bookingDetail.hero.unavailableTitle": "{bookingId} unavailable",
  "bookingDetail.hero.unavailableDescription":
    "This tenant detail route implements the shared EmptyReason states so each empty, missing, or unavailable case stays explicit.",
  "bookingDetail.hero.description":
    "The booking detail follows the Tenant Console canvas: editability, approval state, driver assignment, audit subset, refresh tier, and action descriptors stay together on one tenant-owned screen.",
  "bookingDetail.loading.title": "Loading tenant booking detail",
  "bookingDetail.loading.description":
    "The detail route is hydrating the T5 tenant snapshot, action descriptors, and audit content.",
  "bookingDetail.loading.refreshTitle": "Preparing booking detail",
  "bookingDetail.loading.refreshDescription":
    "Loading the current booking snapshot and refresh metadata.",
  "bookingDetail.loading.statusTitle": "Resolving editability",
  "bookingDetail.loading.statusDescription":
    "Fetching availableActions, editableUntil, and approval state before the screen becomes interactive.",
  "bookingDetail.empty.noData.title": "No booking data exists yet",
  "bookingDetail.empty.noData.body":
    "This tenant has booking access, but no booking record exists in the current workspace snapshot.",
  "bookingDetail.empty.noData.cta": "Create a booking",
  "bookingDetail.empty.notProvisioned.title":
    "Booking module is not provisioned",
  "bookingDetail.empty.notProvisioned.body":
    "Tenant setup is incomplete, so booking detail cannot be hydrated until provisioning finishes.",
  "bookingDetail.empty.notProvisioned.cta": "Open settings",
  "bookingDetail.empty.fetchFailed.title":
    "The booking snapshot could not be loaded",
  "bookingDetail.empty.fetchFailed.body":
    "The backend request failed before a usable read model was returned. Retry or inspect the audit lane for the last successful mutation.",
  "bookingDetail.empty.fetchFailed.cta": "Back to bookings",
  "bookingDetail.empty.permissionDenied.title":
    "This actor cannot read the booking detail",
  "bookingDetail.empty.permissionDenied.body":
    "The booking exists, but the current tenant actor does not have read scope for this record.",
  "bookingDetail.empty.permissionDenied.cta": "Back to bookings",
  "bookingDetail.empty.externalUnavailable.title":
    "The linked external system is unavailable",
  "bookingDetail.empty.externalUnavailable.body":
    "Tenant truth is still readable, but one or more external dispatch details cannot be refreshed right now.",
  "bookingDetail.empty.externalUnavailable.cta": "Open audit",
  "bookingDetail.empty.filteredEmpty.title":
    "This deep link no longer matches the current filters",
  "bookingDetail.empty.filteredEmpty.body":
    "The booking detail route is valid, but the surrounding filtered context no longer contains the record you expected.",
  "bookingDetail.empty.filteredEmpty.cta": "Reset booking filters",
  "bookingDetail.empty.driverNotEligible.title":
    "The assigned driver is no longer eligible",
  "bookingDetail.empty.driverNotEligible.body":
    "The booking still exists, but the current driver eligibility state prevents showing a complete live assignment snapshot.",
  "bookingDetail.empty.driverNotEligible.cta": "Open audit",
  "bookingDetail.empty.restoreLive": "Restore live detail",
  "bookingDetail.empty.reason": "EmptyReason",
  "bookingDetail.command.acceptedTitle":
    "Command accepted · awaiting external confirmation · {actionId}",
  "bookingDetail.command.acceptedHelp":
    "Audit link {auditId} is already assigned. Keep this detail open or refresh after the next T5 cycle if the status has not advanced.",
  "bookingDetail.command.defaultMessage":
    "The tenant command was accepted and is waiting on external dispatch confirmation.",
  "bookingDetail.refresh.kicker": "Refresh tier",
  "bookingDetail.refresh.title": "Tenant booking detail updates on T5",
  "bookingDetail.refresh.description":
    "This is a tenant-slow detail screen: automatic updates are intentionally slower, manual review remains available, and stale state must be explicit.",
  "bookingDetail.refresh.t5": "T5 slow",
  "bookingDetail.refresh.fresh": "fresh snapshot",
  "bookingDetail.refresh.generatedAt": "Generated at",
  "bookingDetail.refresh.lastBookingUpdate": "Last booking update",
  "bookingDetail.refresh.source": "Source",
  "bookingDetail.refresh.manual": "Manual refresh",
  "bookingDetail.refresh.sourceLive": "live tenant API",
  "bookingDetail.refresh.manualHelp":
    "Browser refresh, notification reopen, or command receipt refresh",
  "bookingDetail.status.kicker": "Status",
  "bookingDetail.status.title": "Editability and approval posture",
  "bookingDetail.status.description":
    "Per Q-TEN05, editability is determined by action descriptors plus editableUntil, not guessed from the status label alone.",
  "bookingDetail.status.editable": "Editable",
  "bookingDetail.status.readOnly": "Read only",
  "bookingDetail.status.bookingStatus": "Booking {status}",
  "bookingDetail.status.approvalPendingTitle": "Approval required",
  "bookingDetail.status.approvalPendingHelp":
    "This booking should not be treated as editable just because it is not terminal. Wait for approval or use the rules lane.",
  "bookingDetail.trip.workflowAria": "Booking workflow status",
  "bookingDetail.trip.kicker": "Trip context",
  "bookingDetail.field.bookingId": "Booking ID",
  "bookingDetail.field.orderId": "Order ID",
  "bookingDetail.field.passenger": "Passenger",
  "bookingDetail.field.phone": "Phone",
  "bookingDetail.field.pickup": "Pickup",
  "bookingDetail.field.dropoff": "Drop-off",
  "bookingDetail.field.windowStart": "Window start",
  "bookingDetail.field.windowEnd": "Window end",
  "bookingDetail.field.bookedBy": "Booked by",
  "bookingDetail.field.onsiteContact": "Onsite contact",
  "bookingDetail.field.costCenter": "Cost center",
  "bookingDetail.field.vehiclePreference": "Vehicle preference",
  "bookingDetail.field.flightTerminal": "Flight / terminal",
  "bookingDetail.field.notes": "Notes",
  "bookingDetail.field.quoteFare": "Quoted fare",
  "bookingDetail.field.fareSource": "Fare source",
  "bookingDetail.field.pricingVersion": "Pricing version",
  "bookingDetail.field.manualOverride": "Manual override",
  "bookingDetail.field.approval": "Approval",
  "bookingDetail.field.benefitReference": "Benefit reference",
  "bookingDetail.field.assignmentStatus": "Assignment status",
  "bookingDetail.field.eta": "ETA",
  "bookingDetail.field.orderStatus": "Order status",
  "bookingDetail.field.escalation": "Escalation",
  "bookingDetail.field.commandReceipt": "Command receipt",
  "bookingDetail.value.tenantIntake": "Tenant intake",
  "bookingDetail.value.notPublished": "Not published",
  "bookingDetail.value.noFlight": "No flight",
  "bookingDetail.value.noTerminal": "No terminal",
  "bookingDetail.value.noNotes": "No notes",
  "bookingDetail.value.none": "None",
  "bookingDetail.value.pendingTimestamp": "Pending timestamp",
  "bookingDetail.value.activeAssignment": "Active driver assignment",
  "bookingDetail.value.noActiveAssignment": "No active assignment published",
  "bookingDetail.value.liveEtaPending":
    "Live ETA pending from dispatch read model",
  "bookingDetail.value.notActive": "Not active",
  "bookingDetail.value.opsDeepLinkAvailable": "Ops console deep link available",
  "bookingDetail.value.tenantOwner":
    "Tenant detail remains the primary owner view",
  "bookingDetail.value.noPendingReceipt": "No pending receipt",
  "bookingDetail.link.openPassenger": "Open passenger directory reference",
  "bookingDetail.link.openPickup": "Open pickup address reference",
  "bookingDetail.link.openDropoff": "Open drop-off address reference",
  "bookingDetail.link.openCostCenter": "Open cost center governance",
  "bookingDetail.link.returnContext": "Return to booking list context",
  "bookingDetail.lifecycle.kicker": "Lifecycle",
  "bookingDetail.finance.kicker": "Finance",
  "bookingDetail.assignment.kicker": "Assignment",
  "bookingDetail.assignment.title": "Driver / vehicle assignment",
  "bookingDetail.assignment.description":
    "When dispatch has attached a fulfillment leg, tenant users can see assignment posture without receiving dispatch control.",
  "bookingDetail.actions.kicker": "Actions",
  "bookingDetail.actions.title": "Available actions",
  "bookingDetail.actions.description":
    "The command panel renders enabled, disabled, and hidden states from this booking's action descriptors.",
  "bookingDetail.deepLinks.kicker": "Deep links",
  "bookingDetail.deepLinks.auditSubsetLabel": "View audit subset",
  "bookingDetail.deepLinks.auditReceiptNote":
    "Open the action receipt audit trail directly when a command has already been accepted.",
  "bookingDetail.deepLinks.auditRealmNote":
    "Tenant audit includes actor realm chips for tenant, ops, platform, and system actions.",
  "bookingDetail.deepLinks.rulesLabel": "Open approval rules",
  "bookingDetail.deepLinks.rulesNote":
    "Use the tenant rules lane to inspect the approval logic that currently applies to this booking.",
  "bookingDetail.deepLinks.opsLabel": "Open ops console detail",
  "bookingDetail.deepLinks.opsNote":
    "Forwarded-authority bookings escalate to the ops app in a new tab when dispatch recovery is needed.",
  "bookingDetail.deepLinks.crossAppNote":
    "Cross-app routes open in a new tab when authority belongs to ops or another deployment.",
  "bookingDetail.boundary.title": "Permission boundary",
  "bookingDetail.event.created": "Booking created",
  "bookingDetail.event.createdDetail": "Reservation window {start} to {end}.",
  "bookingDetail.event.approval": "Approval workflow",
  "bookingDetail.event.approvalDetail":
    "Approval state is {state}. Related request count: {count}.",
  "bookingDetail.event.driverAssigned": "Driver assignment active",
  "bookingDetail.event.driverAssignedDetail":
    "The booking is currently attached to an active fulfillment leg. Live ETA is not published by the current read model.",
  "bookingDetail.event.cancelled": "Booking cancelled",
  "bookingDetail.event.cancelledDetail":
    "Tenant cancellation completed. Audit retains the reason and actor attribution.",
  "bookingDetail.event.completed": "Trip completed",
  "bookingDetail.event.completedDetail":
    "Fulfillment completed. Billing and audit remain accessible from tenant-owned routes.",
  "bookingDetail.event.snapshotUpdated": "Workflow snapshot updated",
  "bookingDetail.event.snapshotUpdatedDetail":
    "Current order status is {status}.",
  "bookingDetail.readOnly.pastEditableUntil":
    "The tenant edit window has closed, so this detail is read-only for update commands.",
  "bookingDetail.readOnly.bookingTerminal":
    "The trip has ended. Tenant users can view content and audit, but cannot change the booking.",
  "bookingDetail.readOnly.onTripLocked":
    "The driver workflow is already active. Follow-up should use cancellation policy or ops escalation instead of live editing.",
  "bookingDetail.readOnly.approvalPending":
    "This booking must wait for approval before the next update command can be accepted.",
  "bookingDetail.readOnly.default":
    "This booking currently has no tenant update command available.",
  "bookingDetail.editWindow.noDeadlineEditable":
    "The backend currently exposes no edit deadline for this booking.",
  "bookingDetail.editWindow.noDeadlineReadOnly":
    "The booking is read-only even though no edit deadline was published.",
  "bookingDetail.editWindow.open":
    "The tenant edit window remains open until {time}{relative}.",
  "bookingDetail.editWindow.closed":
    "The tenant edit window closed at {time}{relative}.",
  "bookingDetail.approval.notRequired":
    "This booking currently has no active approval gate.",
  "bookingDetail.approval.pending":
    "Approval is required before dispatch continues.",
  "bookingDetail.approval.approved":
    "The approval gate passed and the booking can continue.",
  "bookingDetail.approval.rejected":
    "Approval was rejected. Review rules before resubmitting.",
  "bookingDetail.approval.blocked":
    "A policy block currently prevents the booking from proceeding.",
  "bookingDetail.approval.cancelledByReevaluation":
    "A prior approval request was invalidated by a later booking change.",
  "bookingDetail.source.forwarded.badge": "Forwarded authority",
  "bookingDetail.source.forwarded.detail":
    "This booking is mirrored from an external-platform authority lane. Tenant-visible status remains readable here without exposing driver assignment or adapter internals.",
  "bookingDetail.source.forwarded.boundary":
    "Tenant routes show the canonical booking and order record only. Adapter-native states remain on the ops and driver authority lanes.",
  "bookingDetail.source.external.badge": "Externally fulfilled",
  "bookingDetail.source.external.detail":
    "This booking uses a partner or external fulfillment path. Tenant-facing status stays visible here without exposing adapter internals.",
  "bookingDetail.source.external.boundary":
    "Tenant routes keep the canonical booking record visible, while partner-side routing, sponsorship, and dispatch coordination stay outside this surface.",
  "bookingDetail.source.owned.badge": "DRTS operated",
  "bookingDetail.source.owned.detail":
    "This booking stays on the DRTS-operated dispatch path for routing, execution, and customer updates.",
  "bookingDetail.source.owned.boundary":
    "Tenant routes and DRTS operations share the same owned booking lifecycle, so published status changes can be acted on through tenant-safe commands when policy allows.",

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
  "newBooking.validation.reservationWindowStartRequired":
    "Reservation window start is required.",
  "newBooking.validation.reservationWindowEndRequired":
    "Reservation window end is required.",
  "newBooking.validation.passengerNameRequired": "Passenger name is required.",
  "newBooking.validation.passengerPhoneRequired":
    "Passenger phone is required.",
  "newBooking.validation.pickupAddressRequired": "Pickup address is required.",
  "newBooking.validation.dropoffAddressRequired":
    "Drop-off address is required.",
  "newBooking.validation.costCenterRequired": "Cost center is required.",
  "newBooking.validation.reservationWindowInvalid":
    "Reservation window start and end must be valid date-time values.",
  "newBooking.validation.reservationWindowOrder":
    "Reservation window end must be after the reservation window start.",
  "newBooking.validation.flightNoRequired":
    "Flight number is required for airport pickup bookings.",
  "newBooking.validation.bookedByPairRequired":
    "Provide both booked-by name and email, or leave both blank.",
  "newBooking.validation.onsiteContactPairRequired":
    "Provide both onsite contact name and phone, or leave both blank.",
  "newBooking.validation.estimatedAmountInvalid":
    "Estimated spend must be a valid non-negative amount.",
  "newBooking.validation.luggageCountInvalid":
    "Luggage count must be a whole number of 0 or more.",
  "newBooking.validation.pickupLatInvalid":
    "Pickup latitude must be a valid number when provided.",
  "newBooking.validation.pickupLngInvalid":
    "Pickup longitude must be a valid number when provided.",
  "newBooking.validation.dropoffLatInvalid":
    "Drop-off latitude must be a valid number when provided.",
  "newBooking.validation.dropoffLngInvalid":
    "Drop-off longitude must be a valid number when provided.",
  "newBooking.action.unavailable": "Currently unavailable",
  "newBooking.action.refreshNow": "Refresh now",
  "newBooking.action.clearShortcuts": "Clear shortcut context",
  "newBooking.action.openCostCenters": "Open cost centers",
  "newBooking.action.openPassengers": "Open passengers",
  "newBooking.action.backBookings": "Back to bookings",
  "newBooking.action.backList": "Back to booking list",
  "newBooking.action.refresh": "Refresh",
  "newBooking.action.reloading": "Reloading...",
  "newBooking.action.cancel": "Cancel",
  "newBooking.action.submitCommand": "Submit command",
  "newBooking.action.noDraft": "No draft action",
  "newBooking.option.manualPassenger": "Manual passenger",
  "newBooking.option.manualPickup": "Manual pickup",
  "newBooking.option.manualDropoff": "Manual drop-off",
  "newBooking.option.notSet": "Not set",
  "newBooking.option.pickup": "Pickup",
  "newBooking.option.dropoff": "Drop-off",
  "newBooking.option.scheduled": "Scheduled",
  "newBooking.option.immediate": "Immediate",
  "newBooking.option.selectCostCenter": "Select cost center",
  "newBooking.format.currencyMissing": "Not provided",
  "newBooking.format.percentMissing": "N/A",
  "newBooking.format.datetimeUnknown": "Unknown",
  "newBooking.format.ageUnknown": "Time unknown",
  "newBooking.format.justNow": "just now",
  "newBooking.format.secondsAgo": "{count}s ago",
  "newBooking.format.minutesAgo": "{count}m ago",
  "newBooking.format.hoursAgo": "{count}h ago",
  "newBooking.direction.pickup": "Pickup",
  "newBooking.direction.dropoff": "Drop-off",
  "newBooking.direction.unset": "Not set",
  "newBooking.decision.allow": "Allowed",
  "newBooking.decision.requireApproval": "Approval required",
  "newBooking.decision.block": "Blocked",
  "newBooking.decision.warn": "Warning",
  "newBooking.decision.manualReview": "Manual review",
  "newBooking.impact.tenant": "Tenant",
  "newBooking.impact.costCenter": "Cost center",
  "newBooking.impact.costCenterCode": "Cost center {code}",
  "newBooking.refreshTier.manual": "Manual",
  "newBooking.refreshTier.urgent": "Urgent",
  "newBooking.refreshTier.fast": "Fast",
  "newBooking.refreshTier.dispatch": "Dispatch",
  "newBooking.refreshTier.medium": "Medium",
  "newBooking.refreshTier.mediumSlow": "Medium-slow",
  "newBooking.refreshTier.slow": "Slow",
  "newBooking.error.policyPreviewUnknown": "Unknown policy preview error.",
  "newBooking.error.policyPreviewHttp":
    "Policy preview failed (HTTP {status}).",
  "newBooking.error.submitBlocked":
    "This booking is currently blocked by tenant approval or quota policy.",
  "newBooking.error.createHttp": "Booking creation failed (HTTP {status}).",
  "newBooking.error.createUnknown": "Unknown booking creation error.",
  "newBooking.error.unknown": "Unknown error",
  "newBooking.header.title": "Create booking",
  "newBooking.header.subtitle":
    "Booked by self or proxy · scheduled / immediate · synchronized command mode (Q-TEN04)",
  "newBooking.meta.command": "Command",
  "newBooking.meta.updateTier": "Refresh tier",
  "newBooking.meta.directoryCoverage": "Directory coverage",
  "newBooking.meta.requiredActions": "Required actions",
  "newBooking.meta.passengers": "Passengers {count}",
  "newBooking.meta.addresses": "Addresses {count}",
  "newBooking.meta.costCenters": "Cost centers {count}",
  "newBooking.meta.noDraft": "Drafts not supported yet",
  "newBooking.prefill.source": "Shortcut prefill from tenant directory",
  "newBooking.prefill.passenger": "Passenger · {name}",
  "newBooking.prefill.pickup": "Pickup · {name}",
  "newBooking.prefill.dropoff": "Drop-off · {name}",
  "newBooking.prefill.appliedTitle": "Directory shortcut prefill applied",
  "newBooking.health.degradedTitle":
    "Some booking creation dependencies are degraded",
  "newBooking.freshness.degradedTitle": "Directory snapshot is degraded",
  "newBooking.freshness.staleTitle": "Directory snapshot needs refresh",
  "newBooking.freshness.body":
    "Snapshot created {age} · {timestamp} · refresh tier {tier}",
  "newBooking.info.estimateTitle": "Estimate is preview-only",
  "newBooking.info.estimateBody":
    "Fare, quota impact, and approval posture can be previewed here, but standard pricing remains backend-owned.",
  "newBooking.card.trip.title": "Trip",
  "newBooking.card.trip.subtitle":
    "Service type, passenger, reservation window, and address-book shortcuts stay in one form.",
  "newBooking.card.pickupDropoff.title": "Pickup / drop-off",
  "newBooking.card.pickupDropoff.subtitle":
    "Start from the address book, then adjust directly when needed without opening another geocoding flow.",
  "newBooking.card.approval.title": "References and approval",
  "newBooking.card.approval.subtitle":
    "Cost center, finance fields, and proxy metadata travel with the command.",
  "newBooking.card.directory.title": "Directory content",
  "newBooking.card.directory.subtitle":
    "These are the in-app entry / exit points required by the handoff packet.",
  "newBooking.card.policy.title": "Policy evaluation",
  "newBooking.card.policy.subtitle":
    "Approval posture and quota impact come directly from the backend preview.",
  "newBooking.card.quota.title": "Quota impact",
  "newBooking.card.quota.subtitle":
    "Keep backend preview vocabulary instead of replacing it with local estimates.",
  "newBooking.card.submit.title": "Submit command",
  "newBooking.card.submit.subtitle":
    "Blocked outcomes stop at the client; approval-required bookings can still submit, with workflow owned by the backend.",
  "newBooking.field.serviceSubtype": "Service subtype",
  "newBooking.field.timingMode": "Timing mode",
  "newBooking.field.reservationStart": "Reservation start",
  "newBooking.field.reservationEnd": "Reservation end",
  "newBooking.field.passenger": "Passenger",
  "newBooking.field.passengerName": "Passenger name",
  "newBooking.field.passengerPhone": "Passenger phone",
  "newBooking.field.savedPickup": "Saved pickup",
  "newBooking.field.savedDropoff": "Saved drop-off",
  "newBooking.field.pickupAddress": "Pickup address",
  "newBooking.field.dropoffAddress": "Drop-off address",
  "newBooking.field.pickupLat": "Pickup latitude",
  "newBooking.field.pickupLng": "Pickup longitude",
  "newBooking.field.dropoffLat": "Drop-off latitude",
  "newBooking.field.dropoffLng": "Drop-off longitude",
  "newBooking.field.estimatedSpend": "Estimated spend ({currency})",
  "newBooking.field.notes": "Notes",
  "newBooking.hint.passengerSelect":
    "Choose a directory passenger for proxy booking, or keep manual entry.",
  "newBooking.hint.phoneFromDirectory":
    "Passenger phone comes from the selected directory record.",
  "newBooking.hint.phoneMissing":
    "This passenger record has no phone, so fill it in here.",
  "newBooking.hint.phoneManual":
    "Manual passenger entry needs a direct contact phone.",
  "newBooking.check.signoffRequired": "Signoff required",
  "newBooking.check.expenseProofRequired": "Expense proof required",
  "newBooking.kpi.directoryBacked": "Directory-backed",
  "newBooking.kpi.savedPickupDropoff": "Saved pickup/drop-off",
  "newBooking.kpi.canonicalSelector": "Canonical selector",
  "newBooking.empty.noData.title": "No creation shortcuts are available",
  "newBooking.empty.noData.body":
    "The passenger and address directories have no usable data yet. Complete the tenant directories first, then return to create a booking.",
  "newBooking.empty.notProvisioned.title": "Cost centers are not provisioned",
  "newBooking.empty.notProvisioned.body":
    "This route requires the standard cost-center directory before booking creation commands can be submitted.",
  "newBooking.empty.fetchFailed.title":
    "Required booking creation data failed to load",
  "newBooking.empty.fetchFailed.body":
    "At least one required directory source failed. Refresh first, then submit once the data recovers.",
  "newBooking.empty.permissionDenied.title":
    "This actor cannot create bookings",
  "newBooking.empty.permissionDenied.body":
    "The backend denied booking creation for the current actor. Confirm permissions with the tenant administrator.",
  "newBooking.empty.externalUnavailable.title":
    "An external dependency is temporarily unavailable",
  "newBooking.empty.externalUnavailable.body":
    "A required upstream service for booking commands is unhealthy. Retry after the dependency recovers.",
  "newBooking.empty.filteredEmpty.title": "The prefill shortcut is stale",
  "newBooking.empty.filteredEmpty.body":
    "The passenger or address prefill link has expired. Clear shortcut context and start again from a clean form.",
  "newBooking.empty.driverNotEligible.title":
    "Driver eligibility does not apply here",
  "newBooking.empty.driverNotEligible.body":
    "Tenant booking creation does not use driver eligibility state.",
  "newBooking.empty.reason": "EmptyReason",
  "newBooking.empty.messageCode": "messageCode: {code}",
  "newBooking.banner.passengerEmptyTitle": "Passenger directory is empty",
  "newBooking.banner.passengerEmptyBody":
    "Manual passenger entry still works, but `/passengers` is the shortcut entry required by the packet.",
  "newBooking.banner.addressEmptyTitle": "Address book is empty",
  "newBooking.banner.addressEmptyBody":
    "Manual address entry still works, but `/addresses` is the standard shortcut source for this route.",
  "newBooking.policy.refreshing": "Refreshing",
  "newBooking.policy.autoPreview": "Auto preview",
  "newBooking.policy.service": "Service",
  "newBooking.policy.direction": "Direction",
  "newBooking.policy.passengerRole": "Passenger role",
  "newBooking.policy.estimatedSpend": "Estimated spend",
  "newBooking.policy.notPublished": "Not published",
  "newBooking.policy.failedTitle": "Policy preview failed",
  "newBooking.policy.mode": "Mode: {value}",
  "newBooking.policy.timeout": "Timeout: {value}h",
  "newBooking.policy.fallback": "Fallback: {value}",
  "newBooking.policy.approver": "Approver {index}",
  "newBooking.quota.period": "Period: {value}",
  "newBooking.quota.trigger": "Trigger: {value}",
  "newBooking.quota.value": "Before {before} / {limit} · after {after}",
  "newBooking.quota.hint": "{dimension} · {percent} remaining · {triggered}",
  "newBooking.quota.waitingTitle":
    "Preview is waiting for complete booking context",
  "newBooking.quota.waitingBody":
    "Select a cost center and complete the core fields before quota impact can be calculated.",
  "newBooking.submit.openingDetail": "Opening detail...",
  "newBooking.submit.resource": "Resource: {type} · {id}",
  "newBooking.submit.viewAudit": "View audit trail",
  "newBooking.submit.failedTitle": "Booking creation failed",
  "newBooking.submit.fixHighlightedTitle": "Fix the highlighted fields first",
  "newBooking.submit.submitting": "Submitting...",
  "newBooking.submit.forApproval": "Submit for approval",
  "newBooking.submit.create": "Create booking",

  "refreshControl.fresh": "Fresh snapshot",
  "refreshControl.stale": "Stale snapshot",
  "refreshControl.degraded": "Degraded data",
  "refreshControl.unknown": "Unknown freshness",
  "refreshControl.refreshing": "Refreshing",
  "refreshControl.refresh": "Refresh",

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

  // ── settings (i18n-fullsweep 20260614) ──

  // ── webhooks (i18n-fullsweep 20260614) ──

  // ── apiKeys (i18n-fullsweep 20260614) ──

  // ── costCenters (i18n-fullsweep 20260614) ──

  // ── reports (i18n-fullsweep 20260614) ──
  "reports.title": "Reports",
  "reports.subtitle":
    "Monthly usage · Cost-center split · SLA summary · Short-lived signed files",
  "reports.action.refresh": "Refresh",
  "reports.action.createJob": "Create job",
  "reports.type.trip_summary": "Trip summary",
  "reports.type.monthly_trip_report": "Monthly usage",
  "reports.type.revenue_summary": "Cost-center split",
  "reports.type.incident_register": "Incident register",
  "reports.type.operational_overview": "Operations overview",
  "reports.status.all": "All statuses",
  "reports.status.queued": "Queued",
  "reports.status.running": "Running",
  "reports.status.completed": "Completed",
  "reports.status.failed": "Failed",
  "reports.status.expired": "Expired",
  "reports.param.period": "Period {value}",
  "reports.param.costCenter": "Cost center {value}",
  "reports.param.passenger": "Passenger {value}",
  "reports.param.tenant": "Tenant {value}",
  "reports.param.defaultScope": "Default tenant scope",
  "reports.empty.not_provisioned.title":
    "Reporting is not provisioned for this tenant",
  "reports.empty.not_provisioned.description":
    "The route can open, but the backend has not yet provisioned reporting for this tenant. Use the cross-app governance links to confirm entitlements, file signing, and report readiness.",
  "reports.empty.fetch_failed.title": "Unable to load report jobs",
  "reports.empty.fetch_failed.description":
    "The page frame is available, but the report job list failed to load. Refresh once the dependent service recovers.",
  "reports.empty.permission_denied.title":
    "This identity cannot operate tenant reports",
  "reports.empty.permission_denied.description":
    "Reports stay in navigation, but the current identity is not permitted to list or create report jobs for this tenant.",
  "reports.empty.external_unavailable.title":
    "Report dependency is temporarily unavailable",
  "reports.empty.external_unavailable.description":
    "The backend reporting service is currently degraded. Wait for the dependency to recover, then manually refresh the job list.",
  "reports.empty.filtered_empty.title": "No jobs match the current filters",
  "reports.empty.filtered_empty.description":
    "This tenant has report history, but the current type, status, or period filter found no match. Clear the filters to see the full queue.",
  "reports.empty.no_data.title": "No report jobs created yet",
  "reports.empty.no_data.description":
    "You can create the first tenant report job from this page. The backend owns the job lifecycle and provides a short-lived signed download URL once the file is ready.",
  "reports.artifact.signed": "Signed file",
  "reports.artifact.expired": "File expired",
  "reports.artifact.notReady": "Not ready",
  "reports.statusReason.failed":
    "The backend recorded this job as failed; you can rerun it with the same parameters.",
  "reports.statusReason.expired":
    "The signed URL has expired; create a new job to produce a fresh file.",
  "reports.crossApp.opsReporting":
    "Open ops-console reporting to trace filing / revenue",
  "reports.crossApp.platformAudit":
    "Open platform-admin audit to govern produced files",
  "reports.flash.actionFailed.title": "Report action failed",
  "reports.flash.unknownError": "Unknown reporting error.",
  "reports.flash.refreshSent.title": "Report list refresh submitted",
  "reports.flash.refreshSent.description":
    "This route is a T6 manual update; the page reloads the latest report job snapshot.",
  "reports.flash.jobQueued.title": "Report job queued",
  "reports.flash.jobQueued.description":
    "Job {jobId} has been accepted. Refresh or wait for the backend to produce the signed file.",
  "reports.flash.rerunQueued.title": "Failed report re-queued",
  "reports.flash.rerunQueued.description":
    "Replacement job {jobId} was accepted with the original type and scope.",
  "reports.confirm.rerun": "Rerun report job {jobId} with the same parameters?",
  "reports.col.job": "Job",
  "reports.col.type": "Type",
  "reports.col.parameters": "Parameters",
  "reports.col.status": "Status",
  "reports.col.created": "Created",
  "reports.col.completed": "Completed",
  "reports.col.format": "Format",
  "reports.col.expires": "Expires",
  "reports.col.file": "File",
  "reports.col.actions": "Actions",
  "reports.rowAction.download": "Download",
  "reports.rowAction.rerun": "Rerun",
  "reports.errorsBanner.title": "Report data could not be fully loaded",
  "reports.errorsBanner.body":
    "The route is still usable, but one or more report data sources failed.",
  "reports.errorsBanner.count": "{count} issues",
  "reports.t6.title": "Update tier T6: manual",
  "reports.t6.body":
    "This route does not auto-poll. Snapshot loaded at {time}; update tier stays {tier}.",
  "reports.tier.manual": "manual",
  "reports.crossAppBanner.title": "Cross-app report tracing stays explicit",
  "reports.crossAppBanner.body":
    "Tenant reports can connect to operational reporting or platform governance; per Q-X03, cross-app deep links open in a new tab.",
  "reports.crossAppBanner.openOps": "Open Ops reporting",
  "reports.crossAppBanner.openPlatformAudit": "Open platform audit",
  "reports.crossAppBanner.tenantAudit": "Tenant audit",
  "reports.kpi.jobs": "Jobs",
  "reports.kpi.jobsSub": "Report job history",
  "reports.kpi.active": "Queued / running",
  "reports.kpi.activeSub": "Backend is producing files",
  "reports.kpi.ready": "Ready",
  "reports.kpi.readySub": "Signed download still valid",
  "reports.kpi.failedExpired": "Failed / expired",
  "reports.kpi.failedExpiredSub": "Needs rerun or regeneration",
  "reports.queue.title": "Report queue",
  "reports.queue.subtitle":
    "Type, status, period, file TTL, and manual retry all follow the contract.",
  "reports.filter.type": "Type filter",
  "reports.filter.status": "Status filter",
  "reports.filter.period": "Period filter",
  "reports.filter.periodHint": "Matches the period embedded in job parameters.",
  "reports.filter.allTypes": "All types",
  "reports.filter.clear": "Clear filters",
  "reports.create.title": "Create report job",
  "reports.create.subtitle":
    "Type, period, and scope parameters are sent straight to the backend queue.",
  "reports.create.jobType": "Job type",
  "reports.create.format": "Format",
  "reports.create.period": "Period",
  "reports.create.periodHint": "Monthly reports usually use YYYY-MM.",
  "reports.create.costCenter": "Cost center",
  "reports.create.costCenterHint":
    "Optional scope refinement, e.g. CC-FIN-001.",
  "reports.create.passenger": "Passenger",
  "reports.create.passengerHint":
    "Optional passenger drill-down for scoped export.",
  "reports.create.submit": "Queue report",
  "reports.create.submitting": "Submitting...",
  "reports.create.refreshList": "Refresh list",
  "reports.override.title": "Status overrides",
  "reports.override.subtitle":
    "Manual QA shortcuts for the six shared EmptyReason variants.",
  "reports.override.liveData": "Live data",
  "reports.deepLinks.title": "Cross-app deep links",
  "reports.deepLinks.subtitle":
    "Reports can route to file download, tenant audit, or external operational follow-up.",
  "reports.deepLinks.auditReceipt":
    "View the audit receipt for tenant-side report actions",
  "reports.deepLinks.open": "Open",

  // ── rules (i18n-fullsweep 20260614) ──

  // ── sla (i18n-fullsweep 20260614) ──

  // ── audit (i18n-fullsweep 20260614) ──

  // ── invoices (i18n-fullsweep 20260614) ──

  "invoices.title": "Invoices",
  "invoices.subtitle":
    "Invoice history, filters, and backend-published actions",
  "invoices.pageLead":
    "Status and CTAs come from the backend read model. This screen only renders availableActions, EmptyReason, refresh tier, and cross-app deep links without inventing role permissions in the client.",
  "invoices.meta.source": "source {value}",
  "invoices.meta.sourceLive": "live",
  "invoices.meta.sourceCache": "cache",
  "invoices.meta.sourceSandbox": "sandbox",
  "invoices.meta.sourceStatic": "static",
  "invoices.meta.sourceUnknown": "unknown",
  "invoices.meta.visible": "{count} visible",
  "invoices.meta.total": "{count} total",
  "invoices.meta.overdue": "{count} overdue",
  "invoices.meta.expiredArtifacts": "{count} expired artifacts",
  "invoices.summary.visible.label": "Visible invoices",
  "invoices.summary.visible.caption":
    "Current register slice after status, period, and id filters",
  "invoices.summary.overdue.label": "Overdue",
  "invoices.summary.overdue.caption":
    "Urgent states remain distinct from regular issued invoices",
  "invoices.summary.expired.label": "Expired artifacts",
  "invoices.summary.expired.caption":
    "Signed download links may expire while invoice metadata remains",
  "invoices.summary.amount.label": "Visible amount",
  "invoices.summary.amount.caption":
    "Finance users can validate the current slice before opening detail",
  "invoices.error.unknown": "Unknown tenant invoice error.",
  "invoices.error.requestFailed": "Request failed.",
  "invoices.error.billingProfile": "Billing profile: {message}",
  "invoices.error.register": "Invoice register: {message}",
  "invoices.error.degradedTitle": "Invoice read model is degraded",
  "invoices.refresh.staleAfterSeconds": "{count}s",
  "invoices.refresh.staleAfterMinutes": "{count}m",
  "invoices.refresh.staleAfterSuffix": " · stale after {value}",
  "invoices.refresh.badge":
    "{packetTier} · {runtimeTier} · {cadenceLabel}{staleAfter}",
  "invoices.refresh.state.fresh": "Fresh",
  "invoices.refresh.state.stale": "Stale",
  "invoices.refresh.state.degraded": "Degraded",
  "invoices.refresh.state.unknown": "Unknown",
  "invoices.banner.freshnessTitle": "Snapshot freshness warning",
  "invoices.banner.freshnessBody":
    "The current content was generated at {generatedAt}. The refresh tier is {packetTier} / {runtimeTier}{staleAfter}. When data is not fresh, the page must state that clearly instead of pretending it is real time.",
  "invoices.section.list": "Invoice register",
  "invoices.section.listSub":
    "Status, period, and invoice id filters keep overdue and artifact-expired states visible",
  "invoices.filter.search": "Search by invoice id",
  "invoices.filter.searchPlaceholder": "inv_2026_05_001",
  "invoices.filter.status": "Status",
  "invoices.filter.period": "Period",
  "invoices.filter.allPeriods": "All periods",
  "invoices.filter.apply": "Apply filters",
  "invoices.filter.clear": "Clear",
  "invoices.table.invoice": "Invoice",
  "invoices.table.period": "Period",
  "invoices.table.amount": "Amount",
  "invoices.table.status": "Status",
  "invoices.table.due": "Due",
  "invoices.table.issued": "Issued",
  "invoices.table.artifact": "Artifact",
  "invoices.table.actions": "Actions",
  "invoices.artifact.missing": "Missing",
  "invoices.artifact.expired": "Expired",
  "invoices.artifact.ready": "Ready",
  "invoices.artifact.none": "No artifact URL",
  "invoices.artifact.expiresAt": "expiresAt {value}",
  "invoices.empty.notProvisioned.title": "Billing setup is not complete",
  "invoices.empty.notProvisioned.body":
    "The tenant billing profile is not ready yet. Complete the invoice title, tax record, and monthly settlement setup before returning to invoices.",
  "invoices.empty.fetchFailed.title": "Invoice snapshot failed to load",
  "invoices.empty.fetchFailed.body":
    "No trustworthy invoice register was returned for this load. The page keeps context and asks the user to retry instead of implying there is no data.",
  "invoices.empty.permissionDenied.title":
    "This role cannot view invoices right now",
  "invoices.empty.permissionDenied.body":
    "This is not empty data. The backend denied access to tenant invoices for the current role, so role or permission settings need review.",
  "invoices.empty.externalUnavailable.title":
    "External artifact services are temporarily unavailable",
  "invoices.empty.externalUnavailable.body":
    "The invoices route still exists, but signed downloads or related external dependencies cannot return complete results right now.",
  "invoices.empty.filteredEmpty.title":
    "No invoices match the current filters",
  "invoices.empty.filteredEmpty.body":
    "Keep the status, period, and invoice id search context visible, and provide a clear recovery path so a failed search is not mistaken for missing tenant invoices.",
  "invoices.empty.noData.title": "This tenant does not have invoices yet",
  "invoices.empty.noData.body":
    "The system read succeeded, but no invoice records exist in the tenant scope yet. Users can still return to billing overview or audit to confirm the monthly settlement state.",
  "invoices.empty.messageCode": "messageCode: {value}",
  "invoices.empty.nextAction": "nextAction: {value}",
  "invoices.action.openBillingSetup": "Open billing setup",
  "invoices.action.refreshSnapshot": "Refresh snapshot",
  "invoices.action.reviewAccess": "Review role access",
  "invoices.action.openPlatformAudit": "Open platform audit",
  "invoices.action.clearFilters": "Clear filters",
  "invoices.action.openBilling": "Open billing overview",
  "invoices.action.downloadArtifact": "Download signed artifact",
  "invoices.action.viewDetail": "View detail",
  "invoices.action.platformAudit": "Platform audit",
  "invoices.action.unavailableGeneric": "Unavailable action",
  "invoices.action.disabled": "{label} disabled",
  "invoices.action.unavailable": "{label} unavailable",
  "invoices.action.expired": "{label} expired",
  "invoices.section.selected": "Selected invoice",
  "invoices.section.selectedSub":
    "Until the drawer or dedicated route is split out, keep the required packet detail on the right",
  "invoices.selected.overdue": "Overdue invoice",
  "invoices.selected.overdueBody":
    "This invoice has passed the default payment window and must be called out separately from normal issued status.",
  "invoices.selected.artifactExpired": "Artifact expired",
  "invoices.selected.artifactExpiredBody":
    "The signed download link has expired, but the invoice metadata and governance path still need to remain visible.",
  "invoices.selected.billingTitle": "Billing title",
  "invoices.selected.amount": "Amount",
  "invoices.selected.period": "Period",
  "invoices.selected.periodValue": "{start} to {end}",
  "invoices.selected.issuedAt": "Issued on",
  "invoices.selected.dueDate": "Due date",
  "invoices.selected.artifactUrl": "Artifact URL",
  "invoices.selected.expiresAt": "expiresAt",
  "invoices.selected.availableActions": "Available actions",
  "invoices.selected.picker": "Invoice selector",
  "invoices.selected.viewDetail": "View detail",
  "invoices.section.crossApp": "Cross-app context",
  "invoices.section.crossAppSub": "Deep links and detail ownership",
  "invoices.selected.deepLinks": "Deep links",
  "invoices.selected.lines": "Line items",
  "invoices.selected.line.orderId": "orderId: {value}",
  "invoices.section.context": "Invoice context",
  "invoices.section.contextSub":
    "Select an invoice to inspect details, artifact state, and deep links",
  "invoices.section.contextBody":
    "Invoice detail appears on the right. When the page is in an empty state, the right column stays empty instead of pretending detail data exists.",
  "invoices.status.all": "All",
  "invoices.status.draft": "Draft",
  "invoices.status.issued": "Issued",
  "invoices.status.paid": "Paid",
  "invoices.status.overdue": "Overdue",
  "invoices.status.unknown": "Unknown",
  "invoices.reason.notProvisioned": "Not provisioned",
  "invoices.reason.fetchFailed": "Fetch failed",
  "invoices.reason.permissionDenied": "Permission denied",
  "invoices.reason.externalUnavailable": "External unavailable",
  "invoices.reason.filteredEmpty": "Filtered empty",
  "invoices.reason.noData": "No data",

  // ── billing (i18n-fullsweep 20260614) ──

  "billing.action.editProfile": "Edit billing profile",
  "billing.action.openInvoices": "Open invoices",
  "billing.action.refresh": "Refresh",
  "billing.refresh.title": "Refresh tier T5 · tenant slow (30s)",
  "billing.refresh.body":
    "This page refreshes on the tenant slow cadence of {seconds} seconds (tier: {tier}). Snapshot loaded at {generatedAt}.",
  "billing.error.profile": "Unable to load tenant billing profile.",
  "billing.error.invoices": "Unable to load tenant invoices.",
  "billing.error.statements": "Unable to load tenant statements.",
  "billing.error.quota": "Unable to load tenant quota summary.",
  "billing.error.loadTitle": "Billing data could not be loaded completely",
  "billing.empty.notProvisioned.title": "Billing overview",
  "billing.empty.notProvisioned.body":
    "This tenant does not have billing records, current-period usage, or invoice data yet. Complete billing setup, then return for the current snapshot.",
  "billing.empty.fetchFailed.title": "Billing data failed to load",
  "billing.empty.fetchFailed.body":
    "The route remains available, but the billing profile request failed. Retry after the backend dependency recovers.",
  "billing.empty.permissionDenied.title":
    "This role cannot view billing right now",
  "billing.empty.permissionDenied.body":
    "The page is reachable, but the current actor lacks tenant billing access (tc_admin or tc_finance is required).",
  "billing.empty.externalUnavailable.title":
    "Downstream billing services are temporarily unavailable",
  "billing.empty.externalUnavailable.body":
    "Some upstream sources for usage and invoices are not responding or returned stale data, so the current-period numbers may be incomplete.",
  "billing.empty.filteredEmpty.title": "The current filters have no data",
  "billing.empty.filteredEmpty.body":
    "Billing data exists, but the current filter selection has no matching results. Clear the filters or choose another period.",
  "billing.empty.noData.title": "No billing activity this period",
  "billing.empty.noData.body":
    "The billing profile exists, but there are no invoices or usage records yet for the current period. The data will appear here as soon as activity is posted.",
  "billing.kpi.accrued": "Accrued this period",
  "billing.kpi.projected": "Projected close (run-rate)",
  "billing.kpi.projectedSub": "{periodKey} monthly close · linear projection",
  "billing.kpi.projectedEmpty": "No current period",
  "billing.kpi.tripCount": "Trips this period",
  "billing.kpi.averageTicket": "Average ticket",
  "billing.quota.share": "{percent}% of {count} quota",
  "billing.quota.unset": "Trip quota is not configured",
  "billing.section.profileEmpty":
    "The billing profile is not created yet. Invoice title, tax id, and contact details appear here after setup is complete.",
  "billing.empty.invoices": "No invoices are available right now.",
  "billing.profile.invoiceTitle": "Invoice title",
  "billing.profile.taxId": "Tax id",
  "billing.profile.contact": "Billing contact",
  "billing.profile.address": "Billing address",
  "billing.profile.settlementMethod": "Settlement method",
  "billing.profile.settlementMethodValue": "Monthly invoice",
  "billing.profile.updatedAt": "Last updated",
  "billing.col.invoice": "Invoice",
  "billing.col.period": "Period",
  "billing.col.amount": "Amount",
  "billing.col.status": "Status",
  "billing.col.due": "Due",
  "billing.status.draft": "Draft",
  "billing.status.issued": "Issued",
  "billing.status.paid": "Paid",
  "billing.status.pending": "Pending",
  "billing.status.unknown": "Unknown",

  // ── passengers (i18n-fullsweep 20260614) ──

  // ── addresses (i18n-fullsweep 20260614) ──

  // ── users (i18n-fullsweep 20260614) ──

  // ── integrationGovernance (i18n-fullsweep 20260614) ──

  // ── notifications (i18n-fullsweep 20260614) ──

  // ── featureFlags (i18n-fullsweep 20260614) ──

  // ── home (i18n-fullsweep 20260614) ──
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

  "bookingList.format.minutes": "{count} 分鐘",
  "bookingList.format.unknown": "未知",
  "bookingList.format.minutesAgo": "{value}前",
  "bookingList.format.hoursAgo": "{count} 小時前",
  "bookingList.format.daysAgo": "{count} 天前",
  "bookingList.format.ended": "已截止",
  "bookingList.format.remainingMinutes": "剩 {value}",
  "bookingList.format.remainingHoursMinutes": "剩 {hours} 小時 {minutes} 分鐘",
  "bookingList.actionDisabled.editWindowPassed": "編輯時窗已截止",
  "bookingList.actionDisabled.cancelWindowPassed": "取消時窗已截止",
  "bookingList.actionDisabled.workflowLocked": "工作流程不再接受租戶變更",
  "bookingList.actionDisabled.default": "無法操作",
  "bookingList.action.openDetail": "開啟明細",
  "bookingList.action.update": "編輯",
  "bookingList.action.cancel": "取消",
  "bookingList.action.create": "建立叫車",
  "bookingList.action.openOpsApproval": "營運審批",
  "bookingList.action.openOpsDispatch": "營運派遣",
  "bookingList.action.openIntegrationGovernance": "整合就緒度",
  "bookingList.action.resetFilters": "清除篩選",
  "bookingList.crossApp.approval": "開啟營運審批佇列",
  "bookingList.crossApp.dispatch": "開啟營運派遣佇列",
  "bookingList.sla.risk": "SLA 風險",
  "bookingList.sla.riskDetail": "需要重新派遣以保護此預約時窗。",
  "bookingList.sla.watch": "SLA 監控",
  "bookingList.sla.watchDetail": "上車時窗將在 {value}後開始。",
  "bookingList.sla.none": "目前沒有發布 SLA 警告。",
  "bookingList.subtype.creditCardAirport": "機場接送",
  "bookingList.subtype.enterprise": "企業派車",
  "bookingList.serviceBucket.businessDispatch": "商務派車",
  "bookingList.source.forwarded": "轉派權威來源",
  "bookingList.source.external": "外部履約",
  "bookingList.source.owned": "DRTS 營運",
  "bookingList.value.noCostCenter": "無成本中心",
  "bookingList.empty.notProvisioned.title": "租戶設定尚未完成 provision",
  "bookingList.empty.notProvisioned.description":
    "在租戶治理與下游整合完成此工作區設定前，訂單將維持無法存取。",
  "bookingList.empty.permissionDenied.title": "你沒有檢視訂單的權限",
  "bookingList.empty.permissionDenied.description":
    "目前的租戶 actor 可進入介面，但此角色情境未獲授權存取訂單帳冊。",
  "bookingList.empty.externalUnavailable.title": "訂單資料暫時無法取得",
  "bookingList.empty.externalUnavailable.description":
    "上游依賴未及時回應。請重新整理本頁，若延遲持續請透過 ops 升級處理。",
  "bookingList.empty.fetchFailed.title": "訂單清單載入失敗",
  "bookingList.empty.fetchFailed.description":
    "頁面無法取得有效的租戶訂單快照。請重新整理，若持續失敗請檢查服務健康狀態。",
  "bookingList.empty.filteredEmpty.title": "沒有符合篩選條件的訂單",
  "bookingList.empty.filteredEmpty.description":
    "請嘗試放寬預約日期區間、清除狀態標籤，或回到所有服務類別。",
  "bookingList.empty.noData.title": "此租戶目前還沒有任何訂單",
  "bookingList.empty.noData.description":
    "這看起來是全新的租戶工作區。建立第一筆訂單，或等待上游訂單匯入填入此帳冊。",
  "bookingList.error.unknown": "未知的訂單錯誤。",
  "bookingList.window.to": "到 {value}",
  "bookingList.pill.age": "建立 {value}",
  "bookingList.pill.updated": "更新 {value}",
  "bookingList.pill.editable": "可編輯 {value}",
  "bookingList.pill.approval": "審批 {state}",
  "bookingList.tab.all": "全部",
  "bookingList.tab.live": "進行中",
  "bookingList.tab.reserve": "預約",
  "bookingList.tab.approval": "待審批",
  "bookingList.tab.done": "已完成",
  "bookingList.tab.cancel": "已取消",
  "bookingList.column.booking": "訂單",
  "bookingList.column.type": "類型",
  "bookingList.column.route": "上車 → 下車",
  "bookingList.column.window": "時窗",
  "bookingList.column.passenger": "乘客",
  "bookingList.column.status": "狀態",
  "bookingList.header.title": "訂單",
  "bookingList.header.subtitle": "本月所有預約 · 含進行中與已完成",
  "bookingList.header.filter": "篩選",
  "bookingList.header.export": "匯出",
  "bookingList.header.exportDisabled": "匯出尚未開放",
  "bookingList.banner.degraded": "租戶訂單快照降級",
  "bookingList.filter.title": "篩選",
  "bookingList.filter.subtitle":
    "依訂單、單號或乘客搜尋，再以狀態、服務類別與預約日期區間縮小範圍。",
  "bookingList.filter.search": "搜尋",
  "bookingList.filter.searchPlaceholder": "訂單、單號、乘客",
  "bookingList.filter.serviceBucket": "服務類別",
  "bookingList.filter.allBuckets": "所有類別",
  "bookingList.filter.from": "起日",
  "bookingList.filter.to": "迄日",
  "bookingList.filter.pageSize": "每頁筆數",
  "bookingList.filter.apply": "套用篩選",
  "bookingList.filter.reset": "重設",
  "bookingList.table.title": "訂單 · 顯示 {shown} / 符合 {total}",
  "bookingList.table.subtitle": "第 {page} / {totalPages} 頁 · 快照 {snapshot}",
  "bookingList.footer.apiPage":
    "API 第 {page} 頁 · 快照筆數 {pageSize} · 總數 {total}",
  "bookingList.pagination.previous": "上一頁",
  "bookingList.pagination.next": "下一頁",

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
  "bookingDetail.hero.eyebrow": "訂單明細",
  "bookingDetail.hero.unavailableTitle": "{bookingId} unavailable",
  "bookingDetail.hero.unavailableDescription":
    "租戶明細路由實作共用 EmptyReason 狀態，讓每種空、未就緒或不可用情況都維持明確。",
  "bookingDetail.hero.description":
    "訂單明細遵循 Tenant Console canvas：可編輯截止、審批狀態、司機指派、audit 子集、更新層級與動作描述子，都集中在同一個租戶擁有的畫面。",
  "bookingDetail.loading.title": "載入租戶訂單明細",
  "bookingDetail.loading.description":
    "明細路由正在水合 T5 租戶快照、動作描述子與 audit 內容。",
  "bookingDetail.loading.refreshTitle": "準備訂單明細",
  "bookingDetail.loading.refreshDescription":
    "載入目前訂單快照與更新中繼資料。",
  "bookingDetail.loading.statusTitle": "解析可編輯性",
  "bookingDetail.loading.statusDescription":
    "在畫面可互動前，取得 availableActions、editableUntil 與審批狀態。",
  "bookingDetail.empty.noData.title": "尚無訂單資料",
  "bookingDetail.empty.noData.body":
    "此租戶具備叫車存取權，但目前 workspace snapshot 尚無訂單紀錄。",
  "bookingDetail.empty.noData.cta": "建立叫車",
  "bookingDetail.empty.notProvisioned.title": "叫車模組尚未佈建",
  "bookingDetail.empty.notProvisioned.body":
    "租戶設定尚未完成；佈建完成前無法載入訂單明細。",
  "bookingDetail.empty.notProvisioned.cta": "開啟設定",
  "bookingDetail.empty.fetchFailed.title": "訂單快照無法載入",
  "bookingDetail.empty.fetchFailed.body":
    "後端請求在回傳可用讀模型前失敗。請重試，或到 audit lane 檢查最後成功的 mutation。",
  "bookingDetail.empty.fetchFailed.cta": "回到訂單",
  "bookingDetail.empty.permissionDenied.title": "目前身分無法讀取訂單明細",
  "bookingDetail.empty.permissionDenied.body":
    "訂單存在，但目前租戶 actor 沒有此紀錄的讀取範圍。",
  "bookingDetail.empty.permissionDenied.cta": "回到訂單",
  "bookingDetail.empty.externalUnavailable.title": "連結的外部系統不可用",
  "bookingDetail.empty.externalUnavailable.body":
    "租戶事實仍可讀取，但一個或多個外部派遣細節暫時無法刷新。",
  "bookingDetail.empty.externalUnavailable.cta": "開啟稽核",
  "bookingDetail.empty.filteredEmpty.title": "此深連結不再符合目前篩選",
  "bookingDetail.empty.filteredEmpty.body":
    "訂單明細路由有效，但周邊篩選脈絡已不包含預期的紀錄。",
  "bookingDetail.empty.filteredEmpty.cta": "重設訂單篩選",
  "bookingDetail.empty.driverNotEligible.title": "已指派司機不再符合資格",
  "bookingDetail.empty.driverNotEligible.body":
    "訂單仍存在，但目前司機資格狀態使畫面無法顯示完整即時指派快照。",
  "bookingDetail.empty.driverNotEligible.cta": "開啟稽核",
  "bookingDetail.empty.restoreLive": "還原 live 明細",
  "bookingDetail.empty.reason": "EmptyReason",
  "bookingDetail.command.acceptedTitle":
    "Command 已接受 · 等待外部確認 · {actionId}",
  "bookingDetail.command.acceptedHelp":
    "Audit link {auditId} 已指派。若狀態尚未推進，請保留此明細或在下一個 T5 cycle 後刷新。",
  "bookingDetail.command.defaultMessage":
    "租戶命令已接受，正在等待外部派遣確認。",
  "bookingDetail.refresh.kicker": "更新層級",
  "bookingDetail.refresh.title": "租戶訂單明細以 T5 更新",
  "bookingDetail.refresh.description":
    "此畫面是租戶慢速明細介面：自動更新較慢，仍可手動檢視，過期狀態必須明確標示。",
  "bookingDetail.refresh.t5": "T5 slow",
  "bookingDetail.refresh.fresh": "最新快照",
  "bookingDetail.refresh.generatedAt": "產生時間",
  "bookingDetail.refresh.lastBookingUpdate": "最後訂單更新",
  "bookingDetail.refresh.source": "來源",
  "bookingDetail.refresh.manual": "手動更新",
  "bookingDetail.refresh.sourceLive": "live tenant API",
  "bookingDetail.refresh.manualHelp":
    "瀏覽器刷新、通知重新開啟，或 command receipt refresh",
  "bookingDetail.status.kicker": "狀態",
  "bookingDetail.status.title": "可編輯性與審批狀態",
  "bookingDetail.status.description":
    "依 Q-TEN05，可編輯性由動作描述子加上 editableUntil 決定，而非僅憑狀態標籤推測。",
  "bookingDetail.status.editable": "可編輯",
  "bookingDetail.status.readOnly": "唯讀",
  "bookingDetail.status.bookingStatus": "Booking {status}",
  "bookingDetail.status.approvalPendingTitle": "需審批狀態",
  "bookingDetail.status.approvalPendingHelp":
    "此訂單不能只因為尚未 terminal 就被視為可編輯。請等待審批，或使用 rules lane。",
  "bookingDetail.trip.workflowAria": "訂單工作流程狀態",
  "bookingDetail.trip.kicker": "行程脈絡",
  "bookingDetail.field.bookingId": "訂單 ID",
  "bookingDetail.field.orderId": "單號 ID",
  "bookingDetail.field.passenger": "乘客",
  "bookingDetail.field.phone": "電話",
  "bookingDetail.field.pickup": "上車",
  "bookingDetail.field.dropoff": "下車",
  "bookingDetail.field.windowStart": "時窗開始",
  "bookingDetail.field.windowEnd": "時窗結束",
  "bookingDetail.field.bookedBy": "預約人",
  "bookingDetail.field.onsiteContact": "現場聯絡人",
  "bookingDetail.field.costCenter": "成本中心",
  "bookingDetail.field.vehiclePreference": "車輛偏好",
  "bookingDetail.field.flightTerminal": "航班／航廈",
  "bookingDetail.field.notes": "備註",
  "bookingDetail.field.quoteFare": "報價車資",
  "bookingDetail.field.fareSource": "車資來源",
  "bookingDetail.field.pricingVersion": "定價版本",
  "bookingDetail.field.manualOverride": "手動覆寫",
  "bookingDetail.field.approval": "審批",
  "bookingDetail.field.benefitReference": "福利參照",
  "bookingDetail.field.assignmentStatus": "指派狀態",
  "bookingDetail.field.eta": "ETA",
  "bookingDetail.field.orderStatus": "訂單狀態",
  "bookingDetail.field.escalation": "升級",
  "bookingDetail.field.commandReceipt": "命令回執",
  "bookingDetail.value.tenantIntake": "租戶受理",
  "bookingDetail.value.notPublished": "未發布",
  "bookingDetail.value.noFlight": "無航班",
  "bookingDetail.value.noTerminal": "無航廈",
  "bookingDetail.value.noNotes": "無備註",
  "bookingDetail.value.none": "無",
  "bookingDetail.value.pendingTimestamp": "等待時間戳",
  "bookingDetail.value.activeAssignment": "司機指派中",
  "bookingDetail.value.noActiveAssignment": "尚未發布有效指派",
  "bookingDetail.value.liveEtaPending": "等待派遣讀模型提供即時 ETA",
  "bookingDetail.value.notActive": "未啟用",
  "bookingDetail.value.opsDeepLinkAvailable": "可開啟 Ops console 深連結",
  "bookingDetail.value.tenantOwner": "租戶明細仍是主要 owner view",
  "bookingDetail.value.noPendingReceipt": "無待處理回執",
  "bookingDetail.link.openPassenger": "開啟乘客目錄參照",
  "bookingDetail.link.openPickup": "開啟上車地址參照",
  "bookingDetail.link.openDropoff": "開啟下車地址參照",
  "bookingDetail.link.openCostCenter": "開啟成本中心治理",
  "bookingDetail.link.returnContext": "回到訂單清單脈絡",
  "bookingDetail.lifecycle.kicker": "生命週期",
  "bookingDetail.finance.kicker": "財務",
  "bookingDetail.assignment.kicker": "指派",
  "bookingDetail.assignment.title": "司機／車輛指派",
  "bookingDetail.assignment.description":
    "若派遣已附上履約段，租戶使用者可看到指派狀態，但不會取得派遣控制權。",
  "bookingDetail.actions.kicker": "操作",
  "bookingDetail.actions.title": "可用操作",
  "bookingDetail.actions.description":
    "命令面板依此訂單的動作描述子集合，呈現啟用、停用與隱藏狀態。",
  "bookingDetail.deepLinks.kicker": "深連結",
  "bookingDetail.deepLinks.auditSubsetLabel": "檢視 audit 子集",
  "bookingDetail.deepLinks.auditReceiptNote":
    "當 command 已接受時，可直接開啟 action receipt audit trail。",
  "bookingDetail.deepLinks.auditRealmNote":
    "Tenant audit 會保留 tenant、ops、platform 與 system 的 actor realm chips。",
  "bookingDetail.deepLinks.rulesLabel": "開啟審批規則",
  "bookingDetail.deepLinks.rulesNote":
    "使用 tenant rules lane 檢查目前套用到此訂單的審批邏輯。",
  "bookingDetail.deepLinks.opsLabel": "開啟 ops console 明細",
  "bookingDetail.deepLinks.opsNote":
    "Forwarded-authority 訂單需要派遣復原時，會在新分頁升級到 ops app。",
  "bookingDetail.deepLinks.crossAppNote":
    "當權限屬於 ops 或另一個部署時，跨 app 路由會在新分頁開啟。",
  "bookingDetail.boundary.title": "權限邊界",
  "bookingDetail.event.created": "訂單已建立",
  "bookingDetail.event.createdDetail": "預約時窗 {start} 至 {end}。",
  "bookingDetail.event.approval": "審批流程",
  "bookingDetail.event.approvalDetail":
    "審批狀態為 {state}。相關請求數：{count}。",
  "bookingDetail.event.driverAssigned": "司機指派中",
  "bookingDetail.event.driverAssignedDetail":
    "此訂單目前已附上有效履約段。目前讀模型尚未發布即時 ETA。",
  "bookingDetail.event.cancelled": "訂單已取消",
  "bookingDetail.event.cancelledDetail":
    "租戶取消已完成。Audit 會保留原因與 actor attribution。",
  "bookingDetail.event.completed": "行程已完成",
  "bookingDetail.event.completedDetail":
    "履約已完成。帳務與 audit 仍可從租戶擁有的路由存取。",
  "bookingDetail.event.snapshotUpdated": "工作流程快照已更新",
  "bookingDetail.event.snapshotUpdatedDetail": "目前訂單狀態為 {status}。",
  "bookingDetail.readOnly.pastEditableUntil":
    "租戶編輯時窗已關閉，因此此明細對更新命令為唯讀。",
  "bookingDetail.readOnly.bookingTerminal":
    "行程已結束。租戶使用者可檢視內容與 audit，但無法再變更訂單。",
  "bookingDetail.readOnly.onTripLocked":
    "司機工作流程已在進行中。後續應透過取消政策或 ops 升級處理，而非即時編輯。",
  "bookingDetail.readOnly.approvalPending":
    "此訂單需待審批結果，才能接受下一個更新命令。",
  "bookingDetail.readOnly.default": "此訂單目前沒有可用的租戶更新命令。",
  "bookingDetail.editWindow.noDeadlineEditable":
    "後端目前未提供此訂單的編輯截止時間。",
  "bookingDetail.editWindow.noDeadlineReadOnly":
    "即使後端未發布編輯截止時間，此訂單仍為唯讀。",
  "bookingDetail.editWindow.open": "租戶編輯時窗開放至 {time}{relative}。",
  "bookingDetail.editWindow.closed": "租戶編輯時窗已於 {time}{relative} 關閉。",
  "bookingDetail.approval.notRequired": "此訂單目前沒有啟用的審批關卡。",
  "bookingDetail.approval.pending": "派遣繼續前需要審批。",
  "bookingDetail.approval.approved": "審批關卡已通過，訂單可繼續。",
  "bookingDetail.approval.rejected": "審批已被拒絕。重新提交前請檢視規則。",
  "bookingDetail.approval.blocked": "政策封鎖目前阻止此訂單繼續進行。",
  "bookingDetail.approval.cancelledByReevaluation":
    "先前審批請求已因後續訂單變更而失效。",
  "bookingDetail.source.forwarded.badge": "Forwarded authority",
  "bookingDetail.source.forwarded.detail":
    "此訂單鏡像自外部平台權限 lane。租戶可見狀態仍可在此讀取，但不暴露司機指派或 adapter 內部狀態。",
  "bookingDetail.source.forwarded.boundary":
    "租戶路由只顯示 canonical booking 與 order record；adapter-native 狀態留在 ops 與 driver authority lanes。",
  "bookingDetail.source.external.badge": "外部履約",
  "bookingDetail.source.external.detail":
    "此訂單使用合作夥伴或外部履約路徑。租戶端狀態在此可見，但不暴露 adapter internals。",
  "bookingDetail.source.external.boundary":
    "租戶路由保留 canonical booking record；partner-side routing、sponsorship 與派遣協調留在此 surface 之外。",
  "bookingDetail.source.owned.badge": "DRTS 營運",
  "bookingDetail.source.owned.detail":
    "此訂單留在 DRTS-operated dispatch path，處理路由、履約與客戶更新。",
  "bookingDetail.source.owned.boundary":
    "租戶路由與 DRTS operations 共用同一個 owned booking lifecycle，因此政策允許時，可透過 tenant-safe commands 處理已發布狀態變更。",

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
  "newBooking.validation.reservationWindowStartRequired":
    "請填寫預約時窗開始時間。",
  "newBooking.validation.reservationWindowEndRequired":
    "請填寫預約時窗結束時間。",
  "newBooking.validation.passengerNameRequired": "請填寫乘客姓名。",
  "newBooking.validation.passengerPhoneRequired": "請填寫乘客電話。",
  "newBooking.validation.pickupAddressRequired": "請填寫上車地址。",
  "newBooking.validation.dropoffAddressRequired": "請填寫下車地址。",
  "newBooking.validation.costCenterRequired": "請選擇成本中心。",
  "newBooking.validation.reservationWindowInvalid":
    "預約時窗開始與結束必須是有效日期時間。",
  "newBooking.validation.reservationWindowOrder":
    "預約時窗結束必須晚於開始時間。",
  "newBooking.validation.flightNoRequired": "機場接機訂單需要填寫航班號碼。",
  "newBooking.validation.bookedByPairRequired":
    "代訂人姓名與 Email 需同時填寫，或兩者都留空。",
  "newBooking.validation.onsiteContactPairRequired":
    "現場聯絡人與電話需同時填寫，或兩者都留空。",
  "newBooking.validation.estimatedAmountInvalid":
    "預估支出必須是有效且不小於 0 的金額。",
  "newBooking.validation.luggageCountInvalid": "行李件數必須是 0 以上的整數。",
  "newBooking.validation.pickupLatInvalid":
    "上車緯度若有填寫，必須是有效數字。",
  "newBooking.validation.pickupLngInvalid":
    "上車經度若有填寫，必須是有效數字。",
  "newBooking.validation.dropoffLatInvalid":
    "下車緯度若有填寫，必須是有效數字。",
  "newBooking.validation.dropoffLngInvalid":
    "下車經度若有填寫，必須是有效數字。",
  "newBooking.action.unavailable": "目前無法操作",
  "newBooking.action.refreshNow": "立即更新",
  "newBooking.action.clearShortcuts": "清除快捷內容",
  "newBooking.action.openCostCenters": "開啟成本中心",
  "newBooking.action.openPassengers": "開啟乘客",
  "newBooking.action.backBookings": "回到訂單清單",
  "newBooking.action.backList": "返回訂單列表",
  "newBooking.action.refresh": "刷新",
  "newBooking.action.reloading": "重新載入中...",
  "newBooking.action.cancel": "取消",
  "newBooking.action.submitCommand": "送出命令",
  "newBooking.action.noDraft": "暫不支援草稿",
  "newBooking.option.manualPassenger": "手動輸入乘客",
  "newBooking.option.manualPickup": "手動上車點",
  "newBooking.option.manualDropoff": "手動下車點",
  "newBooking.option.notSet": "未設定",
  "newBooking.option.pickup": "上車",
  "newBooking.option.dropoff": "下車",
  "newBooking.option.scheduled": "預約",
  "newBooking.option.immediate": "即時",
  "newBooking.option.selectCostCenter": "選擇成本中心",
  "newBooking.format.currencyMissing": "未提供",
  "newBooking.format.percentMissing": "不適用",
  "newBooking.format.datetimeUnknown": "未知",
  "newBooking.format.ageUnknown": "時間未知",
  "newBooking.format.justNow": "剛剛",
  "newBooking.format.secondsAgo": "{count} 秒前",
  "newBooking.format.minutesAgo": "{count} 分鐘前",
  "newBooking.format.hoursAgo": "{count} 小時前",
  "newBooking.direction.pickup": "上車",
  "newBooking.direction.dropoff": "下車",
  "newBooking.direction.unset": "未設定",
  "newBooking.decision.allow": "允許",
  "newBooking.decision.requireApproval": "需審批",
  "newBooking.decision.block": "已封鎖",
  "newBooking.decision.warn": "警告",
  "newBooking.decision.manualReview": "人工複核",
  "newBooking.impact.tenant": "租戶",
  "newBooking.impact.costCenter": "成本中心",
  "newBooking.impact.costCenterCode": "成本中心 {code}",
  "newBooking.refreshTier.manual": "手動",
  "newBooking.refreshTier.urgent": "緊急",
  "newBooking.refreshTier.fast": "快速",
  "newBooking.refreshTier.dispatch": "派遣",
  "newBooking.refreshTier.medium": "中等",
  "newBooking.refreshTier.mediumSlow": "中慢",
  "newBooking.refreshTier.slow": "慢速",
  "newBooking.error.policyPreviewUnknown": "未知政策預覽錯誤。",
  "newBooking.error.policyPreviewHttp": "政策預覽失敗 (HTTP {status})。",
  "newBooking.error.submitBlocked": "此叫車目前被租戶審批或額度政策阻擋。",
  "newBooking.error.createHttp": "建立叫車失敗 (HTTP {status})。",
  "newBooking.error.createUnknown": "未知叫車建立錯誤。",
  "newBooking.error.unknown": "未知錯誤",
  "newBooking.header.title": "建立叫車",
  "newBooking.header.subtitle":
    "代訂或本人 · 預約 / 即時 · 同步 command 模式 (Q-TEN04)",
  "newBooking.meta.command": "命令",
  "newBooking.meta.updateTier": "更新層級",
  "newBooking.meta.directoryCoverage": "目錄覆蓋",
  "newBooking.meta.requiredActions": "必備操作",
  "newBooking.meta.passengers": "乘客 {count}",
  "newBooking.meta.addresses": "地址 {count}",
  "newBooking.meta.costCenters": "成本中心 {count}",
  "newBooking.meta.noDraft": "暫不支援草稿",
  "newBooking.prefill.source": "來自租戶目錄的捷徑預填",
  "newBooking.prefill.passenger": "乘客 · {name}",
  "newBooking.prefill.pickup": "上車 · {name}",
  "newBooking.prefill.dropoff": "下車 · {name}",
  "newBooking.prefill.appliedTitle": "已套用目錄捷徑預填",
  "newBooking.health.degradedTitle": "部分建立訂單依賴目前降級",
  "newBooking.freshness.degradedTitle": "目錄快照目前降級",
  "newBooking.freshness.staleTitle": "目錄快照需要更新",
  "newBooking.freshness.body":
    "快照建立於 {age} · {timestamp} · 更新層級 {tier}",
  "newBooking.info.estimateTitle": "估算只用於預覽",
  "newBooking.info.estimateBody":
    "費用、額度影響與審批姿態可先預覽，但標準報價仍由後端擁有。",
  "newBooking.card.trip.title": "行程",
  "newBooking.card.trip.subtitle":
    "服務類型、乘客、預約時間與地址簿捷徑都在同一張表單完成。",
  "newBooking.card.pickupDropoff.title": "上車／下車",
  "newBooking.card.pickupDropoff.subtitle":
    "先選地址簿，再視需要直接微調，不另外開 geocoding flow。",
  "newBooking.card.approval.title": "關聯與審批",
  "newBooking.card.approval.subtitle":
    "成本中心、財務欄位與代訂 metadata 都隨命令一起送出。",
  "newBooking.card.directory.title": "目錄內容",
  "newBooking.card.directory.subtitle":
    "這些是 handoff packet 指定的 in-app entry / exit points。",
  "newBooking.card.policy.title": "政策評估",
  "newBooking.card.policy.subtitle": "審批姿態與額度影響都直接來自後端預覽。",
  "newBooking.card.quota.title": "配額影響",
  "newBooking.card.quota.subtitle": "沿用後端預覽語彙，不用本地預估字典取代。",
  "newBooking.card.submit.title": "送出 command",
  "newBooking.card.submit.subtitle":
    "blocked outcome 在 client 端直接阻擋；approval-required 仍可送出，但 workflow 由後端擁有。",
  "newBooking.field.serviceSubtype": "服務子類型",
  "newBooking.field.timingMode": "時間模式",
  "newBooking.field.reservationStart": "預約開始",
  "newBooking.field.reservationEnd": "預約結束",
  "newBooking.field.passenger": "乘客",
  "newBooking.field.passengerName": "乘客姓名",
  "newBooking.field.passengerPhone": "乘客電話",
  "newBooking.field.savedPickup": "已存上車點",
  "newBooking.field.savedDropoff": "已存下車點",
  "newBooking.field.pickupAddress": "上車地址",
  "newBooking.field.dropoffAddress": "下車地址",
  "newBooking.field.pickupLat": "上車緯度",
  "newBooking.field.pickupLng": "上車經度",
  "newBooking.field.dropoffLat": "下車緯度",
  "newBooking.field.dropoffLng": "下車經度",
  "newBooking.field.estimatedSpend": "預估支出 ({currency})",
  "newBooking.field.notes": "備註",
  "newBooking.hint.passengerSelect": "為代客叫車選擇目錄乘客，或維持手動輸入。",
  "newBooking.hint.phoneFromDirectory": "乘客電話來自選取的目錄紀錄。",
  "newBooking.hint.phoneMissing": "這位乘客檔案沒有電話，請在此補上。",
  "newBooking.hint.phoneManual": "手動輸入乘客時需要直接聯絡電話。",
  "newBooking.check.signoffRequired": "需要簽核",
  "newBooking.check.expenseProofRequired": "需要費用佐證",
  "newBooking.kpi.directoryBacked": "目錄支援",
  "newBooking.kpi.savedPickupDropoff": "已存上下車點",
  "newBooking.kpi.canonicalSelector": "標準選擇器",
  "newBooking.empty.noData.title": "目前沒有可用的建立捷徑",
  "newBooking.empty.noData.body":
    "乘客與地址目錄都還沒有可用資料。先補齊租戶目錄，再回來建立訂單。",
  "newBooking.empty.notProvisioned.title": "成本中心尚未佈建",
  "newBooking.empty.notProvisioned.body":
    "這個路由需要標準成本中心目錄，否則叫車建立命令不能送出。",
  "newBooking.empty.fetchFailed.title": "建立訂單所需資料載入失敗",
  "newBooking.empty.fetchFailed.body":
    "至少一個必要目錄來源讀取失敗。請先刷新，確認資料恢復後再送出。",
  "newBooking.empty.permissionDenied.title": "目前身分沒有建立訂單權限",
  "newBooking.empty.permissionDenied.body":
    "後端拒絕目前身分的叫車建立權限。請與租戶管理員確認權限。",
  "newBooking.empty.externalUnavailable.title": "外部依賴暫時不可用",
  "newBooking.empty.externalUnavailable.body":
    "叫車命令依賴的上游服務暫時異常。等依賴恢復後刷新再重試。",
  "newBooking.empty.filteredEmpty.title": "預填捷徑已失效",
  "newBooking.empty.filteredEmpty.body":
    "乘客或地址的預填連結已經過期。清除捷徑脈絡後，從乾淨表單重新開始。",
  "newBooking.empty.driverNotEligible.title": "駕駛資格狀態不適用這個頁面",
  "newBooking.empty.driverNotEligible.body":
    "租戶叫車建立路由不使用駕駛資格狀態。",
  "newBooking.empty.reason": "EmptyReason",
  "newBooking.empty.messageCode": "messageCode: {code}",
  "newBooking.banner.passengerEmptyTitle": "乘客目錄為空",
  "newBooking.banner.passengerEmptyBody":
    "仍可手動輸入乘客，但 `/passengers` 才是 packet 指定的捷徑入口。",
  "newBooking.banner.addressEmptyTitle": "地址簿為空",
  "newBooking.banner.addressEmptyBody":
    "仍可手動輸入地址，但 `/addresses` 才是這個路由的標準捷徑來源。",
  "newBooking.policy.refreshing": "刷新中",
  "newBooking.policy.autoPreview": "自動預覽",
  "newBooking.policy.service": "服務",
  "newBooking.policy.direction": "方向",
  "newBooking.policy.passengerRole": "乘客角色",
  "newBooking.policy.estimatedSpend": "預估花費",
  "newBooking.policy.notPublished": "未發布",
  "newBooking.policy.failedTitle": "政策預覽失敗",
  "newBooking.policy.mode": "模式：{value}",
  "newBooking.policy.timeout": "逾時：{value} 小時",
  "newBooking.policy.fallback": "備援策略：{value}",
  "newBooking.policy.approver": "審批人 {index}",
  "newBooking.quota.period": "期別：{value}",
  "newBooking.quota.trigger": "觸發：{value}",
  "newBooking.quota.value": "使用前 {before} / {limit} · 使用後 {after}",
  "newBooking.quota.hint": "{dimension} · 剩餘 {percent} · {triggered}",
  "newBooking.quota.waitingTitle": "預覽等待完整叫車脈絡",
  "newBooking.quota.waitingBody":
    "先選成本中心並補齊核心欄位，才能計算配額影響。",
  "newBooking.submit.openingDetail": "開啟明細中...",
  "newBooking.submit.resource": "Resource: {type} · {id}",
  "newBooking.submit.viewAudit": "查看稽核軌跡",
  "newBooking.submit.failedTitle": "建立訂單失敗",
  "newBooking.submit.fixHighlightedTitle": "請先處理高亮欄位",
  "newBooking.submit.submitting": "送出中...",
  "newBooking.submit.forApproval": "送出審批",
  "newBooking.submit.create": "建立叫車",

  "refreshControl.fresh": "最新快照",
  "refreshControl.stale": "過期快照",
  "refreshControl.degraded": "降級資料",
  "refreshControl.unknown": "鮮度未知",
  "refreshControl.refreshing": "刷新中",
  "refreshControl.refresh": "刷新",

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
  "billing.subtitle": "計費檔案、當期用量、發票與對帳單",
  "billing.section.profile": "帳務設定檔",
  "billing.section.invoices": "近期發票",
  "billing.section.statements": "租戶可見對帳單",
  "billing.section.statementsSub":
    "由 `/api/tenant/statements` 讀取，畫面僅做只讀呈現。",
  "billing.empty.statements": "這個期別目前沒有對帳單。",
  "billing.col.statement": "對帳單",
  "billing.col.gross": "毛額",
  "billing.col.serviceFee": "服務費",
  "billing.col.subsidy": "補貼",
  "billing.col.net": "淨額",
  "billing.col.payoutStatus": "撥付狀態",

  // ── settings (i18n-fullsweep 20260614) ──

  // ── webhooks (i18n-fullsweep 20260614) ──

  // ── apiKeys (i18n-fullsweep 20260614) ──

  // ── costCenters (i18n-fullsweep 20260614) ──

  // ── reports (i18n-fullsweep 20260614) ──
  "reports.title": "報表",
  "reports.subtitle": "月用量 · 成本中心拆分 · SLA 摘要 · 短效簽名檔案",
  "reports.action.refresh": "重新整理",
  "reports.action.createJob": "建立工作",
  "reports.type.trip_summary": "行程摘要",
  "reports.type.monthly_trip_report": "月用量",
  "reports.type.revenue_summary": "成本中心拆分",
  "reports.type.incident_register": "事件登錄",
  "reports.type.operational_overview": "維運總覽",
  "reports.status.all": "所有狀態",
  "reports.status.queued": "排隊中",
  "reports.status.running": "執行中",
  "reports.status.completed": "完成",
  "reports.status.failed": "失敗",
  "reports.status.expired": "已過期",
  "reports.param.period": "期別 {value}",
  "reports.param.costCenter": "成本中心 {value}",
  "reports.param.passenger": "乘客 {value}",
  "reports.param.tenant": "租戶 {value}",
  "reports.param.defaultScope": "預設租戶範圍",
  "reports.empty.not_provisioned.title": "此租戶尚未開通報表能力",
  "reports.empty.not_provisioned.description":
    "路由可以開啟，但後端尚未為此租戶開通報表能力。請透過跨應用治理連結確認權益、檔案簽章與報表就緒狀態。",
  "reports.empty.fetch_failed.title": "無法載入報表工作",
  "reports.empty.fetch_failed.description":
    "頁面框架可用，但報表工作清單讀取失敗。待相依服務恢復後，請重新整理一次。",
  "reports.empty.permission_denied.title": "目前身分無法操作租戶報表",
  "reports.empty.permission_denied.description":
    "報表仍保留在導覽中，但目前身分沒有列出或建立此租戶報表工作的權限。",
  "reports.empty.external_unavailable.title": "報表相依服務暫時不可用",
  "reports.empty.external_unavailable.description":
    "後端報表服務目前降級。請等待相依服務恢復後，再手動刷新工作清單。",
  "reports.empty.filtered_empty.title": "目前篩選沒有符合的工作",
  "reports.empty.filtered_empty.description":
    "此租戶有報表歷史，但目前類型、狀態或期別篩選沒有命中。清除篩選即可查看完整佇列。",
  "reports.empty.no_data.title": "尚未建立任何報表工作",
  "reports.empty.no_data.description":
    "你可以從此頁建立第一個租戶報表工作。後端會負責工作生命週期，並在檔案完成後提供短效簽名下載網址。",
  "reports.artifact.signed": "已簽名檔案",
  "reports.artifact.expired": "檔案已過期",
  "reports.artifact.notReady": "尚未就緒",
  "reports.statusReason.failed": "後端紀錄此工作失敗，可用相同參數重新執行。",
  "reports.statusReason.expired": "簽名網址已過期，請建立新工作產生新的檔案。",
  "reports.crossApp.opsReporting": "開啟 ops-console 報表以追溯申報／營收",
  "reports.crossApp.platformAudit": "開啟 platform-admin audit 以治理產出檔案",
  "reports.flash.actionFailed.title": "報表操作失敗",
  "reports.flash.unknownError": "未知報表錯誤。",
  "reports.flash.refreshSent.title": "已送出報表清單刷新",
  "reports.flash.refreshSent.description":
    "此路由屬於 T6 手動更新；頁面會重新載入最新的報表作業快照。",
  "reports.flash.jobQueued.title": "報表工作已排入佇列",
  "reports.flash.jobQueued.description":
    "工作 {jobId} 已受理。請刷新或等待後端產生簽名檔案。",
  "reports.flash.rerunQueued.title": "失敗報表已重新排入佇列",
  "reports.flash.rerunQueued.description":
    "替代工作 {jobId} 已用原本類型與範圍受理。",
  "reports.confirm.rerun": "要用相同參數重跑報表工作 {jobId} 嗎？",
  "reports.col.job": "工作",
  "reports.col.type": "類型",
  "reports.col.parameters": "參數",
  "reports.col.status": "狀態",
  "reports.col.created": "建立",
  "reports.col.completed": "完成",
  "reports.col.format": "格式",
  "reports.col.expires": "到期",
  "reports.col.file": "檔案",
  "reports.col.actions": "操作",
  "reports.rowAction.download": "下載",
  "reports.rowAction.rerun": "重跑",
  "reports.errorsBanner.title": "報表資料無法完整載入",
  "reports.errorsBanner.body": "路由仍可使用，但一個或多個報表讀取來源失敗。",
  "reports.errorsBanner.count": "{count} 個問題",
  "reports.t6.title": "更新層級 T6：手動",
  "reports.t6.body":
    "此路由不自動輪詢。快照載入於 {time}，更新層級維持 {tier}。",
  "reports.tier.manual": "手動",
  "reports.crossAppBanner.title": "跨應用報表追溯保持明確",
  "reports.crossAppBanner.body":
    "租戶報表可銜接營運報表或平台治理；依 Q-X03，跨應用深連結會在新分頁開啟。",
  "reports.crossAppBanner.openOps": "開啟 Ops 報表",
  "reports.crossAppBanner.openPlatformAudit": "開啟平台 audit",
  "reports.crossAppBanner.tenantAudit": "租戶 audit",
  "reports.kpi.jobs": "工作",
  "reports.kpi.jobsSub": "報表工作歷史",
  "reports.kpi.active": "排隊／執行中",
  "reports.kpi.activeSub": "後端正在產出檔案",
  "reports.kpi.ready": "就緒",
  "reports.kpi.readySub": "簽名下載仍有效",
  "reports.kpi.failedExpired": "失敗／過期",
  "reports.kpi.failedExpiredSub": "需要重跑或重新產檔",
  "reports.queue.title": "報表佇列",
  "reports.queue.subtitle":
    "類型、狀態、期別、檔案 TTL 與手動重試都以契約為依據。",
  "reports.filter.type": "類型篩選",
  "reports.filter.status": "狀態篩選",
  "reports.filter.period": "期別篩選",
  "reports.filter.periodHint": "對應工作參數中內嵌的期別。",
  "reports.filter.allTypes": "所有類型",
  "reports.filter.clear": "清除篩選",
  "reports.create.title": "建立報表工作",
  "reports.create.subtitle": "類型、期別與範圍參數直接送入後端佇列。",
  "reports.create.jobType": "工作類型",
  "reports.create.format": "格式",
  "reports.create.period": "期別",
  "reports.create.periodHint": "月報通常使用 YYYY-MM。",
  "reports.create.costCenter": "成本中心",
  "reports.create.costCenterHint": "選填的範圍細化，例如 CC-FIN-001。",
  "reports.create.passenger": "乘客",
  "reports.create.passengerHint": "選填的乘客下鑽，用於範圍匯出。",
  "reports.create.submit": "排入報表佇列",
  "reports.create.submitting": "送出中...",
  "reports.create.refreshList": "重新整理清單",
  "reports.override.title": "狀態覆蓋",
  "reports.override.subtitle": "六種共用 EmptyReason 變體的手動 QA 捷徑。",
  "reports.override.liveData": "即時資料",
  "reports.deepLinks.title": "跨應用深層連結",
  "reports.deepLinks.subtitle":
    "報表可導向檔案下載、租戶 audit 或外部營運後續。",
  "reports.deepLinks.auditReceipt": "查看租戶端報表操作的 audit 收據",
  "reports.deepLinks.open": "開啟",

  // ── rules (i18n-fullsweep 20260614) ──

  // ── sla (i18n-fullsweep 20260614) ──

  // ── audit (i18n-fullsweep 20260614) ──

  // ── invoices (i18n-fullsweep 20260614) ──

  "invoices.title": "發票",
  "invoices.subtitle": "發票歷史、篩選條件與後端發布的操作",
  "invoices.pageLead":
    "狀態與 CTA 以 backend read model 為準。此頁僅呈現 availableActions、EmptyReason、refresh tier 與跨應用深層連結，不在 client 端自行推導角色權限。",
  "invoices.meta.source": "來源 {value}",
  "invoices.meta.sourceLive": "即時",
  "invoices.meta.sourceCache": "快取",
  "invoices.meta.sourceSandbox": "沙箱",
  "invoices.meta.sourceStatic": "靜態",
  "invoices.meta.sourceUnknown": "未知",
  "invoices.meta.visible": "{count} 筆可見",
  "invoices.meta.total": "共 {count} 筆",
  "invoices.meta.overdue": "{count} 筆逾期",
  "invoices.meta.expiredArtifacts": "{count} 筆檔案已過期",
  "invoices.summary.visible.label": "可見發票",
  "invoices.summary.visible.caption": "套用狀態、期別與 id 篩選後的當前清單切片",
  "invoices.summary.overdue.label": "逾期",
  "invoices.summary.overdue.caption": "緊急狀態需與一般已開立發票區分顯示",
  "invoices.summary.expired.label": "已過期檔案",
  "invoices.summary.expired.caption":
    "即使簽名下載連結過期，發票中繼資料仍需保留",
  "invoices.summary.amount.label": "可見金額",
  "invoices.summary.amount.caption": "財務使用者可先核對目前切片，再開啟明細",
  "invoices.error.unknown": "未知的租戶發票錯誤。",
  "invoices.error.requestFailed": "請求失敗。",
  "invoices.error.billingProfile": "帳務設定檔：{message}",
  "invoices.error.register": "發票清單：{message}",
  "invoices.error.degradedTitle": "發票讀取模型已降級",
  "invoices.refresh.staleAfterSeconds": "{count} 秒",
  "invoices.refresh.staleAfterMinutes": "{count} 分",
  "invoices.refresh.staleAfterSuffix": " · 過期視窗 {value}",
  "invoices.refresh.badge":
    "{packetTier} · {runtimeTier} · {cadenceLabel}{staleAfter}",
  "invoices.refresh.state.fresh": "最新",
  "invoices.refresh.state.stale": "過期",
  "invoices.refresh.state.degraded": "降級",
  "invoices.refresh.state.unknown": "未知",
  "invoices.banner.freshnessTitle": "快照新鮮度警告",
  "invoices.banner.freshnessBody":
    "目前內容產生於 {generatedAt}。refresh tier 為 {packetTier} / {runtimeTier}{staleAfter}。當資料不是 fresh 時，頁面必須明確提示，而不是假裝即時。",
  "invoices.section.list": "發票清單",
  "invoices.section.listSub":
    "狀態、期別與發票 id 篩選，並維持逾期與檔案過期狀態可見",
  "invoices.filter.search": "依發票 id 搜尋",
  "invoices.filter.searchPlaceholder": "inv_2026_05_001",
  "invoices.filter.status": "狀態",
  "invoices.filter.period": "期別",
  "invoices.filter.allPeriods": "全部期別",
  "invoices.filter.apply": "套用篩選",
  "invoices.filter.clear": "清除",
  "invoices.table.invoice": "發票",
  "invoices.table.period": "期別",
  "invoices.table.amount": "金額",
  "invoices.table.status": "狀態",
  "invoices.table.due": "到期",
  "invoices.table.issued": "開立",
  "invoices.table.artifact": "檔案",
  "invoices.table.actions": "操作",
  "invoices.artifact.missing": "檔案缺失",
  "invoices.artifact.expired": "檔案已過期",
  "invoices.artifact.ready": "檔案就緒",
  "invoices.artifact.none": "沒有檔案 URL",
  "invoices.artifact.expiresAt": "expiresAt {value}",
  "invoices.empty.notProvisioned.title": "尚未完成帳務設定",
  "invoices.empty.notProvisioned.body":
    "租戶帳務設定檔尚未就緒。請先補齊發票抬頭、稅籍與月結設定，再回到發票頁。",
  "invoices.empty.fetchFailed.title": "發票快照讀取失敗",
  "invoices.empty.fetchFailed.body":
    "本次載入沒有取得可信的發票清單。頁面會保留語境並要求使用者重試，而不是暗示目前沒有資料。",
  "invoices.empty.permissionDenied.title": "目前角色無法檢視發票",
  "invoices.empty.permissionDenied.body":
    "這不是空資料。後端拒絕目前角色查看租戶發票，需要回到角色或權限設定處理。",
  "invoices.empty.externalUnavailable.title": "外部檔案服務暫時不可用",
  "invoices.empty.externalUnavailable.body":
    "發票頁仍存在，但簽名下載或相關外部依賴暫時無法提供完整結果。",
  "invoices.empty.filteredEmpty.title": "目前篩選條件沒有符合的發票",
  "invoices.empty.filteredEmpty.body":
    "保留狀態、期別與發票 id 的查詢語境，並提供清楚的回復路徑，避免把搜尋失敗誤解為租戶沒有任何發票。",
  "invoices.empty.noData.title": "這個租戶目前還沒有發票",
  "invoices.empty.noData.body":
    "系統讀取正常，但目前租戶範圍內尚未產生任何發票紀錄。使用者仍可回到帳務概覽或稽核確認月結狀態。",
  "invoices.empty.messageCode": "messageCode：{value}",
  "invoices.empty.nextAction": "nextAction：{value}",
  "invoices.action.openBillingSetup": "前往帳務設定",
  "invoices.action.refreshSnapshot": "重新整理快照",
  "invoices.action.reviewAccess": "檢查角色權限",
  "invoices.action.openPlatformAudit": "前往平台稽核",
  "invoices.action.clearFilters": "清除篩選",
  "invoices.action.openBilling": "前往帳務概覽",
  "invoices.action.downloadArtifact": "下載簽名檔",
  "invoices.action.viewDetail": "檢視詳情",
  "invoices.action.platformAudit": "平台稽核",
  "invoices.action.unavailableGeneric": "不可用操作",
  "invoices.action.disabled": "{label}已停用",
  "invoices.action.unavailable": "{label}不可用",
  "invoices.action.expired": "{label}已過期",
  "invoices.section.selected": "已選發票",
  "invoices.section.selectedSub":
    "在 drawer 或獨立路由拆出前，右側先保留 packet 要求的必要明細",
  "invoices.selected.overdue": "逾期發票",
  "invoices.selected.overdueBody":
    "已逾預設付款期限，必須與一般已開立狀態分開提示。",
  "invoices.selected.artifactExpired": "檔案已過期",
  "invoices.selected.artifactExpiredBody":
    "簽名下載連結已過期，但發票中繼資料與治理去向仍需保留。",
  "invoices.selected.billingTitle": "帳務抬頭",
  "invoices.selected.amount": "金額",
  "invoices.selected.period": "期別",
  "invoices.selected.periodValue": "{start} 到 {end}",
  "invoices.selected.issuedAt": "開立日",
  "invoices.selected.dueDate": "到期日",
  "invoices.selected.artifactUrl": "檔案 URL",
  "invoices.selected.expiresAt": "expiresAt",
  "invoices.selected.availableActions": "可用操作",
  "invoices.selected.picker": "發票選擇器",
  "invoices.selected.viewDetail": "檢視詳情",
  "invoices.section.crossApp": "跨應用上下文",
  "invoices.section.crossAppSub": "深層連結與明細歸屬",
  "invoices.selected.deepLinks": "深層連結",
  "invoices.selected.lines": "明細項目",
  "invoices.selected.line.orderId": "orderId：{value}",
  "invoices.section.context": "發票上下文",
  "invoices.section.contextSub": "選擇一筆發票以檢視明細、檔案狀態與深層連結",
  "invoices.section.contextBody":
    "發票詳情會顯示在右側。若目前是 empty state，右欄維持空白，不假裝已有明細資料。",
  "invoices.status.all": "全部",
  "invoices.status.draft": "草稿",
  "invoices.status.issued": "已開立",
  "invoices.status.paid": "已付款",
  "invoices.status.overdue": "逾期",
  "invoices.status.unknown": "未知",
  "invoices.reason.notProvisioned": "尚未設定",
  "invoices.reason.fetchFailed": "讀取失敗",
  "invoices.reason.permissionDenied": "權限不足",
  "invoices.reason.externalUnavailable": "外部服務不可用",
  "invoices.reason.filteredEmpty": "篩選結果為空",
  "invoices.reason.noData": "尚無資料",

  // ── billing (i18n-fullsweep 20260614) ──

  "billing.action.editProfile": "編輯帳務資料",
  "billing.action.openInvoices": "前往發票",
  "billing.action.refresh": "重新整理",
  "billing.refresh.title": "更新頻率 T5 · 租戶慢速（30 秒）",
  "billing.refresh.body":
    "此頁以 {seconds} 秒的租戶慢速節奏更新（tier: {tier}）。快照載入於 {generatedAt}。",
  "billing.error.profile": "租戶帳務設定檔讀取失敗。",
  "billing.error.invoices": "租戶發票讀取失敗。",
  "billing.error.statements": "租戶對帳單讀取失敗。",
  "billing.error.quota": "租戶額度摘要讀取失敗。",
  "billing.error.loadTitle": "帳務資料暫時無法完整載入",
  "billing.empty.notProvisioned.title": "帳務概覽",
  "billing.empty.notProvisioned.body":
    "此租戶尚未建立帳務檔案、當期用量或發票資料。請先完成帳務設定，再回到此頁查看當前快照。",
  "billing.empty.fetchFailed.title": "帳務資料載入失敗",
  "billing.empty.fetchFailed.body":
    "路由仍可使用，但帳務設定檔讀取失敗。請於後端相依服務恢復後重試。",
  "billing.empty.permissionDenied.title": "目前角色無法檢視帳務",
  "billing.empty.permissionDenied.body":
    "頁面可進入，但目前操作者沒有租戶帳務存取權限（需要 tc_admin 或 tc_finance）。",
  "billing.empty.externalUnavailable.title": "下游帳務服務暫時無法使用",
  "billing.empty.externalUnavailable.body":
    "用量與發票來源的部分上游服務目前無回應或回傳過期資料，因此當期數字可能不完整。",
  "billing.empty.filteredEmpty.title": "目前篩選條件沒有資料",
  "billing.empty.filteredEmpty.body":
    "帳務資料存在，但目前篩選沒有對應結果。請清除篩選或改選其他期別。",
  "billing.empty.noData.title": "本期尚無帳務活動",
  "billing.empty.noData.body":
    "帳務設定檔已建立，但本期尚未出現發票或用量紀錄。一旦有活動入帳，就會顯示於此。",
  "billing.kpi.accrued": "本期累計",
  "billing.kpi.projected": "預估結帳（run-rate）",
  "billing.kpi.projectedSub": "{periodKey} 月結 · 線性推估",
  "billing.kpi.projectedEmpty": "尚無當期",
  "billing.kpi.tripCount": "本期趟次",
  "billing.kpi.averageTicket": "平均單筆",
  "billing.quota.share": "{percent}% / {count} 配額",
  "billing.quota.unset": "未設定趟次配額",
  "billing.section.profileEmpty":
    "帳務設定檔尚未建立。完成設定後，發票抬頭、統一編號與聯絡資訊會顯示於此。",
  "billing.empty.invoices": "目前沒有可顯示的發票。",
  "billing.profile.invoiceTitle": "發票抬頭",
  "billing.profile.taxId": "統一編號",
  "billing.profile.contact": "計費聯絡人",
  "billing.profile.address": "帳單地址",
  "billing.profile.settlementMethod": "結算方式",
  "billing.profile.settlementMethodValue": "月結發票",
  "billing.profile.updatedAt": "最後更新",
  "billing.col.invoice": "發票",
  "billing.col.period": "期別",
  "billing.col.amount": "金額",
  "billing.col.status": "狀態",
  "billing.col.due": "到期",
  "billing.status.draft": "草稿",
  "billing.status.issued": "已開立",
  "billing.status.paid": "已付款",
  "billing.status.pending": "待處理",
  "billing.status.unknown": "未知",

  // ── passengers (i18n-fullsweep 20260614) ──

  // ── addresses (i18n-fullsweep 20260614) ──

  // ── users (i18n-fullsweep 20260614) ──

  // ── integrationGovernance (i18n-fullsweep 20260614) ──

  // ── notifications (i18n-fullsweep 20260614) ──

  // ── featureFlags (i18n-fullsweep 20260614) ──

  // ── home (i18n-fullsweep 20260614) ──
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
