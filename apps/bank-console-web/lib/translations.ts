export type Locale = "en" | "zh";

// Bank / issuer back-office console (S3). Routes are filled in task-by-task from
// the bank screen-requirements hand-off and shared token system; remaining routes
// can stay scaffolded until their respective surfaces land.
const en = {
  "app.title": "Bank Console",
  "app.description":
    "Issuer / card-benefit back-office console for DRTS Phase 1 (credit-card airport transfer).",

  "shell.breadcrumb.home": "Overview",
  "shell.search": "Search bookings, contracts, statements...",

  "nav.section.workspace": "Workspace",
  "nav.section.finance": "Contracts & settlement",
  "nav.section.governance": "Governance",

  "nav.home": "Overview",
  "nav.bookings": "Card bookings",
  "nav.contracts": "Contracts & SLA",
  "nav.statements": "Settlement statements",
  "nav.programs": "Programs & quota",
  "nav.users": "People & roles",
  "nav.audit": "Audit",

  "pending.badge": "Pending design",
  "pending.eyebrow": "Card-benefit back-office",
  "pending.heading": "Awaiting design canvas",
  "pending.lead":
    "This screen is part of the new bank / issuer console. Its visual design has not been delivered yet, so the route is a functional placeholder rather than an invented final screen.",
  "pending.authorityTitle": "Design authority",
  "pending.authorityBody":
    "The card-benefit data IA has no canvas to extend (the corporate tenant-console canvas is for YAMATO / cost-centre commute and must not be reused). Screens land once the visual design team delivers the canvas.",
  "pending.referenceTitle": "Behaviour & API authority",
  "pending.referenceBody":
    "Behaviour, data, and API mapping live in the screen-requirements hand-off and the System Design. This shell only wires the tenant-realm chrome, navigation, and routes.",

  "home.eyebrow": "Issuer workspace",
  "home.title": "Bank / issuer console",
  "home.lead":
    "Issuer-tenant back-office for the credit-card airport-transfer benefit: card bookings, contract & SLA posture, settlement statements, and program quota — all read from the shared tenant plane.",
  "home.purpose":
    "Home / overview will surface today's bookings, quota burn, and SLA posture once the design canvas is delivered.",

  "bookings.title": "Card bookings",
  "bookings.purpose":
    "Cardholder / program / flight / direction / dispatch-state list (card-airport dimension, not corporate cost-centre). Cardholder references stay PII-masked.",
  "bookings.eyebrow": "Issuer bookings workspace",
  "bookings.scopeLabel": "Scope",
  "bookings.scopeValue": "Issuer tenant · airport transfer only",
  "bookings.periodLabel": "Business period",
  "bookings.maskingLabel": "Masking",
  "bookings.maskingValue": "Cardholder and benefit references exported masked",
  "bookings.readonlyTitle": "Read-only fulfilment view",
  "bookings.readonlyBody":
    "This list is issuer-facing only. It filters by program, direction, dispatch state, period, and masked cardholder reference without exposing cost-centre data or dispatch mutation controls.",
  "bookings.filters.kicker": "List filters",
  "bookings.filters.title": "Card-airport filters",
  "bookings.filters.description":
    "Filter the issuer tenant view by program, direction, dispatch state, business period, and masked cardholder reference.",
  "bookings.filters.program": "Program",
  "bookings.filters.direction": "Direction",
  "bookings.filters.state": "Dispatch state",
  "bookings.filters.period": "Period",
  "bookings.filters.cardholder": "Cardholder ref",
  "bookings.filters.cardholderPlaceholder": "e.g. CH••••98",
  "bookings.filters.apply": "Apply filters",
  "bookings.filters.reset": "Clear",
  "bookings.metrics.kicker": "Posture",
  "bookings.metrics.total": "Bookings in current result set",
  "bookings.metrics.active": "Assigned or en route",
  "bookings.metrics.completed": "Completed trips",
  "bookings.table.kicker": "Bookings list",
  "bookings.table.title": "Airport-transfer fulfilment",
  "bookings.table.description":
    "Columns stay on the card-benefit dimension only: order, cardholder ref, program, direction, flight / terminal, route, booking window, state, and masked benefit reference.",
  "bookings.columns.order": "Order",
  "bookings.columns.cardholder": "Cardholder",
  "bookings.columns.program": "Program",
  "bookings.columns.direction": "Direction",
  "bookings.columns.flight": "Flight / terminal",
  "bookings.columns.route": "Pickup / dropoff",
  "bookings.columns.window": "Time window",
  "bookings.columns.state": "State",
  "bookings.columns.benefit": "Benefit",
  "bookings.direction.outbound": "Outbound",
  "bookings.direction.inbound": "Inbound",
  "bookings.state.assigned": "Assigned",
  "bookings.state.en_route": "En route",
  "bookings.state.completed": "Completed",
  "bookings.state.cancelled": "Cancelled",
  "bookings.empty": "No bookings match the current filters.",

  "contracts.title": "Contracts & SLA",
  "contracts.purpose":
    "Service-contract posture between the program and DRTS: term, SLA targets, current-period attainment, and exception list.",

  "statements.title": "Settlement statements",
  "statements.purpose":
    "Period and per-trip settlement reconciliation (issuer-pays-DRTS), with masked references and signed downloadable artifacts.",
  "statements.eyebrow": "Settlement workspace",
  "statements.direction": "Issuer pays DRTS",
  "statements.strip.periods": "Periods in result",
  "statements.strip.published": "Published periods",
  "statements.strip.total": "Issuer payable total",
  "statements.callout.title": "Settlement posture",
  "statements.callout.body":
    "This list stays at the statement-period layer: total payable, publication status, issue / due dates, and signed artifact download, while all trip-level refs remain masked in the drill-down view.",
  "statements.filters.kicker": "Statement filters",
  "statements.filters.title": "Filter by settlement state",
  "statements.filters.description":
    "Refine the issuer finance list to published, paid, or due statements before opening a period detail.",
  "statements.filters.status": "Status",
  "statements.filters.apply": "Apply filters",
  "statements.filters.reset": "Clear",
  "statements.metrics.kicker": "Settlement posture",
  "statements.metrics.periods": "Statement periods in current result",
  "statements.metrics.due": "Periods currently due",
  "statements.metrics.issuerPays": "Issuer payable in current result",
  "statements.list.kicker": "Statements",
  "statements.list.title": "Period-level reconciliation",
  "statements.list.description":
    "Each row shows statement number, period total, publication status, issue / due dates, signed artifact download, and a route into per-trip reconciliation detail.",
  "statements.columns.period": "Period",
  "statements.columns.total": "Issuer payable",
  "statements.columns.status": "Status",
  "statements.columns.issued": "Issued",
  "statements.columns.due": "Due",
  "statements.columns.artifact": "Signed artifact",
  "statements.columns.detail": "Detail",
  "statements.status.published": "Published",
  "statements.status.paid": "Paid",
  "statements.status.due": "Due",
  "statements.actions.download": "Download",
  "statements.actions.viewDetail": "View detail",
  "statements.actions.downloadSigned": "Download signed artifact",
  "statements.actions.reportDispute": "Report to DRTS",
  "statements.actions.disputed": "Disputed line",
  "statements.empty": "No statements match the current filters.",
  "statements.detail.eyebrow": "Statement detail",
  "statements.detail.title": "Statement {period}",
  "statements.detail.purpose":
    "Per-trip settlement detail with fare, subsidised-vs-paid split, masked benefit / cardholder / card refs, signed artifact access, and a dispute path for each trip line.",
  "statements.detail.back": "Back to statements",
  "statements.detail.directionLabel": "Money direction",
  "statements.detail.programLabel": "Program",
  "statements.detail.artifactLabel": "Artifact status",
  "statements.detail.artifactReady": "Signed artifact ready",
  "statements.detail.artifactExpired": "Artifact expired, re-issue required",
  "statements.detail.callout.title": "Masked references only",
  "statements.detail.callout.body":
    "Cardholder, benefit, and card references stay masked across line items, downloads, and dispute handoff. Any raw reference here is a release defect.",
  "statements.detail.metrics.fare": "Total fare",
  "statements.detail.metrics.subsidised": "Subsidised by program",
  "statements.detail.metrics.issuerPayable": "Issuer payable total",
  "statements.detail.metrics.paid": "Cardholder paid total",
  "statements.detail.metrics.trips": "Trips in this statement",
  "statements.detail.table.kicker": "Per-trip reconciliation",
  "statements.detail.table.title": "Trip lines",
  "statements.detail.table.description":
    "Each line records fare, subsidised-vs-self-paid split, masked benefit / cardholder / card refs, issuer-pays-DRTS direction, signed artifact download, and a dispute path.",
  "statements.detail.columns.trip": "Trip / order",
  "statements.detail.columns.route": "Trip date / route",
  "statements.detail.columns.fare": "Fare",
  "statements.detail.columns.subsidised": "Subsidised",
  "statements.detail.columns.paid": "Paid",
  "statements.detail.columns.benefit": "Benefit",
  "statements.detail.columns.cardholder": "Cardholder",
  "statements.detail.columns.card": "Card ref",
  "statements.detail.columns.direction": "Money direction",
  "statements.detail.columns.artifact": "Artifact",
  "statements.detail.columns.dispute": "Dispute",

  "programs.title": "Programs & quota",
  "programs.purpose":
    "Benefit consumption per program / period: cardholders served and 趟次 consumed vs quota (禮遇趟次 remaining).",

  "users.title": "People & roles",
  "users.purpose":
    "Bank back-office roles: program-admin, ops-viewer, and finance.",

  "audit.title": "Audit",
  "audit.purpose":
    "Eligibility, dispatch, and settlement trail scoped to the issuer tenant.",
  "audit.eyebrow": "Issuer audit trail",
  "audit.description":
    "Read-only trail for eligibility decisions, dispatch visibility, settlement closeout, and statement access. Cardholder and card references remain masked throughout.",
  "audit.readOnly": "Read-only",
  "audit.issuerBadge": "CTBC issuer tenant",
  "audit.summary.events": "events",
  "audit.summary.eligibilityKicker": "Eligibility",
  "audit.summary.eligibilityBody":
    "Card-benefit decisions and manual-review routing, always retaining masked cardholder and card references.",
  "audit.summary.dispatchKicker": "Dispatch visibility",
  "audit.summary.dispatchBody":
    "Read-only issuer view of assignment outcomes and fulfilment milestones for booking-linked trips.",
  "audit.summary.settlementKicker": "Settlement & access",
  "audit.summary.settlementBody":
    "Statement publication, artifact access, and issuer-pays-DRTS closeout events by period.",
  "audit.callout.title": "Masking and scope",
  "audit.callout.bodyMasked":
    "Every subject preview in this audit list is already masked. The bank console never reveals raw cardholder identity or full card references.",
  "audit.callout.bodyFallback":
    "This view should only surface masked previews. Any unmasked reference is a defect that must be remediated before release.",
  "audit.filters.kicker": "Filters",
  "audit.filters.title": "Refine the issuer audit feed",
  "audit.filters.description":
    "Filter by event type, operator, settlement period, or masked subject reference.",
  "audit.filters.reset": "Clear filters",
  "audit.filters.type": "Event type",
  "audit.filters.actor": "Operator",
  "audit.filters.period": "Period",
  "audit.filters.subject": "Subject",
  "audit.filters.subjectPlaceholder":
    "Masked subject, booking, statement, or reason code",
  "audit.filters.apply": "Apply",
  "audit.filters.allTypes": "All event types",
  "audit.filters.allActors": "All operators",
  "audit.filters.allPeriods": "All periods",
  "audit.list.kicker": "Audit list",
  "audit.list.title": "{count} audit events",
  "audit.list.description":
    "Each row records timestamp, actor, type, masked subject, reason code, and the linked booking or settlement statement.",
  "audit.empty.title": "No events match these filters",
  "audit.empty.body":
    "Try clearing one or more filters to restore the issuer audit trail.",
  "audit.column.actor": "Actor",
  "audit.column.subject": "Masked subject",
  "audit.column.reasonCode": "Reason code",
  "audit.column.related": "Related entity",
  "audit.mask.ok": "Masked preview confirmed",
  "audit.mask.needsReview": "Masking review required",
  "audit.related.booking": "Booking",
  "audit.related.statement": "Statement",
  "audit.actor.bank_ops_viewer": "Ops viewer",
  "audit.actor.bank_program_admin": "Program admin",
  "audit.actor.bank_finance": "Finance",
  "audit.actor.system": "System",
  "audit.type.eligibility_decision": "Eligibility decision",
  "audit.type.dispatch_assignment": "Dispatch assignment",
  "audit.type.settlement_close": "Settlement close",
  "audit.type.access": "Access",
  "audit.reason.ELIGIBLE_APPROVED": "Eligibility approved",
  "audit.reason.MANUAL_REVIEW_REQUIRED": "Manual review required",
  "audit.reason.DRIVER_ASSIGNED": "Driver assigned",
  "audit.reason.STATEMENT_PUBLISHED": "Statement published",
  "audit.reason.ACCESS_GRANTED": "Access granted",
  "audit.reason.ACCESS_DENIED": "Access denied",

  "common.all": "All",
} as const;

const zh: Record<keyof typeof en, string> = {
  "app.title": "銀行卡友後台",
  "app.description":
    "DRTS Phase 1 信用卡卡友機場接送的發卡行／卡權益後台主控台。",

  "shell.breadcrumb.home": "總覽",
  "shell.search": "搜尋訂單、合約、對帳單…",

  "nav.section.workspace": "工作面",
  "nav.section.finance": "合約與帳務",
  "nav.section.governance": "治理",

  "nav.home": "總覽",
  "nav.bookings": "卡友訂單",
  "nav.contracts": "合約與 SLA",
  "nav.statements": "結算對帳單",
  "nav.programs": "方案與配額",
  "nav.users": "使用者與角色",
  "nav.audit": "稽核",

  "pending.badge": "畫面待設計",
  "pending.eyebrow": "卡權益後台",
  "pending.heading": "等待設計稿",
  "pending.lead":
    "本畫面屬於全新的銀行／發卡行後台。視覺設計稿尚未交付，因此此路由先以功能占位呈現，不會自行發明最終畫面。",
  "pending.authorityTitle": "設計授權",
  "pending.authorityBody":
    "卡權益資料 IA 沒有可延伸的既有 canvas（企業版 tenant-console canvas 是 YAMATO／成本中心通勤用，不可重用）。畫面待視覺設計團隊交付 canvas 後再落地。",
  "pending.referenceTitle": "行為與 API 授權",
  "pending.referenceBody":
    "行為、資料與 API 對應以 screen-requirements 交接稿與 System Design 為準。此殼只負責 tenant realm chrome、導覽與路由骨架。",

  "home.eyebrow": "發卡行工作面",
  "home.title": "銀行／發卡行主控台",
  "home.lead":
    "信用卡卡友機場接送權益的發卡行後台：卡友訂單、合約與 SLA 狀態、結算對帳單、方案配額，皆讀取共用的 tenant plane。",
  "home.purpose": "總覽將在設計稿交付後呈現今日訂單、配額消耗與 SLA 狀態。",

  "bookings.title": "卡友訂單",
  "bookings.purpose":
    "卡友／方案／航班／去回程／派遣狀態清單（卡友—機場維度，非企業成本中心）。卡友參考一律 PII 遮罩。",
  "bookings.eyebrow": "發卡行訂單工作面",
  "bookings.scopeLabel": "範圍",
  "bookings.scopeValue": "發卡行租戶 · 僅機場接送",
  "bookings.periodLabel": "期別",
  "bookings.maskingLabel": "遮罩",
  "bookings.maskingValue": "卡友與權益參考一律遮罩輸出",
  "bookings.readonlyTitle": "唯讀履約視圖",
  "bookings.readonlyBody":
    "此清單僅供發卡行檢視，支援方案、方向、派遣狀態、期別與遮罩卡友參考篩選；不顯示成本中心，也不提供派遣異動操作。",
  "bookings.filters.kicker": "清單篩選",
  "bookings.filters.title": "卡友—機場維度篩選",
  "bookings.filters.description":
    "依方案、去回程、派遣狀態、業務期別與遮罩卡友參考縮小發卡行租戶視圖。",
  "bookings.filters.program": "方案",
  "bookings.filters.direction": "方向",
  "bookings.filters.state": "派遣狀態",
  "bookings.filters.period": "期別",
  "bookings.filters.cardholder": "卡友參考",
  "bookings.filters.cardholderPlaceholder": "例如 CH••••98",
  "bookings.filters.apply": "套用篩選",
  "bookings.filters.reset": "清除",
  "bookings.metrics.kicker": "清單態勢",
  "bookings.metrics.total": "目前結果集訂單數",
  "bookings.metrics.active": "已指派或途中",
  "bookings.metrics.completed": "已完成趟次",
  "bookings.table.kicker": "訂單清單",
  "bookings.table.title": "機場接送履約列表",
  "bookings.table.description":
    "欄位只保留卡權益維度：訂單、卡友參考、方案、方向、航班／航廈、上下車、時段、狀態與遮罩權益參考。",
  "bookings.columns.order": "訂單",
  "bookings.columns.cardholder": "卡友",
  "bookings.columns.program": "方案",
  "bookings.columns.direction": "方向",
  "bookings.columns.flight": "航班／航廈",
  "bookings.columns.route": "上下車",
  "bookings.columns.window": "時段",
  "bookings.columns.state": "狀態",
  "bookings.columns.benefit": "Benefit",
  "bookings.direction.outbound": "去程",
  "bookings.direction.inbound": "回程",
  "bookings.state.assigned": "已指派",
  "bookings.state.en_route": "途中",
  "bookings.state.completed": "已完成",
  "bookings.state.cancelled": "已取消",
  "bookings.empty": "目前篩選沒有符合的訂單。",

  "contracts.title": "合約與 SLA",
  "contracts.purpose":
    "方案與 DRTS 之間的服務合約狀態：合約期、SLA 目標、當期達成率與例外清單。",

  "statements.title": "結算對帳單",
  "statements.purpose":
    "期別與逐趟結算對帳（發卡行付款給 DRTS），含遮罩參考與可下載的簽名 artifact。",
  "statements.eyebrow": "結算工作面",
  "statements.direction": "發卡行付款給 DRTS",
  "statements.strip.periods": "目前結果期別數",
  "statements.strip.published": "已發布期別",
  "statements.strip.total": "發卡行應付總額",
  "statements.callout.title": "結算態勢",
  "statements.callout.body":
    "此清單停留在期別層級，顯示應付總額、發布狀態、開立／到期日與簽名檔下載；逐趟遮罩參考則在 drill-down 詳情內查看。",
  "statements.filters.kicker": "對帳單篩選",
  "statements.filters.title": "依結算狀態篩選",
  "statements.filters.description":
    "可先收斂到已發布、已付款或到期中的對帳單，再打開單一期別明細。",
  "statements.filters.status": "狀態",
  "statements.filters.apply": "套用篩選",
  "statements.filters.reset": "清除",
  "statements.metrics.kicker": "結算態勢",
  "statements.metrics.periods": "目前結果中的對帳期別",
  "statements.metrics.due": "目前到期中的期別",
  "statements.metrics.issuerPays": "目前結果中的發卡行應付額",
  "statements.list.kicker": "對帳單清單",
  "statements.list.title": "期別級對帳",
  "statements.list.description":
    "每列顯示對帳單編號、期別總額、發布狀態、開立／到期日、簽名檔下載，以及進入逐趟明細的連結。",
  "statements.columns.period": "期別",
  "statements.columns.total": "發卡行應付",
  "statements.columns.status": "狀態",
  "statements.columns.issued": "開立日",
  "statements.columns.due": "到期日",
  "statements.columns.artifact": "簽名檔",
  "statements.columns.detail": "明細",
  "statements.status.published": "已發布",
  "statements.status.paid": "已付款",
  "statements.status.due": "待付款",
  "statements.actions.download": "下載",
  "statements.actions.viewDetail": "查看明細",
  "statements.actions.downloadSigned": "下載簽名檔",
  "statements.actions.reportDispute": "向 DRTS 提報",
  "statements.actions.disputed": "已標記爭議",
  "statements.empty": "目前篩選沒有符合的對帳單。",
  "statements.detail.eyebrow": "對帳單明細",
  "statements.detail.title": "{period} 對帳單",
  "statements.detail.purpose":
    "逐趟顯示車資、補助 vs 自付拆分、遮罩 benefit／卡友／卡號參考、簽名檔下載，以及每筆可提報爭議的路徑。",
  "statements.detail.back": "返回對帳單清單",
  "statements.detail.directionLabel": "金流方向",
  "statements.detail.programLabel": "方案",
  "statements.detail.artifactLabel": "簽名檔狀態",
  "statements.detail.artifactReady": "簽名檔可下載",
  "statements.detail.artifactExpired": "簽名檔已過期，需重新開立",
  "statements.detail.callout.title": "僅允許遮罩參考",
  "statements.detail.callout.body":
    "逐筆資料、下載檔與爭議提報都只能顯示遮罩後的卡友、benefit 與卡號參考；任何 raw reference 都屬 release defect。",
  "statements.detail.metrics.fare": "總車資",
  "statements.detail.metrics.subsidised": "方案補助總額",
  "statements.detail.metrics.issuerPayable": "發卡行應付總額",
  "statements.detail.metrics.paid": "卡友自付總額",
  "statements.detail.metrics.trips": "本期趟次數",
  "statements.detail.table.kicker": "逐趟對帳",
  "statements.detail.table.title": "趟次明細",
  "statements.detail.table.description":
    "每列記錄車資、補助 vs 自付拆分、遮罩 benefit／卡友／卡號參考、發卡行付款給 DRTS 的方向、簽名檔下載與單筆爭議路徑。",
  "statements.detail.columns.trip": "趟次／訂單",
  "statements.detail.columns.route": "日期／路線",
  "statements.detail.columns.fare": "車資",
  "statements.detail.columns.subsidised": "補助",
  "statements.detail.columns.paid": "自付",
  "statements.detail.columns.benefit": "Benefit",
  "statements.detail.columns.cardholder": "卡友",
  "statements.detail.columns.card": "卡號參考",
  "statements.detail.columns.direction": "金流方向",
  "statements.detail.columns.artifact": "簽名檔",
  "statements.detail.columns.dispute": "爭議",

  "programs.title": "方案與配額",
  "programs.purpose":
    "各方案／期別的權益消耗：服務卡友數、趟次消耗 vs 配額（禮遇趟次剩餘）。",

  "users.title": "使用者與角色",
  "users.purpose": "銀行後台角色：方案管理員、客服／營運、財務。",

  "audit.title": "稽核",
  "audit.purpose": "範圍限發卡行租戶的資格、派遣與結算軌跡。",
  "audit.eyebrow": "發卡行稽核軌跡",
  "audit.description":
    "唯讀檢視資格決策、派遣可見性、結算關帳與對帳單存取事件。所有卡友與卡片參考在此畫面皆維持遮罩。",
  "audit.readOnly": "唯讀",
  "audit.issuerBadge": "CTBC 發卡行租戶",
  "audit.summary.events": "筆事件",
  "audit.summary.eligibilityKicker": "資格決策",
  "audit.summary.eligibilityBody":
    "記錄卡權益判定與人工覆核分流，卡友與卡片參考一律只顯示 masked preview。",
  "audit.summary.dispatchKicker": "派遣可見性",
  "audit.summary.dispatchBody":
    "銀行側唯讀查看 booking 關聯趟次的指派結果與履約節點，不提供派遣修改。",
  "audit.summary.settlementKicker": "結算與存取",
  "audit.summary.settlementBody":
    "按期別追蹤對帳單發布、artifact 存取，以及 issuer-pays-DRTS 的關帳事件。",
  "audit.callout.title": "遮罩與範圍",
  "audit.callout.bodyMasked":
    "目前清單中的 subject preview 均已遮罩。銀行後台不會揭露原始卡友身分或完整卡號參考。",
  "audit.callout.bodyFallback":
    "此畫面只應呈現遮罩 preview。若出現未遮罩參考，屬於 release 前必須修復的缺陷。",
  "audit.filters.kicker": "篩選",
  "audit.filters.title": "收斂發卡行稽核事件",
  "audit.filters.description": "可依事件類型、操作者、期別或遮罩主體參考篩選。",
  "audit.filters.reset": "清除篩選",
  "audit.filters.type": "事件類型",
  "audit.filters.actor": "操作者",
  "audit.filters.period": "期別",
  "audit.filters.subject": "主體",
  "audit.filters.subjectPlaceholder":
    "輸入遮罩主體、booking、statement 或原因碼",
  "audit.filters.apply": "套用篩選",
  "audit.filters.allTypes": "全部事件類型",
  "audit.filters.allActors": "全部操作者",
  "audit.filters.allPeriods": "全部期別",
  "audit.list.kicker": "事件清單",
  "audit.list.title": "{count} 筆稽核事件",
  "audit.list.description":
    "每列顯示時間、操作者、事件類型、遮罩主體、原因碼，以及對應 booking 或結算對帳單連結。",
  "audit.empty.title": "目前沒有符合篩選條件的事件",
  "audit.empty.body": "可清除一或多個篩選條件，恢復發卡行稽核軌跡。",
  "audit.column.actor": "操作者",
  "audit.column.subject": "遮罩主體",
  "audit.column.reasonCode": "原因碼",
  "audit.column.related": "關聯實體",
  "audit.mask.ok": "已確認為遮罩 preview",
  "audit.mask.needsReview": "需補做遮罩檢查",
  "audit.related.booking": "Booking",
  "audit.related.statement": "Statement",
  "audit.actor.bank_ops_viewer": "營運查看",
  "audit.actor.bank_program_admin": "方案管理員",
  "audit.actor.bank_finance": "財務",
  "audit.actor.system": "系統",
  "audit.type.eligibility_decision": "資格決策",
  "audit.type.dispatch_assignment": "派遣",
  "audit.type.settlement_close": "結算關帳",
  "audit.type.access": "存取",
  "audit.reason.ELIGIBLE_APPROVED": "資格核准",
  "audit.reason.MANUAL_REVIEW_REQUIRED": "需人工覆核",
  "audit.reason.DRIVER_ASSIGNED": "已指派司機",
  "audit.reason.STATEMENT_PUBLISHED": "對帳單已發布",
  "audit.reason.ACCESS_GRANTED": "允許存取",
  "audit.reason.ACCESS_DENIED": "拒絕存取",

  "common.all": "全部",
};

export const translations = { en, zh } as const;
export type TranslationKey = keyof typeof en;

export function t(
  key: TranslationKey,
  locale: Locale = "zh",
  params?: Record<string, string | number>,
): string {
  const template = translations[locale][key] ?? en[key];
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((result, [name, value]) => {
    return result.replaceAll(`{${name}}`, String(value));
  }, template);
}
