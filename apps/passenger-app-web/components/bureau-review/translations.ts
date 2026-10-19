/** zh-TW copy for the bureau-review reference page follows the Passenger app's existing translation resources. */
export const t = {
  title: "新北市交通局審查入口",
  statusIntroPrefix:
    "本頁本身唯讀，不提供建立訂單、取消、派遣或司機端操作；下方連結導向的",
  statusIntroAnd: " 與 ",
  statusIntroSuffix: "才是乘客可實際操作的既有入口，沿乘客本人身分登入與操作。",
  accessHeading: "存取方式與範圍",
  accessAvailableIntro:
    "本服務目前可直接用一般瀏覽器開啟，不需要任何 Google 帳號登入、技術權杖或憑證檔案：",
  loginLinkDesc:
    "— 乘客本人登入（手機號碼或既有帳號，依既有驗證方式），非交通局專屬帳號。",
  reviewLinkDesc: "— 既有共享演練操作頁（需負責單位先行啟用）。",
  noPublicUrlPrefix:
    "本環境尚未開放對外的公開網址，一般瀏覽器暫時無法經由本服務的公開網址到達",
  noPublicUrlMid: "。負責單位需先完成網域、DNS 與憑證設定（詳見",
  noPublicUrlSuffix:
    "），本頁才會顯示實際可開啟的網址；在那之前，不應把本頁本身當作已解除 403 的證據。",
  driverScopeNote:
    "司機端的上線演練與調度派遣控制畫面不在這個對外入口的範圍內：即使以上網址已經公開，一般使用者與交通局承辦同仁都無法透過這個入口看到或操作司機端功能，只能使用乘客本人既有的登入、預約與行程頁面。",
  fullConfigPrefix: "完整的部署設定、權限細節與操作指令留在",
  fullConfigSuffix: "，本頁只呈現一般使用者需要知道的存取方式與範圍。",
  sharedRunHeading: "最近已核對的共享實測",
  sharedRunSourceLabel: "實測來源版本：",
  sharedRunCheckedAtLabel: "核對時間（UTC）：",
  sharedRunBatchLabel: "驗證批次：",
  sharedRunScope:
    "以下是已完成的核心與加驗流程紀錄。來源版本指這批實測使用的程式，不代表本頁目前執行的版本，也不代表整個驗證批次完成。",
  sharedRunSummary: (
    orders: number,
    coreStages: number,
    additionalStages: number,
    tests: number,
    retries: number,
  ) =>
    `${orders} 張演練新訂單，${coreStages} + ${additionalStages} = ${coreStages + additionalStages} 個階段；${tests} 個測試通過、無失敗或跳過、測試重試 ${retries} 次。這不是全部 16 案通過，也不能與下方歷史步驟合併計算。`,
  sharedRunGroupHeader: "核對項目",
  sharedRunResultHeader: "本次結果",
  sharedRunLimitsHeader: "仍未涵蓋",
  sharedRunChecks: [
    {
      label: "首次登入與條款",
      result:
        "從一般登入頁走手機驗證碼流程並成功登入；首次條款視窗確實出現，同一帳戶保存並讀回條款與隱私版本。簡訊收件來源明示模擬。",
      limits:
        "未勾選、拒絕、錯碼、過期、重寄，以及登出、到期登入狀態仍需各自補驗。正向結果有實際頁面操作與帳戶讀回，但沒有條款視窗原圖。",
    },
    {
      label: "費用、付款與取消",
      result:
        "A、B、E 三單各為演練 TWD85；B 沿同一付款紀錄從首次失敗變為第二次成功。C、D、F、G、H 五張原單取消後均無行程扣款、付款或評價紀錄；抵達後放棄確認不送出取消，確認後三端一致，原車司可供下一單使用。",
      limits:
        "上車後／待補憑證時的取消拒絕仍需原頁面與同單資料補驗；模擬付款不等於真卡清算或退款完成。",
    },
    {
      label: "媒合與接單期限",
      result:
        "90 秒是尚未指派的媒合工作逾時門檻，60 秒是已指派任務的接單期限；依工作與指派狀態適用，不能簡化為即時／預約的二分。本乘客入口仍只提供預約。",
      limits:
        "這兩組流程未完成真實 90 秒媒合逾時驗證；報價到期、接單逾時與拒派恢復的其他專用結果不併入此處的 108 階段。",
    },
    {
      label: "司機、地址與連線恢復",
      result:
        "改派維持原訂單並更新車牌。F 本次使用 Google 地址搜尋與反查，定位拒絕不發反查，超區不建單，恢復合法地址後正常預約及取消。H 暫停模擬定位，原頁顯示延遲並在恢復後更新；G 原司機婉拒後沿同單改派。",
      limits:
        "必要司機資料缺漏、圖資故障／逾時／零候選、送出中斷線或回應遺失、重複請求與跨裝置仍未補齊；G 的新司機行程畫面未收錄。模擬定位不等於實體道路定位。",
    },
    {
      label: "文件、評價、申訴與特殊服務",
      result:
        "A、B 保留同單四份 HTML，其中兩份為完整合成乘車證明，均明標非正式。A 失物案完成內部備註、指派、解決、關閉及五次稽核回執；低分同意聯絡時建案，E 不同意聯絡時無案，改分被拒後原分數不變。歷史重整保留原三單。",
      limits:
        "文件未就緒／失敗後重取、正式開立與業者資料、車資／服務申訴、真人聯繫及物品返還仍待驗。福利／無障礙的產品、資格、供給及適用旅程仍保留，不能用一般預約或合成文件代替。",
    },
    {
      label: "取消、完程與手機提示",
      result:
        "原圖可見 A 完程追蹤已結束；C 取消與 G 婉拒的主狀態正確，演練區顯示目前沒有活動任務。建單前的聯絡手機提示只出現一次，明示登入驗證與聯絡驗證各自獨立，並提供帳號管理連結。",
      limits:
        "C、G 的追蹤卡不在原圖範圍，不能據此宣稱已看見該卡；A 原圖也未顯示完整訂單編號。終態與提示的窄範圍結果不等於全部行程分支完成。",
    },
  ],
  sharedRunCancellationPolicy:
    "現行政策：允許取消時不收取消費，並核對沒有錯扣或額外付款。退款只在有實際已扣款時另行核對；未扣款的取消不需要假造退款。下方歷史原文的「取消費／退款」待驗敘述，不是新增取消費的規則。",
  sharedRunSimulationLimits:
    "車司資格、司機定位、支付與通知的外部來源仍明示模擬；內部訂單、身份、費用、派遣、付款與案件走原流程。本次結果不證明真人運輸、電話接通或正式營運憑證。",
  verifiedCasesHeading: "歷史已驗證案例摘要（48d94）",
  historicalScopeNote:
    "下方 48d94 快照原文完整保留；其中「本版」「已驗」及「尚未覆蓋」均指當時的演練，不直接代表現況。上方較新的實測只補充已核對部分，沒有改寫舊結果或抹除其餘缺項。",
  sourceSnapshotLabel: "來源快照：",
  sourceSnapshotSeparator: "），檢查時間",
  stageGroupHeader: "階段群組",
  stepCountHeader: "步驟數",
  resultHeader: "結果",
  totalLabel: "合計",
  caseListHeading: "歷史案例清單（UC01–UC16，原文封存）",
  caseListIntro:
    "每一案例可展開查看前提、步驟、預期結果、實際驗證內容與尚未覆蓋的部分；狀態文字逐案各自撰寫，不套用單一通過／不通過標籤，避免掩蓋個別案例的實際缺口。",
  scenarioLabel: "情境：",
  preconditionLabel: "前提：",
  stepsLabel: "步驟：",
  expectedLabel: "預期結果：",
  verifiedLabel: "實際驗證：",
  missingLabel: "尚未覆蓋：",
  archiveHeading: "歷史完整原圖與離線封存（48d94）",
  archivePrefix:
    "本頁上方已逐案列出詳細步驟與驗證內容；若需要原始畫面截圖，另有雜湊驗證之離線示範包（",
  archiveMid: "個檔案，SHA-256",
  archiveSuffix:
    "）作為補充，可向負責單位索取；本頁的案例清單本身已是可直接閱讀的完整紀錄，不是離線包的替代摘要。",
} as const;
