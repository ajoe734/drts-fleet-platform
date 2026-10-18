import {
  BUREAU_REVIEW_CASES,
  BUREAU_REVIEW_SOURCE,
  BUREAU_REVIEW_STAGE_GROUPS,
  BUREAU_REVIEW_TOTAL_STAGES,
} from "./content";
import { t } from "./translations";

// Read-only reference entry for the New Taipei transport bureau, served from
// the same passenger-app-web Cloud Run service as the real product. This
// page renders no booking form, no OTP login and no actionable controls of
// its own — the actual乘客 login/booking/trip journey lives at /login and
// /review on this same origin, and this page just explains and links to
// them. It never links to /review-driver or /api/review-driver-api/*: those
// stay off this origin's public entry by design (see
// operations/deployment/passenger-bureau-entry/setup-passenger-public-entry.sh
// and docs/03-runbooks/passenger-bureau-browser-entry-20261018.md).
//
// Earlier drafts of this page claimed a single Google-identity
// roles/run.invoker grant plus "Cloud Run's built-in login page" made this
// service reachable from an ordinary browser. That is not how Cloud Run
// authentication works (no such login page exists outside Cloud IAP) — see
// entry-R1-ordinary-browser-authentication-finding.md. The actual fix is a
// Cloud Load Balancer + Cloud IAP front door; this component only describes
// that mechanism, it never implements or assumes network/IAM behavior
// itself.
export function BureauReviewPage() {
  const publicEntryHost = process.env.PAX_BUREAU_ENTRY_HOST?.trim();

  return (
    <main style={{ padding: 18, maxWidth: 860 }}>
      <h1>{t.title}</h1>
      <p role="status">
        {t.statusIntroPrefix}
        <code>/login</code>
        {t.statusIntroAnd}
        <code>/review</code>
        {t.statusIntroSuffix}
      </p>

      <section>
        <h2>{t.accessHeading}</h2>
        {publicEntryHost ? (
          <>
            <p>{t.accessAvailableIntro}</p>
            <ul>
              <li>
                <a href={`https://${publicEntryHost}/login`}>
                  https://{publicEntryHost}/login
                </a>{" "}
                {t.loginLinkDesc}
              </li>
              <li>
                <a href={`https://${publicEntryHost}/review`}>
                  https://{publicEntryHost}/review
                </a>{" "}
                {t.reviewLinkDesc}
              </li>
            </ul>
          </>
        ) : (
          <p role="alert">
            {t.noPublicUrlPrefix}
            <code>/login</code>
            {t.noPublicUrlMid}
            <code>
              docs/03-runbooks/passenger-bureau-browser-entry-20261018.md
            </code>
            {t.noPublicUrlSuffix}
          </p>
        )}
        <p>{t.driverScopeNote}</p>
        <p>
          {t.fullConfigPrefix}{" "}
          <code>
            docs/03-runbooks/passenger-bureau-browser-entry-20261018.md
          </code>
          {t.fullConfigSuffix}
        </p>
      </section>

      <section>
        <h2>{t.verifiedCasesHeading}</h2>
        <p>
          {t.sourceSnapshotLabel}
          <code>{BUREAU_REVIEW_SOURCE.release}</code>（
          <code>{BUREAU_REVIEW_SOURCE.sourceSha}</code>
          {t.sourceSnapshotSeparator}
          {" "}
          {BUREAU_REVIEW_SOURCE.checkedAtUtc}。
        </p>
        <table>
          <thead>
            <tr>
              <th>{t.stageGroupHeader}</th>
              <th>{t.stepCountHeader}</th>
              <th>{t.resultHeader}</th>
            </tr>
          </thead>
          <tbody>
            {BUREAU_REVIEW_STAGE_GROUPS.map((group) => (
              <tr key={group.label}>
                <td>{group.label}</td>
                <td>{group.count}</td>
                <td>{group.allSingleAttemptPassed ? "單次嘗試全數通過" : "未全數通過"}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>{t.totalLabel}</strong>
              </td>
              <td>
                <strong>{BUREAU_REVIEW_TOTAL_STAGES}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{t.caseListHeading}</h2>
        <p>{t.caseListIntro}</p>
        {BUREAU_REVIEW_CASES.map((entry) => (
          <details key={entry.id} style={{ marginBottom: 10 }}>
            <summary>
              <strong>{entry.id}</strong> {entry.title} — {entry.status}
            </summary>
            <div style={{ paddingLeft: 16 }}>
              <p>
                <strong>{t.scenarioLabel}</strong>
                {entry.scenarios}
              </p>
              <p>
                <strong>{t.preconditionLabel}</strong>
                {entry.preconditions}
              </p>
              <p>
                <strong>{t.stepsLabel}</strong>
              </p>
              <ol>
                {entry.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <p>
                <strong>{t.expectedLabel}</strong>
                {entry.expected}
              </p>
              <p>
                <strong>{t.verifiedLabel}</strong>
                {entry.verified}
              </p>
              <p>
                <strong>{t.missingLabel}</strong>
                {entry.missing}
              </p>
            </div>
          </details>
        ))}
      </section>

      <section>
        <h2>{t.archiveHeading}</h2>
        <p>
          {t.archivePrefix}
          <code>{BUREAU_REVIEW_SOURCE.offlinePackage.fileEntries}</code>{" "}
          {t.archiveMid}
          {" "}
          <code>{BUREAU_REVIEW_SOURCE.offlinePackage.sha256}</code>
          {t.archiveSuffix}
        </p>
      </section>
    </main>
  );
}
