import assert from "node:assert/strict";
import { mailRequest, realIssueInvitation, realPollDeliveryReceipt, type MailRunnerConfig, type IssueInvitationResult } from "./mail-acceptance-runner";
import { observeMailbox, observeInvitationMailbox } from "./mailbox-observer";
import type { UatEvidenceRecorder } from "../shared";

const taskDisplayName = "SR-LIVE-MAIL-001 live acceptance";
type Wire = Record<string, unknown>;
type User = { user_id: string; tenant_id: string; email: string; display_name: string; role_code: string; status: string };

function headers(config: MailRunnerConfig) {
  return { authorization: `Bearer ${config.roleSessionToken}`, "x-tenant-id": config.tenantId, "content-type": "application/json" };
}
async function api(config: MailRunnerConfig, recorder: UatEvidenceRecorder, path: string, body?: unknown, proof?: string): Promise<Wire> {
  const response = await mailRequest(config, path, {
    headers: { ...headers(config), ...(proof ? { "x-drts-step-up-reference": proof } : {}) },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
  }, recorder);
  const envelope = await response.json() as { data?: Wire };
  assert(envelope.data && typeof envelope.data === "object", "Missing live data envelope");
  return envelope.data;
}
async function users(config: MailRunnerConfig, recorder: UatEvidenceRecorder): Promise<User[]> {
  const data = await api(config, recorder, "tenant/users");
  assert(Array.isArray(data.items), "Missing tenant user directory");
  return data.items as User[];
}
function ownUser(config: MailRunnerConfig, user: User, recipient: string) {
  assert(user.tenant_id === config.tenantId && user.email === recipient &&
    user.display_name === taskDisplayName && user.role_code === "tenant_viewer" &&
    /^tenant_user_[a-f0-9-]{36}$/.test(user.user_id), "Existing alias is not a task-owned viewer");
}
async function resetViewer(config: MailRunnerConfig, recorder: UatEvidenceRecorder, user: User) {
  ownUser(config, user, config.authorizedRecipient);
  assert(user.status === "active", "Unexpected task viewer status");
  const proof = await api(config, recorder, "identity/step-up-proofs", { actionId: "tenant:users:role:update" });
  assert(proof.required === true && typeof proof.step_up_reference === "string" && proof.action_id === "tenant:users:role:update");
  const updated = await api(config, recorder, `tenant/users/${encodeURIComponent(user.user_id)}/role`,
    { roleCode: "tenant_viewer", status: "invited" }, proof.step_up_reference);
  assert(updated.user_id === user.user_id && updated.status === "invited", "Could not reset task viewer through the real API");
}
async function resend(config: MailRunnerConfig, recorder: UatEvidenceRecorder, userId: string) {
  const response = await mailRequest(config, `tenant/users/${encodeURIComponent(userId)}/invitation/resend`,
    { method: "POST", headers: headers(config), body: "{}" }, recorder);
  const data = (await response.json() as { data: Wire }).data;
  assert(typeof data.invitation_id === "string" && typeof data.delivery_id === "string" &&
    typeof data.expires_at === "string" && !data.accepted_at && !data.revoked_at, "Invalid replacement invitation");
  recorder.recordResourceId("tenant_invitation", data.invitation_id, { delivery_id: data.delivery_id, user_id: userId, expires_at: data.expires_at });
  return { invitationId: data.invitation_id, deliveryId: data.delivery_id, userId,
    expiresAt: data.expires_at, statusCode: response.status, deployedCandidateSha: response.headers.get("x-drts-candidate-sha") };
}

/** Fixed aliases may already exist. Never mutate another owner's membership. */
export async function prepareTaskInvitation(config: MailRunnerConfig, recipient: string, recorder: UatEvidenceRecorder): Promise<IssueInvitationResult> {
  assert([config.authorizedRecipient, config.nonAllowlistedRecipient].includes(recipient), "Unauthorized invitation recipient");
  const matches = (await users(config, recorder)).filter(user => user.email === recipient);
  assert(matches.length <= 1, "Ambiguous tenant alias");
  if (!matches[0]) return realIssueInvitation(config, recipient, recorder);
  const user = matches[0];
  ownUser(config, user, recipient);
  if (user.status === "active" && recipient === config.authorizedRecipient) await resetViewer(config, recorder, user);
  else assert(user.status === "invited", "Task alias is not pending");
  return resend(config, recorder, user.user_id);
}

async function sent(config: MailRunnerConfig, recorder: UatEvidenceRecorder, deliveryId: string) {
  const receipt = await realPollDeliveryReceipt(config, deliveryId, recorder);
  recorder.recordResourceId("provider_receipt", deliveryId, receipt.readback);
  assert(receipt.status === "sent" && receipt.providerMessageId && receipt.attempts > 0 && receipt.lastOutcome === "sent", "No successful provider receipt");
  return receipt;
}
async function accept(config: MailRunnerConfig, recorder: UatEvidenceRecorder, deliveryId: string, userId: string, expected: "accepted" | "denied" | "expired") {
  const observation = await observeMailbox(config, deliveryId, {
    flow: "invite", subject: "You're invited to join your DRTS tenant workspace",
    required_text: ["You have been invited to join a DRTS tenant workspace.", "This invitation expires at"],
    acceptance: expected, user_id: userId,
  });
  assert(observation.acceptance === expected && typeof observation.acceptance_status === "number" && typeof observation.acceptance_duration_ms === "number", "Missing actual acceptance response");
  recorder.recordHttpCall({ method: "POST", url: `${config.apiOrigin}/api/tenant/invitations/accept`,
    statusCode: observation.acceptance_status, durationMs: observation.acceptance_duration_ms,
    responseHeaders: { "x-drts-candidate-sha": config.candidateSha } });
  recorder.recordResourceId(`invitation_${expected}`, deliveryId, observation);
  return observation;
}

export async function exerciseInvitationLifecycle(config: MailRunnerConfig, issued: IssueInvitationResult, recorder: UatEvidenceRecorder) {
  assert(issued.userId && issued.deliveryId, "No real invitation user identity");
  const userId = issued.userId;
  const replacement = await resend(config, recorder, userId);
  assert(replacement.deliveryId !== issued.deliveryId && replacement.invitationId !== issued.invitationId, "Resend did not rotate invitation");
  await sent(config, recorder, replacement.deliveryId);
  await accept(config, recorder, issued.deliveryId, userId, "denied");
  const revoked = await api(config, recorder, `tenant/users/${encodeURIComponent(userId)}/invitation/revoke`, {});
  assert(revoked.invitation_id === replacement.invitationId && revoked.revoked_at, "Revoke did not target replacement");
  await accept(config, recorder, replacement.deliveryId, userId, "denied");
  const final = await resend(config, recorder, userId);
  await sent(config, recorder, final.deliveryId);
  await accept(config, recorder, final.deliveryId, userId, "accepted");
  await accept(config, recorder, final.deliveryId, userId, "denied");
  const active = (await users(config, recorder)).find(user => user.user_id === userId);
  assert(active, "Accepted viewer missing from tenant directory");
  await resetViewer(config, recorder, active);
  const pending = await resend(config, recorder, userId);
  await sent(config, recorder, pending.deliveryId);
  const observation = await observeInvitationMailbox(config, pending.deliveryId);
  recorder.recordResourceId("invitation_expiry_checkpoint", pending.deliveryId, {
    user_id: userId, invitation_id: pending.invitationId, expires_at: pending.expiresAt,
    candidate_sha: config.candidateSha, mailbox: observation,
  });
}

/** Run BEFORE any resends, after an actual 24 hours. Revoke's authoritative
 * pending-only result proves the denied invitation was not previously revoked
 * or consumed. The exact same invitation/delivery must still be pending.
 */
export async function verifyExpiredInvitation(config: MailRunnerConfig, env: Record<string, string | undefined>, recorder: UatEvidenceRecorder): Promise<boolean> {
  const userId = env.DRTS_LIVE_MAIL_EXPIRY_USER_ID?.trim();
  const deliveryId = env.DRTS_LIVE_MAIL_EXPIRY_DELIVERY_ID?.trim();
  if (!userId && !deliveryId) return false;
  assert(userId && /^tenant_user_[a-f0-9-]{36}$/.test(userId) && deliveryId && /^[a-f0-9-]{36}$/.test(deliveryId), "Both real expiry checkpoint IDs are required");
  const user = (await users(config, recorder)).find(entry => entry.user_id === userId);
  assert(user, "Expiry viewer missing");
  ownUser(config, user, config.authorizedRecipient);
  assert(user.status === "invited", "Expiry viewer is already active");
  const receipt = await sent(config, recorder, deliveryId);
  const observation = await accept(config, recorder, deliveryId, userId, "expired");
  const revoked = await api(config, recorder, `tenant/users/${encodeURIComponent(userId)}/invitation/revoke`, {});
  assert(revoked.delivery_id === deliveryId && revoked.accepted_at === null && typeof revoked.revoked_at === "string" &&
    receipt.readback?.idempotency_key === `tenant-invitation:${String(revoked.invitation_id)}`,
    "Expiry denial was not for the still-pending invitation");
  const expiry = Date.parse(String(revoked.expires_at));
  const queued = Date.parse(String(receipt.readback?.queued_at));
  assert(expiry === Date.parse(String(observation.expires_at)) && Date.now() > expiry &&
    Number.isFinite(queued) && expiry - queued >= 85_800_000 && expiry - queued <= 86_400_000,
    "No actual elapsed invitation expiry evidence");
  recorder.recordResourceId("real_invitation_expiry", deliveryId, { ...revoked, queued_at: receipt.readback?.queued_at, checked_at: new Date().toISOString() });
  return true;
}

/** Read-only approval profile: the actor grant does not permit impersonating
 * the dynamically invited +approve user. An authorized approver creates and
 * decides this request via the product; this profile verifies its actual mail.
 */
export async function observeApproval(config: MailRunnerConfig, requestId: string, recorder: UatEvidenceRecorder) {
  assert(/^approval-request-[a-f0-9-]{36}$/.test(requestId), "Invalid approval request ID");
  const request = await api(config, recorder, `tenant/approval-requests/${encodeURIComponent(requestId)}`);
  assert(request.tenant_id === config.tenantId && request.approval_request_id === requestId &&
    ["approved", "rejected"].includes(String(request.status)), "Approval must be a real decided request in the test tenant");
  const directory = await users(config, recorder);
  const approvers = request.resolved_approver_user_ids;
  assert(Array.isArray(approvers) && approvers.length === 1, "Expected exactly one authorized approver");
  const approver = directory.find(user => user.user_id === approvers[0]);
  assert(approver?.status === "active" && approver.email === config.authorizedRecipient.replace("+invite@", "+approve@"), "Approval recipient is outside the task mailbox grant");
  const audit = await api(config, recorder, "audit");
  assert(Array.isArray(audit.items), "Missing actual approval audit");
  const bookingId = String(request.booking_id);
  const orderId = String(request.order_id);
  const subjects: Record<string, string> = {
    new_request: `待審批用車申請 ${bookingId} / Approval required for booking ${bookingId}`,
    approaching_timeout: `審批即將逾時 ${bookingId} / Approval timeout approaching for booking ${bookingId}`,
    approved: `審批已通過 ${bookingId} / Approval completed for booking ${bookingId}`,
    rejected: `審批已拒絕 ${bookingId} / Approval rejected for booking ${bookingId}`,
  };
  for (const template of ["new_request", "approaching_timeout", String(request.status)]) {
    const logs = (audit.items as Wire[]).filter(log => log.tenant_id === config.tenantId &&
      log.resource_id === requestId && log.action_name === `approval_notification.${template}`);
    assert(logs.length === 1, "Missing or ambiguous approval notification audit");
    const summary = logs[0]!.new_values_summary as Wire;
    assert(summary.booking_id === bookingId && summary.order_id === orderId && summary.template_key === template, "Approval audit business identity mismatch");
    const recipients = (summary.email as Wire)?.recipients as Wire[];
    assert(Array.isArray(recipients) && recipients.length === 1 && recipients[0]!.user_id === approver.user_id && typeof recipients[0]!.delivery_id === "string", "Approval audit recipient mismatch");
    const deliveryId = recipients[0]!.delivery_id as string;
    await sent(config, recorder, deliveryId);
    const observation = await observeMailbox(config, deliveryId, {
      flow: "approve", subject: subjects[template]!,
      required_text: [`Booking ID: ${bookingId}`, `Order ID: ${orderId}`, `Approval Request ID: ${requestId}`, `Timeout At: ${String(request.timeout_at)}`],
    });
    recorder.recordResourceId(`approval_${template}`, deliveryId, { approval_request_id: requestId, booking_id: bookingId, order_id: orderId, ...observation });
  }
}
