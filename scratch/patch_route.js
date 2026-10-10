const fs = require('fs');
const path = require('path');
const p = path.resolve('apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts');
let content = fs.readFileSync(p, 'utf8');

const interceptCallback = `
    if (fullPath === "auth/oauth/callback" && method === "POST") {
      if (initialBodyData) {
        try {
          const parsed = JSON.parse(initialBodyData);
          const txn = request.cookies.get("pax_oauth_txn")?.value;
          if (txn) {
            parsed.transaction_id = txn;
            initialBodyData = JSON.stringify(parsed);
          }
        } catch(e) {}
      }
    }
`;
content = content.replace(
  "let init = await buildInit(token, refreshToken);",
  interceptCallback + "\n    let init = await buildInit(token, refreshToken);"
);

const interceptStart = `
    let oauthTxn = null;
    if (fullPath === "auth/oauth/start" && method === "POST" && upstream.ok) {
       try {
         const text = await upstream.clone().text();
         const parsed = JSON.parse(text);
         if (parsed.data?.transaction_id || parsed.transaction_id || parsed.data?.transactionId || parsed.transactionId) {
            oauthTxn = parsed.data?.transaction_id || parsed.transaction_id || parsed.data?.transactionId || parsed.transactionId;
         }
       } catch(e) {}
    }
`;
content = content.replace(
  "let loginData = null;",
  interceptStart + "\n    let loginData = null;"
);

const setCookie = `
    if (oauthTxn) {
      nextResponse.cookies.set("pax_oauth_txn", oauthTxn, { ...opts, maxAge: 600 });
    }
`;
content = content.replace(
  "if (didClearTokens) {",
  setCookie + "\n    if (didClearTokens) {"
);

fs.writeFileSync(p, content);
console.log("Patched route.ts");
