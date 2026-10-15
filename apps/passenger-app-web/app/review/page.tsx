"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PassengerClient } from "@drts/passenger-client";
import { stopDemo, isDemoMode } from "../../lib/demo/store";
import {
  useReviewDemo,
  useReviewOpsUrl,
} from "../../components/review-demo/review-context";

const client = new PassengerClient({ baseUrl: "", fetchFn: fetch });

export default function ReviewEntry() {
  const enabled = useReviewDemo();
  const opsUrl = useReviewOpsUrl();
  const [target, setTarget] = useState("0900000001");
  const [proof, setProof] = useState<{ challenge: string; code: string }>();
  const [accountId, setAccountId] = useState<string>();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (enabled)
      void client
        .getAccount()
        .then((a) => setAccountId(a.drtsPassengerId))
        .catch(() => setAccountId(undefined));
  }, [enabled]);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError("操作未完成，請檢查演練配置或稍後重試；沒有切換至本機假訂單。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main style={{ padding: 18 }}>
      <h1>交通局同單審查演練</h1>
      <p>
        乘客、調度、司機共用 API
        與資料庫中的同一張訂單。每一輪新建三筆獨立訂單，畫面上的 UUID
        是跨視窗核對依據。
      </p>
      <p>
        簡訊、圖資、車司資格、GPS、PSP、通知均為明示模擬；不出車、不扣款、不通知真人，下載非正式憑證。
      </p>
      {!enabled && (
        <p role="status">此環境尚未啟用共享演練，或目前仍在本機 demo。</p>
      )}
      <button
        onClick={() => {
          if (isDemoMode()) stopDemo();
          window.location.assign("/review");
        }}
      >
        進入共享後端演練（保留本機 demo 資料）
      </button>
      {error && <p role="alert">{error}</p>}
      {enabled && (
        <section>
          <h2>乘客演練帳戶</h2>
          {accountId ? (
            <>
              <p>
                已登入乘客{" "}
                <output data-testid="review-passenger-id">{accountId}</output>
              </p>
              <Link href="/account/payment-methods">1. 綁定演練付款方式</Link>
              <br />
              <Link href="/">2. 選新北起訖與未來預約時間，試算並確認叫車</Link>
              <br />
              <Link href="/rides">3. 歷史與取消紀錄</Link>
              <br />
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await client.logout();
                    setAccountId(undefined);
                    setProof(undefined);
                  })
                }
              >
                登出／換乘客
              </button>
            </>
          ) : (
            <>
              <label>
                演練手機（0900000000–0900000099）
                <input
                  aria-label="演練手機"
                  value={target}
                  disabled={busy || !!proof}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <p>
                這是合成 SMS
                收件匣，驗證碼不會發給真人。驗證後建立真正演練帳戶與 session。
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                我了解本次模擬範圍，並同意{" "}
                <Link href="/review/terms">演練條款與隱私說明</Link>
              </label>
              {!proof ? (
                <button
                  disabled={busy || !agreed}
                  onClick={() =>
                    void run(async () => {
                      const response = await fetch(
                        "/api/passenger-app/review-demo/otp",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ target }),
                        },
                      );
                      if (!response.ok) throw new Error("otp_unavailable");
                      const result = await response.json();
                      setProof(result.data);
                    })
                  }
                >
                  取得模擬簡訊
                </button>
              ) : (
                <>
                  <p>
                    模擬簡訊驗證碼：<output>{proof.code}</output>（5 分鐘有效）
                  </p>
                  <button
                    disabled={busy || !agreed}
                    onClick={() =>
                      void run(async () => {
                        await client.login({
                          provider: "phone",
                          target,
                          ...proof,
                        });
                        // Real profile/consent writer; no localStorage account substitute.
                        await client.updateAccount({
                          displayName: "審查演練乘客",
                          contactPhone: target,
                          termsVersion: "review-terms-v1",
                          privacyVersion: "review-privacy-v1",
                        });
                        setAccountId(
                          (await client.getAccount()).drtsPassengerId,
                        );
                        setProof(undefined);
                      })
                    }
                  >
                    驗證並登入演練帳戶
                  </button>
                  <button disabled={busy} onClick={() => setProof(undefined)}>
                    重新取得
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}
      <h2>三視窗操作順序</h2>
      {enabled && (
        <p>
          <a href="/review-driver/onboarding" target="_blank" rel="noreferrer">
            開啟真 Driver 演練視窗
          </a>{" "}
          ·{" "}
          {opsUrl && (
            <a href={opsUrl} target="_blank" rel="noreferrer">
              開啟已授權 Ops 操作視窗
            </a>
          )}
        </p>
      )}
      <ol>
        <li>乘客確認叫車後，複製行程網址中的 UUID。</li>
        <li>
          在已登入的 Ops「派遣」找到此
          UUID，建立派遣並指派合格演練車司；改派與無車沿現有操作。
        </li>
        <li>
          司機用有效裝置註冊碼登入 Driver Web，任務確認同
          UUID，依序接單、出發、抵達、開始、完成。模擬位置須開啟並推進，才能累積
          tracker 里程。
        </li>
        <li>
          乘客保持行程頁，觀察即時狀態；暫停位置可觀察過期，停網後恢復可觀察重連。
        </li>
        <li>
          第一單正常付款與五星；第二單先選失敗付款方式、完程後依政策補繳與低分案件；第三單取消後回歷史讀回。
        </li>
      </ol>
      <Link href="/demo">原本機功能示範</Link>
    </main>
  );
}
