// Snapshot of the already-validated, hash-verified shared rehearsal run.
// This is read-only reference data for the PAX-BUREAU-BROWSER-ENTRY-20261018
// page; it is not fetched live and does not call any API. Refreshing it to a
// newer accepted run, or to a corrected case readback, is a separate,
// reviewed content update — see
// .local/passenger-bureau-handoff-20261018T143118Z/cases.json for the
// authoritative per-case source this file mirrors.

export const BUREAU_REVIEW_SOURCE = {
  release: "publish/v2026.10.18.4",
  sourceSha: "48d9488c43f16a25d9e6c356e891f2c3433552b2",
  checkedAtUtc: "2026-10-18T14:37:25Z",
  offlinePackage: {
    path: ".local/passenger-transport-bureau-review-20261015/bureau-demo-package/bureau-demo-offline-v2026.10.18.4-48d94.zip",
    sha256:
      "e5250c8d018495c7ba29b6c27e5ea62c0b41e34c8745e7652820eb93ca6c183c",
    fileEntries: 744,
  },
} as const;

export interface BureauReviewStageGroup {
  readonly label: string;
  readonly count: number;
  readonly allSingleAttemptPassed: boolean;
}

// own_readback_of_raw_stage_groups from the 2026-10-18 shared-dev verification
// pass; 163 stages total across the five groups below.
export const BUREAU_REVIEW_STAGE_GROUPS: readonly BureauReviewStageGroup[] = [
  { label: "A B C 主流程", count: 48, allSingleAttemptPassed: true },
  { label: "D E F G H 分支", count: 60, allSingleAttemptPassed: true },
  { label: "I 報價到期", count: 13, allSingleAttemptPassed: true },
  { label: "K 接單逾時", count: 21, allSingleAttemptPassed: true },
  { label: "L 拒派後恢復", count: 21, allSingleAttemptPassed: true },
];

export const BUREAU_REVIEW_TOTAL_STAGES = BUREAU_REVIEW_STAGE_GROUPS.reduce(
  (sum, group) => sum + group.count,
  0,
);

export interface BureauReviewCase {
  readonly id: string;
  readonly title: string;
  // Deliberately a free-text status, not an enum: UC01's "normal trip
  // verified, first-activation still pending" and UC16's "not offered by
  // this product entry" each need their own exact wording, not a shared
  // passed/partial/outside_scope label that would misrepresent either one
  // (entry-R2-case-fidelity-finding.md).
  readonly status: string;
  readonly scenarios: string;
  readonly preconditions: string;
  readonly steps: readonly string[];
  readonly expected: string;
  readonly verified: string;
  readonly missing: string;
}

// Mirrors .local/passenger-bureau-handoff-20261018T143118Z/cases.json
// verbatim (16 cases); that file is the authoritative corrected source after
// entry-R2-case-fidelity-finding.md. Do not re-summarize or re-label these
// into coarser categories here.
export const BUREAU_REVIEW_CASES: readonly BureauReviewCase[] = [
  {
    id: "UC01",
    title: "首次使用與正常預約搭乘",
    status: "正常旅程已驗 首次開通待補",
    scenarios: "A",
    preconditions:
      "主持人已取得私人環境存取；準備合成乘客、付款方式與車司。新戶流程另用從未同意條款的帳戶驗證。",
    steps: [
      "從一般登入頁輸入合成手機，取得演練收件碼，走原 OTP 登入。",
      "新戶應閱讀並同意條款與隱私；回訪者讀取既有同意。本版實跑使用已同意的回訪帳戶。",
      "選新北示範上、下車地點及有效未來時間，試算車資，閱讀並勾選本次費用確認後預約。",
      "調度用乘客原訂單建立派遣，司機接受並前往；乘客核對車牌與司機。",
      "司機抵達後實際等到預約時間，再開始、完成行程。",
      "乘客確認付款結果，查看歷史與演練乘車文件，送出五星。",
    ],
    expected:
      "同一訂單依序走到完程、付款與評價；預約時間之前不能藉演練跳過時間條件。",
    verified:
      "A 真後端同單完成，0.23 公里、108 秒、演練 TWD85、付款一次成功、五星；OTP 驗證回201。",
    missing:
      "本版未出現首次條款視窗，不能將回訪登入當作首次開通已驗。新戶拒絕條款、錯碼、過期、重寄、登出與 session 到期需補測。",
  },
  {
    id: "UC02",
    title: "回訪登入付款方式與歷史恢復",
    status: "部分已驗",
    scenarios: "A B C",
    preconditions: "使用已有條款同意、乘車紀錄與演練付款方式的回訪帳戶。",
    steps: [
      "重新登入一般乘客入口。",
      "檢查既有付款方式及預設選項。",
      "前往歷史列表，開啟已完成與已取消的原訂單。",
      "重整頁面，核對訂單、付款、評價與取消狀態仍一致。",
      "補測更換預設卡、登出再登入及另一裝置回訪。",
    ],
    expected: "回訪與重整保留真後端資料；每一歷史項目開啟正確原單。",
    verified:
      "本版 A B C 三個不同訂單在重整後的歷史均可查，C 保持取消；帳戶讀回既有同意。",
    missing: "預設卡切換、刪卡與在途付款關係、跨裝置回訪、到期 session 恢復未完整展示。",
  },
  {
    id: "UC03",
    title: "費用告知與未勾選確認",
    status: "演練已驗",
    scenarios: "D 及 A B",
    preconditions: "有效地點、未來預約時間及報價；從未勾選當次費用確認的狀態開始。",
    steps: [
      "試算車資，閱讀費用範圍與當次說明。",
      "保留費用確認未勾選，觀察確認鍵停用。",
      "勾選確認後送出預約。",
      "若修改地點或重新報價，重新檢查當次確認狀態。",
    ],
    expected: "未確認當次費用時不能建單；新的報價不能沿用舊確認。",
    verified: "D 已驗未勾選不能下單、勾選後真建單；I 重新報價後舊確認清除。",
    missing:
      "演練費用確認已驗；正式營運的條款及費用文案採認仍需另處理，不將演練文字當正式定稿。",
  },
  {
    id: "UC04",
    title: "預約時間錯誤與報價過期",
    status: "演練已驗",
    scenarios: "D I",
    preconditions: "演練預約最少提前1分鐘；報價效期維持原15分鐘。",
    steps: [
      "在原表單輸入過去時間，確認拒絕而且不發出報價。",
      "輸入未來但不足最少提前時間的時段，確認拒絕。",
      "改為有效時間取得報價，暫不送出；真實等待原15分鐘到期。",
      "檢查原表單保留地點與時間，但舊報價失效，使用舊報價的建單請求被拒絕。",
      "重新試算、重新勾選費用確認，建立唯一新單。",
      "取消新單並由乘客與調度查回同一訂單。",
    ],
    expected: "拒絕無效時間及過期報價；原草稿可恢復；過期報價不產生訂單，新報價只建一單。",
    verified:
      "I 真實等待902244毫秒，舊報價回400 FARE_QUOTE_EXPIRED且關聯訂單為0，新報價只建立一筆；未改時鐘。",
    missing: "跨午夜、日期切換及不同裝置時區未由本輪完整覆蓋。1分鐘為演練設定，不能當正式營運規則。",
  },
  {
    id: "UC05",
    title: "各階段取消與取消確認",
    status: "取消狀態已驗 費用邊界待補",
    scenarios: "F C D H",
    preconditions: "各階段各用獨立新單，不在已取消的舊單上假造下一階段。",
    steps: [
      "F 建單但尚未派遣時取消，查回原單。",
      "C 指派後、司機接受前取消，確認司機不能再接受。",
      "D 司機接受後由乘客取消，三端核對原單。",
      "H 司機抵達後先關閉取消確認，再開啟並確認取消。",
      "查回取消歷史、付款與評價是否產生，確認原車司可供下一筆訂單使用。",
    ],
    expected: "放棄確認不取消；確認後三端為同一取消結果、舊任務不能繼續，原單歷史保留。",
    verified:
      "F 未派遣、C 接受前、D 接受後、H 抵達後均實跑；H 放棄再確認及車司釋放後供 E 使用已驗。",
    missing:
      "完整取消費、退款、各時間邊界及上車後的取消限制未完整驗證；司機黃色模擬區仍可能顯示等待接單。",
  },
  {
    id: "UC06",
    title: "無車拒接接單逾時與拒派恢復",
    status: "部分已驗",
    scenarios: "C G K L",
    preconditions: "主持人能使用原演練準備頁控制合成供給；保持原業務期限與真後端規則。",
    steps: [
      "C 先維持無車，查空候選及待重派狀態，恢復供給後在原單繼續。",
      "G 司機先保留不送出拒接，再真正婉拒，由調度重派原單。",
      "K 顯示任務後不接受、不拒絕，實際等原60秒接單期限及背景排程處理。",
      "K 檢查原任務失效，在同一訂單建立新的派遣與任務，接受後取消。",
      "L 候選顯示後暫停供給，發出指派取得真409；恢復供給後沿原單與原派遣重新指派，接受後取消。",
    ],
    expected: "無供給、拒接、逾時與資格變更均顯示可理解的狀態；恢復沿原訂單，舊任務不能繼續。",
    verified:
      "C、G、K、L均有本版結果；K 自計時啟動到觀察逾時74613毫秒，沿用原60秒政策；L 真409為 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT。",
    missing: "即時叫車90秒媒合逾時仍未驗，不能用預約接單60秒替代；G 更換後的 B 司機畫面未收錄。",
  },
  {
    id: "UC07",
    title: "改派後重新核對司機與車牌",
    status: "演練已驗",
    scenarios: "A G",
    preconditions: "已建單並有可指派的兩組合成車司，保留原訂單編號。",
    steps: [
      "A 在一般調度頁先指派 B，再改派 A；期間讓乘客短暫離線。",
      "乘客恢復連線，檢查更新後司機、車牌與改派提示。",
      "確認舊任務已取消、新任務仍屬同一訂單。",
      "G 在原乘客頁確認新車牌 SIM-2001 完整可見。",
      "現場上車前再次核對實車與畫面資訊。",
    ],
    expected: "車牌更新清楚且完整；舊司機不得執行新任務；訂單維持唯一。",
    verified: "A 一般調度建立、指派與改派，以及五個司機狀態自動同步已驗；G 原乘客頁完整顯示 SIM-2001。",
    missing: "真人核對實車、實體證照與現場接送不在本次 Web 演練證據內。",
  },
  {
    id: "UC08",
    title: "司機資料不足與聯絡不可用",
    status: "部分已驗",
    scenarios: "D",
    preconditions: "司機已接受原單；外部電話服務缺席情境由演練配置呈現。",
    steps: [
      "在已接單頁查看車牌、司機及資格資訊。",
      "按聯絡司機，走原訂單聯絡命令。",
      "外部電話無法使用時查看明確提示、客服入口及重試選項。",
      "補測缺少司機或車輛必要欄位時的畫面與處置，避免顯示不完整指派卡。",
    ],
    expected: "聯絡不可用時明確說明並提供替代；資料不足不能顯示為已完整核實。",
    verified:
      "D 聯絡 API 回201，乘客原頁顯示無法直接聯絡及客服／重試；未把客服撥接冒作司機接通。",
    missing: "資料缺漏的實際觸發、逐欄揭露與真電話接通未驗；API201只證命令處理，不代表真人通話。",
  },
  {
    id: "UC09",
    title: "定位拒絕超區地址與圖資故障",
    status: "部分已驗",
    scenarios: "F",
    preconditions: "切換一般選址模式，清除固定演練地點，使用原地址搜尋與定位權限流程。",
    steps: [
      "拒絕瀏覽器定位，確認沒有發出反查。",
      "授權明示的模擬座標，走原反查與地址搜尋。",
      "從真供應商候選選取地點，檢查地址與座標一致。",
      "選台中超出本服務區的目的地，試算取得不服務，確認無報價快照、無建單。",
      "改回可服務地點，重新試算、返回修改、確認建單，再取消及查回。",
    ],
    expected: "定位拒絕可轉手動選址；超區不能建單；改合法地址可恢復原流程。",
    verified: "F 定位拒絕、真 Google 反查／路線、超區拒絕及恢復均已實跑。",
    missing:
      "圖資斷線／逾時／零候選、同名地址消歧、實體 GNSS與原生底圖未完整驗；固定選點不能當真實地址輸入的證據。",
  },
  {
    id: "UC10",
    title: "位置延遲離線與重連",
    status: "部分已驗",
    scenarios: "A H",
    preconditions: "乘客停留原行程頁；司機定位從明示模擬來源進入真正追蹤管線。",
    steps: [
      "A 讓乘客離線時改派，恢復連線後核對新車牌與原訂單。",
      "H 保持原乘客頁，暫停定位來源直到顯示更新延遲。",
      "恢復來源後確認讀到新的司機位置與正常新鮮度。",
      "司機抵達後確認不再顯示舊接客倒數；取消後查看三端結果。",
    ],
    expected: "過期位置有提示；恢復時以後端最新狀態為準，不能虛構未收到的軌跡或延用舊 ETA。",
    verified: "A 離線改派重連及 GPS freshness、H 原頁定位過期與恢復已驗，抵達後取消也已驗。",
    missing: "送出建單時斷線、重複點擊、長期離線、背景被系統終止及各角色同時斷線未完整演練。",
  },
  {
    id: "UC11",
    title: "扣款失敗欠款拒約與補繳",
    status: "演練已驗",
    scenarios: "B",
    preconditions: "綁定首次失敗、後續可成功的演練付款方式，走完整真後端行程。",
    steps: [
      "完成行程後檢查付款失敗提示與未付金額。",
      "有欠款時嘗試再次預約，查看拒絕。",
      "依既有重試政策等待並執行演練補繳。",
      "確認沿同一付款紀錄由第1次失敗變為第2次成功。",
      "回歷史查看同單已付結果，再進評價。",
    ],
    expected: "補繳保留原訂單與付款編號，不藉重建訂單或重送完程重複扣款。",
    verified: "B 同一 paymentId 由 failed／attempt1 變 captured／attempt2，TWD85；欠款拒約與補繳已驗。",
    missing: "本項通過限模擬 PSP；真卡授權、清算、重複回調與退款等正式金流另驗。",
  },
  {
    id: "UC12",
    title: "乘車文件下載與未就緒恢復",
    status: "部分已驗",
    scenarios: "A B",
    preconditions: "已完程的原訂單，保存後端權威快照；下載品明標演練非正式憑證。",
    steps: [
      "從原行程開啟乘車文件。",
      "核對訂單、車隊、遮碼司機資料、車牌、上下車時間、路線、里程及車資支付。",
      "下載演練 HTML 與 E04，重整後再開同一訂單。",
      "補測文件尚未就緒、暫時失敗及重取，檢查說明與重試入口。",
    ],
    expected: "文件與原訂單及付款一致，未就緒不顯示為正式開立完成；演練品始終清楚標識。",
    verified: "A B 共保存4份完整HTML，含兩份合成E04及兩份演練紀錄；同單歷史與下載已驗。",
    missing: "本版沒有獨立觸發未就緒再恢復；正式業者資料、正式開立及營運採認未完成。",
  },
  {
    id: "UC13",
    title: "高分評價與送出後不可修改",
    status: "部分已驗",
    scenarios: "A E",
    preconditions: "已完程並符合原付款／評價規則，保留第一次送出前後的同單狀態。",
    steps: [
      "A 選五星並送出，查看感謝畫面與原單。",
      "E 送出兩星後重整，檢查評價入口消失。",
      "E 再次改分請求應被拒絕，查回第一次分數與聯絡意願。",
      "補測 A 五星送出後再改分與連續重送。",
    ],
    expected: "每一單維持原評價規則，送出後不能任意覆寫第一次評價或聯絡意願。",
    verified: "A 五星成功；E 重整隱藏入口，真 BFF 改分回409且原兩星／拒絕聯絡維持。",
    missing: "A 五星再次改分未獨立請求；各星等、標籤、文字與快速重送仍需按原需求補驗。",
  },
  {
    id: "UC14",
    title: "低分評價與客服聯絡意願",
    status: "演練已驗",
    scenarios: "B E",
    preconditions: "兩筆分開的已完程訂單，分別驗同意與拒絕客服聯絡。",
    steps: [
      "B 選一星，勾選願意聯絡並送出。",
      "調度／客服查同一訂單的新案件與聯絡意願。",
      "E 選兩星，保持不願聯絡並送出。",
      "用真案件查詢確認 E 無案件，重整與改分被拒後意願仍一致。",
    ],
    expected: "同意時保留意願並建立對應案件；拒絕聯絡不憑空產生同類客服案件。",
    verified: "B 一星／contact=true 建同單案；E 兩星／contact=false 且真 Ops API無案件。",
    missing: "真人客服接案、聯繫成功與通知送達仍未驗，不能由建立案件推斷已聯絡本人。",
  },
  {
    id: "UC15",
    title: "遺失物車資與服務申訴",
    status: "部分已驗",
    scenarios: "A 及 B",
    preconditions: "由原已完成訂單發起案件；使用合成描述，清楚區分內部處理與真實服務。",
    steps: [
      "A 從原行程開啟遺失物表單並送出，核對原訂單連結。",
      "一般客服在清單找到同案，填備註、指派處理。",
      "填明示演練結果後解決及關閉。",
      "查五筆真歷程、匯出準備及五次稽核回執，開啟實際稽核頁。",
      "另補車資爭議、服務申訴及真人聯繫／物品交還案例。",
    ],
    expected: "案件、每次狀態與稽核都能追回同一訂單；系統結案不能當作真實物品已返還。",
    verified: "A 遺失物已完成一般客服內部備註／指派／解決／關閉與五次真回執；B 低分建案另證。",
    missing:
      "車資／服務類案件、真人聯繫、失物認領及實物返還未演；語音回撥、錄音與背景持久化尚有未完成內部接線。",
  },
  {
    id: "UC16",
    title: "福利優惠與輪椅無障礙服務",
    status: "本展示未提供",
    scenarios: "無",
    preconditions: "先核對原服務產品、優惠資格、車隊與可用無障礙車司，不能用一般車硬代。",
    steps: [
      "確認入口是否提供福利／優惠及輪椅／無障礙服務選擇。",
      "若納入審查，補資格、適用區域、費用與可用供給資料。",
      "以對應服務產品走選址、預約、派遣、上下車與完程。",
      "另驗無可用專車、資格不符、取消及照護者協助等分支。",
    ],
    expected: "服務選擇、資格、報價與真正車司能力一致；未支援時明確說明。",
    verified: "目前一般預約入口未提供此選項，本輪無完整驗證。",
    missing: "屬本展示未覆蓋項目，原全系統範圍保留；不能用本展示範圍外等同需求已完成或永久排除。",
  },
];
