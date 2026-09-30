# UI17-PASSENGER-CANVAS-20260924 驗收文件

## 來源與依據
- Source ZIP: `docs/05-ui/driver app (18).zip`
- Source SHA256: `9989de8f342e2d78e85796599131bea139a238e750821d1f292e004bb4cd9005`
- Review Sources:
  - `worker_outcomes codex-20260924T072904Z-eade93f1` (Candidate SHA `f08c75fd8cfd264d2e7bd3eb94d8a447f41de8c9`)
  - `codex-20260924T074134Z-f0e892fc` (Candidate SHA `52504d576dcb0422a4b2c4852c4e77547c6d70a3`)
  - `codex-20260924T080620Z-6ff5bb17` at 2026-09-24T08:12:15Z (Candidate SHA `c7eb547ef72455f411fb722b9d0cb36b234c3b38`)
  - Current PR #2133 (Candidate SHA `7ba1319dda95260c877e8b5d4d9d2f1cd1154bec`)
- 正式依據：新北市交通局 115.9.11 初審意見，要求 E-04、E-18、E-19 增量。
- 移植畫板：E-04（P5_S10 修改）、E-18 / E-18b、E-19a、E-19b / E-19b-off。

## 審查發現對照與修正

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F1/F6: PR targets the wrong integration branch | PR #2133 | 舊版 PR base 為 `main` → 修正版改為 `dev`，且僅含 6 個 scoped files | PR #2133 matches published head `7ba1319dda95260c877e8b5d4d9d2f1cd1154bec` | (無) |
| F2: E-screen customer-service number remains inconsistent | `p5-ui.jsx`, `p5-e-screens.jsx` | 舊版 `P5Notice` 寫死 0800 → 新增 `csNumber` props 且 E-04/E-18/E-19a 等皆帶入 `02-2944-0985` | (Reviewer execution) Node test-harness probe 退出碼 0 (Node v22.23.2, Babel 7.29.0) | 瀏覽器渲染、實際真機一致性待驗 |
| F3: Unconfirmed example URLs promoted into contract | `p5-ui.jsx`, `p5-e-screens.jsx`, `passenger-e-screen-contract-20260924.md` | 舊版 URL `ride.zhixing.tw` → 改為 `(App Domain Pending)` 佔位符 | (Reviewer execution) Node test-harness probe 退出碼 0 (Node v22.23.2) | 尚未確認正式網域與部署路徑 |
| F4a: Required fee/policy crosswalk and auditable evidence are missing | `passenger-e-screen-contract-20260924.md` | 舊版未核對 8 項費用與 PRD → 修正版補齊 8 項對照，修正 3. 取消費與 8. 優惠活動的不當政策歸因，維持 attachment-only/pending 狀態。釐清 NT$80 為舊版範例。 | Markdown 文本檢閱 (c7eb547e / 7ba1319d) 相比 52504d57 修正 | 未變更產品行為與政策 |
| F4b: reproducible handoff evidence missing | `UI17-PASSENGER-CANVAS-20260924.md` | 舊版缺乏可執行的 Node probe 腳本，只有文字描述 | 於本文件底部補齊 Reviewer-executed runnable scoped probe (exit 0) | - |
| F5: check_commit_trailers.py fails | CI | 舊版 trailers 錯誤或遺失 → 修正版包含正確的 2 commits | `tools/ci/git/check_commit_trailers.py --base c2d94aaa42b7042cd0d44d2114fea2096c18e617 --head 7ba1319dda95260c877e8b5d4d9d2f1cd1154bec`: Python 3.12.3, exit 0 | - |
| `ui17-passenger-canvas-20260924_source_and_state_coverage` | E-04、E-18、E-19 畫板元件 | 確認畫板與邏輯涵蓋 E04 detail state、E18 low-score state 及 E19 disabled state | (Reviewer execution) Node test-harness probe 退出碼 0 (Node v22.23.2) | E-04/E-18 真機一致性未驗證 |
| `ui17-passenger-canvas-20260924_scoped_verification_and_preservation` | `智行叫車 Passenger.html` | 保留原有 P5 頁面，組件 SSR 皆相同（僅 URL 佔位符改動）；`design-canvas.jsx` CDN 引入與結構不變 | `git diff --check c2d94aaa42b7042cd0d44d2114fea2096c18e617 7ba1319dda95260c877e8b5d4d9d2f1cd1154bec` 退出碼 0 | Browser 實際互動未驗證 |

## 命令與檢查
- Reviewer executed `tools/ci/git/check_commit_trailers.py` locally and verified PR #2133 targets dev and includes exactly 6 allowed scoped files. Same-SHA CI integration runs completed SUCCESS.
- 執行 `git diff --check c2d94aaa42b7042cd0d44d2114fea2096c18e617 7ba1319dda95260c877e8b5d4d9d2f1cd1154bec`，退出碼 `0`，證實無 whitespace 錯誤。
- 下方附上完整的 Reviewer-executed runnable scoped probe (Node test-harness code)。該腳本在 `7ba1319dda95260c877e8b5d4d9d2f1cd1154bec` (current) 與 `c7eb547ef72455f411fb722b9d0cb36b234c3b38` (prior) 下執行皆通過 (exit 0)。測試環境: Node v22.23.2, Babel core 7.29.0 / preset-react 7.28.5, ReactDOM 19.2.5。未依賴 Browser/Server。

## 待驗
- 實際 Browser Layout 與互動 (React 18.3.1 CDN execution)。
- E-04/E-18 真機一致性確認。
- 正式網域 (`(App Domain Pending)`) 與部署路徑/後端整合確認。
- 實際 Hosted CI 流程與 Product Server 整合。

## Reviewer-executed runnable scoped probe

```bash
node <<'UI17_PROBE'
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {execFileSync: run} = require('node:child_process');
const deps = '/home/lupin/workspace/drts-fleet-platform/node_modules/.pnpm';
const pkg = (prefix,name) => {
  const matches = fs.readdirSync(deps).filter(x => x.startsWith(prefix));
  assert.equal(matches.length,1,'unique package '+prefix);
  return deps+'/'+matches[0]+'/node_modules/'+name;
};
const reactPath=pkg('react@19.2.5','react');
const domPath=pkg('react-dom@19.2.5','react-dom');
const babelPath=pkg('@babel+core@7.29.0','@babel/core');
const presetPath=pkg('@babel+preset-react@7.28.5','@babel/preset-react');
const React=require(reactPath), {renderToStaticMarkup:ssr}=require(domPath+'/server');
const babel=require(babelPath);
const base='c2d94aaa42b7042cd0d44d2114fea2096c18e617';
const prior='c7eb547ef72455f411fb722b9d0cb36b234c3b38';
const current='7ba1319dda95260c877e8b5d4d9d2f1cd1154bec';
const old='f08c75fd8cfd264d2e7bd3eb94d8a447f41de8c9';
const prefix='docs/05-ui/drts-design-canvas/';
const files=['design-canvas.jsx','p5-ui.jsx','p5-screens.jsx','p5-e-screens.jsx'];
const html='智行叫車 Passenger.html';
const blob=(sha,file)=>run('git',['show',sha+':'+prefix+file],{encoding:'utf8'});
function load(sha,hasE) {
  const c=vm.createContext({React,window:{},console});
  const evaluate=(source,name)=>vm.runInContext(babel.transformSync(source,
    {filename:name,configFile:false,babelrc:false,presets:[presetPath]}).code,c);
  for(const f of hasE?files:files.slice(0,3)) evaluate(blob(sha,f),f);
  const inline=blob(sha,html).match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
  evaluate(inline.replace(/ReactDOM\.createRoot[^\n]*\n?/,''),'App.jsx');
  return {c,render:(name,props={})=>ssr(React.createElement(c[name],props))};
}
const b=load(base,false), p=load(old,true), n=load(current,true);
for(const f of [...files,html]) assert.equal(blob(current,f),blob(prior,f),f+' unchanged');
assert.equal(blob(current,'design-canvas.jsx'),blob(base,'design-canvas.jsx'));
const external=s=>(s.match(/<script src="https:[^\n]+/g)||[]);
assert.deepEqual(external(blob(base,html)),external(blob(current,html)));
const originalIds=[...blob(base,html).matchAll(/<DCArtboard id="([^"]+)"/g)].map(m=>m[1]);
const boards=[];
function walk(e) {
  if(!React.isValidElement(e)) return;
  if(e.type===n.c.DCArtboard) {boards.push(e.props.id); ssr(e.props.children);}
  React.Children.forEach(e.props.children,walk);
}
walk(n.c.App());
assert.equal(originalIds.length,14); assert.equal(boards.length,19);
for(const id of originalIds) assert(boards.includes(id),id);
const normalize=s=>s.replaceAll('ride.zhixing.tw/r/••••K2','(App Domain Pending)/r/••••K2');
const preserved=[...Array(12)].map((_,i)=>'P5_S'+String(i+1).padStart(2,'0'))
  .filter(x=>x!=='P5_S10').concat(['P5_A03','P5_A04']);
for(const name of preserved) assert.equal(normalize(b.render(name)),n.render(name),name);
const e04=n.render('P5_S10');
for(const s of ['車隊／派遣業者','智行車隊（智慧運輸科技股份有限公司）','執登證號 ••••4280',
  '起程','NT$ 85','續程','NT$ 245','延滯計時','NT$ 25','夜間加成','信用卡 ••••1234','1999'])
  assert(e04.includes(s),s);
assert(!n.render('P5_S10',{detail:false}).includes('夜間加成'));
for(let stars=1;stars<=5;stars++) {
  const out=n.render('P5_E18',{stars});
  assert.equal(out.includes('需要客服與您聯繫嗎？'),stars<=2);
  for(const s of ['BKR-2208','蔡○○','NT$ 355','信義區松仁路 100 號','中山區南京東路二段 100 號'])
    assert(e04.includes(s)&&out.includes(s),s);
}
for(const [name,props] of [['P5_S10',{}],['P5_E18',{stars:4}],['P5_E18',{stars:2}],['P5_E19a',{}]]) {
  assert(p.render(name,props).includes('0800-090-000'),'old footer reproduction');
  const out=n.render(name,props);
  assert(out.includes('02-2944-0985')&&!out.includes('0800-090-000'),name);
  assert(out.includes('(App Domain Pending)'),name+' URL');
}
for(const checked of [true,false]) {
  const out=n.render('P5_E19b',{checked});
  const tag=out.match(/<button\b[^>]*>確認叫車<\/button>/)[0];
  assert.equal(/\sdisabled(?:=|\s|>)/.test(tag),!checked);
  assert(tag.includes('cursor:'+(checked?'pointer':'not-allowed')));
  assert.equal(out.includes('請先勾選'),!checked);
}
const spec=run('python3',['-c',
  'import zipfile; z=zipfile.ZipFile("/home/lupin/workspace/drts-fleet-platform/docs/05-ui/driver app (18).zip"); print(z.read(next(n for n in z.namelist() if n.endswith("G201011_App補件畫面設計規格_v1_0.md"))).decode())'
],{encoding:'utf8'});
const section=spec.split('### 3.3')[1].split('**分兩個畫面')[0];
const rows=[...section.matchAll(/^\| ([^|]+) \| ([^|]+) \|$/gm)]
  .map(m=>[m[1].trim(),m[2].trim()]).filter(x=>!['項目','---'].includes(x[0]));
assert.equal(rows.length,8);
assert.deepEqual(JSON.parse(JSON.stringify(n.c.window.E_FEES)),rows);
const feeOutput=n.render('P5_E19a');
for(const [label,text] of rows) assert(feeOutput.includes(label)&&feeOutput.includes(text),label);
console.log(JSON.stringify({result:'PASS',sha:current,predecessor:prior,
  node:process.version,babel:babel.version,preset:require(presetPath+'/package.json').version,
  react:React.version,reactDom:require(domPath+'/package.json').version,
  originalBoards:originalIds.length,totalBoards:boards.length,preservedScreens:preserved.length,
  checks:['4 JSX + inline App parsed/evaluated','prior source blob equality','CDN/shell preserved',
    'actual board children SSR','E04 detail both states','E18 stars 1-5/trip equality',
    'F2 old 4 failures reproduced/current pass','E URL placeholders','E19 disabled both states',
    '8 fee rows exact ZIP18 equality']},null,2));
UI17_PROBE
```
