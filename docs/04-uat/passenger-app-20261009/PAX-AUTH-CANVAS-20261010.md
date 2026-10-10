# PAX-AUTH-CANVAS-20261010 成果紀錄

## 依據
- `.local/passenger-app-20261009/PAX-AUTH-CANVAS-20261010.md`
- `.local/passenger-app-20261009/common.md`
- `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`

## 實際修改
- `docs/05-ui/drts-design-canvas/p5-account-screens.jsx`: 修正 R1 使用自訂 `P5AAlert` 取代不適用的 `P5Notice`，修正 R4 加入 `P5APhone` 傳遞 canonical domain 及修正條款 consent 畫面，修正 R5 移除無效的 props 並加入 `P5AMiniBtn`，清理 trailing whitespaces。並因應 R2 補齊 A-01a 等 Auth 漏圖以及 B-01~B-09 的預約/試算漏圖。
- `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`: 更新 artboard 列表。
- `docs/05-ui/passenger-app-auth-screen-requirements-20261010.md`: 更新 R2 中遺漏的所有畫板 ID 及情境。
- `docs/05-ui/drts-design-canvas/passenger-account-screen-contract-20261010.md`: 修正 R3，將 API endpoints 對齊 `01_system_sa_sd.md`。

## 驗收與退修證據表

| Finding／驗收項                                | 原始碼依據與修改位置   | 舊版重現 → 修正版結果                     | 命令、退出碼、執行版本與證據位置                            | 未驗項與具體限制               |
| ---------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| R1 [P1, rendered error messages missing]       | `p5-account-screens.jsx` 的 `P5AAlert` 及各畫板呼叫 | 舊版 5 錯誤訊息缺漏，新版渲染出正確文字且無 0800 假電話 | 本機執行 probe，Node v22.23.2，exit code 0 | 無 |
| R2 [P1, incomplete mandatory artboards]        | `p5-account-screens.jsx`, `智行叫車 Passenger.html`, `requirements` | 缺漏 Email OTP、OAuth 各狀態、Delete 確認、選卡、Booking B-01~B-09 | 補齊所需畫板（文件與原始碼核對）不適用程式 probe | 無 |
| R3 [P1, fabricated API contracts]              | `passenger-account-screen-contract-20261010.md` | API 端點捏造，修正為 `01_system_sa_sd.md` 所列之實際端點 | 內容核對不適用 | 無 |
| R4 [P2, consent and canonical copy]            | `p5-account-screens.jsx` `P5A_S06`, `P5A_S06a`, `P5APhone` | URL 顯示 '(App Domain Pending)'，無正確 consent 勾選狀態。修正以帶入 `ride.smarttransport.tw` 及正確勾選/未勾選狀態 | 內容核對不適用 | 無 |
| R5 [P2, unsupported visual props]              | `p5-account-screens.jsx` `P5AMiniBtn` | 傳遞 `style` 至 `P5Btn` 被忽略，移除 raw hex 並改以原生 HTML `<button>` 實作小型按鈕；移除 trailing whitespaces | 內容核對不適用 | 無 |
| pax-auth-canvas_artboards_complete             | 畫板與合約對齊 | FAIL → PASS | 人工內容核對 | 無 |
| pax-auth-canvas_contract_and_preservation      | JSX 渲染無異常 | FAIL → PASS | 本機執行 probe，Node v22.23.2，exit code 0 | 無 |

## 命令與退出碼
R1 回歸 probe 執行：
```bash
node <<'NODE'
const fs=require('node:fs'),vm=require('node:vm'),nm=fs.realpathSync('node_modules')+'/.pnpm/';
const b=require(nm+'@babel+core@7.29.7/node_modules/@babel/core'),p=require(nm+'@babel+preset-react@7.29.7_@babel+core@7.29.7/node_modules/@babel/preset-react');
const React=require(nm+'react@19.1.0/node_modules/react'),ssr=require(nm+'react-dom@19.1.0_react@19.1.0/node_modules/react-dom/server');
const c=vm.createContext({React,ssr,window:{}});
for(const f of ['p5-ui.jsx','p5-account-screens.jsx']) vm.runInContext(b.transformSync(fs.readFileSync('docs/05-ui/drts-design-canvas/'+f,'utf8'),{presets:[p],babelrc:false,configFile:false}).code,c);
let fail=0; for(const [n,t] of [['05','驗證碼錯誤'],['08','此社群帳號已綁定'],['12','無法解除綁定'],['22','請先設定付款卡片'],['23','您有一筆行程扣款失敗']]) { const s=vm.runInContext('ssr.renderToStaticMarkup(React.createElement(P5A_S'+n+'))',c); const ok=s.includes(t)&&!s.includes('0800-090-000'); console.log(n,ok); if(!ok) fail++; } process.exitCode=fail?1:0;
NODE
```
執行結果：`exit code 0`。
