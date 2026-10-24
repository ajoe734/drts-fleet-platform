# PAX-DESIGN-V2-20261015 驗證紀錄

初版 Owner：Codex，初版 Reviewer：Codex2（2026-10-15 UTC）。`v2-20261024` 補稿整併 Owner：Gemini2，Reviewer：Codex（2026-10-24 UTC）。只改文件。

## 依據、版本與交接

- 依據：本 task spec、canonical root 的 `.local/passenger-app-20261009/common.md`（含 2026-10-10 補充）、`claude-design-20261015/design-spec-20261010.md`、`claude-design-20261015/CHANGELOG.md`（`v2-20261024`，線上畫布版本 35）、唯讀來源核對紀錄 `.local/goal-continuation-20261015T-current-frontier/Root-PAX-Design-v2-AU04-20261024-delivered-source-qualified.json`（SHA256 `41433373c7115058b40c34e133d0b14dca4194a43d30dcfa604daad5c5a2d95c`）、SA／SD §3、既有 P5 canvas 與 `packages/ui-tokens/src/realms.ts` passenger 品牌。
- 基線：`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`。初版匯入 anchor：`04f539b8c`；初版內容修訂 anchor：`d91754c635a72af88e4fb8209cacf2569d02e5aa`；首輪交審候選：`8e20b183098674e75fe4ad2924f3b92dc88718c3`（Codex2 於 2026-10-15T11:31:19Z 因 `SRC-AU04` 退修）；退修定位 anchor：`2ebdcae50aa7c64f6a21ce0f2ef2a6f72aadd53e`。
- 候選分支：`codex/pax-design-v2-20261015`（[PR #2657](https://github.com/ajoe734/drts-fleet-platform/pull/2657)）。最終完整 `CANDIDATE_SHA` 取本文件所在候選的 `git rev-parse HEAD`，並由 status CLI handoff 與同一 PR head 鎖定；不把 anchor SHA 當 candidate，也不在文件自填無法自參照的 commit hash。
- 2026-10-24 原互動設計來源交付 `v2-20261024`（補齊 `AU-04.dc.html` 空白、傳送中、傳送太頻繁三框並同步更新 `canvas.json` 寬度 `892 → 2158`；舊版兩檔備份於 `versions/v1-20261015/project/`，其餘 27 檔未變）。本輪原樣匯入更新後 29 檔、更新 README 與本 UAT 紀錄並重跑靜態與政策檢查，詳見文末「SRC-AU04 來源補稿匯入與複驗（2026-10-24，Owner Gemini2）」。沒有宣稱已 merge 或自動完成 acceptance。

## Finding／驗收對照

| Finding／驗收項                         | 原始碼依據與修改位置                                                                                                                                     | 舊版重現 → 修正版結果                                                                                                                                                                            | 命令、退出碼、版本與證據位置                                                              | 未驗項與具體限制                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| pax-design-v2_artboards_imported        | 來源 `project/`（`v2-20261024`）；新目錄 `canvas.json`、28 個 `.dc.html`、README；舊 account contract 與 Passenger HTML 的 A／B 區段                     | 基線無 v2 存檔；`8e20b1830` 缺 AU-04 三狀態 → `v2-20261024` 29 個檔 byte-identical，28 ID／狀態（含 AU-04 五狀態）逐字一致，50 個舊 ID 全數標為取代並有映射；HTML 標籤配對通過                   | 下方匯入／HTML／README／AU-04 核對：exit 0，完整 sha256 及輸出可重跑                      | 同 candidate 新 CI、獨立 reviewer、merge／acceptance 由 lifecycle 收錄；畫面實際顯示需 Claude 環境 |
| pax-design-v2_policy_text_aligned       | 使用者 2026-10-10 決定；E_FEES、P5_E19b、P5_S01／S06／S12／A03、P5Actions／Notice、PA_P5Fare、platform-mtx-commerce、兩份 contract、02_content_and_rules | 基線 grep 命中 13 行 → 指定 grep 空；取消含派車後不收費、60 秒 NT$5、夜間每趟 NT$20、客服 02-2944-0985                                                                                           | grep 預期 exit 1（無匹配）；Babel 7.29.2 exit 0；下方逐字前後對照                         | 同 candidate 新 CI、獨立 reviewer、merge／acceptance 由 lifecycle 收錄；本機 pass 不代替這些 gate  |
| SRC-AU04：Email OTP 要求同 AU-02 狀態   | 規格 `design-spec-20261010.md:82,84` AU-04「同 AU-02」；`CHANGELOG.md`（`v2-20261024`）；`AU-04.dc.html` 與 `canvas.json`                                | 舊版 `8e20b1830`（`AU-04.dc.html` `c30a99ca...`）僅有 `['已填寫', '格式錯誤']`，probe exit 1 → 新版 `b283d66f...` 具 `['空白', '已填寫', '格式錯誤', '傳送中', '傳送太頻繁']` 五框，probe exit 0 | 下方匯入核對與文末 2026-10-24 AU-04 狀態 probe：exit 0；原 `a`／`b` 畫框與 AU-03 逐字保留 | 線上畫布 v35 為來源交付紀錄，本輪未登入遠端或啟動視覺 runtime；待新 candidate CI 與獨立 review     |
| CONTRACT-PM04／GEO：設計與既有 API 落差 | SA／SD §3 未定義乘客重扣 command；舊 account contract 的 geo BFF 未決註記                                                                                | 新 README 對 PM-04 重扣、BK-02／03 存取邊界明列待補契約；不捏造 endpoint                                                                                                                         | 人工文件對照；API 對照表標註同一限制                                                      | 非本 task 產品實作範圍；更新卡片不等於已有重扣 API                                                 |

## 匯入 hash、標籤與對照表核對

來源絕對路徑：`/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/claude-design-20261015/project/`（`v2-20261024`；舊版 `v1-20261015` 變更前原檔保留於同層 `versions/v1-20261015/project/`）。
來源與目的檔直接以 bytes 比較，下列 SHA256 MATCH 每行的 hash 同時適用來源與目的檔。
未重新序列化 `canvas.json`，未格式化 `.dc.html`，沒有複製產生器或新增 runtime。

| 來源變更檔案    | `v1-20261015` SHA256（候選 `8e20b1830`）                           | `v2-20261024` SHA256（本候選）                                     | 變更說明                                                                                 |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `AU-04.dc.html` | `c30a99cafab3ced8f5844337f3de4d8f50e4d0944abf0404748d4cc6a2647b38` | `b283d66f3c77e455e9afd78de88d824d1751f490a8f45a6e3226e7961e6426b7` | 新增空白（`e0`）、傳送中（`e3`）、傳送太頻繁（`e4`）三框；原 `a`、`b` 兩框原始碼逐字未改 |
| `canvas.json`   | `593618160b2f0ecf6c1e12234e30068d27c4c44c0a31d49e0cec8bdb71a2aa58` | `4b5b30c0151170e7edd01c5f12b4c64e84dbe398e325062a051be8679c66058a` | `boards["AU-04.dc.html"].w` 由 `892` 改為 `2158`，其餘欄位不變                           |

在 task worktree 執行以下 Python：

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
print('PASS: 29 byte-identical imports (v2-20261024), 28 balanced HTML files, 28 exact README rows, 50 legacy mappings.')
```

Python 3.12.3；exit 0。完整輸出：

```text
SHA256 MATCH 4b5b30c0151170e7edd01c5f12b4c64e84dbe398e325062a051be8679c66058a canvas.json
SHA256 MATCH f3aa0c686df06aa33e80bd2806c2de399b6a2f43b28e6ac19c7dd482bfd9a96e Main.dc.html
TAGS + README PASS AU-01 3 state labels
SHA256 MATCH 7528ebde95737a81e2b2ed2d37091abd538e3c03c822999cd90814558b0255ae AU-02.dc.html
TAGS + README PASS AU-02 4 state labels
SHA256 MATCH 0cc8f09ebcb7cf14a7c9ead357bb5f3ad3e8dbf4c10e65fe16d227c33e870131 AU-03.dc.html
TAGS + README PASS AU-03 6 state labels
SHA256 MATCH b283d66f3c77e455e9afd78de88d824d1751f490a8f45a6e3226e7961e6426b7 AU-04.dc.html
TAGS + README PASS AU-04 5 state labels
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
PASS: 29 byte-identical imports (v2-20261024), 28 balanced HTML files, 28 exact README rows, 50 legacy mappings.
```

規格對照另確認：AU-04 已補齊空白、傳送中、傳送太頻繁並保留已填寫、格式錯誤共 5 個狀態；PM-01 將過期／失效合併一框；TR-01 在單一清單內含進行中、完成可評價、付款失敗、已取消；AC-03 額外呈現驗證碼輸入、AU-05 額外呈現等待過久。

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

## SRC-AU04 首輪退修回應（2026-10-15，Owner Codex）

Codex2 於 2026-10-15T11:31:19Z 退修候選 `8e20b183098674e75fe4ad2924f3b92dc88718c3`，generation `80009a7775814e5a8e92e680e0b85534`。這是首次獨立退修；本節是定位與來源補稿協調紀錄，不是修正版交審，也不消除 SRC-AU04。

本次 `git fetch origin` 後，本機 HEAD、遠端 `origin/codex/pax-design-v2-20261015` 與 [PR #2657](https://github.com/ajoe734/drts-fleet-platform/pull/2657) head 均為上述 SHA；修改前工作樹乾淨。未因 dev 前進而 merge／rebase。後續本節的 anchor 只保存退修證據，不能沿用舊候選的 CI／review 結論。

### 定位與最小重現

- 規格：原來源 `design-spec-20261010.md:82,84`，AU-04「同 AU-02」要求空白、格式錯誤、傳送中、傳送太頻繁（稍後再試）。規格 SHA256：`dcd81a8b71b589f8cfc071fd9d697996019fb9f90f8226b7cac656c67cca64a2`。
- 實際路徑：唯讀 `generator/au04.py` 的 `board(...)` 只傳入 `已填寫`／`格式錯誤` 兩框；原來源 `project/AU-04.dc.html:25` → 原樣匯入 `docs/05-ui/passenger-app-design-20261015/AU-04.dc.html:25` → README AU-04 列。原稿頂端「沿用 AU-02 的樣式」說明沒有建立缺少的三個狀態畫框。
- 原稿與匯入檔 SHA256 都仍為 `c30a99cafab3ced8f5844337f3de4d8f50e4d0944abf0404748d4cc6a2647b38`，未收到可用的補稿版本或明確變更驗收邊界的決定。

在 task worktree 執行下列最小靜態 probe（Python 3.12.3）；`exit 1` 是缺陷重現，不是通過：

```bash
python3 - <<'PY'
from pathlib import Path
import re
source = Path('/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/claude-design-20261015/project/AU-04.dc.html')
imported = Path('docs/05-ui/passenger-app-design-20261015/AU-04.dc.html')
assert source.read_bytes() == imported.read_bytes()
states = re.findall(r'>｜([^<]+)<', imported.read_text())
missing = [s for s in ('空白', '格式錯誤', '傳送中', '傳送太頻繁') if not any(v.startswith(s) for v in states)]
print('ACTUAL', states)
print('MISSING', missing)
raise SystemExit(1 if missing else 0)
PY
```

```text
ACTUAL ['已填寫', '格式錯誤']
MISSING ['空白', '傳送中', '傳送太頻繁']
```

另已執行從規格 AU-02 列動態讀取必要狀態的 probe，結果相同，exit 1；本機腳本與輸出在 `.local/pax-design-v2-20261015/probe-au04.py`、`owner-recheck-au04.txt`。此檢查只驗證正式設計狀態標籤，沒有新增鏡像單元測試，也未執行 UI runtime。

### 既有項目回歸與修正邊界

| Finding／驗收項                            | 本次核對與結果                                                                                                                                                                                                                                                                                 | 未滿足項／下一步                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SRC-AU04／pax-design-v2_artboards_imported | 在退修 SHA 重跑本文件既有 `check-import.py`：exit 0；29 檔逐檔 bytes／SHA256 仍全數 MATCH、28 HTML 標籤配對、28 README 原標籤逐字對照、50 舊 ID 映射通過。完整輸出保存 `.local/pax-design-v2-20261015/owner-recheck-import.txt`，逐檔 hash 與上表相同。獨立狀態 probe exit 1。                 | **未通過**完整設計狀態符合性。不可用匯入成功或 README 揭露代替此驗收。                    |
| pax-design-v2_policy_text_aligned          | 重跑本文件指定 `git grep`（排除 archive）：無輸出，exit 1（預期）；本輪未修改任何畫板或政策文字，保留前輪 Babel 與 reviewer 的政策核對證據。                                                                                                                                                   | 未重新執行 Babel（僅本 Markdown 有變更）；新 SHA 仍需新 CI／獨立 review，不挪用前輪綠燈。 |
| 前輪 candidate CI                          | `gh pr view 2657 --json headRefOid,state,statusCheckRollup`：舊 SHA 的 28 success、2 條件 skipped、0 pending；[CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38723272678)、[integration](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38723272735) 均已結束。 | 只屬於退修 SHA；CI 未覆蓋 AU-04 狀態缺口，不能據此通過 acceptance。                       |

交 Supervisor（Claude）協調原互動設計來源：補交 AU-04 的空白、傳送中、傳送太頻繁三個實際畫框，保留既有合法狀態與 Email 欄位／按鈕行為；若尺寸或索引變動，須一併交付 `canvas.json`。另一條可解除路徑是使用者明確變更本 task 的狀態驗收邊界，須保留原決定與新決定的依據；owner 無權自行降低要求。

收到來源交付後，原 owner 才能記錄補稿來源／版本及新舊逐檔 hash、原樣重新匯入、同步 README 真實狀態，重跑 AU-04 狀態 probe、全部匯入／HTML／README／舊 ID 對照及指定 policy grep；如有 JSX 變更再跑 Babel。再普通 push，確認 local／remote／PR head 一致，對新 SHA 取得 CI 並 handoff Codex2。現階段僅保存此證據並用 status CLI 記錄等待 Supervisor 協調；不重送未修候選、不改 immutable 檔、不自行 done。PM-04／Geo 已揭露契約缺口維持原範圍；未啟動任何 VM 服務或 browser。

## SRC-AU04 來源補稿匯入與複驗（2026-10-24，Owner Gemini2）

- **來源交付與版本**：2026-10-24 原互動設計來源（Claude Code interactive session 操作使用者 Claude Design 畫布，線上版本 35）交付 `v2-20261024`，記錄於 `/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/claude-design-20261015/CHANGELOG.md`（SHA256 `0e30246ac04e0d2ed95b3f67f0bd58a831d0b67a75f6e507826b14b56dc22fcd`，4721 bytes）與獨立唯讀核對檔 `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Root-PAX-Design-v2-AU04-20261024-delivered-source-qualified.json`（SHA256 `41433373c7115058b40c34e133d0b14dca4194a43d30dcfa604daad5c5a2d95c`）。
- **新舊逐檔差異**：
  - `AU-04.dc.html`：`v1-20261015` `c30a99cafab3ced8f5844337f3de4d8f50e4d0944abf0404748d4cc6a2647b38`（8208 bytes）→ `v2-20261024` `b283d66f3c77e455e9afd78de88d824d1751f490a8f45a6e3226e7961e6426b7`（18611 bytes）。新增「空白」（`id="e0"`，按鈕 disabled 並顯示「請先輸入 Email」）、「傳送中」（`id="e3"`，欄位 readonly、按鈕 disabled/`aria-busy="true"` 與轉圈「傳送中…」）、「傳送太頻繁」（`id="e4"`，`role="alert"` 顯示「傳送次數太多」與客服 `02-2944-0985`、按鈕 disabled 並顯示「暫時無法傳送，請稍後再試」）三個 390×844 實際畫框；既有「已填寫」（`id="a"`）與「格式錯誤」（`id="b"`）兩個 390×844 畫框原始碼逐字保留；畫板與 `$preview` 寬度由 `892` 更新為 `2158`（`5*390 + 4*32 + 2*40 = 2158`）；與 `AU-03` 銜接不變。
  - `canvas.json`：`v1-20261015` `593618160b2f0ecf6c1e12234e30068d27c4c44c0a31d49e0cec8bdb71a2aa58`（5631 bytes）→ `v2-20261024` `4b5b30c0151170e7edd01c5f12b4c64e84dbe398e325062a051be8679c66058a`（5632 bytes），僅 `boards["AU-04.dc.html"].w` 由 `892` 改為 `2158`。
  - 其餘 27 個 `.dc.html` 與候選 `8e20b183098674e75fe4ad2924f3b92dc88718c3` 逐位元組完全相同；舊版變更前兩檔備份於 `.local/passenger-app-20261009/claude-design-20261015/versions/v1-20261015/project/`。

### AU-04 狀態 probe（舊版 exit 1 → 新版 exit 0）

在 task worktree 執行與首輪退修完全相同的狀態 probe（Python 3.12.3）：

```bash
python3 - <<'PY'
from pathlib import Path
import re
source = Path('/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/claude-design-20261015/project/AU-04.dc.html')
imported = Path('docs/05-ui/passenger-app-design-20261015/AU-04.dc.html')
assert source.read_bytes() == imported.read_bytes()
states = re.findall(r'>｜([^<]+)<', imported.read_text())
missing = [s for s in ('空白', '格式錯誤', '傳送中', '傳送太頻繁') if not any(v.startswith(s) for v in states)]
print('ACTUAL', states)
print('MISSING', missing)
raise SystemExit(1 if missing else 0)
PY
```

輸出（exit 0）：

```text
ACTUAL ['空白', '已填寫', '格式錯誤', '傳送中', '傳送太頻繁']
MISSING []
```

### 本輪完整靜態與政策回歸結果

- **29 檔匯入與 HTML／README／舊 ID 對照**：執行上方匯入核對腳本，Python 3.12.3 exit 0（29 檔 `SHA256 MATCH`、28 個 `.dc.html` 標籤成對、README 28 列狀態與 `AU-04` 5 個狀態標籤完全一致、50 個舊 A／B ID 映射與取代標記全數保留）。
- **指定政策 grep**：`git grep -n "指派前取消\|取消費（指派前）\|每 80 秒\|+20%\|1130042\|0800-090-000" -- docs/05-ui/drts-design-canvas ':!docs/05-ui/drts-design-canvas/archive/**'` 無輸出，exit 1（預期無匹配）。
- **Babel 7.29.2 JSX 解析**：重跑上方 Node.js（v22.23.2）腳本解析 5 個 `.jsx` 與 `智行叫車 Passenger.html` 內嵌 JSX block，exit 0。
- **Repo 治理檢查**：`node tools/ci/check-repo-classification.mjs`（exit 0，6671 files）、`python3 tools/ci/git/check_staged_generated_files.py --staged`（exit 0）、`python3 tools/ci/git/check_commit_trailers.py --base df77ae3586694b9ad753eecf2b3ceab3fbfacb90 --head HEAD`（exit 0）、`git diff --check`（exit 0）。
- **未驗項與限制**：未登入遠端 Claude Design 畫布、未在 VM 啟動任何開發伺服器／預覽／瀏覽器或外部服務；新 candidate SHA 的 hosted CI 與獨立 reviewer（Codex）審查待 push 與 handoff 後由 candidate lifecycle 收錄。
