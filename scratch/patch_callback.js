const fs = require('fs');
const p = 'apps/passenger-app-web/app/auth/callback/[provider]/page.tsx';
let content = fs.readFileSync(p, 'utf8');

// Replace standard passenger client import
content = content.replace(
  'import { useRouter, useParams, useSearchParams } from "next/navigation";',
  'import { useRouter, useParams, useSearchParams } from "next/navigation";\nimport { PassengerClient } from "../../../../../packages/passenger-client/src";'
);

content = content.replace(
  'const [loading, setLoading] = useState(true);',
  `const [loading, setLoading] = useState(true);
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState("");
  
  const client = useRef(new PassengerClient({
    baseUrl: "",
    fetchFn: (...args) => fetch(...args),
  })).current;`
);

content = content.replace(
  /if \(payload\.result === "logged_in"\) \{\n            router\.push\("\/"\);\n          \}/g,
  `if (payload.result === "logged_in") {
            try {
              const acc = await client.getAccount();
              if (!acc.termsVersion) {
                 setConsentRequired(true);
                 setLoading(false);
              } else {
                 router.push("/");
              }
            } catch {
              router.push("/");
            }
          }`
);

const consentScreen = `
  const handleConsentSubmit = async () => {
    if (!consentChecked) {
      setConsentError("請勾選同意條款與隱私權政策");
      return;
    }
    setLoading(true);
    setConsentError("");
    try {
      await client.updateAccount({ termsVersion: "v1.0", privacyVersion: "v1.0" });
      router.push("/");
    } catch {
      setConsentError("儲存失敗，請重試");
      setLoading(false);
    }
  };

  if (consentRequired) {
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
`;

content = content.replace(
  'return (',
  consentScreen + '\n  return ('
);

fs.writeFileSync(p, content);
console.log("Patched callback page.");
