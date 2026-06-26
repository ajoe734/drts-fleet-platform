export type Locale = "en" | "zh";

type Params = Record<string, string | number>;

const en = {
  "app.title": "Referral Embed",
  "app.description":
    "Embedded DRTS ride-hailing surface for third-party referral channels (community / property-management apps): partner-scoped handoff, booking, trip status, and explicit unsupported states.",
  "common.language.switch": "Switch language",
  "common.language.en": "English",
  "common.language.zh": "Traditional Chinese",
  "common.route.open": "Open route",
  "common.route.openWithHref": "Open route: {href}",
  "common.none": "Not created",
  "common.estimatedFare": "Estimated fare",
  "common.approxNtd": "Approx. NT$ {amount}",
  "shell.badge": "Phase 1 passenger surface",
  "shell.title": "Passenger Web",
  "shell.description":
    "External-consumer shell for trip status, trip history, and receipt-aware follow-up, kept separate from tenant and ops control planes.",
  "shell.navLabel": "Passenger surface navigation",
  "shell.calloutTitle": "Receipt ownership stays source-driven",
  "shell.calloutBody":
    "This shell may show DRTS receipts, external receipt references, or explicit unsupported states. It must not invent a new email or SMS delivery channel.",
  "shell.footnote":
    "Baseline routes come from SYS-UI-003. Booking request, active trip, cancel, completion, and the named negative-flow routes are materialized by SYS-UI-004.",
  "shell.topbarEyebrow": "External Consumer Plane",
  "shell.topbarDefaultNote":
    "Dedicated shell for rider-facing status and receipt surfaces.",
  "shell.metaTopology": "Topology: apps/passenger-web",
  "shell.metaScope": "Scope: booking + trip + negative routes",
  "nav.home.label": "Booking Status Home",
  "nav.home.note":
    "Landing route for current trip posture, ETA framing, and next actions.",
  "nav.book.label": "Request a Ride",
  "nav.book.note":
    "Authority-safe booking request entry with eligibility, supply, and degraded fallbacks.",
  "nav.trip.label": "Active Trip",
  "nav.trip.note":
    "Current trip status with cancel, completion, read-only, and reauth subroutes.",
  "nav.trips.label": "Trip History",
  "nav.trips.note":
    "Past-trip landing zone that defers receipt rendering to the receipt lane.",
  "nav.receipts.label": "Receipt Center",
  "nav.receipts.note":
    "DRTS-issued, external-reference, and unsupported ownership states are explicit.",
  "nav.auth.label": "Auth Entry",
  "nav.auth.note":
    "Bootstrap entry for sign-in, trip lookup, and support-safe recovery framing.",
  "nav.unauthenticated.label": "Unauthenticated",
  "nav.unauthenticated.note":
    "Shows the fallback path when the rider cannot be verified yet.",
  "nav.unsupported.label": "Unsupported",
  "nav.unsupported.note":
    "Covers third-party receipt ownership and not-serviceable channel constraints.",
  "route.booking.main.label": "Request a Ride",
  "route.booking.main.outcome": "Request submitted",
  "route.booking.main.body":
    "Rider supplies pickup, drop-off, and an optional reservation window. ETA is framed as an estimate and the request is queued for matching.",
  "route.booking.denied.label": "Booking Denied",
  "route.booking.denied.outcome": "Denied by policy",
  "route.booking.denied.body":
    "Backend rejects the request because of safety, fraud, or platform policy guardrails. The rider sees a non-blaming reason and a support exit.",
  "route.booking.ineligible.label": "Booking Ineligible",
  "route.booking.ineligible.outcome": "Eligibility failed",
  "route.booking.ineligible.body":
    "Passenger profile, payment instrument, or program eligibility does not match the request. The route names which gate failed without leaking PII.",
  "route.booking.noSupply.label": "No Supply Available",
  "route.booking.noSupply.outcome": "No driver matched",
  "route.booking.noSupply.body":
    "No qualified driver or vehicle is available for the requested time and area. The rider is offered to retry, schedule, or use an alternate channel.",
  "route.booking.degraded.label": "Booking Degraded",
  "route.booking.degraded.outcome": "Read-only fallback",
  "route.booking.degraded.body":
    "Booking surface is in a degraded mode: status is visible but mutating actions are blocked. Riders are routed to support or asked to retry later.",
  "route.trip.main.label": "Active Trip Status",
  "route.trip.main.outcome": "Trip in progress",
  "route.trip.main.body":
    "Driver matched, ETA estimated, vehicle and trip identifiers visible. Cancel is offered only while authority allows it.",
  "route.trip.cancel.label": "Cancel Active Trip",
  "route.trip.cancel.outcome": "Cancel requested",
  "route.trip.cancel.body":
    "Cancellation flow when the rider still owns cancel authority. Names the policy window and possible cancellation fee context.",
  "route.trip.completed.label": "Trip Completed",
  "route.trip.completed.outcome": "Completed",
  "route.trip.completed.body":
    "Trip ended cleanly. Surface offers receipt visibility, trip trace, and a return path to history.",
  "route.trip.readOnly.label": "Read-Only Trip View",
  "route.trip.readOnly.outcome": "Read-only authority",
  "route.trip.readOnly.body":
    "Trip is owned by partner, tenant, or concierge. The rider can see status but cannot mutate; mutation lives with the source channel.",
  "route.trip.cancelled.label": "Trip Cancelled",
  "route.trip.cancelled.outcome": "Cancelled",
  "route.trip.cancelled.body":
    "Trip was cancelled by the rider, the driver, or the platform. The page names the cancelling actor and what the rider can do next.",
  "route.trip.reauth.label": "Reauth Required",
  "route.trip.reauth.outcome": "Session expired",
  "route.trip.reauth.body":
    "Rider session expired or context cannot be re-established. Trip data stays hidden until re-verification clears.",
  "home.eyebrow": "Booking status home",
  "home.title":
    "Passenger landing starts from trip state, ETA framing, and next-action clarity.",
  "home.body":
    "SYS-UI-003 opened the passenger shell with auth, trip-history, and receipt landing zones. SYS-UI-004 now materializes the booking request, active trip status, completion, cancellation, and named negative-flow routes.",
  "home.cta.book": "Request a ride",
  "home.cta.trip": "View active trip",
  "home.cta.history": "Trip history",
  "home.metric.trip": "Active trip",
  "home.metric.eta": "ETA",
  "home.metric.next": "Next action",
  "home.metric.ride": "Airport return to downtown",
  "home.metric.status": "Driver matched",
  "home.metric.etaValue": "8 minutes",
  "home.metric.etaNote":
    "Displayed as an estimated arrival, never as a guarantee.",
  "home.metric.nextValue": "Trip trace",
  "home.metric.nextNote": "Cancelable until driver arrives at pickup",
  "home.lane.baseline": "Baseline",
  "home.lane.current.title": "Current trip posture",
  "home.lane.current.body":
    "Passenger home lands on booking status first, not a generic marketing splash. ETA is always framed as an estimate rather than a guarantee.",
  "home.lane.history.title": "History and receipts",
  "home.lane.history.body":
    "Past trips and receipt ownership are reachable from the same shell so riders do not need a separate product surface.",
  "home.lane.negative.title": "Negative-flow visibility",
  "home.lane.negative.body":
    "Booking denial, ineligible, no-supply, degraded, cancelled, and reauth states are dedicated routes, not silent toasts.",
  "home.bookingInventory.eyebrow": "Booking flow inventory",
  "home.bookingInventory.title":
    "Every booking-request outcome has its own route",
  "home.bookingInventory.body":
    "The request entry, denial, ineligible, no-supply, and degraded states are reachable directly from this map for review and demos.",
  "home.tripInventory.eyebrow": "Trip flow inventory",
  "home.tripInventory.title": "Every active-trip outcome has its own route",
  "home.tripInventory.body":
    "Active status, cancel, completion, read-only authority, cancelled, and reauth-required all live on dedicated subroutes.",
  "home.callout.empty.title": "Empty-state contract",
  "home.callout.empty.body":
    "If no active trip exists, the surface degrades to history, receipt lookup, and support-safe entry points instead of a blank shell.",
  "home.callout.backend.title": "Backend wiring stays downstream",
  "home.callout.backend.body":
    "This slice materializes route topology and authority framing. Live booking create, cancel, and status integration is the next wave; nothing here invents a fake mutation.",
  "auth.eyebrow": "Auth entry",
  "auth.title": "Passenger bootstrap now has a named landing route.",
  "auth.body":
    "This route reserves the channel-specific sign-in and trip-lookup entry point required by the reopened passenger topology. It keeps the auth boundary explicit while downstream transport and identity seams are still being wired.",
  "auth.option1.title": "Magic-link or code entry",
  "auth.option1.body":
    "Primary rider bootstrap path for direct passenger access once the channel-specific auth seam is implemented.",
  "auth.option2.title": "Trip lookup with guarded fallback",
  "auth.option2.body":
    "Supports reservation code or contact verification framing without exposing tenant or ops identity surfaces.",
  "auth.option3.title": "Support escalation",
  "auth.option3.body":
    "If the rider cannot be verified, the shell routes them to explicit unauthenticated handling rather than inventing partial access.",
  "auth.entryLane": "Entry lane",
  "auth.callout.title": "Unauthenticated state",
  "auth.callout.body":
    "Riders who have not cleared verification flow into a dedicated fallback route instead of seeing stale trip data.",
  "auth.callout.cta": "View unauthenticated fallback",
  "book.eyebrow": "Booking request",
  "book.title":
    "Request a ride lands as a real route, not a coming-soon placeholder.",
  "book.body":
    "This route materializes the passenger booking entry required by SYS-UI-004. It frames the request as a quote-then-confirm flow, stays explicit about ETA estimates, and exposes every reachable negative outcome as its own named subroute.",
  "book.cta.trip": "Continue to active trip view",
  "book.cta.auth": "Verify rider identity first",
  "book.summary.kicker": "Request payload preview",
  "book.summary.title":
    "Confirm pickup, drop-off, and timing before submission",
  "book.summary.pickup.label": "Pickup",
  "book.summary.pickup.value": "1 Market St, San Francisco",
  "book.summary.pickup.note":
    "Captured from the rider's stored location or fresh entry.",
  "book.summary.dropoff.label": "Drop-off",
  "book.summary.dropoff.value": "SFO Terminal 2",
  "book.summary.dropoff.note":
    "Drop-off can be a saved place or a freeform address.",
  "book.summary.window.label": "Reservation window",
  "book.summary.window.value": "Pick up in about 10 min",
  "book.summary.window.note":
    "Estimated arrival is shown as a range, never as a guaranteed minute.",
  "book.summary.service.label": "Service level",
  "book.summary.service.value": "Standard direct",
  "book.summary.service.note":
    "Partner, tenant, and concierge surfaces have their own request entry; this lane is direct passenger.",
  "book.summary.footnote":
    "Submission is intentionally not wired to a live backend in this slice. The slice materializes route topology and authority framing; the actual POST /bookings integration belongs to a downstream wave.",
  "book.callout.authority.title": "Authority-safe entry",
  "book.callout.authority.body":
    "This surface only owns direct passenger requests. Bookings owned by tenant, partner, or concierge channels stay in their own surfaces and are not duplicated here.",
  "book.callout.eta.title": "ETA stays an estimate",
  "book.callout.eta.body":
    "The route never guarantees a specific pickup minute. Quote and estimated-arrival framing is part of the contract, not decoration.",
  "book.negative.eyebrow": "Negative outcomes",
  "book.negative.title": "Every reachable rejection has its own route",
  "book.negative.body":
    "Riders never land on a vague something-went-wrong page. Each failure mode is a named subroute with explicit framing and a safe next action.",
  "denied.eyebrow": "Denied by policy",
  "denied.title": "Booking request was denied.",
  "denied.body":
    "The platform rejected this request for a policy reason. The rider surface intentionally does not show the underlying decision graph; it shows the public-facing reason and the safe next steps.",
  "denied.sampleKicker": "Reason class sample",
  "denied.sampleTitle": "policy.safety_hold",
  "denied.sampleBody":
    "Public-facing message: We could not complete this request. Please contact support to review your account before booking again.",
  "denied.sampleNote":
    "Internal reason codes are not surfaced to the rider, but they are stable enough for support to look up. The mapping table is owned by the booking policy service, not by this UI.",
  "denied.reason1":
    "Active safety hold on the rider profile. Booking is blocked until the hold clears via support.",
  "denied.reason2":
    "Open fraud review on the rider's recent activity. The rider sees a non-blaming message and a support exit.",
  "denied.reason3":
    "Drop-off lies in a region the platform has explicitly blocked for non-credentialed riders.",
  "denied.callout.allowed.title": "Allowed next steps",
  "denied.callout.allowed.body":
    "Riders may contact support, retry after the policy reason clears, or fall back to an unsupported-channel acknowledgement.",
  "denied.callout.allowed.cta": "Open unsupported fallback",
  "denied.callout.notdo.title": "What the route does not do",
  "denied.callout.notdo.body":
    "It does not auto-retry, does not silently downgrade to a different service level, and does not blame the rider for the denial.",
  "denied.cta.auth": "Re-verify rider identity",
  "denied.cta.book": "Return to request entry",
  "ineligible.eyebrow": "Eligibility failed",
  "ineligible.title": "Rider does not currently qualify for this booking.",
  "ineligible.body":
    "Eligibility is checked before the request is dispatched. This route shows which gate failed without leaking PII or other riders' data. Each gate has its own remediation lane.",
  "ineligible.kicker": "Eligibility checklist",
  "ineligible.listTitle": "Gate-by-gate result",
  "ineligible.gate1.name": "Identity verification",
  "ineligible.gate1.state": "verified",
  "ineligible.gate1.body":
    "Rider identity has been verified. This gate is currently passing.",
  "ineligible.gate2.name": "Payment instrument",
  "ineligible.gate2.state": "missing",
  "ineligible.gate2.body":
    "No usable payment instrument is on file. The rider must add one before requesting a paid trip.",
  "ineligible.gate3.name": "Program eligibility",
  "ineligible.gate3.state": "not enrolled",
  "ineligible.gate3.body":
    "The requested fare program requires enrollment that is not present on this profile.",
  "ineligible.callout.payment.title": "Add a payment instrument",
  "ineligible.callout.payment.body":
    "Riders may resolve the most common ineligible state by adding a valid payment instrument. The rider profile lane owns this entry point.",
  "ineligible.callout.program.title": "Program enrollment",
  "ineligible.callout.program.body":
    "Subsidy, paratransit, and partner programs are not auto-enrolled. The rider is sent to the program owner instead of being denied silently.",
  "ineligible.callout.program.cta": "Open unsupported fallback",
  "ineligible.callout.downgrade.title": "No silent downgrade",
  "ineligible.callout.downgrade.body":
    "The route never silently switches the rider to a different fare program or service tier. Any fallback must be explicit.",
  "ineligible.cta.auth": "Re-verify identity",
  "ineligible.cta.book": "Return to request entry",
  "noSupply.eyebrow": "No driver matched",
  "noSupply.title": "No supply is currently available for this request.",
  "noSupply.body":
    "The request was not denied; the platform simply could not match a qualified driver inside the configured radius and time window. The rider keeps cancel-safe authority and is offered explicit fallbacks.",
  "noSupply.kicker": "Why this differs from denied and unsupported",
  "noSupply.listTitle": "Supply-side rather than policy-side",
  "noSupply.row1.label": "Pickup ETA window",
  "noSupply.row1.value": "no qualified driver under 30 min",
  "noSupply.row1.note":
    "The platform searched the configured radius and time window without a match.",
  "noSupply.row2.label": "Service area",
  "noSupply.row2.value": "in service",
  "noSupply.row2.note":
    "The drop-off is inside the supported area, so this is not an unsupported outcome.",
  "noSupply.row3.label": "Fallback options",
  "noSupply.row3.value": "schedule for later, retry, alternate channel",
  "noSupply.row3.note":
    "Each fallback is offered as an explicit affordance, not auto-applied.",
  "noSupply.callout.retry.title": "Retry now",
  "noSupply.callout.retry.body":
    "Riders may retry immediately; supply changes second by second and the platform may match a driver shortly.",
  "noSupply.callout.retry.cta": "Re-submit the same request",
  "noSupply.callout.schedule.title": "Schedule for later",
  "noSupply.callout.schedule.body":
    "Riders may convert the request into a scheduled reservation if the program allows it. The reservation lane owns the actual booking-type swap.",
  "noSupply.callout.match.title": "No phantom matching",
  "noSupply.callout.match.body":
    "The route never claims a match that does not exist and never holds the rider in a fake searching-forever state without a deadline.",
  "degraded.eyebrow": "Read-only fallback",
  "degraded.title": "Booking is in degraded mode.",
  "degraded.body":
    "The booking surface has detected a degraded backend. The route stays honest about which affordances are available and which are intentionally blocked instead of failing silently when a submit is attempted.",
  "degraded.kicker": "Affordance matrix",
  "degraded.listTitle": "What works, what is blocked, and why",
  "degraded.row1.name": "View existing trip status",
  "degraded.row1.state": "available",
  "degraded.row1.body":
    "Read paths still work. Riders can confirm whether an in-progress trip exists and view its last-known status snapshot.",
  "degraded.row2.name": "Submit new booking request",
  "degraded.row2.state": "blocked",
  "degraded.row2.body":
    "Mutating endpoints are intentionally disabled while the platform is in degraded mode. The submit affordance is hidden, not faked.",
  "degraded.row3.name": "Cancel an active trip",
  "degraded.row3.state": "blocked",
  "degraded.row3.body":
    "Cancellation is also held back; operations or support owns mutations during the degraded window so two writers cannot race.",
  "degraded.row4.name": "Contact support",
  "degraded.row4.state": "available",
  "degraded.row4.body":
    "Support escalation is always available, including a clearly named incident reference for the rider to share.",
  "degraded.callout.signal.title": "Where the signal comes from",
  "degraded.callout.signal.body":
    "Degraded mode is driven by an upstream health signal, not by the UI guessing. The rider sees the same posture support is operating on, so explanations stay consistent.",
  "degraded.callout.retry.title": "No fake retries",
  "degraded.callout.retry.body":
    "The route never silently retries a blocked mutation in the background. Retries are explicit rider actions tied to the recovery state.",
  "degraded.cta.trip": "View any active trip status",
  "degraded.cta.unsupported": "Open unsupported fallback",
  "trip.eyebrow": "Active trip status",
  "trip.title":
    "The active trip surface is now a real route, not a roadmap note.",
  "trip.body":
    "This page materializes the in-flight passenger trip view required by SYS-UI-004. Status, ETA framing, vehicle metadata, and authority posture are all visible. Mutations only appear when the rider still owns the relevant authority.",
  "trip.snapshot.kicker": "Trip {id}",
  "trip.snapshot.title": "Driver matched",
  "trip.snapshot.eta.label": "ETA",
  "trip.snapshot.eta.value": "8 min estimate",
  "trip.snapshot.eta.note":
    "Always rendered as an estimate, never as a guarantee.",
  "trip.snapshot.vehicle.label": "Vehicle",
  "trip.snapshot.vehicle.value": "White Toyota Camry · 7VBN384",
  "trip.snapshot.vehicle.note":
    "Plate and model shown so the rider can identify the vehicle.",
  "trip.snapshot.driver.label": "Driver",
  "trip.snapshot.driver.value": "Driver M.",
  "trip.snapshot.driver.note":
    "Only first name; phone-bridged contact is handled outside this surface.",
  "trip.snapshot.authority.label": "Authority",
  "trip.snapshot.authority.value": "DRTS-owned trip",
  "trip.snapshot.authority.note":
    "Mutation is allowed because this is a direct passenger trip.",
  "trip.snapshot.cancel.label": "Cancel window",
  "trip.snapshot.cancel.value": "Cancel-safe until pickup arrival",
  "trip.snapshot.cancel.note":
    "Cancellation policy is enforced server-side; the UI only mirrors it.",
  "trip.cta.cancel": "Cancel this trip",
  "trip.cta.completed": "Preview completion view",
  "trip.lifecycle.kicker": "Lifecycle",
  "trip.lifecycle.title": "Phase-by-phase progress",
  "trip.lifecycle.requested.phase": "Requested",
  "trip.lifecycle.requested.state": "complete",
  "trip.lifecycle.requested.body": "Rider submitted the request.",
  "trip.lifecycle.matched.phase": "Matched",
  "trip.lifecycle.matched.state": "current",
  "trip.lifecycle.matched.body": "Driver accepted; ETA estimate is rolling.",
  "trip.lifecycle.pickup.phase": "En route to pickup",
  "trip.lifecycle.pickup.state": "upcoming",
  "trip.lifecycle.pickup.body": "Driver is moving toward pickup.",
  "trip.lifecycle.boarded.phase": "Picked up",
  "trip.lifecycle.boarded.state": "upcoming",
  "trip.lifecycle.boarded.body": "Trip starts after the rider boards.",
  "trip.lifecycle.dropoff.phase": "Drop-off",
  "trip.lifecycle.dropoff.state": "upcoming",
  "trip.lifecycle.dropoff.body":
    "Trip ends at the drop-off and the receipt becomes available.",
  "trip.routes.eyebrow": "Subroutes",
  "trip.routes.title": "Each lifecycle outcome has its own named route",
  "trip.routes.body":
    "Cancel, complete, read-only authority, post-fact cancellation, and reauth-required outcomes are split out so the UI is auditable route by route, not behind hidden conditional branches.",
  "tripCancel.eyebrow": "Cancel requested",
  "tripCancel.title": "Cancel the active trip while authority allows it.",
  "tripCancel.body":
    "This route is reachable only while the rider holds cancel authority. The page mirrors the server-enforced policy window and the quoted fee so the rider sees the same numbers support sees.",
  "tripCancel.kicker": "Policy snapshot",
  "tripCancel.policyTitle": "What cancellation does right now",
  "tripCancel.policy1.label": "Cancel window",
  "tripCancel.policy1.value": "Open until pickup",
  "tripCancel.policy1.note":
    "Rider holds cancellation authority until the driver arrives at pickup.",
  "tripCancel.policy2.label": "Cancellation fee",
  "tripCancel.policy2.value": "$0 today",
  "tripCancel.policy2.note":
    "Server enforces fee policy. The UI mirrors the current quote and never invents a different amount.",
  "tripCancel.policy3.label": "Refund posture",
  "tripCancel.policy3.value": "Pre-auth release",
  "tripCancel.policy3.note":
    "Any payment pre-auth is released; no settled charge happens for an in-window cancel.",
  "tripCancel.reason.kicker": "Reason optional",
  "tripCancel.reason.title": "Why are you cancelling?",
  "tripCancel.reason1": "Plans changed",
  "tripCancel.reason2": "Wait time too long",
  "tripCancel.reason3": "Pickup location is wrong",
  "tripCancel.reason4": "Other",
  "tripCancel.reasonState": "selectable",
  "tripCancel.reasonBody":
    "Free-form text is allowed but is not required to cancel.",
  "tripCancel.reasonFootnote":
    "The reason is reported to the operations side for supply tuning. It never blocks cancellation when the policy window is open.",
  "tripCancel.callout.after.title": "After cancellation",
  "tripCancel.callout.after.body":
    "The rider lands on the cancelled-trip surface, which names the cancelling actor for clarity.",
  "tripCancel.callout.after.cta": "Preview cancelled-trip view",
  "tripCancel.callout.window.title": "Out-of-window cancellation",
  "tripCancel.callout.window.body":
    "Once the cancel window closes, this route stops offering the mutation and routes the rider to the read-only or completed view instead.",
  "tripCancel.cta.confirm": "Confirm cancellation preview",
  "tripCancel.cta.keep": "Keep the trip",
  "tripCancelled.eyebrow": "Cancelled",
  "tripCancelled.title": "This trip was cancelled.",
  "tripCancelled.body":
    "The trip is closed without a completed pickup. The route names the cancelling actor and the safe next action. The rider should never have to guess who cancelled or whether the cancellation cost something.",
  "tripCancelled.kicker": "Cancelling actor",
  "tripCancelled.listTitle": "Who cancelled this trip and what comes next",
  "tripCancelled.case1.actor": "Rider",
  "tripCancelled.case1.body":
    "The rider cancelled while the policy window was open. No fee is charged in this scenario.",
  "tripCancelled.case1.next": "Rider may request a new trip immediately.",
  "tripCancelled.case2.actor": "Driver",
  "tripCancelled.case2.body":
    "The matched driver cancelled before pickup. The platform did not penalize the rider.",
  "tripCancelled.case2.next":
    "The platform attempts re-matching automatically; the rider sees the new state explicitly.",
  "tripCancelled.case3.actor": "Platform",
  "tripCancelled.case3.body":
    "Operations cancelled the trip due to a safety, supply, or policy event. The rider is told what happened in non-PII terms.",
  "tripCancelled.case3.next":
    "The rider is offered support escalation and any auto-issued credit.",
  "tripCancelled.nextLabel": "Next",
  "tripCancelled.nextValue": "Next: {value}",
  "tripCancelled.state": "cancelled",
  "tripCancelled.callout.receipt.title": "Cancellation receipt",
  "tripCancelled.callout.receipt.body":
    "Any cancellation-fee receipt follows the same source-driven rules as a normal trip receipt; the receipt center surfaces it where it applies.",
  "tripCancelled.callout.receipt.cta": "Check the receipt center",
  "tripCancelled.callout.retry.title": "Try again",
  "tripCancelled.callout.retry.body":
    "The rider can submit a new request from the booking entry. If supply is the problem, the no-supply route is reused.",
  "tripCancelled.callout.retry.cta": "Open a new booking",
  "tripCancelled.callout.notdo.title": "What this route does not do",
  "tripCancelled.callout.notdo.body":
    "It does not silently issue a credit, does not auto-reorder the same trip, and does not blame the rider for a cancellation it did not own.",
  "tripCompleted.eyebrow": "Completed",
  "tripCompleted.title": "Trip completed cleanly.",
  "tripCompleted.body":
    "The trip ended at the drop-off. This route consolidates the post-trip summary, points the rider at the platform-issued receipt, and leaves a return path back to history for follow-up.",
  "tripCompleted.kicker": "Trip summary",
  "tripCompleted.listTitle": "Post-trip snapshot",
  "tripCompleted.row1.label": "Trip ID",
  "tripCompleted.row1.value": "trp_8FQ12X",
  "tripCompleted.row1.note":
    "Stable identifier for this trip across history, receipts, and support.",
  "tripCompleted.row2.label": "Duration",
  "tripCompleted.row2.value": "23 min",
  "tripCompleted.row2.note":
    "Measured wheels-down to wheels-up; not a quoted estimate.",
  "tripCompleted.row3.label": "Distance",
  "tripCompleted.row3.value": "8.4 mi",
  "tripCompleted.row3.note": "Routing distance reported by the trip trace.",
  "tripCompleted.row4.label": "Fare total",
  "tripCompleted.row4.value": "$24.10",
  "tripCompleted.row4.note":
    "Server-authoritative; UI mirrors the settlement record.",
  "tripCompleted.row5.label": "Receipt status",
  "tripCompleted.row5.value": "DRTS-issued",
  "tripCompleted.row5.note":
    "Receipt is owned by the platform and is visible in the receipt center.",
  "tripCompleted.callout.receipt.title": "Open the receipt",
  "tripCompleted.callout.receipt.body":
    "The DRTS-issued receipt is reachable from the receipt center and keeps source-driven ownership semantics.",
  "tripCompleted.callout.receipt.cta": "Go to receipt center",
  "tripCompleted.callout.history.title": "Return to history",
  "tripCompleted.callout.history.body":
    "Past trips list completed and prior trips together with the right receipt-ownership outcomes.",
  "tripCompleted.callout.history.cta": "View trip history",
  "tripCompleted.callout.scope.title": "Out of scope",
  "tripCompleted.callout.scope.body":
    "Tip flow, complaint flow, and ratings are intentionally not materialized in this slice. Each lives in its own future lane.",
  "tripReadOnly.eyebrow": "Read-only authority",
  "tripReadOnly.title": "This trip is read-only for the rider.",
  "tripReadOnly.body":
    "The booking is owned by another channel. The rider can follow the trip but cannot cancel, reschedule, or override fare from this surface. The mutating authority lives with the source channel.",
  "tripReadOnly.kicker": "Ownership snapshot",
  "tripReadOnly.snapshotTitle": "Authority breakdown",
  "tripReadOnly.row1.label": "Source channel",
  "tripReadOnly.row1.value": "Tenant booking",
  "tripReadOnly.row1.note":
    "The trip was booked by a tenant on behalf of the rider; the tenant retains mutation authority.",
  "tripReadOnly.row2.label": "Visible to rider",
  "tripReadOnly.row2.value": "Status, ETA, vehicle, lifecycle",
  "tripReadOnly.row2.note":
    "All read paths are mirrored so the rider can follow the trip without owning mutation.",
  "tripReadOnly.row3.label": "Hidden from rider",
  "tripReadOnly.row3.value": "Cancel, reschedule, fare override",
  "tripReadOnly.row3.note":
    "Mutating affordances live with the source channel and are not surfaced here.",
  "tripReadOnly.matrixKicker": "Cross-channel matrix",
  "tripReadOnly.matrixTitle": "Where mutation lives by source channel",
  "tripReadOnly.table.source": "Source channel",
  "tripReadOnly.table.authority": "Mutation authority",
  "tripReadOnly.table.visibility": "Rider visibility",
  "tripReadOnly.table.notes": "Notes",
  "tripReadOnly.case1.source": "Direct passenger",
  "tripReadOnly.case1.mutate": "Rider",
  "tripReadOnly.case1.view": "Rider",
  "tripReadOnly.case1.note":
    "The standard /trip route. Cancel-safe authority sits with the rider.",
  "tripReadOnly.case2.source": "Tenant booking",
  "tripReadOnly.case2.mutate": "Tenant console",
  "tripReadOnly.case2.view": "Rider read-only",
  "tripReadOnly.case2.note":
    "This route. Rider sees status; tenant owns cancel and override.",
  "tripReadOnly.case3.source": "Partner booking",
  "tripReadOnly.case3.mutate": "Partner channel",
  "tripReadOnly.case3.view": "Rider read-only",
  "tripReadOnly.case3.note":
    "Mutation is delegated to the partner surface. Rider stays read-only.",
  "tripReadOnly.case4.source": "Concierge booking",
  "tripReadOnly.case4.mutate": "Concierge or call point",
  "tripReadOnly.case4.view": "Rider read-only",
  "tripReadOnly.case4.note":
    "Mutation is held by the concierge surface; rider remains read-only.",
  "tripReadOnly.callout.fake.title": "No fake mutation affordance",
  "tripReadOnly.callout.fake.body":
    "Cancel, reschedule, and override do not appear here even as disabled buttons. Hiding them is intentional: surfacing a button the rider cannot press would be misleading.",
  "tripReadOnly.callout.act.title": "How the rider acts on this trip",
  "tripReadOnly.callout.act.body":
    "The rider must reach back through the source channel, whether tenant, partner, or concierge, to mutate the trip. Support escalation stays available.",
  "tripReadOnly.callout.act.cta": "Open unsupported or source-owned fallback",
  "tripReauth.eyebrow": "Session expired",
  "tripReauth.title": "Re-authentication is required to continue.",
  "tripReauth.body":
    "The platform held back trip data because it can no longer prove who the rider is. The route does not show stale trip details and does not silently downgrade to anonymous mode. Re-verification is the only way forward.",
  "tripReauth.kicker": "Why this happens",
  "tripReauth.listTitle": "Reauth is triggered by an explicit signal",
  "tripReauth.cause1.code": "Expired session",
  "tripReauth.cause1":
    "The rider session token expired during the trip. Trip data stays hidden until the rider re-verifies.",
  "tripReauth.cause2.code": "Session revoked",
  "tripReauth.cause2":
    "The session was revoked from another device or by support. Re-authentication is required.",
  "tripReauth.cause3.code": "Context mismatch",
  "tripReauth.cause3":
    "The trip context cannot be re-established because the rider profile changed. Verification clears it.",
  "tripReauth.state": "blocked",
  "tripReauth.callout.verify.title": "Re-verify identity",
  "tripReauth.callout.verify.body":
    "The auth-entry route owns the actual reauthentication path. After it clears, the rider returns to the active trip view automatically.",
  "tripReauth.callout.verify.cta": "Go to auth entry",
  "tripReauth.callout.hidden.title": "What stays hidden",
  "tripReauth.callout.hidden.body":
    "Trip status, ETA, vehicle, and driver details all stay hidden during reauth. The unauthenticated guardrails apply.",
  "tripReauth.callout.hidden.cta": "See unauthenticated fallback",
  "trips.eyebrow": "Trip history",
  "trips.title":
    "Trip history is a real passenger sub-surface with explicit outcome links.",
  "trips.body":
    "The reopened passenger app no longer leaves trip history as deferred prose. This route surfaces completed, cancelled, and read-only past trips, each linked to its own outcome route from SYS-UI-004.",
  "trips.card1.title": "Completed trip",
  "trips.card1.note": "DRTS-owned receipt available",
  "trips.card1.body":
    "A completed direct passenger trip can expose a platform-issued receipt and trip trace from the same lane.",
  "trips.card1.cta": "Open completed-trip view",
  "trips.card2.title": "Partner or tenant-funded trip",
  "trips.card2.note": "External receipt reference",
  "trips.card2.body":
    "History stays visible, but billing ownership may point the rider to the source channel that actually owns the receipt artifact.",
  "trips.card2.cta": "Open read-only trip view",
  "trips.card3.title": "Cancelled trip",
  "trips.card3.note": "Cancellation outcome",
  "trips.card3.body":
    "History keeps cancelled trips with the cancelling actor named so the rider does not have to reconstruct what happened.",
  "trips.card3.cta": "Open cancelled-trip view",
  "trips.card4.title": "No prior trips",
  "trips.card4.note": "Empty state",
  "trips.card4.body":
    "The route still explains how to find an active trip or re-enter via auth instead of rendering an empty table shell.",
  "trips.card4.cta": "Re-enter through auth",
  "trips.callout.receipt.title": "Receipt center handoff",
  "trips.callout.receipt.body":
    "Receipt rendering rules are owned by the dedicated receipt lane, so trip history links forward instead of duplicating billing logic.",
  "trips.callout.receipt.cta": "Open receipt center",
  "trips.callout.notdo.title": "What history does not do",
  "trips.callout.notdo.body":
    "History does not re-issue receipts, does not invent cancellation credits, and does not surface trips owned by other riders.",
  "receipts.eyebrow": "Receipt center",
  "receipts.title":
    "The passenger receipt surface is now wired to concrete trip outcomes.",
  "receipts.body":
    "This landing page establishes the receipt topology required by SYS-UI-003 and links each ownership class to the matching trip outcome route from SYS-UI-004. Source-channel ownership stays authoritative; this surface only mirrors it.",
  "receipts.card1.title": "DRTS-issued receipt",
  "receipts.card1.status": "Supported",
  "receipts.card1.body":
    "Direct passenger trips can expose a platform-owned receipt artifact and trace metadata from this lane.",
  "receipts.card1.cta": "Preview completed-trip receipt",
  "receipts.card2.title": "External receipt reference",
  "receipts.card2.status": "Supported with ownership handoff",
  "receipts.card2.body":
    "When the source channel owns billing, the rider sees who owns the receipt and where to continue instead of a fake download button.",
  "receipts.card2.cta": "See read-only trip ownership",
  "receipts.card3.title": "Receipt unavailable or unsupported",
  "receipts.card3.status": "Explicitly handled",
  "receipts.card3.body":
    "Phone-assisted, partner, or otherwise unsupported cases remain visible with a concrete explanation and support direction.",
  "receipts.card3.cta": "Open unsupported fallback",
  "receipts.callout.title": "No invented delivery channel",
  "receipts.callout.body":
    "The route intentionally avoids claiming new email or SMS receipt delivery. Ownership and availability must stay aligned with upstream settlement and source-channel rules.",
  "unauth.eyebrow": "Unauthenticated state",
  "unauth.title": "Trip details stay locked until the rider clears bootstrap.",
  "unauth.body":
    "This route makes the fallback explicit for passengers who arrive without a valid session, code, or trip-verification context.",
  "unauth.callout.next.title": "Allowed next steps",
  "unauth.callout.next.body":
    "Re-enter through auth, verify a reservation code, or contact support through the future passenger support lane.",
  "unauth.callout.next.cta": "Return to auth entry",
  "unauth.callout.notdo.title": "What this route does not do",
  "unauth.callout.notdo.body":
    "It does not leak tenant-admin booking data, operations tooling, or partial receipt artifacts to an unauthenticated rider.",
  "unsupported.eyebrow": "Unsupported state",
  "unsupported.title":
    "Some trip and receipt outcomes are intentionally not owned by this shell.",
  "unsupported.body":
    "This route is the honest landing zone for out-of-service-area, third-party-owned, or otherwise unsupported passenger scenarios.",
  "unsupported.card1.kicker": "Not serviceable",
  "unsupported.card1.title": "Out-of-area or unsupported demand",
  "unsupported.card1.body":
    "If the rider is outside the service area, the product rule is to return an explicit not_serviceable outcome instead of pretending a booking can proceed.",
  "unsupported.card2.kicker": "Source-owned receipts",
  "unsupported.card2.title": "Partner or tenant billing lane",
  "unsupported.card2.body":
    "Where another channel owns settlement, this shell can point to that authority but should not fabricate a passenger download artifact.",
  "embed.chrome.title": "Community ride booking",
  "embed.chrome.webview": "webview",
  "embed.card.handoffSummary": "Identity handoff summary",
  "embed.card.handoffSubtitle": "signed handoff token",
  "embed.card.trip": "Trip",
  "embed.card.tripSubtitle": "pickup · drop-off · time",
  "embed.card.vehicles": "Vehicle type",
  "embed.card.vehiclesSubtitle": "owned mobility",
  "embed.card.negatives": "Test negative states",
  "embed.card.history": "Trip history",
  "embed.card.historySubtitle": "persistent identity · reopen safe",
  "embed.card.receipt": "Receipt",
  "embed.card.completed": "Trip completed",
  "embed.card.cancelled": "Trip cancelled",
  "embed.card.negative": "Negative state · {screen}",
  "embed.field.signature": "Community signature valid",
  "embed.field.identity": "Resident identity resolved",
  "embed.field.unit": "Community / unit",
  "embed.field.passengerId": "DRTS passenger",
  "embed.field.sessionBound": "Bound referral handoff session",
  "embed.token.connState": "Connection state",
  "embed.token.partnerSession": "Community session expired",
  "embed.token.partnerSessionValue": "expired",
  "embed.token.handoffToken": "Handoff token stale",
  "embed.token.handoffTokenValue": "stale",
  "embed.token.detection": "Detection result",
  "embed.token.originHost": "Origin host unauthorized",
  "embed.token.originHostValue": "unauthorized",
  "embed.token.partnerSignature": "Community signature",
  "embed.token.partnerSignatureValue": "missing",
  "embed.field.pickup": "Pickup",
  "embed.field.dropoff": "Drop-off",
  "embed.field.when": "Trip time",
  "embed.field.savedPlaces": "Saved places",
  "embed.field.eta": "ETA",
  "embed.field.driver": "Driver",
  "embed.field.completedAt": "Completed at",
  "embed.field.passenger": "Passenger",
  "embed.field.route": "Route",
  "embed.field.vehicle": "Vehicle",
  "embed.field.payment": "Payment",
  "embed.field.total": "Total",
  "embed.field.contact": "Contact driver / view receipt",
  "embed.field.viewHistory": "View trip history",
  "embed.field.viewReceipt": "View receipt",
  "embed.field.rebook": "Request another ride",
  "embed.field.backToBook": "Back to booking form",
  "embed.field.viewTrip": "View existing trip",
  "embed.field.trackTrip": "Track trip",
  "embed.field.contactSupport": "Contact support",
  "embed.field.contactDriver": "Contact driver",
  "embed.field.confirmRide": "Confirm ride request",
  "embed.field.returnToApp": "Back to community app",
  "embed.field.openStandalone": "Open standalone ride site",
  "embed.field.returnToEntry": "Return to {appName}",
  "embed.field.tryLater": "Try again later",
  "embed.field.agree": "Agree and start",
  "embed.field.notNow": "Not now",
  "embed.field.cancelTrip": "Cancel trip · {minutes} min left",
  "embed.nav.book": "Book",
  "embed.nav.trip": "Active",
  "embed.nav.trips": "History",
  "embed.nav.receipt": "Receipt",
  "embed.nav.completed": "Completed",
  "embed.nav.cancelled": "Cancelled",
  "embed.card.fallback": "AV fallback states",
  "embed.card.fallbackSubtitle":
    "Passenger-safe fallback posture from backend message codes",
  "embed.fallback.etaLabel": "Estimated pickup · ETA",
  "embed.fallback.etaNote": "Estimated only, not guaranteed",
  "embed.fallback.minutes": "min",
  "embed.fallback.tripId": "Trip ID",
  "embed.fallback.destination": "Destination",
  "embed.fallback.fare": "Fare",
  "embed.fallback.sameFare": "Original fare · no surcharge",
  "embed.fallback.sameBooking":
    "Same booking continues. No second booking and no additional charge.",
  "embed.fallback.operatorNote":
    "Transportation provided by {name}. Service status is for reference only.",
  "embed.state.handoff.title": "Ready to book as {name}",
  "embed.state.handoff.badge": "handoff · linked",
  "embed.state.reauth.title": "Sign-in state expired",
  "embed.state.reauth.badge": "reauth_required",
  "embed.state.unsupported.title": "Cannot open in this environment",
  "embed.state.unsupported.badge": "unsupported_host · blocked",
  "embed.state.consent.title": "Authorize ride-booking access",
  "embed.state.consent.badge": "consent_required",
  "embed.state.fallback.title": "Embedded service is temporarily unavailable",
  "embed.state.fallback.badge": "fallback_to_web · use website",
  "embed.message.unsupported":
    "The current source host is not on the authorized allowlist, so embedded loading has been blocked for security reasons.",
  "embed.message.reauth":
    "To protect your resident account, return to {appName} and re-enter ride booking.",
  "embed.message.consent":
    "First-time use requires consent confirmation. Trips and receipts stay linked to the existing resident identity.",
  "embed.message.fallback":
    "Ride booking cannot be completed inside the community app right now. The standalone website can still recover the same trips and receipts.",
  "embed.message.handoff":
    "No extra sign-in is needed. Resident identity is securely handed off from {appName}.",
  "embed.book.subtitle": "{name} · {unit}",
  "embed.book.identity": "Bound referral handoff session: {id}",
  "embed.book.now": "Depart now",
  "embed.book.pickup": "Yuhe Yunfeng Tower A Lobby",
  "embed.book.dropoff": "Taipei Veterans General Hospital Outpatient Building",
  "embed.book.negative.nosupply": "No supply",
  "embed.book.negative.ineligible": "Ineligible",
  "embed.book.negative.denied": "Denied",
  "embed.book.negative.degraded": "Degraded",
  "embed.vehicle.standard.name": "Standard",
  "embed.vehicle.standard.note": "1-4 riders",
  "embed.vehicle.comfort.name": "Comfort",
  "embed.vehicle.comfort.note": "1-4 riders · extra space",
  "embed.vehicle.xl.name": "Six-seater",
  "embed.vehicle.xl.note": "5-6 riders · extra luggage",
  "embed.place.lobby": "Community lobby",
  "embed.place.station": "Taipei Main Station",
  "embed.place.hospital": "Veterans General Hospital",
  "embed.trip.status.en_route": "Heading to pickup",
  "embed.trip.bound":
    "This trip remains linked to the referral passenger identity and can be recovered after reopening the community app.",
  "embed.history.inProgress": "In progress",
  "embed.history.completed": "Completed",
  "embed.history.cancelled": "Cancelled",
  "embed.receipt.pay": "Community monthly billing · linked resident account",
  "embed.completed.body":
    "This trip has ended successfully. The rider can go directly to the receipt or history view.",
  "embed.cancelled.body":
    "The cancellation outcome and source context are preserved without losing the linked handoff identity.",
  "embed.negative.nosupply":
    "No nearby dispatchable vehicle is available. Try again later or pick another time.",
  "embed.negative.ineligible":
    "This resident identity is not currently enrolled for ride booking. Please contact the community desk.",
  "embed.negative.denied":
    "This booking request was not approved. Confirm that the trip remains within the supported service area.",
  "embed.negative.degraded":
    "Service is responding slowly right now. Recovery will continue after the system stabilizes.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "app.title": "轉介嵌入前台",
  "app.description":
    "供第三方轉介渠道（社區／物業管理 App）內嵌的 DRTS 叫車前台：渠道身分交接、下單、行程狀態與明確的不支援狀態。",
  "common.language.switch": "切換語言",
  "common.language.en": "English",
  "common.language.zh": "繁體中文",
  "common.route.open": "開啟路由",
  "common.route.openWithHref": "開啟路由：{href}",
  "common.none": "未建立",
  "common.estimatedFare": "預估車資",
  "common.approxNtd": "約 NT$ {amount}",
  "shell.badge": "Phase 1 乘客前台",
  "shell.title": "乘客前台",
  "shell.description":
    "面向乘客的外部前台，用於行程狀態、行程歷史與收據後續處理，並與租戶與營運控制平面分離。",
  "shell.navLabel": "乘客前台導覽",
  "shell.calloutTitle": "收據權責維持來源系統主導",
  "shell.calloutBody":
    "此殼層可顯示 DRTS 收據、外部收據參照或明確的不支援狀態，但不得自行發明新的電子郵件或簡訊送達通道。",
  "shell.footnote":
    "基線路由來自 SYS-UI-003。訂單請求、進行中行程、取消、完成與具名負向流程路由則由 SYS-UI-004 具體化。",
  "shell.topbarEyebrow": "外部消費者層",
  "shell.topbarDefaultNote": "專供乘客查看狀態與收據的前台殼層。",
  "shell.metaTopology": "拓樸：apps/passenger-web",
  "shell.metaScope": "範圍：訂單 + 行程 + 負向路由",
  "nav.home.label": "訂單狀態首頁",
  "nav.home.note": "當前行程姿態、ETA 框架與下一步行動的落地頁。",
  "nav.book.label": "叫車請求",
  "nav.book.note": "具權限邊界的叫車入口，涵蓋資格、供給與降級 fallback。",
  "nav.trip.label": "進行中行程",
  "nav.trip.note": "目前行程狀態，含取消、完成、唯讀與重新驗證子路由。",
  "nav.trips.label": "行程歷史",
  "nav.trips.note": "過往行程入口，將收據呈現責任轉交給收據路由。",
  "nav.receipts.label": "收據中心",
  "nav.receipts.note": "DRTS 開立、外部參照與不支援的權責狀態都明確呈現。",
  "nav.auth.label": "驗證入口",
  "nav.auth.note": "登入、查詢行程與支援導向修復的起始入口。",
  "nav.unauthenticated.label": "未驗證",
  "nav.unauthenticated.note": "顯示乘客尚未完成驗證時的 fallback 路徑。",
  "nav.unsupported.label": "不支援",
  "nav.unsupported.note": "涵蓋第三方收據權責與不可服務通道限制。",
  "route.booking.main.label": "叫車請求",
  "route.booking.main.outcome": "請求已送出",
  "route.booking.main.body":
    "乘客提供上車、下車與可選預約時間窗。ETA 只作為估計值呈現，請求會進入媒合佇列。",
  "route.booking.denied.label": "訂單遭拒",
  "route.booking.denied.outcome": "被政策拒絕",
  "route.booking.denied.body":
    "後端基於安全、詐欺或平台政策護欄拒絕此請求。乘客只會看到不帶責難的說明與支援出口。",
  "route.booking.ineligible.label": "資格不符",
  "route.booking.ineligible.outcome": "資格檢核失敗",
  "route.booking.ineligible.body":
    "乘客檔案、付款工具或方案資格與此請求不相符。路由會指出是哪一道關卡失敗，同時不洩漏 PII。",
  "route.booking.noSupply.label": "目前無供給",
  "route.booking.noSupply.outcome": "未媒合到司機",
  "route.booking.noSupply.body":
    "在指定時間與區域內沒有合格司機或車輛可用。系統會明確提供重試、改期或其他通道。",
  "route.booking.degraded.label": "訂單降級",
  "route.booking.degraded.outcome": "唯讀 fallback",
  "route.booking.degraded.body":
    "叫車前台處於降級模式：可查看狀態，但會阻擋修改行為。乘客會被引導至支援或稍後再試。",
  "route.trip.main.label": "進行中行程狀態",
  "route.trip.main.outcome": "行程進行中",
  "route.trip.main.body":
    "已媒合司機、提供 ETA 估計，並顯示車輛與行程識別資訊。只有在權限允許時才會提供取消。",
  "route.trip.cancel.label": "取消進行中行程",
  "route.trip.cancel.outcome": "已請求取消",
  "route.trip.cancel.body":
    "當乘客仍持有取消權限時顯示的取消流程，會清楚標示政策時間窗與可能的取消費上下文。",
  "route.trip.completed.label": "行程完成",
  "route.trip.completed.outcome": "已完成",
  "route.trip.completed.body":
    "行程順利結束。前台會提供收據可見性、行程軌跡與回到歷史記錄的入口。",
  "route.trip.readOnly.label": "唯讀行程檢視",
  "route.trip.readOnly.outcome": "唯讀權限",
  "route.trip.readOnly.body":
    "此行程由合作夥伴、租戶或 concierge 持有。乘客可查看狀態但不能修改；修改權限屬於來源通道。",
  "route.trip.cancelled.label": "行程已取消",
  "route.trip.cancelled.outcome": "已取消",
  "route.trip.cancelled.body":
    "行程可能由乘客、司機或平台取消。頁面會明確指出取消者以及乘客接下來可做的事。",
  "route.trip.reauth.label": "需要重新驗證",
  "route.trip.reauth.outcome": "工作階段逾時",
  "route.trip.reauth.body":
    "乘客工作階段逾時，或系統無法重新建立上下文。重新驗證完成前，行程資料會維持隱藏。",
  "home.eyebrow": "訂單狀態首頁",
  "home.title": "乘客首頁從行程狀態、ETA 框架與下一步清晰度開始。",
  "home.body":
    "SYS-UI-003 已開啟乘客殼層中的驗證、行程歷史與收據入口。SYS-UI-004 進一步具體化叫車請求、進行中行程、完成、取消與具名負向流程路由。",
  "home.cta.book": "叫車",
  "home.cta.trip": "查看進行中行程",
  "home.cta.history": "行程歷史",
  "home.metric.trip": "進行中行程",
  "home.metric.eta": "ETA",
  "home.metric.next": "下一步",
  "home.metric.ride": "機場返程回市區",
  "home.metric.status": "已媒合司機",
  "home.metric.etaValue": "8 分鐘",
  "home.metric.etaNote": "一律以預估到達時間呈現，不作為保證。",
  "home.metric.nextValue": "行程軌跡",
  "home.metric.nextNote": "在司機抵達上車點前可安全取消",
  "home.lane.baseline": "基線",
  "home.lane.current.title": "目前行程姿態",
  "home.lane.current.body":
    "乘客首頁首先落在訂單狀態，而非泛用行銷首頁。ETA 永遠以估計而非保證呈現。",
  "home.lane.history.title": "歷史與收據",
  "home.lane.history.body":
    "過往行程與收據權責會在同一個殼層中可達，讓乘客不需要再跳到另一個產品面。",
  "home.lane.negative.title": "負向流程可見性",
  "home.lane.negative.body":
    "訂單遭拒、資格不符、無供給、降級、已取消與重新驗證狀態都擁有獨立路由，而非靜默 toast。",
  "home.bookingInventory.eyebrow": "訂單流程清單",
  "home.bookingInventory.title": "每種叫車請求結果都有自己的路由",
  "home.bookingInventory.body":
    "請求入口、遭拒、資格不符、無供給與降級狀態都能直接從此地圖進入，便於審閱與展示。",
  "home.tripInventory.eyebrow": "行程流程清單",
  "home.tripInventory.title": "每種進行中行程結果都有自己的路由",
  "home.tripInventory.body":
    "進行中狀態、取消、完成、唯讀權限、已取消與重新驗證需求都各自落在專屬子路由。",
  "home.callout.empty.title": "空狀態契約",
  "home.callout.empty.body":
    "若目前沒有進行中行程，此前台會回退到歷史、收據查詢與安全的支援入口，而不是顯示空白殼層。",
  "home.callout.backend.title": "後端串接仍屬下一波",
  "home.callout.backend.body":
    "此 slice 主要具體化路由拓樸與權限框架。實際的建立訂單、取消與狀態串接屬於下一波，不會在這裡發明假的 mutation。",
  "auth.eyebrow": "驗證入口",
  "auth.title": "乘客 bootstrap 現在有了具名落地路由。",
  "auth.body":
    "此路由保留重新開啟的乘客拓樸所需之通道特定登入與行程查詢入口。在下游 transport 與 identity seam 尚未接好前，它能維持驗證邊界明確。",
  "auth.option1.title": "Magic link 或代碼進入",
  "auth.option1.body":
    "一旦通道專屬驗證 seam 完成，這會是直接面向乘客的主要 bootstrap 路徑。",
  "auth.option2.title": "具護欄的行程查詢",
  "auth.option2.body":
    "支援預約代碼或聯絡方式驗證框架，同時不暴露租戶或營運身分前台。",
  "auth.option3.title": "支援升級",
  "auth.option3.body":
    "若乘客無法被驗證，殼層會將其導向明確的未驗證處理，而不是發明部分存取。",
  "auth.entryLane": "入口面",
  "auth.callout.title": "未驗證狀態",
  "auth.callout.body":
    "尚未通過驗證流程的乘客會落入專用 fallback 路由，而不是看到過期行程資料。",
  "auth.callout.cta": "查看未驗證 fallback",
  "book.eyebrow": "叫車請求",
  "book.title": "叫車入口是一條真正的路由，而不是即將推出的 placeholder。",
  "book.body":
    "此路由具體化 SYS-UI-004 所要求的乘客叫車入口。它將流程框為報價後確認，明確標示 ETA 為估計值，並把所有可達的負向結果拆成具名子路由。",
  "book.cta.trip": "繼續前往進行中行程",
  "book.cta.auth": "先驗證乘客身分",
  "book.summary.kicker": "請求內容預覽",
  "book.summary.title": "送出前確認上車、下車與時間資訊",
  "book.summary.pickup.label": "上車地點",
  "book.summary.pickup.value": "舊金山 Market St 1 號",
  "book.summary.pickup.note": "可來自乘客儲存地點，也可來自本次新輸入。",
  "book.summary.dropoff.label": "下車地點",
  "book.summary.dropoff.value": "SFO 第二航廈",
  "book.summary.dropoff.note": "下車地點可為儲存位置，也可為自由輸入地址。",
  "book.summary.window.label": "預約時間窗",
  "book.summary.window.value": "約 10 分鐘後上車",
  "book.summary.window.note": "到達時間以區間估計呈現，絕不保證特定分鐘。",
  "book.summary.service.label": "服務等級",
  "book.summary.service.value": "標準直派",
  "book.summary.service.note":
    "合作夥伴、租戶與 concierge 通道各有自己的入口；此處只處理直接乘客通道。",
  "book.summary.footnote":
    "此 slice 故意不接實際後端。它主要具體化路由拓樸與權限框架；真正的 POST /bookings 串接屬於下游波次。",
  "book.callout.authority.title": "權限安全的入口",
  "book.callout.authority.body":
    "此頁面只負責直接乘客的請求。由租戶、合作夥伴或 concierge 擁有的訂單會留在原通道，不在此重複。",
  "book.callout.eta.title": "ETA 仍是估計值",
  "book.callout.eta.body":
    "此路由不會保證特定上車分鐘。報價與預估抵達框架屬於契約本身，不是裝飾。",
  "book.negative.eyebrow": "負向結果",
  "book.negative.title": "每種可達的拒絕狀態都有自己的路由",
  "book.negative.body":
    "乘客不會落到含糊的 something went wrong 頁面。每種失敗模式都有具名子路由、明確上下文與安全下一步。",
  "denied.eyebrow": "被政策拒絕",
  "denied.title": "此叫車請求遭到拒絕。",
  "denied.body":
    "平台基於政策原因拒絕了此請求。乘客前台不會顯示底層決策圖，而是提供面向乘客的說明與安全的下一步。",
  "denied.sampleKicker": "原因類別範例",
  "denied.sampleTitle": "policy.safety_hold",
  "denied.sampleBody":
    "對外訊息：目前無法完成此請求，請先聯絡支援檢視帳號後再重新叫車。",
  "denied.sampleNote":
    "內部原因碼不會直接顯示給乘客，但對支援而言具有足夠穩定性可供查詢。映射表由 booking policy service 擁有，而非此 UI。",
  "denied.reason1": "乘客檔案存在安全性 hold。在支援解除前無法叫車。",
  "denied.reason2":
    "近期活動仍在詐欺審查中。乘客只會看到不帶責難的訊息與支援出口。",
  "denied.reason3": "下車地點位於平台明確封鎖、且不對一般乘客開放的區域。",
  "denied.callout.allowed.title": "允許的下一步",
  "denied.callout.allowed.body":
    "乘客可聯絡支援、待政策原因解除後重試，或退回到不支援通道確認頁。",
  "denied.callout.allowed.cta": "開啟不支援 fallback",
  "denied.callout.notdo.title": "此路由不會做的事",
  "denied.callout.notdo.body":
    "它不會自動重試、不會靜默降級到其他服務等級，也不會把拒絕責任推給乘客。",
  "denied.cta.auth": "重新驗證乘客身分",
  "denied.cta.book": "返回叫車入口",
  "ineligible.eyebrow": "資格檢核失敗",
  "ineligible.title": "乘客目前不符合此叫車資格。",
  "ineligible.body":
    "資格會在派車前先行檢查。此路由會指出哪一道關卡未通過，同時不洩漏 PII 或其他乘客資料。每個關卡都有自己的修復路徑。",
  "ineligible.kicker": "資格檢核清單",
  "ineligible.listTitle": "逐關卡檢視結果",
  "ineligible.gate1.name": "身分驗證",
  "ineligible.gate1.state": "已驗證",
  "ineligible.gate1.body": "乘客身分已驗證完成，此關卡目前通過。",
  "ineligible.gate2.name": "付款工具",
  "ineligible.gate2.state": "缺少",
  "ineligible.gate2.body":
    "檔案中沒有可用的付款工具。乘客需先補上後才能請求付費行程。",
  "ineligible.gate3.name": "方案資格",
  "ineligible.gate3.state": "未註冊",
  "ineligible.gate3.body": "此請求所需方案尚未綁定在此乘客檔案上。",
  "ineligible.callout.payment.title": "新增付款工具",
  "ineligible.callout.payment.body":
    "最常見的不符合資格狀態可透過新增有效付款工具解決。此入口由 rider profile lane 擁有。",
  "ineligible.callout.program.title": "方案註冊",
  "ineligible.callout.program.body":
    "補助、復康巴士或合作方案不會自動註冊。乘客會被導向方案擁有方，而不是被靜默拒絕。",
  "ineligible.callout.program.cta": "開啟不支援 fallback",
  "ineligible.callout.downgrade.title": "不做靜默降級",
  "ineligible.callout.downgrade.body":
    "此路由不會靜默切換乘客到其他票價方案或服務層級。任何 fallback 都必須明示。",
  "ineligible.cta.auth": "重新驗證身分",
  "ineligible.cta.book": "返回叫車入口",
  "noSupply.eyebrow": "未媒合到司機",
  "noSupply.title": "此請求目前沒有可用供給。",
  "noSupply.body":
    "此請求並非被拒絕；平台只是無法在設定半徑與時間窗內找到合格司機。乘客仍保有安全取消權限，且會看到明確的 fallback。",
  "noSupply.kicker": "為何這與遭拒或不支援不同",
  "noSupply.listTitle": "供給問題而非政策問題",
  "noSupply.row1.label": "上車 ETA 視窗",
  "noSupply.row1.value": "30 分鐘內無合格司機",
  "noSupply.row1.note": "平台已在設定半徑與時間窗內搜尋，但未找到媒合對象。",
  "noSupply.row2.label": "服務區域",
  "noSupply.row2.value": "仍在服務範圍內",
  "noSupply.row2.note": "下車點位於支援區域中，因此這不是 unsupported 結果。",
  "noSupply.row3.label": "Fallback 選項",
  "noSupply.row3.value": "稍後預約、立即重試、替代通道",
  "noSupply.row3.note": "每種 fallback 都會作為顯式選項呈現，不會被自動套用。",
  "noSupply.callout.retry.title": "立即重試",
  "noSupply.callout.retry.body":
    "乘客可立即重試；供給每分每秒都在變化，平台可能很快就會媒合到司機。",
  "noSupply.callout.retry.cta": "重新送出相同請求",
  "noSupply.callout.schedule.title": "改成稍後預約",
  "noSupply.callout.schedule.body":
    "若方案允許，乘客可將請求改為預約型行程。真正的預約型態切換由 reservation lane 擁有。",
  "noSupply.callout.match.title": "不會幻覺式媒合",
  "noSupply.callout.match.body":
    "此路由不會宣稱不存在的媒合結果，也不會讓乘客無期限停留在假性的持續搜尋狀態。",
  "degraded.eyebrow": "唯讀 fallback",
  "degraded.title": "叫車前台目前處於降級模式。",
  "degraded.body":
    "叫車前台偵測到後端降級。此路由會誠實標示哪些能力可用、哪些被刻意封鎖，而不是在乘客嘗試送出時才默默失敗。",
  "degraded.kicker": "能力矩陣",
  "degraded.listTitle": "哪些可用、哪些被阻擋，以及原因",
  "degraded.row1.name": "查看既有行程狀態",
  "degraded.row1.state": "可用",
  "degraded.row1.body":
    "讀取路徑仍可用。乘客可確認是否存在進行中行程，並查看最近一次狀態快照。",
  "degraded.row2.name": "送出新的叫車請求",
  "degraded.row2.state": "已阻擋",
  "degraded.row2.body":
    "在平台降級期間，修改型端點會被故意停用。送出能力會被隱藏，而不是偽裝成可用。",
  "degraded.row3.name": "取消進行中行程",
  "degraded.row3.state": "已阻擋",
  "degraded.row3.body":
    "取消同樣會被保留給營運或支援處理，以避免在降級窗口內發生雙寫競爭。",
  "degraded.row4.name": "聯絡支援",
  "degraded.row4.state": "可用",
  "degraded.row4.body": "支援升級永遠可用，並提供可明確轉述的事件參照給乘客。",
  "degraded.callout.signal.title": "訊號來源",
  "degraded.callout.signal.body":
    "降級模式由上游健康訊號驅動，而非 UI 自行猜測。乘客看到的姿態會與支援操作中的姿態一致。",
  "degraded.callout.retry.title": "不做假重試",
  "degraded.callout.retry.body":
    "此路由不會在背景中靜默重試被阻擋的 mutation。重試必須是與恢復狀態綁定的明確乘客行動。",
  "degraded.cta.trip": "查看任何進行中行程狀態",
  "degraded.cta.unsupported": "開啟不支援 fallback",
  "trip.eyebrow": "進行中行程狀態",
  "trip.title": "進行中行程前台已是實際路由，而不是 roadmap 註記。",
  "trip.body":
    "此頁具體化 SYS-UI-004 所要求的乘客進行中行程檢視。狀態、ETA 框架、車輛資訊與權限姿態都可見；只有在乘客仍持有相關權限時才會顯示 mutation。",
  "trip.snapshot.kicker": "行程 {id}",
  "trip.snapshot.title": "已媒合司機",
  "trip.snapshot.eta.label": "ETA",
  "trip.snapshot.eta.value": "約 8 分鐘",
  "trip.snapshot.eta.note": "一律以估計值呈現，不作保證。",
  "trip.snapshot.vehicle.label": "車輛",
  "trip.snapshot.vehicle.value": "白色 Toyota Camry · 7VBN384",
  "trip.snapshot.vehicle.note": "顯示車牌與車型，讓乘客能正確辨識車輛。",
  "trip.snapshot.driver.label": "司機",
  "trip.snapshot.driver.value": "司機 M.",
  "trip.snapshot.driver.note": "只顯示名字；電話橋接聯絡在此頁之外處理。",
  "trip.snapshot.authority.label": "權限",
  "trip.snapshot.authority.value": "DRTS 直屬行程",
  "trip.snapshot.authority.note": "因為這是直接乘客行程，所以允許 mutation。",
  "trip.snapshot.cancel.label": "取消時間窗",
  "trip.snapshot.cancel.value": "抵達上車點前可安全取消",
  "trip.snapshot.cancel.note": "取消政策由伺服器端執行；UI 只負責鏡像顯示。",
  "trip.cta.cancel": "取消此行程",
  "trip.cta.completed": "預覽完成頁",
  "trip.lifecycle.kicker": "生命週期",
  "trip.lifecycle.title": "逐階段進度",
  "trip.lifecycle.requested.phase": "已提出請求",
  "trip.lifecycle.requested.state": "完成",
  "trip.lifecycle.requested.body": "乘客已送出請求。",
  "trip.lifecycle.matched.phase": "已媒合",
  "trip.lifecycle.matched.state": "目前",
  "trip.lifecycle.matched.body": "司機已接受，ETA 估計持續更新中。",
  "trip.lifecycle.pickup.phase": "前往上車點",
  "trip.lifecycle.pickup.state": "即將到來",
  "trip.lifecycle.pickup.body": "司機正朝上車點移動。",
  "trip.lifecycle.boarded.phase": "已上車",
  "trip.lifecycle.boarded.state": "即將到來",
  "trip.lifecycle.boarded.body": "乘客上車後行程正式開始。",
  "trip.lifecycle.dropoff.phase": "下車完成",
  "trip.lifecycle.dropoff.state": "即將到來",
  "trip.lifecycle.dropoff.body": "行程在下車點結束，之後即可查看收據。",
  "trip.routes.eyebrow": "子路由",
  "trip.routes.title": "每種生命週期結果都有自己的具名路由",
  "trip.routes.body":
    "取消、完成、唯讀權限、事後取消與重新驗證需求都拆成獨立路由，讓 UI 可以逐路由稽核，而不是藏在條件分支之後。",
  "tripCancel.eyebrow": "已請求取消",
  "tripCancel.title": "在權限仍允許時取消進行中行程。",
  "tripCancel.body":
    "此路由只會在乘客仍持有取消權限時出現。頁面會鏡像顯示伺服器端執行的政策時間窗與報價費用，讓乘客與支援看到相同數字。",
  "tripCancel.kicker": "政策快照",
  "tripCancel.policyTitle": "目前取消行為的效果",
  "tripCancel.policy1.label": "取消時間窗",
  "tripCancel.policy1.value": "上車前皆可取消",
  "tripCancel.policy1.note": "司機抵達上車點前，取消權限都在乘客手上。",
  "tripCancel.policy2.label": "取消費",
  "tripCancel.policy2.value": "今日為 $0",
  "tripCancel.policy2.note":
    "費率政策由伺服器端執行。UI 只鏡像當下報價，不會自行編造金額。",
  "tripCancel.policy3.label": "退款姿態",
  "tripCancel.policy3.value": "預授權釋放",
  "tripCancel.policy3.note":
    "任何付款預授權都會被釋放；在時間窗內取消不會產生已入帳費用。",
  "tripCancel.reason.kicker": "原因（選填）",
  "tripCancel.reason.title": "您為何取消？",
  "tripCancel.reason1": "行程變更",
  "tripCancel.reason2": "等待太久",
  "tripCancel.reason3": "上車地點錯誤",
  "tripCancel.reason4": "其他",
  "tripCancel.reasonState": "可選",
  "tripCancel.reasonBody": "可填自由文字，但取消並不以此為必要條件。",
  "tripCancel.reasonFootnote":
    "此原因會回報給營運側供應調校使用；只要政策時間窗開啟，它就不會阻擋取消。",
  "tripCancel.callout.after.title": "取消之後",
  "tripCancel.callout.after.body":
    "乘客會落到已取消行程頁，該頁會明確指出取消者，避免混淆。",
  "tripCancel.callout.after.cta": "預覽已取消行程頁",
  "tripCancel.callout.window.title": "逾時取消",
  "tripCancel.callout.window.body":
    "取消時間窗一旦關閉，此路由就不再提供 mutation，會改導向唯讀或已完成頁。",
  "tripCancel.cta.confirm": "確認取消（預覽）",
  "tripCancel.cta.keep": "保留此行程",
  "tripCancelled.eyebrow": "已取消",
  "tripCancelled.title": "此行程已取消。",
  "tripCancelled.body":
    "此行程在未完成上車前即已關閉。路由會指出取消者與安全的下一步，讓乘客不必猜測是誰取消，也不必猜測是否產生成本。",
  "tripCancelled.kicker": "取消者",
  "tripCancelled.listTitle": "是誰取消了此行程，以及接下來會發生什麼",
  "tripCancelled.case1.actor": "乘客",
  "tripCancelled.case1.body":
    "乘客在政策時間窗內取消。在此情境下不會收取費用。",
  "tripCancelled.case1.next": "乘客可立即重新提出新行程。",
  "tripCancelled.case2.actor": "司機",
  "tripCancelled.case2.body": "已媒合司機在上車前取消。平台不會懲罰乘客。",
  "tripCancelled.case2.next":
    "平台會自動嘗試重新媒合，並將新狀態明確呈現給乘客。",
  "tripCancelled.case3.actor": "平台",
  "tripCancelled.case3.body":
    "營運側因安全、供給或政策事件取消此行程。乘客會收到不含 PII 的說明。",
  "tripCancelled.case3.next": "乘客會看到支援升級與任何自動核發補償的說明。",
  "tripCancelled.nextLabel": "下一步",
  "tripCancelled.nextValue": "下一步：{value}",
  "tripCancelled.state": "已取消",
  "tripCancelled.callout.receipt.title": "取消收據",
  "tripCancelled.callout.receipt.body":
    "任何取消費收據都遵循與一般行程收據相同的來源權責規則；收據中心會在適用時呈現它。",
  "tripCancelled.callout.receipt.cta": "查看收據中心",
  "tripCancelled.callout.retry.title": "再試一次",
  "tripCancelled.callout.retry.body":
    "乘客可回到叫車入口提出新請求。若問題來自供給，則會重用無供給路由。",
  "tripCancelled.callout.retry.cta": "開啟新叫車請求",
  "tripCancelled.callout.notdo.title": "此路由不會做的事",
  "tripCancelled.callout.notdo.body":
    "它不會靜默發放點數、不會自動重下同一趟行程，也不會把非乘客擁有的取消責任推給乘客。",
  "tripCompleted.eyebrow": "已完成",
  "tripCompleted.title": "行程已順利完成。",
  "tripCompleted.body":
    "行程已在下車點結束。此路由整合行後摘要、導向平台開立的收據，並保留返回歷史記錄的路徑。",
  "tripCompleted.kicker": "行程摘要",
  "tripCompleted.listTitle": "行後快照",
  "tripCompleted.row1.label": "行程 ID",
  "tripCompleted.row1.value": "trp_8FQ12X",
  "tripCompleted.row1.note": "此行程在歷史、收據與支援中共用的穩定識別碼。",
  "tripCompleted.row2.label": "時長",
  "tripCompleted.row2.value": "23 分鐘",
  "tripCompleted.row2.note": "以實際行車時間計算，而非預估值。",
  "tripCompleted.row3.label": "距離",
  "tripCompleted.row3.value": "8.4 英里",
  "tripCompleted.row3.note": "由行程軌跡回報的路線距離。",
  "tripCompleted.row4.label": "總車資",
  "tripCompleted.row4.value": "$24.10",
  "tripCompleted.row4.note": "以伺服器為準；UI 僅鏡像結算紀錄。",
  "tripCompleted.row5.label": "收據狀態",
  "tripCompleted.row5.value": "DRTS 開立",
  "tripCompleted.row5.note": "收據由平台持有，並可在收據中心查看。",
  "tripCompleted.callout.receipt.title": "開啟收據",
  "tripCompleted.callout.receipt.body":
    "DRTS 開立的收據可從收據中心進入，並維持來源驅動的權責語意。",
  "tripCompleted.callout.receipt.cta": "前往收據中心",
  "tripCompleted.callout.history.title": "返回歷史記錄",
  "tripCompleted.callout.history.body":
    "過往行程會把已完成與既往行程一起列出，同時套用正確的收據權責結果。",
  "tripCompleted.callout.history.cta": "查看行程歷史",
  "tripCompleted.callout.scope.title": "超出本 slice 範圍",
  "tripCompleted.callout.scope.body":
    "小費、客訴與評分流程刻意不在此 slice 中具體化；它們各自屬於未來獨立 lane。",
  "tripReadOnly.eyebrow": "唯讀權限",
  "tripReadOnly.title": "此行程對乘客而言為唯讀。",
  "tripReadOnly.body":
    "此訂單由其他通道持有。乘客可追蹤行程，但無法在此頁取消、改期或調整費率；修改權限留在來源通道。",
  "tripReadOnly.kicker": "權責快照",
  "tripReadOnly.snapshotTitle": "權限拆解",
  "tripReadOnly.row1.label": "來源通道",
  "tripReadOnly.row1.value": "租戶代訂",
  "tripReadOnly.row1.note":
    "此行程由租戶代表乘客建立，因此 mutation 權限仍在租戶端。",
  "tripReadOnly.row2.label": "乘客可見",
  "tripReadOnly.row2.value": "狀態、ETA、車輛、生命週期",
  "tripReadOnly.row2.note":
    "所有讀取路徑都會被鏡像顯示，讓乘客在沒有 mutation 權限時仍可追蹤行程。",
  "tripReadOnly.row3.label": "乘客不可見",
  "tripReadOnly.row3.value": "取消、改期、費率覆寫",
  "tripReadOnly.row3.note": "修改型能力留在來源通道，不在此頁面顯示。",
  "tripReadOnly.matrixKicker": "跨通道矩陣",
  "tripReadOnly.matrixTitle": "不同來源通道的 mutation 所在位置",
  "tripReadOnly.table.source": "來源通道",
  "tripReadOnly.table.authority": "修改權限",
  "tripReadOnly.table.visibility": "乘客可見性",
  "tripReadOnly.table.notes": "備註",
  "tripReadOnly.case1.source": "直接乘客",
  "tripReadOnly.case1.mutate": "乘客",
  "tripReadOnly.case1.view": "乘客",
  "tripReadOnly.case1.note": "標準 /trip 路由。安全取消權限在乘客手上。",
  "tripReadOnly.case2.source": "租戶代訂",
  "tripReadOnly.case2.mutate": "租戶控制台",
  "tripReadOnly.case2.view": "乘客唯讀",
  "tripReadOnly.case2.note": "本頁路由。乘客可看狀態；取消與覆寫由租戶持有。",
  "tripReadOnly.case3.source": "合作夥伴代訂",
  "tripReadOnly.case3.mutate": "合作夥伴通道",
  "tripReadOnly.case3.view": "乘客唯讀",
  "tripReadOnly.case3.note": "mutation 被委派給合作夥伴前台，乘客維持唯讀。",
  "tripReadOnly.case4.source": "Concierge 代訂",
  "tripReadOnly.case4.mutate": "Concierge 或 call point",
  "tripReadOnly.case4.view": "乘客唯讀",
  "tripReadOnly.case4.note": "mutation 由 concierge 前台持有；乘客僅能查看。",
  "tripReadOnly.callout.fake.title": "不提供假的 mutation 入口",
  "tripReadOnly.callout.fake.body":
    "取消、改期與覆寫甚至不會以 disabled button 形式出現。隱藏它們是刻意的，因為顯示無法操作的按鈕會造成誤導。",
  "tripReadOnly.callout.act.title": "乘客如何處理此行程",
  "tripReadOnly.callout.act.body":
    "乘客必須回到來源通道，不論是租戶、合作夥伴或 concierge，才能修改此行程。支援升級仍維持可用。",
  "tripReadOnly.callout.act.cta": "開啟不支援或來源擁有 fallback",
  "tripReauth.eyebrow": "工作階段逾時",
  "tripReauth.title": "必須重新驗證後才能繼續。",
  "tripReauth.body":
    "平台暫時收起行程資料，因為它無法再證明目前使用者的身分。此路由不會顯示過期行程，也不會靜默降級到匿名模式；唯一前進方式是重新驗證。",
  "tripReauth.kicker": "觸發原因",
  "tripReauth.listTitle": "重新驗證由明確訊號觸發",
  "tripReauth.cause1.code": "工作階段逾時",
  "tripReauth.cause1":
    "乘客的工作階段 token 在行程中逾時。重新驗證完成前，行程資料會維持隱藏。",
  "tripReauth.cause2.code": "工作階段已撤銷",
  "tripReauth.cause2": "此工作階段在其他裝置或由支援端撤銷，因此必須重新驗證。",
  "tripReauth.cause3.code": "上下文不一致",
  "tripReauth.cause3":
    "乘客檔案變動導致無法重新建立行程上下文；重新驗證後才能恢復。",
  "tripReauth.state": "已阻擋",
  "tripReauth.callout.verify.title": "重新驗證身分",
  "tripReauth.callout.verify.body":
    "實際的重新驗證流程由驗證入口路由持有。完成後，乘客會自動返回進行中行程檢視。",
  "tripReauth.callout.verify.cta": "前往驗證入口",
  "tripReauth.callout.hidden.title": "哪些資料會被隱藏",
  "tripReauth.callout.hidden.body":
    "行程狀態、ETA、車輛與司機資訊在重新驗證期間都會保持隱藏，並套用未驗證護欄。",
  "tripReauth.callout.hidden.cta": "查看未驗證 fallback",
  "trips.eyebrow": "行程歷史",
  "trips.title": "行程歷史是一個具體化的乘客子前台，並帶有明確結果連結。",
  "trips.body":
    "重新開啟的乘客 app 不再把行程歷史只留在規格文字中。此路由會顯示已完成、已取消與唯讀的過往行程，並各自連到 SYS-UI-004 所具體化的結果頁。",
  "trips.card1.title": "已完成行程",
  "trips.card1.note": "可查看 DRTS 收據",
  "trips.card1.body":
    "直接乘客的已完成行程可在同一個 lane 中顯示平台開立收據與行程軌跡。",
  "trips.card1.cta": "開啟已完成行程頁",
  "trips.card2.title": "合作夥伴或租戶出資行程",
  "trips.card2.note": "外部收據參照",
  "trips.card2.body":
    "歷史行程仍可見，但計費權責可能會將乘客導回真正擁有收據的來源通道。",
  "trips.card2.cta": "開啟唯讀行程頁",
  "trips.card3.title": "已取消行程",
  "trips.card3.note": "取消結果",
  "trips.card3.body":
    "歷史記錄會保留已取消行程，並標明取消者，讓乘客不必自行重建經過。",
  "trips.card3.cta": "開啟已取消行程頁",
  "trips.card4.title": "沒有既往行程",
  "trips.card4.note": "空狀態",
  "trips.card4.body":
    "此路由仍會說明如何找到進行中行程或透過驗證重新進入，而不是只顯示空白表格殼層。",
  "trips.card4.cta": "透過驗證重新進入",
  "trips.callout.receipt.title": "收據中心交接",
  "trips.callout.receipt.body":
    "收據呈現規則由專屬收據 lane 擁有，因此行程歷史只做前導連結，不重複計費邏輯。",
  "trips.callout.receipt.cta": "開啟收據中心",
  "trips.callout.notdo.title": "歷史頁不做的事",
  "trips.callout.notdo.body":
    "歷史頁不會重新開立收據、不會發明取消補償，也不會顯示其他乘客的行程。",
  "receipts.eyebrow": "收據中心",
  "receipts.title": "乘客收據前台已經接上具體行程結果。",
  "receipts.body":
    "此落地頁建立 SYS-UI-003 所需的收據拓樸，並將每種權責類別連到 SYS-UI-004 對應的行程結果路由。來源通道權責仍是唯一權威，此頁只做鏡像。",
  "receipts.card1.title": "DRTS 開立收據",
  "receipts.card1.status": "支援",
  "receipts.card1.body":
    "直接乘客行程可從此 lane 暴露平台擁有的收據物件與軌跡資訊。",
  "receipts.card1.cta": "預覽已完成行程收據",
  "receipts.card2.title": "外部收據參照",
  "receipts.card2.status": "支援，但需交接權責",
  "receipts.card2.body":
    "當計費由來源通道持有時，乘客會看到誰擁有收據，以及接下來該去哪裡，而不是看到假的下載按鈕。",
  "receipts.card2.cta": "查看唯讀行程權責",
  "receipts.card3.title": "收據不可用或不支援",
  "receipts.card3.status": "已明確處理",
  "receipts.card3.body":
    "電話協助、合作夥伴或其他不支援情境都會保留可見性，並附上具體說明與支援方向。",
  "receipts.card3.cta": "開啟不支援 fallback",
  "receipts.callout.title": "不發明新的送達通道",
  "receipts.callout.body":
    "此路由刻意不宣稱新的電子郵件或簡訊收據送達方式。權責與可用性必須與上游結算與來源通道規則一致。",
  "unauth.eyebrow": "未驗證狀態",
  "unauth.title": "在乘客完成 bootstrap 前，行程細節都會維持鎖定。",
  "unauth.body":
    "此路由明確呈現那些沒有有效 session、代碼或行程驗證上下文就到達此處的乘客 fallback。",
  "unauth.callout.next.title": "允許的下一步",
  "unauth.callout.next.body":
    "可重新走驗證流程、驗證預約代碼，或透過未來的乘客支援 lane 聯絡支援。",
  "unauth.callout.next.cta": "返回驗證入口",
  "unauth.callout.notdo.title": "此路由不做的事",
  "unauth.callout.notdo.body":
    "它不會向未驗證乘客洩漏租戶管理訂單資料、營運工具或部分收據內容。",
  "unsupported.eyebrow": "不支援狀態",
  "unsupported.title": "部分行程與收據結果刻意不由此殼層持有。",
  "unsupported.body":
    "此路由是對超出服務區、第三方持有或其他不支援乘客情境的誠實落點。",
  "unsupported.card1.kicker": "不可服務",
  "unsupported.card1.title": "超出區域或不支援的需求",
  "unsupported.card1.body":
    "若乘客不在服務區內，產品規則要求回傳明確的 not_serviceable 結果，而不是假裝仍可繼續叫車。",
  "unsupported.card2.kicker": "來源持有收據",
  "unsupported.card2.title": "合作夥伴或租戶計費通道",
  "unsupported.card2.body":
    "當其他通道持有結算權責時，此殼層可以指向該權威，但不應捏造供乘客下載的 artifact。",
  "embed.chrome.title": "社區叫車",
  "embed.chrome.webview": "webview",
  "embed.card.handoffSummary": "身分交接摘要",
  "embed.card.handoffSubtitle": "signed handoff token",
  "embed.card.trip": "行程",
  "embed.card.tripSubtitle": "上車 · 下車 · 時間",
  "embed.card.vehicles": "車種",
  "embed.card.vehiclesSubtitle": "owned mobility",
  "embed.card.negatives": "測試負向狀態",
  "embed.card.history": "歷史行程",
  "embed.card.historySubtitle": "持久身分 · reopen safe",
  "embed.card.receipt": "收據",
  "embed.card.completed": "行程已完成",
  "embed.card.cancelled": "行程已取消",
  "embed.card.negative": "負向狀態 · {screen}",
  "embed.field.signature": "社區簽章有效",
  "embed.field.identity": "住戶身分已解析",
  "embed.field.unit": "社區 / 戶別",
  "embed.field.passengerId": "DRTS Passenger",
  "embed.field.sessionBound": "已綁定 referral handoff session",
  "embed.token.connState": "連線狀態",
  "embed.token.partnerSession": "社區工作階段過期",
  "embed.token.partnerSessionValue": "expired",
  "embed.token.handoffToken": "交付權杖逾時",
  "embed.token.handoffTokenValue": "stale",
  "embed.token.detection": "偵測結果",
  "embed.token.originHost": "來源宿主未授權",
  "embed.token.originHostValue": "未授權",
  "embed.token.partnerSignature": "社區簽章",
  "embed.token.partnerSignatureValue": "缺少",
  "embed.field.pickup": "上車",
  "embed.field.dropoff": "下車",
  "embed.field.when": "用車時間",
  "embed.field.savedPlaces": "常用地點",
  "embed.field.eta": "ETA",
  "embed.field.driver": "司機",
  "embed.field.completedAt": "完成時間",
  "embed.field.passenger": "乘客",
  "embed.field.route": "路線",
  "embed.field.vehicle": "車輛",
  "embed.field.payment": "付款",
  "embed.field.total": "合計",
  "embed.field.contact": "聯絡司機 / 查看收據",
  "embed.field.viewHistory": "查看歷史行程",
  "embed.field.viewReceipt": "查看收據",
  "embed.field.rebook": "重新叫車",
  "embed.field.backToBook": "返回叫車表單",
  "embed.field.viewTrip": "查看既有行程",
  "embed.field.trackTrip": "追蹤行程",
  "embed.field.contactSupport": "聯絡客服",
  "embed.field.contactDriver": "聯絡司機",
  "embed.field.confirmRide": "確認叫車",
  "embed.field.returnToApp": "回社區 App",
  "embed.field.openStandalone": "前往獨立叫車網站",
  "embed.field.returnToEntry": "回 {appName} 重新進入",
  "embed.field.tryLater": "稍後再試",
  "embed.field.agree": "同意並開始",
  "embed.field.notNow": "暫不使用",
  "embed.field.cancelTrip": "取消行程 · 剩 {minutes} 分鐘",
  "embed.nav.book": "叫車",
  "embed.nav.trip": "進行中",
  "embed.nav.trips": "歷史",
  "embed.nav.receipt": "收據",
  "embed.nav.completed": "完成",
  "embed.nav.cancelled": "取消",
  "embed.card.fallback": "AV fallback 狀態",
  "embed.card.fallbackSubtitle": "由後端 messageCode 驅動的乘客安全狀態",
  "embed.fallback.etaLabel": "預計上車 · ETA",
  "embed.fallback.etaNote": "估計值，非保證",
  "embed.fallback.minutes": "分鐘",
  "embed.fallback.tripId": "行程編號",
  "embed.fallback.destination": "目的地",
  "embed.fallback.fare": "費用",
  "embed.fallback.sameFare": "維持原價 · 無額外收費",
  "embed.fallback.sameBooking":
    "同一筆行程繼續 · 不會重新下單，也不會加收費用。",
  "embed.fallback.operatorNote":
    "接送由 {name} 提供 · 服務狀態僅供參考",
  "embed.state.handoff.title": "以 {name} 身分為您準備叫車",
  "embed.state.handoff.badge": "handoff · 已交接",
  "embed.state.reauth.title": "登入狀態已逾時",
  "embed.state.reauth.badge": "reauth_required",
  "embed.state.unsupported.title": "無法在此環境開啟",
  "embed.state.unsupported.badge": "unsupported_host · 已封鎖",
  "embed.state.consent.title": "授權使用叫車服務",
  "embed.state.consent.badge": "consent_required",
  "embed.state.fallback.title": "內嵌服務暫時無法使用",
  "embed.state.fallback.badge": "fallback_to_web · 改用網站",
  "embed.message.unsupported":
    "目前來源宿主不在授權白名單中，因此基於安全考量已阻擋內嵌載入。",
  "embed.message.reauth": "為保護您的住戶帳號，請回到 {appName} 重新進入叫車。",
  "embed.message.consent":
    "首次使用需先確認授權範圍，行程與收據會綁定既有住戶身分。",
  "embed.message.fallback":
    "目前無法在社區 App 內完成叫車，但改用獨立網站後仍可找回同一批行程與收據。",
  "embed.message.handoff": "免再登入；住戶身分會由 {appName} 安全交接進來。",
  "embed.book.subtitle": "{name} · {unit}",
  "embed.book.identity": "已綁定 referral handoff session：{id}",
  "embed.book.now": "現在出發",
  "embed.book.pickup": "御和雲峰 A 棟 1F 大廳",
  "embed.book.dropoff": "台北榮民總醫院 · 門診大樓",
  "embed.book.negative.nosupply": "無供給",
  "embed.book.negative.ineligible": "資格不符",
  "embed.book.negative.denied": "遭拒",
  "embed.book.negative.degraded": "降級",
  "embed.vehicle.standard.name": "標準車",
  "embed.vehicle.standard.note": "1-4 人",
  "embed.vehicle.comfort.name": "舒適車",
  "embed.vehicle.comfort.note": "1-4 人 · 大空間",
  "embed.vehicle.xl.name": "六人座",
  "embed.vehicle.xl.note": "5-6 人 · 行李多",
  "embed.place.lobby": "社區大廳",
  "embed.place.station": "台北車站",
  "embed.place.hospital": "榮總醫院",
  "embed.trip.status.en_route": "前往上車",
  "embed.trip.bound":
    "此行程會維持與 referral passenger 身分綁定，重開社區 App 後仍可找回。",
  "embed.history.inProgress": "進行中",
  "embed.history.completed": "已完成",
  "embed.history.cancelled": "已取消",
  "embed.receipt.pay": "社區月結 · 綁定住戶帳號",
  "embed.completed.body": "本次行程已順利結束，可直接前往收據或歷史行程。",
  "embed.cancelled.body":
    "取消結果與來源脈絡都會被保留，不會遺失既有 handoff 身分。",
  "embed.negative.nosupply": "附近暫無可派車輛，請稍後重試或改約其他時間。",
  "embed.negative.ineligible":
    "此住戶身分目前未開通叫車服務，請洽社區管理中心。",
  "embed.negative.denied":
    "此次叫車請求未通過，請確認行程仍在支援的服務範圍內。",
  "embed.negative.degraded": "服務目前回應較慢，系統恢復後會再繼續。",
};

export const translations = { en, zh } as const;

export type TranslationKey = keyof typeof en;

export function t(
  key: TranslationKey | string,
  params?: Params,
  locale: Locale = "zh",
): string {
  const scoped = translations[locale] as Record<string, string>;
  const fallback = translations.zh as Record<string, string>;
  const template = String(scoped[key] ?? fallback[key] ?? key);
  if (!params) {
    return template;
  }
  let result = template;
  for (const [name, value] of Object.entries(params)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}
