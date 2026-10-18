import {
  BUREAU_REVIEW_CASES,
  BUREAU_REVIEW_SOURCE,
  BUREAU_REVIEW_STAGE_GROUPS,
  BUREAU_REVIEW_TOTAL_STAGES,
} from "./content";

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
      <h1>新北市交通局審查入口</h1>
      <p role="status">
        本頁本身唯讀，不提供建立訂單、取消、派遣或司機端操作；下方連結導向的
        <code>/login</code> 與 <code>/review</code>
        才是乘客可實際操作的既有入口，沿乘客本人身分登入與操作。
      </p>

      <section>
        <h2>存取方式與範圍</h2>
        {publicEntryHost ? (
          <>
            <p>
              本服務目前可直接用一般瀏覽器開啟，不需要任何 Google
              帳號登入、技術權杖或憑證檔案：
            </p>
            <ul>
              <li>
                <a href={`https://${publicEntryHost}/login`}>
                  https://{publicEntryHost}/login
                </a>{" "}
                — 乘客本人登入（手機號碼或既有帳號，依既有驗證方式），非交通局專屬帳號。
              </li>
              <li>
                <a href={`https://${publicEntryHost}/review`}>
                  https://{publicEntryHost}/review
                </a>{" "}
                — 既有共享演練操作頁（需負責單位先行啟用）。
              </li>
            </ul>
          </>
        ) : (
          <p role="alert">
            本環境尚未開放對外的公開網址，一般瀏覽器暫時無法經由本服務的公開網址到達
            <code>/login</code>。負責單位需先完成網域、DNS 與憑證設定（詳見
            <code>
              docs/03-runbooks/passenger-bureau-browser-entry-20261018.md
            </code>
            ），本頁才會顯示實際可開啟的網址；在那之前，不應把本頁本身當作已解除
            403 的證據。
          </p>
        )}
        <p>
          司機端的上線演練與調度派遣控制畫面不在這個對外入口的範圍內：即使以上網址已經公開，一般使用者與交通局承辦同仁都無法透過這個入口看到或操作司機端功能，只能使用乘客本人既有的登入、預約與行程頁面。
        </p>
        <p>
          完整的部署設定、權限細節與操作指令留在{" "}
          <code>
            docs/03-runbooks/passenger-bureau-browser-entry-20261018.md
          </code>
          ，本頁只呈現一般使用者需要知道的存取方式與範圍。
        </p>
      </section>

      <section>
        <h2>已驗證案例摘要</h2>
        <p>
          來源快照：<code>{BUREAU_REVIEW_SOURCE.release}</code>（
          <code>{BUREAU_REVIEW_SOURCE.sourceSha}</code>），檢查時間{" "}
          {BUREAU_REVIEW_SOURCE.checkedAtUtc}。
        </p>
        <table>
          <thead>
            <tr>
              <th>階段群組</th>
              <th>步驟數</th>
              <th>結果</th>
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
                <strong>合計</strong>
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
        <h2>案例清單（UC01–UC16）</h2>
        <p>
          每一案例可展開查看前提、步驟、預期結果、實際驗證內容與尚未覆蓋的部分；狀態文字逐案各自撰寫，不套用單一通過／不通過標籤，避免掩蓋個別案例的實際缺口。
        </p>
        {BUREAU_REVIEW_CASES.map((entry) => (
          <details key={entry.id} style={{ marginBottom: 10 }}>
            <summary>
              <strong>{entry.id}</strong> {entry.title} — {entry.status}
            </summary>
            <div style={{ paddingLeft: 16 }}>
              <p>
                <strong>情境：</strong>
                {entry.scenarios}
              </p>
              <p>
                <strong>前提：</strong>
                {entry.preconditions}
              </p>
              <p>
                <strong>步驟：</strong>
              </p>
              <ol>
                {entry.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <p>
                <strong>預期結果：</strong>
                {entry.expected}
              </p>
              <p>
                <strong>實際驗證：</strong>
                {entry.verified}
              </p>
              <p>
                <strong>尚未覆蓋：</strong>
                {entry.missing}
              </p>
            </div>
          </details>
        ))}
      </section>

      <section>
        <h2>完整原圖與離線封存</h2>
        <p>
          本頁上方已逐案列出詳細步驟與驗證內容；若需要原始畫面截圖，另有雜湊驗證之離線示範包（
          <code>{BUREAU_REVIEW_SOURCE.offlinePackage.fileEntries}</code>{" "}
          個檔案，SHA-256{" "}
          <code>{BUREAU_REVIEW_SOURCE.offlinePackage.sha256}</code>
          ）作為補充，可向負責單位索取；本頁的案例清單本身已是可直接閱讀的完整紀錄，不是離線包的替代摘要。
        </p>
      </section>
    </main>
  );
}
