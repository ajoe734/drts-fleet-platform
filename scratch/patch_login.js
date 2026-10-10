const fs = require('fs');
const p = 'apps/passenger-app-web/app/login/page.tsx';
let content = fs.readFileSync(p, 'utf8');

// Replace handleVerifyOtp and add consent state
content = content.replace(
  'const [loading, setLoading] = useState(false);',
  `const [loading, setLoading] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState("");`
);

content = content.replace(
  /const handleVerifyOtp = async \(\) => \{[\s\S]*?finally \{\n      setLoading\(false\);\n    \}\n  \};/,
`const handleVerifyOtp = async () => {
    setLoading(true);
    setError("");
    try {
      const target = providerUsed === "phone" ? phone : email;
      const res = await client.login({
        target,
        provider: providerUsed,
        challenge,
        code,
      });
      if (res.result === "logged_in") {
        try {
          const acc = await client.getAccount();
          if (!acc.termsVersion) {
            setConsentRequired(true);
          } else {
            window.location.href = "/";
          }
        } catch {
          window.location.href = "/";
        }
      } else {
        setError("驗證失敗");
      }
    } catch (err: any) {
      if (err.message && err.message.includes("429")) {
         setError("嘗試次數過多，請稍後重試");
      } else {
         setError("驗證碼錯誤或已過期");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConsentSubmit = async () => {
    if (!consentChecked) {
      setConsentError("請勾選同意條款與隱私權政策");
      return;
    }
    setLoading(true);
    setConsentError("");
    try {
      await client.updateAccount({ termsVersion: "v1.0", privacyVersion: "v1.0" });
      window.location.href = "/";
    } catch {
      setConsentError("儲存失敗，請重試");
      setLoading(false);
    }
  };`
);

// Add loading state guards
content = content.replace(/onClick=\{handleVerifyOtp\}/g, `disabled={loading || code.length !== 6} onClick={handleVerifyOtp}`);
content = content.replace(/onClick=\{\(\) => handleRequestOtp\(providerUsed\)\}/g, `disabled={loading || countdown > 0} onClick={() => handleRequestOtp(providerUsed)}`);
content = content.replace(/onClick=\{\(\) => handleRequestOtp\("phone"\)\}/g, `disabled={loading || !phone} onClick={() => handleRequestOtp("phone")}`);
content = content.replace(/onClick=\{\(\) => handleRequestOtp\("email"\)\}/g, `disabled={loading || !email} onClick={() => handleRequestOtp("email")}`);
content = content.replace(/onClick=\{\(\) => handleOAuth\("google"\)\}/g, `disabled={loading} onClick={() => handleOAuth("google")}`);
content = content.replace(/onClick=\{\(\) => handleOAuth\("facebook"\)\}/g, `disabled={loading} onClick={() => handleOAuth("facebook")}`);
content = content.replace(/onClick=\{\(\) => handleOAuth\("line"\)\}/g, `disabled={loading} onClick={() => handleOAuth("line")}`);

// Render consent screen if consentRequired is true
content = content.replace(
  'if (otpSent) {',
  `if (consentRequired) {
    return (
      <div style={{ padding: 14 }}>
        <P5Card title="服務條款與隱私權政策">
          <div style={{ marginBottom: 14, fontSize: 13, color: P5.ink }}>
            歡迎使用智行叫車。請先閱讀並同意我們的服務條款與隱私權政策。
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <input 
              type="checkbox" 
              id="consent" 
              checked={consentChecked} 
              onChange={(e) => setConsentChecked(e.target.checked)} 
              disabled={loading}
            />
            <label htmlFor="consent" style={{ fontSize: 13, color: P5.ink, cursor: "pointer" }}>
              我同意
              <a href="/terms" target="_blank" style={{ color: P5.brand, textDecoration: "none", margin: "0 4px" }}>服務條款</a>
              與
              <a href="/privacy" target="_blank" style={{ color: P5.brand, textDecoration: "none", margin: "0 4px" }}>隱私權政策</a>
            </label>
          </div>
          {consentError && (
            <div style={{ color: P5.danger, fontSize: 13, marginBottom: 14 }}>{consentError}</div>
          )}
          <P5Btn kind="primary" disabled={loading} onClick={handleConsentSubmit}>
            {loading ? "處理中..." : "同意並繼續"}
          </P5Btn>
        </P5Card>
      </div>
    );
  }

  if (otpSent) {`
);

fs.writeFileSync(p, content);
console.log("Patched login page.");
