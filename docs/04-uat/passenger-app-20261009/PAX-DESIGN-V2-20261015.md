# PAX-DESIGN-V2-20261015 驗證紀錄

Owner：Codex。Reviewer：Codex2。日期：2026-10-15（UTC）。只改文件。

## 依據、版本與交接

- 依據：本 task spec、canonical root 的 `.local/passenger-app-20261009/common.md`（含 2026-10-10 補充）、`claude-design-20261015/design-spec-20261010.md`、SA／SD §3、既有 P5 canvas 與 `packages/ui-tokens/src/realms.ts` passenger 品牌。
- 基線：`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`。匯入 anchor：`04f539b8c`。內容修訂與檢查執行版本：`d91754c635a72af88e4fb8209cacf2569d02e5aa`，後續 closeout 僅新增本證據文件。
- 候選分支：`codex/pax-design-v2-20261015`。最終完整 `CANDIDATE_SHA` 取本文件所在候選的 `git rev-parse HEAD`，並由 status CLI handoff 與同一 PR head 鎖定；不把 anchor SHA 當 candidate，也不在文件自填無法自參照的 commit hash。
- PR 與同 SHA 的 CI／review 結果由 task machine truth 記錄；本文件提交時尚待建立 PR、讀取該候選 CI 並交 Codex2 獨立審查，沒有宣稱已 merge 或完成 acceptance。
- 沒有前輪候選退修。本輪已知來源缺口保留於下表，不以匯入成功覆蓋缺口。

## Finding／驗收對照

| Finding／驗收項                         | 原始碼依據與修改位置                                                                                                                                     | 舊版重現 → 修正版結果                                                                                       | 命令、退出碼、版本與證據位置                                                         | 未驗項與具體限制                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| pax-design-v2_artboards_imported        | 來源 `project/`；新目錄 `canvas.json`、28 個 `.dc.html`、README；舊 account contract 與 Passenger HTML 的 A／B 區段                                      | 基線無 v2 存檔 → 29 個檔 byte-identical，28 ID／狀態逐字一致，50 個舊 ID 全數標為取代並有映射；標籤配對通過 | 下方匯入／HTML／README 核對：exit 0，完整 sha256 及輸出可重跑；執行於上述內容 anchor | 匯入完整，但完整設計狀態符合性仍有 AU-04 缺口；畫面實際顯示／互動未驗（需 Claude Design 執行環境）         |
| pax-design-v2_policy_text_aligned       | 使用者 2026-10-10 決定；E_FEES、P5_E19b、P5_S01／S06／S12／A03、P5Actions／Notice、PA_P5Fare、platform-mtx-commerce、兩份 contract、02_content_and_rules | 基線 grep 命中 13 行 → 指定 grep 空；取消含派車後不收費、60 秒 NT$5、夜間每趟 NT$20、客服 02-2944-0985      | grep 預期 exit 1（無匹配）；Babel 7.29.2 exit 0；下方逐字前後對照                    | 同 candidate CI、獨立 reviewer、merge／acceptance 尚由 lifecycle 收錄；本機 pass 不代替這些 gate           |
| SRC-AU04：Email OTP 要求同 AU-02 狀態   | 規格 AU-04「同 AU-02」；原始 AU-04.dc.html 的「｜」標籤                                                                                                  | 原始及匯入檔均只有已填寫／格式錯誤，缺空白／傳送中／傳送太頻繁；本輪未消除                                  | README 明列缺口；hash 一致證明沒有自行補畫；同一來源靜態定位，不適用產品行為測試     | 任務要求匯入檔一位元組不改，需原設計來源補稿，請 reviewer／Supervisor 判定接受邊界；不得將全部狀態標為通過 |
| CONTRACT-PM04／GEO：設計與既有 API 落差 | SA／SD §3 未定義乘客重扣 command；舊 account contract 的 geo BFF 未決註記                                                                                | 新 README 對 PM-04 重扣、BK-02／03 存取邊界明列待補契約；不捏造 endpoint                                    | 人工文件對照；API 對照表標註同一限制                                                 | 非本 task 產品實作範圍；更新卡片不等於已有重扣 API                                                         |

## 匯入 hash、標籤與對照表核對

來源絕對路徑：`/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/claude-design-20261015/project/`。
來源與目的檔直接以 bytes 比較，下列 SHA256 MATCH 每行的 hash 同時適用來源與目的檔。
未重新序列化 `canvas.json`，未格式化 `.dc.html`，沒有複製產生器或新增 runtime。

在 repo root 執行以下 Python（本機保存為 `.local/pax-design-v2-20261015/check-import.py`）：

```python
from pathlib import Path
from html.parser import HTMLParser
import hashlib, json, re
src = Path('/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/claude-design-20261015/project')
dst = Path('docs/05-ui/passenger-app-design-20261015')
meta = json.loads((dst / 'canvas.json').read_text())
assert len(meta['boards']) == len(meta['order']) == 28
assert set(meta['order']) == set(meta['boards']) == {p.name for p in dst.glob('*.dc.html')}
readme = (dst / 'README.md').read_text()
rows = {}
for line in readme.splitlines():
    cols = [c.strip() for c in line.split('|')]
    if len(cols) == 8 and re.fullmatch(r'(AU|AC|BK|TR|PM)-\d{2}', cols[1]):
        assert cols[1] not in rows
        rows[cols[1]] = cols
assert len(rows) == 28
class Tags(HTMLParser):
    void = set('area base br col embed hr img input link meta param source track wbr'.split())
    def __init__(self):
        super().__init__(); self.stack = []
    def handle_starttag(self, tag, attrs):
        if tag not in self.void: self.stack.append(tag)
    def handle_startendtag(self, tag, attrs): pass
    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, (self.getpos(), tag, self.stack[-3:])
        self.stack.pop()
for name in ['canvas.json', *meta['order']]:
    data = (dst / name).read_bytes()
    assert data == (src / name).read_bytes(), name
    print('SHA256 MATCH', hashlib.sha256(data).hexdigest(), name)
    if name.endswith('.dc.html'):
        content = data.decode(); parser = Tags(); parser.feed(content); parser.close()
        assert not parser.stack, (name, parser.stack)
        title = re.search(r'<title>(.*?)</title>', content)[1]
        assert title == meta['boards'][name]['title']
        screen_id, screen_name = title.split(' ', 1)
        states = re.findall(r'>｜([^<]+)<', content)
        assert rows[screen_id][2] == f'[{name}]({name})'
        assert rows[screen_id][3] == screen_name
        assert rows[screen_id][4] == '；'.join(states), screen_id
        print('TAGS + README PASS', screen_id, len(states), 'state labels')
contract = Path('docs/05-ui/drts-design-canvas/passenger-account-screen-contract-20261010.md').read_text()
legacy = contract.split('## 舊版畫板與歷史 API 對照（已取代）')[1]
old_ids = re.findall(r'^\| ([AB]-\d+[a-z]?) \|', legacy, re.M)
assert len(old_ids) == 50
mapping = contract.split('## 舊版畫板與歷史 API 對照（已取代）')[0]
for old in old_ids:
    assert re.search(r'(?<![\w-])' + re.escape(old) + r'(?![\w-])', mapping), old
    assert re.search(r'^\| ' + re.escape(old) + r' \|[^\n]*已取代（2026-10-15）', legacy, re.M)
print('PASS: 29 byte-identical imports, 28 balanced HTML files, 28 exact README rows, 50 legacy mappings.')
print('OPEN DESIGN GAP: AU-04 missing blank/sending/rate-limited states from source; not redrawn.')
```

命令：`python3 .local/pax-design-v2-20261015/check-import.py`。Python 3.12.3；exit 0。完整輸出：

```text
SHA256 MATCH 593618160b2f0ecf6c1e12234e30068d27c4c44c0a31d49e0cec8bdb71a2aa58 canvas.json
SHA256 MATCH f3aa0c686df06aa33e80bd2806c2de399b6a2f43b28e6ac19c7dd482bfd9a96e Main.dc.html
TAGS + README PASS AU-01 3 state labels
SHA256 MATCH 7528ebde95737a81e2b2ed2d37091abd538e3c03c822999cd90814558b0255ae AU-02.dc.html
TAGS + README PASS AU-02 4 state labels
SHA256 MATCH 0cc8f09ebcb7cf14a7c9ead357bb5f3ad3e8dbf4c10e65fe16d227c33e870131 AU-03.dc.html
TAGS + README PASS AU-03 6 state labels
SHA256 MATCH c30a99cafab3ced8f5844337f3de4d8f50e4d0944abf0404748d4cc6a2647b38 AU-04.dc.html
TAGS + README PASS AU-04 2 state labels
SHA256 MATCH c1528dda145794dfaa82f8b528c620a3b1130cfe3e6db83b89eec828e6398999 AU-05.dc.html
TAGS + README PASS AU-05 3 state labels
SHA256 MATCH ba5faca2bfb8789926fcc00d0b9ba4a50f8c54cad96ddcc29b3038fb51208386 AU-06.dc.html
TAGS + README PASS AU-06 3 state labels
SHA256 MATCH c2d9b7f02cbf1ff4a57d83a762228a6861c4cdfbd46acead33cd97ef01b79753 AU-07.dc.html
TAGS + README PASS AU-07 1 state labels
SHA256 MATCH b3e9c7c9e349fb5ef450e2e59ecdaabc67b71be07d4b8eca07476f088dc9cc12 AU-08.dc.html
TAGS + README PASS AU-08 2 state labels
SHA256 MATCH 93156edd2faab608bc873e57a1592c48264aca856e8e28900c4285d9bb80fbac AC-01.dc.html
TAGS + README PASS AC-01 3 state labels
SHA256 MATCH 46a12860d96eb904d264330bc85d4de1bdc7f824ac09845f9aa06b201d73e373 AC-02.dc.html
TAGS + README PASS AC-02 3 state labels
SHA256 MATCH 68db2f01e5be975e6cb7cfc2ec830fc77fe3b9ea6d39bf79fa66a938e1f4cce5 AC-03.dc.html
TAGS + README PASS AC-03 3 state labels
SHA256 MATCH f7d058ec8b5a13d6d080466025508c66ebcae1ad9e1e7cfdd644b3bcc68383a0 AC-04.dc.html
TAGS + README PASS AC-04 4 state labels
SHA256 MATCH 2928bc3af282bcb029457f0f4a519d779765ce61e92eb0c3dedc7ed841633dcc AC-05.dc.html
TAGS + README PASS AC-05 1 state labels
SHA256 MATCH 235eada9af3612bfc37a764268b627a059a734f6a3581f06ad8a779a20941e20 AC-06.dc.html
TAGS + README PASS AC-06 5 state labels
SHA256 MATCH 9ef4f6f87fb34ac213d828175144c78710f590316064c5cbfd0b84d5b9344050 BK-01.dc.html
TAGS + README PASS BK-01 5 state labels
SHA256 MATCH 8115a230f49e977074cd664e8ac1f51527f2cbd0221f1c851f86059a0cb0728d BK-02.dc.html
TAGS + README PASS BK-02 6 state labels
SHA256 MATCH aa8db307306c755cd515f94dc8fa45381ab88841dbd56d8025df58eeadc80d18 BK-03.dc.html
TAGS + README PASS BK-03 3 state labels
SHA256 MATCH 2362d220115b056e97bcd9b328f8d07cb96732f399afdb7ae41da0d3fb44bf3f BK-04.dc.html
TAGS + README PASS BK-04 3 state labels
SHA256 MATCH 72a14e246604dcee80793b9a99099dcc792bd7b1e87c5b6fa9b1b39a2bbd432e BK-05.dc.html
TAGS + README PASS BK-05 4 state labels
SHA256 MATCH d298ae8080418bf0f72143d9c065742146c383d938737a0a20061a72517a6f21 TR-01.dc.html
TAGS + README PASS TR-01 3 state labels
SHA256 MATCH ee1a8b69bf1d78e1cd424d252ba0a3a7e47c234f09ebcf3025c10325c3eb7928 TR-02.dc.html
TAGS + README PASS TR-02 1 state labels
SHA256 MATCH 9a0b82cbfac716792d8bad89a7359ae4ac21c83159e117b05619e3a74e1b8071 TR-03.dc.html
TAGS + README PASS TR-03 4 state labels
SHA256 MATCH de1e0ff3db3ea1ce670e588a69fde2e947edd2f598da41608f329611b9b2e766 TR-04.dc.html
TAGS + README PASS TR-04 1 state labels
SHA256 MATCH 9463ebe29e81d0227d08efecd47c4a72b01557565cbc9e8598640cceff9584d4 PM-01.dc.html
TAGS + README PASS PM-01 3 state labels
SHA256 MATCH 4cb4a27ac351029994dc7155aa419e9b12fe25c603dcaae0d4cd760bb8bc83ad PM-02.dc.html
TAGS + README PASS PM-02 6 state labels
SHA256 MATCH 2457b28f83ff966f1cb44ef01ba475dec3069c90afac077c5e1e8347a9dfe095 PM-03.dc.html
TAGS + README PASS PM-03 3 state labels
SHA256 MATCH 2382783289ef69b158127d745a25fdf8fd5811d3d038515625783337bb135caf PM-04.dc.html
TAGS + README PASS PM-04 3 state labels
SHA256 MATCH 7cb82b89ff6fc62bb20a754d8a474c62934894296f22e298363f48a2c055c094 PM-05.dc.html
TAGS + README PASS PM-05 3 state labels
PASS: 29 byte-identical imports, 28 balanced HTML files, 28 exact README rows, 50 legacy mappings.
OPEN DESIGN GAP: AU-04 missing blank/sending/rate-limited states from source; not redrawn.
```

規格對照另確認：PM-01 將過期／失效合併一框；TR-01 在單一清單內含進行中、完成可評價、付款失敗、已取消；AC-03 額外呈現驗證碼輸入、AU-05 額外呈現等待過久。AU-04 三個缺少狀態是未解項。

## 每個文字修正的前後對照

以下為實際 literal replacement；出現次數以本輪替換時為準。除了第 35 項為先替換網域後的相鄰句修訂，其餘修改前均核對基線存在；修改後均核對內容 anchor 存在（35 項 exit 0）。

2. `docs/05-ui/drts-design-canvas/p5-e-screens.jsx`（1 處）

   修改前：`// 費用政策文字為定稿，不得改寫。客服 02-2944-0985。運價寫「依主管機關核定運價」，不虛構文號。`

   修改後：`// 費用政策依 G201011 與 2026-10-10 使用者決定：取消一律不收費（含派車後）。其餘定稿文字不得改寫。客服 02-2944-0985。運價寫「依主管機關核定運價」，不虛構文號。`

3. `docs/05-ui/drts-design-canvas/p5-e-screens.jsx`（1 處）

   修改前：`不收取（指派前取消不收費）`

   修改後：`不收取（含派車後取消）`

4. `docs/05-ui/drts-design-canvas/p5-e-screens.jsx`（1 處）

   修改前：`預約費、取消費（指派前）、等待費：不另收`

   修改後：`預約費、取消費、等待費：不另收`

5. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

   修改前：`0800-090-000`

   修改後：`02-2944-0985`

6. `docs/05-ui/drts-design-canvas/p5-ui.jsx`（1 處）

   修改前：`0800-090-000`

   修改後：`02-2944-0985`

7. `docs/05-ui/drts-design-canvas/platform-mtx-commerce.jsx`（1 處）

   修改前：`0800-090-000`

   修改後：`02-2944-0985`

8. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

   修改前：`指派前取消不收費`

   修改後：`取消不收費`

9. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

   修改前：`取消可能產生 NT$ 80 費用`

   修改後：`取消不收費`

10. `docs/05-ui/drts-design-canvas/p5-ui.jsx`（1 處）

修改前：`2:15 內取消不收費`

修改後：`取消不收費`

11. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

修改前：`備查 北市交運字第1130042號`

修改後：`依臺北市政府公告計程車運價`

12. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

修改前：`每 80 秒`

修改後：`每 60 秒`

13. `docs/05-ui/drts-design-canvas/platform-p5.jsx`（1 處）

修改前：`每 80 秒`

修改後：`每 60 秒`

14. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

修改前：`+20%`

修改後：`每趟加 NT$ 20`

15. `docs/05-ui/drts-design-canvas/platform-p5.jsx`（1 處）

修改前：`+20% · 23:00–06:00`

修改後：`每趟加 NT$ 20 · 23:00–06:00`

16. `docs/05-ui/drts-design-canvas/platform-p5.jsx`（1 處）

修改前：`北市交運字第1130042號`

修改後：`依臺北市政府公告計程車運價`

17. `docs/05-ui/drts-design-canvas/platform-p5.jsx`（1 處）

修改前：`北市交運字第1130077號`

修改後：`依臺北市政府公告計程車運價`

18. `docs/05-ui/drts-design-canvas/platform-p5.jsx`（1 處）

修改前：`北市交運字第1120198號`

修改後：`依臺北市政府公告計程車運價`

19. `docs/05-ui/drts-design-canvas/platform-p5.jsx`（1 處）

修改前：`h:'備查文號'`

修改後：`h:'運價依據'`

20. `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`（1 處）

修改前：`指派前取消不收費`

修改後：`取消不收費`

21. `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`（1 處）

修改前：`收費取消窗口 + 安全帶提醒`

修改後：`取消不收費 + 安全帶提醒`

22. `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`（1 處）

修改前：`生效日 · 備查文號 · 車資變更規則`

修改後：`生效日 · 運價依據 · 車資變更規則`

23. `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`（1 處）

修改前：`05 · 登入與帳號 (PAX-AUTH-CANVAS-20261010)`

修改後：`05 · 登入與帳號 (PAX-AUTH-CANVAS-20261010) · 已由 docs/05-ui/passenger-app-design-20261015 取代`

24. `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`（1 處）

修改前：`## 1. 逐字抄錄內容`

修改後：`## 1. 原始內容與使用者決定 ⏎  ⏎ 以下以 G201011 為基礎；取消規則已由 2026-10-10 使用者決定覆蓋為一律不收費（含派車後）。其餘費用文字維持原稿。`

25. `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`（1 處）

修改前：`不收取（指派前取消不收費）`

修改後：`不收取（含派車後）`

26. `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`（1 處）

修改前：`預約費、取消費（指派前）、等待費：不另收`

修改後：`預約費、取消費、等待費：不另收`

27. `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`（1 處）

修改前：`G201011 寫「指派前取消不收費」，但派車後的取消費用不明確`

修改後：`原附件僅述派車前，現依使用者決定覆蓋`

28. `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`（1 處）

修改前：`**待使用者確認**：派車後（指派後）取消是否收費？取消後的 dispatch 政策為何？（保持 explicitly pending）`

修改後：`**已決定（2026-10-10 使用者）**：取消一律不收費，含派車後；行程開始（on_trip）後的取消限制沿用既有規則，不改派單政策。`

29. `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md`（1 處）

修改前：`依據 G201011 §3.3 line150 規定，必須呈現`

修改後：`依據 G201011 §3.3 line150，並套用 2026-10-10 使用者的取消決定，必須呈現`

30. `docs/05-ui/drts-design-canvas/passenger-e-screen-contract-20260924.md`（1 處）

修改前：`| 3. 取消費 | 不收取（指派前取消不收費） | 附件 3.3 提供「指派前不收費」文字。PRD `phase1_prd_detailed_v1.md:482` 僅規範若已進入收費時窗需提示後果，未定義時窗與指派邊界，此附件規則映射狀態保留為 pending。註：`P5_S06` 提及司機抵達後取消可能收取 NT$80 為舊版靜態範例，非定案之跨全域固定政策。 |`

修改後：`| 3. 取消費 | 不收取（含派車後取消） | **已決定（2026-10-10 使用者）**：取消一律不收費，含派車後，覆蓋附件 3.3 的派車前限定與先前 pending。`P5_S06`（P5-06）舊 NT$80 取消收費範例已移除，共用 `P5Actions` 亦不再顯示時窗。行程開始（on_trip）後的取消限制沿用既有規則。 |`

31. `docs/05-ui/drts-design-canvas/passenger-e-screen-contract-20260924.md`（1 處）

修改前：`## E-19 費用與優惠說明及下單確認`

修改後：`## E-19 費用與優惠說明及下單確認 ⏎  ⏎ 2026-10-15 對齊 2026-10-10 使用者決定：取消一律不收費（含派車後）；E-19b 摘要為「預約費、取消費、等待費：不另收」，其餘費用文字不變。`

32. `docs/05-ui/drts-design-canvas/p5-ui.jsx`（1 處）

修改前：`(App Domain Pending)`

修改後：`ride.smarttransport.tw`

33. `docs/05-ui/drts-design-canvas/p5-e-screens.jsx`（2 處）

修改前：`(App Domain Pending)`

修改後：`ride.smarttransport.tw`

34. `docs/05-ui/drts-design-canvas/p5-screens.jsx`（1 處）

修改前：`ride.zhixing.tw`

修改後：`ride.smarttransport.tw`

35. `docs/05-ui/drts-design-canvas/passenger-e-screen-contract-20260924.md`（2 處）

修改前：`(App Domain Pending)`

修改後：`ride.smarttransport.tw`

36. `docs/05-ui/drts-design-canvas/passenger-e-screen-contract-20260924.md`（1 處）

修改前：`**網域約定**：使用 `ride.smarttransport.tw` 作為佔位符（passenger-web 實體已退休，需待未來決策方可決定正式上線之 host）。`

修改後：`**網域約定**：依 2026-10-09 使用者決定，第一方乘客 App 使用 `ride.smarttransport.tw`；舊 passenger-web 維持退役。`

此外，account contract 50 個舊 A／B 畫板的 `Design Complete` 全部改為 `已取代（2026-10-15）`，新增含全部舊 ID 的新畫面對照，原 API／task 欄保留為歷史資訊；README 列出 28 個新 ID 的精確狀態、API、task 及示意值。

## 指定 grep

```bash
git grep -n "指派前取消\|取消費（指派前）\|每 80 秒\|+20%\|1130042\|0800-090-000" -- docs/05-ui/drts-design-canvas ':!docs/05-ui/drts-design-canvas/archive/**'
```

輸出：

```text
stdout: (empty)
stderr: (empty)
exit: 1 (git grep found no matches; expected)
```

基線同一命令加上完整 base SHA 於 `--` 前，exit 0；本機輸出保存在 `.local/pax-design-v2-20261015/baseline-grep.log`。規則文件的歷史矛盾盤點與本 UAT 刻意保留舊字串供追溯，不屬上方 grep 範圍。

## Babel JSX 解析

重用 repo 已安裝的 pnpm transitive dependency `@babel/parser` 7.29.2，沒有新增依賴。沒有執行 JSX 或載入外部 script。
在 repo root 執行下列 Node.js（本機保存為 `.local/pax-design-v2-20261015/check-jsx.cjs`）：

```javascript
const fs = require("node:fs");
const path = require("node:path");
const dir = fs
  .readdirSync("node_modules/.pnpm")
  .find((n) => n.startsWith("@babel+parser@"));
if (!dir) throw new Error("Existing Babel parser dependency not installed");
const root = path.resolve(
  "node_modules/.pnpm",
  dir,
  "node_modules/@babel/parser",
);
const parser = require(root);
console.log("Babel parser", require(root + "/package.json").version);
for (const name of [
  "p5-e-screens.jsx",
  "p5-screens.jsx",
  "p5-ui.jsx",
  "platform-p5.jsx",
  "platform-mtx-commerce.jsx",
]) {
  parser.parse(
    fs.readFileSync("docs/05-ui/drts-design-canvas/" + name, "utf8"),
    { sourceType: "script", plugins: ["jsx"] },
  );
  console.log("PASS", name);
}
const html = fs.readFileSync(
  "docs/05-ui/drts-design-canvas/智行叫車 Passenger.html",
  "utf8",
);
let count = 0;
for (const m of html.matchAll(
  /<script\b[^>]*type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g,
)) {
  if (m[1].trim()) {
    parser.parse(m[1], { sourceType: "script", plugins: ["jsx"] });
    count++;
  }
}
if (count !== 1) throw new Error("Expected one inline JSX block");
console.log("PASS Passenger.html inline JSX blocks:", count);
```

命令：`node .local/pax-design-v2-20261015/check-jsx.cjs`。Node v22.23.2；exit 0。輸出：

```text
Babel parser 7.29.2
PASS p5-e-screens.jsx
PASS p5-screens.jsx
PASS p5-ui.jsx
PASS platform-p5.jsx
PASS platform-mtx-commerce.jsx
PASS Passenger.html inline JSX blocks: 1
```

## 其餘檢查與限制

- `node tools/ci/check-repo-classification.mjs`：exit 0（6670 tracked files，新增 UAT 前）；closeout 後再核對最終版本。
- `python3 tools/ci/git/check_staged_generated_files.py --staged`：兩個 anchor 前皆 exit 0。
- `python3 tools/ci/git/check_commit_trailers.py --base df77ae3586694b9ad753eecf2b3ceab3fbfacb90 --head HEAD`：exit 0（2 個 anchor）；closeout 後再核對最終版本。
- `git diff --check`：exit 0，無輸出。
- commit 使用 `HUSKY=0` 避免 lint-staged 的 `prettier --write` 重排 immutable `canvas.json`；手動執行 generated-file guard、trailer gate，新 README／UAT 個別用 Prettier 格式化。既有 canvas JSX／HTML／contract 保留原本格式，僅替換指定文字／增補映射，不把格式變更混入政策差異。
- `apps/`、`packages/`、`archive/` 沒有修改；不增補 palette 或改畫面外觀。
- 未啟動開發服務、preview、瀏覽器／E2E 或 Docker；沒有外部 OAuth／簡訊／金流呼叫。這些不是本次文件變更的靜態驗收，不宣稱通過。
- `.dc.html` 的實際視覺／互動需 Claude Design 執行環境；repo 缺 `support.js` 為原來源交付形式，非新增可執行入口。
- 正式條款／隱私頁、7 天上限、客訴 500 字、案件格式、標誌素材、重扣 API 等示意或缺口，在 README 明確區分；沒有虛構新文號、電話或政策網址。
