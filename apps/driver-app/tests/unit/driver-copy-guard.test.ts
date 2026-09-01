import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

/**
 * 需求 2 的全域文案守門測試。
 *
 * 驗收標準：「所有使用者介面都不再顯示系統架構、API、規格編號、程式識別名稱
 * 或內部同步策略」。這支測試用 TypeScript AST 掃描 `app/`、`components/`、
 * `lib/` 三個目錄裡所有靜態字串，挑出「會被渲染成畫面文字」的那些，然後：
 *
 *   1. 禁詞檢查 —— 使用者可見文案不得出現開發用語（見 BLOCKED_TERMS）。
 *   2. 中文檢查 —— 使用者可見文案一律繁體中文，只放行品牌與單位縮寫。
 *   3. Runtime 檢查 —— AST 掃不到、但會把後端回傳代碼推上畫面的路徑。
 *
 * 掃描範圍刻意排除 `tests/`（守門測試本身一定會出現禁詞）與所有 `.md`
 * 文件（README 等是給開發者看的技術文件，不是使用者介面）。
 */

// ---------------------------------------------------------------------------
// Runtime 測試需要的 react-native / icon 替身（vi.mock 會被提升到最前面）
// ---------------------------------------------------------------------------

vi.mock("react-native", () => {
  const passthrough = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: vi.fn() },
    Platform: { OS: "android", select: (spec: Record<string, unknown>) => spec.android },
    Pressable: passthrough("Pressable"),
    SafeAreaView: passthrough("SafeAreaView"),
    ScrollView: passthrough("ScrollView"),
    StatusBar: "StatusBar",
    StyleSheet: { create: <T>(styles: T) => styles, flatten: (s: unknown) => s },
    Text: passthrough("Text"),
    TextInput: "TextInput",
    TouchableOpacity: passthrough("TouchableOpacity"),
    View: passthrough("View"),
  };
});

vi.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) =>
    React.createElement("Ionicons", props),
}));

import {
  assessPlatformHealth,
} from "../../components/platform-status-card";
import { getPlatformDisplayLabel } from "../../components/platform-task-badge";
import { formatDriverBlockingReasonLabel } from "../../lib/operational-labels";
import { deriveBlockingReasons } from "../../lib/platform-presence-view";

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SCAN_ROOTS = ["app", "components", "lib"] as const;

// ---------------------------------------------------------------------------
// 禁詞表（需求 2）
// ---------------------------------------------------------------------------

const BLOCKED_TERMS = [
  "sitemap",
  "cockpit",
  "packet",
  "§",
  "Phase 1",
  "phase1",
  "web console",
  "CrossAppResourceLink",
  "next-best-action",
  "EmptyReason",
  "ResourceActionDescriptor",
  "deep-link",
  "deep link",
  "allowedActions",
  "availableActions",
  "fallback",
  "outbox",
  "durable",
  "timeline",
  "domain",
  "surface",
  "ledger",
  "Realm",
  "Idempotency",
  "Pretrip",
  "Takeover",
  "capability",
  "guardrail",
  "sync_failed",
  "forwarded",
  "polyline",
  "heartbeat",
  "provisioning",
  "SDK",
  "bundled",
  "EXPO_PUBLIC",
  "/api/",
  "endpoint",
  "schema",
  "payload",
  "SQLite",
  "DeviceNotProvisioned",
  "SessionExpired",
  "DeviceRevoked",
  "DriverSuspended",
  "DeviceId",
  "BindingId",
  "DriverId",
  "Workspace cockpit",
  "Trip Route Summary",
  "spec",
  "Q-DRV",
  "鏡像",
  "旗標",
  "降級",
  "主控",
  "生命周期",
] as const;

/** 品牌／通用縮寫允許清單。 */
const ALLOWED_TOKENS = ["DRTS", "SOS", "GPS", "110", "119", "App"] as const;

/** 度量與貨幣單位：不是英文文案，是數值旁邊的單位符號。 */
const ALLOWED_UNIT_TOKENS = ["km", "KB", "MB", "NT$", "US$"] as const;

// ---------------------------------------------------------------------------
// KNOWN_EXCEPTIONS —— 逐條列出、附中文理由，不得靜默跳過整個檔案
// ---------------------------------------------------------------------------

type CopyException = {
  /** 例外編號，違規訊息會顯示。 */
  id: string;
  /** 相對於 apps/driver-app 的檔案路徑。 */
  file: string;
  /** 被豁免的字串值（去頭尾空白後完全比對）。 */
  values?: readonly string[];
  /**
   * 結構化豁免：只豁免指派給這個屬性名的字串，
   * 用來精準排除 i18n 字典的英文欄位，而不是整檔跳過。
   */
  propertyName?: string;
  /** 中文理由。 */
  reason: string;
};

const KNOWN_EXCEPTIONS: readonly CopyException[] = [
  {
    id: "EX-01",
    file: "lib/operational-labels.ts",
    propertyName: "en",
    reason:
      "i18n 字典 { en, zh } 的英文欄位（Pending Acceptance、Airport Transfer、" +
      "Third-party Forwarded Order、Service Product Pending、UNKNOWN_STATUS.en、" +
      "UNMAPPED_STATUS.en…）。司機端的 DriverLocale 固定為 zh，en 欄位永不渲染。" +
      "採結構化排除（只排除 en: 這個屬性名），同一檔案的 zh: 欄位仍然照常受檢。",
  },
  {
    id: "EX-02",
    file: "components/platform-task-badge.tsx",
    values: ["Uber", "Lyft", "Grab", "Gojek", "Bolt", "DiDi"],
    reason:
      "PLATFORM_LABELS 的值是外部叫車平台的品牌名。品牌名不翻譯，" +
      "司機必須看到平台原名才知道訂單來源。",
  },
  {
    id: "EX-03",
    file: "components/driver-trip-map.tsx",
    values: ["Apple"],
    reason:
      "導航按鈕在 iOS 顯示「Apple 導航」、Android 顯示「系統 導航」。" +
      "Apple 與同檔案的「Google 導航」都是品牌名，不翻譯。",
  },
  {
    id: "EX-04",
    file: "lib/driver-navigation.ts",
    values: [
      "Apple Maps",
      "Google Maps app",
      "Google Maps web",
      "Android navigation",
    ],
    reason:
      "挑選導航 App 時的內部 candidate 標記，不會渲染到畫面；" +
      "而且 Apple Maps／Google Maps 本身就是品牌名。",
  },
  {
    id: "EX-05",
    file: "app/(tabs)/settings/index.tsx",
    values: ["driver@example.com", "zh-TW"],
    reason:
      "表單 placeholder 的輸入格式範例：電子郵件欄位示範信箱格式、" +
      "介面語言欄位示範語言代碼格式，司機必須照這個格式輸入。",
  },
  {
    id: "EX-06",
    file: "lib/operational-labels.ts",
    values: ["Service Product Pending"],
    reason:
      "formatDriverServiceProductLabel() 在 locale 為 en 時的回傳值，" +
      "與 EX-01 同一組 i18n 字典；司機端固定 zh，這個分支永不執行。",
  },
] as const;

// ---------------------------------------------------------------------------
// AST 抽取
// ---------------------------------------------------------------------------

type CopyCandidate = {
  file: string;
  line: number;
  value: string;
  /** 判定為使用者可見的理由，違規訊息會顯示，方便追查。 */
  origin: string;
  /** 最近一層物件屬性名（供結構化豁免使用）。 */
  propertyName: string | null;
};

const HAN_CHARACTER = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** 這些 JSX 屬性的值會被畫成文字。 */
const DISPLAY_ATTRIBUTES = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "actionLabel",
  "actionTitle",
  "authorityLabel",
  "body",
  "cancelLabel",
  "caption",
  "confirmLabel",
  "dangerLabel",
  "description",
  "detail",
  "emptyText",
  "eyebrow",
  "footnote",
  "heading",
  "headline",
  "helpText",
  "helperText",
  "hint",
  "label",
  "message",
  "note",
  "placeholder",
  "primaryLabel",
  "retryLabel",
  "secondaryLabel",
  "statusLabel",
  "subtitle",
  "submitLabel",
  "summary",
  "text",
  "title",
  "value",
]);

/** 這些物件屬性的值會被畫成文字（view-model／Alert／前景服務通知）。 */
const DISPLAY_PROPERTIES = new Set([
  "accessibilityLabel",
  "actionLabel",
  "actionTitle",
  "authorityLabel",
  "body",
  "cancelLabel",
  "caption",
  "confirmLabel",
  "description",
  "detail",
  "emptyText",
  "eyebrow",
  "footnote",
  "heading",
  "headline",
  "helperText",
  "hint",
  "label",
  "message",
  "meta",
  "note",
  "notificationBody",
  "notificationTitle",
  "placeholder",
  "primaryLabel",
  "readinessLabel",
  "secondaryLabel",
  "statusLabel",
  "subtitle",
  "summary",
  "title",
]);

/** 這些屬性收的是列舉值／樣式代碼／圖示名，不是文案。 */
const NON_TEXT_PROPERTIES = new Set([
  "accuracy",
  "activityType",
  "align",
  "day",
  "dayPeriod",
  "era",
  "hour",
  "hour12",
  "minute",
  "month",
  "second",
  "timeZone",
  "weekday",
  "year",
  "autoCapitalize",
  "autoComplete",
  "backgroundColor",
  "borderColor",
  "code",
  "color",
  "direction",
  "icon",
  "iconColor",
  "iconName",
  "id",
  "key",
  "keyboardType",
  "kind",
  "locale",
  "mode",
  "name",
  "provider",
  "reason",
  "resizeMode",
  "returnKeyType",
  "size",
  "state",
  "status",
  "style",
  "testID",
  "textColor",
  "textContentType",
  "tone",
  "urgency",
  "variant",
  "weight",
]);

/**
 * 變數名長得像「文案字典」的，裡面的字串都當成會渲染
 * （例如 PLATFORM_LABELS、driverStrings、typeLabel、authorityLabel）。
 */
const COPY_DICTIONARY_NAME =
  /(LABEL|LABELS|COPY|STRING|STRINGS|TITLE|TITLES|MESSAGE|MESSAGES|CAPTION|WORDING|HINT)/i;

const ROUTE_LITERAL = /^\/[a-z0-9\-_/()[\].]*$/i;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const SQL_STATEMENT =
  /^(SELECT|INSERT|UPDATE|DELETE|PRAGMA|CREATE|DROP|BEGIN|COMMIT|ALTER)\b/i;
const SINGLE_GLYPH = /^[A-Za-z]$/;

function listSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  for (const root of SCAN_ROOTS) {
    walk(path.join(APP_ROOT, root));
  }
  return files.sort();
}

/** 往上跳過純表達式包裝，找到真正的「語意父節點」。 */
function semanticParent(node: ts.Node): ts.Node | null {
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isConditionalExpression(parent) ||
      ts.isBinaryExpression(parent) ||
      ts.isTemplateExpression(parent) ||
      ts.isTemplateSpan(parent) ||
      ts.isJsxExpression(parent) ||
      ts.isAsExpression(parent)
    ) {
      current = parent;
      continue;
    }
    return parent;
  }
  return null;
}

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isImportTypeNode(parent) ||
    ts.isExternalModuleReference(parent)
  ) {
    return true;
  }
  return (
    ts.isCallExpression(parent) &&
    /^(require|import)$/.test(parent.expression.getText())
  );
}

/** `case "x":` 與 `x === "y"` 的字串是內部代碼，不是文案。 */
function isComparisonOperand(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isCaseClause(parent)) return true;
  return (
    ts.isBinaryExpression(parent) &&
    (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
      parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)
  );
}

/** 型別位置的字串字面量（union 型別、索引存取型別）不是文案。 */
function isTypeLiteral(node: ts.Node): boolean {
  return !!node.parent && ts.isLiteralTypeNode(node.parent);
}

/** 參數預設值（例如 `locale: DriverLocale = "zh"`）是代碼參數，不是文案。 */
function isParameterDefault(node: ts.Node): boolean {
  return !!node.parent && ts.isParameter(node.parent);
}

function isObjectKey(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isEnumMember(parent)) &&
    (parent.name as ts.Node) === node
  );
}

function isInsideCallNamed(node: ts.Node, pattern: RegExp): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      pattern.test(current.expression.getText())
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * 函式呼叫的直接引數通常是代碼參數（locale、key、平台代碼），不是文案。
 * Alert.* 例外：Alert.alert(title, body) 就是畫面文字。
 */
function isPlainCallArgument(node: ts.Node): boolean {
  const parent = semanticParent(node);
  if (!parent || !ts.isCallExpression(parent)) return false;
  return !/^Alert\./.test(parent.expression.getText());
}

function nearestPropertyName(node: ts.Node): string | null {
  const parent = semanticParent(node);
  if (
    parent &&
    ts.isPropertyAssignment(parent) &&
    (parent.name as ts.Node) !== node
  ) {
    return parent.name.getText().replace(/^["']|["']$/g, "");
  }
  return null;
}

function isInCopyDictionary(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isVariableDeclaration(current) &&
      COPY_DICTIONARY_NAME.test(current.name.getText())
    ) {
      return true;
    }
    // 名字像 getXxxLabel() / formatXxxTitle() 的函式，回傳值就是畫面文字。
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name &&
      COPY_DICTIONARY_NAME.test(current.name.getText())
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function collectCandidates(): CopyCandidate[] {
  const candidates: CopyCandidate[] = [];

  for (const file of listSourceFiles()) {
    const relative = path.relative(APP_ROOT, file);
    const text = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      let raw: string | null = null;
      let jsxText = false;

      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        raw = node.text;
      } else if (ts.isJsxText(node)) {
        raw = node.text;
        jsxText = true;
      } else if (
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        // 樣板字串的靜態片段。
        raw = node.text;
      }

      if (raw !== null && raw.trim()) {
        const value = raw.trim();
        const skip =
          isModuleSpecifier(node) ||
          isInsideCallNamed(node, /StyleSheet\.create/) ||
          isInsideCallNamed(node, /^console\./) ||
          isObjectKey(node) ||
          isTypeLiteral(node) ||
          isParameterDefault(node) ||
          isComparisonOperand(node) ||
          HEX_COLOR.test(value) ||
          SQL_STATEMENT.test(value) ||
          SINGLE_GLYPH.test(value) ||
          (ROUTE_LITERAL.test(value) && !/api/i.test(value));

        if (!skip) {
          const parent = semanticParent(node);
          const attributeName =
            parent && ts.isJsxAttribute(parent) ? parent.name.getText() : null;
          const propertyName = nearestPropertyName(node);
          let origin: string | null = null;

          if (jsxText) {
            origin = "JSX 文字節點";
          } else if (attributeName && NON_TEXT_PROPERTIES.has(attributeName)) {
            origin = null;
          } else if (propertyName && NON_TEXT_PROPERTIES.has(propertyName)) {
            origin = null;
          } else if (attributeName && DISPLAY_ATTRIBUTES.has(attributeName)) {
            origin = "JSX 屬性 " + attributeName;
          } else if (propertyName && DISPLAY_PROPERTIES.has(propertyName)) {
            origin = "物件屬性 " + propertyName;
          } else if (isPlainCallArgument(node)) {
            origin = null;
          } else if (isInCopyDictionary(node)) {
            origin = "文案字典";
          } else if (HAN_CHARACTER.test(value)) {
            origin = "中文文案";
          } else if (/\s/.test(value)) {
            // 多字英文句子（含內部 Error message）。禁詞照掃；
            // 中文檢查不掃，因為它們已由 formatDriverError 擋在畫面之外。
            origin = "英文語句";
          }

          if (origin) {
            candidates.push({
              file: relative,
              line:
                source.getLineAndCharacterOfPosition(node.getStart(source))
                  .line + 1,
              value,
              origin,
              propertyName,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return candidates;
}

function matchesException(
  candidate: CopyCandidate,
  exception: CopyException,
): boolean {
  if (candidate.file !== exception.file) return false;
  if (exception.propertyName) {
    return candidate.propertyName === exception.propertyName;
  }
  return (exception.values ?? []).includes(candidate.value);
}

function isExcused(candidate: CopyCandidate): boolean {
  return KNOWN_EXCEPTIONS.some((exception) =>
    matchesException(candidate, exception),
  );
}

function stripAllowedTokens(value: string): string {
  let remaining = value;
  for (const token of [...ALLOWED_TOKENS, ...ALLOWED_UNIT_TOKENS]) {
    remaining = remaining.split(token).join(" ");
  }
  return remaining;
}

function describeHit(candidate: CopyCandidate, note: string): string {
  return `${candidate.file}:${candidate.line} (${candidate.origin}) ${note} → ${JSON.stringify(candidate.value)}`;
}

const CANDIDATES = collectCandidates();

// ---------------------------------------------------------------------------
// 1. 靜態文案守門
// ---------------------------------------------------------------------------

describe("driver-app 使用者文案守門（需求 2）", () => {
  it("掃描器有正常運作（候選文案數量在合理範圍）", () => {
    expect(CANDIDATES.length).toBeGreaterThan(500);
  });

  it("使用者可見文案不得出現系統架構／API／規格／程式識別名稱等開發用語", () => {
    const violations: string[] = [];

    for (const candidate of CANDIDATES) {
      if (isExcused(candidate)) continue;
      const lowered = candidate.value.toLowerCase();
      const hits = BLOCKED_TERMS.filter((term) =>
        lowered.includes(term.toLowerCase()),
      );
      if (hits.length > 0) {
        violations.push(describeHit(candidate, `禁詞 [${hits.join(", ")}]`));
      }
    }

    expect(violations).toEqual([]);
  });

  it("使用者可見文案一律繁體中文（僅放行品牌與單位縮寫）", () => {
    const violations: string[] = [];

    for (const candidate of CANDIDATES) {
      // 「英文語句」是內部錯誤訊息，只做禁詞檢查。
      if (candidate.origin === "英文語句") continue;
      if (HAN_CHARACTER.test(candidate.value)) continue;
      if (isExcused(candidate)) continue;
      if (!/[A-Za-z]/.test(stripAllowedTokens(candidate.value))) continue;

      violations.push(describeHit(candidate, "英文文案"));
    }

    expect(violations).toEqual([]);
  });

  it("KNOWN_EXCEPTIONS 沒有失效條目（每條都必須仍然命中）", () => {
    const unused = KNOWN_EXCEPTIONS.filter(
      (exception) =>
        !CANDIDATES.some((candidate) => matchesException(candidate, exception)),
    ).map((exception) => `${exception.id} ${exception.file}`);

    expect(unused).toEqual([]);
  });

  it("每條 KNOWN_EXCEPTIONS 都附有中文理由", () => {
    for (const exception of KNOWN_EXCEPTIONS) {
      expect(exception.reason.trim().length).toBeGreaterThan(10);
      expect(HAN_CHARACTER.test(exception.reason)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Runtime 守門：AST 掃不到、但會把未知／後端代碼推上畫面的路徑
// ---------------------------------------------------------------------------

const INTERNAL_CODE_SHAPE = /[_]|^[a-z0-9]+([.:/-][a-z0-9]+)+$/;

describe("平台代碼不會以內部代碼樣式外洩", () => {
  it("已知平台代碼顯示品牌名或中文", () => {
    expect(getPlatformDisplayLabel("uber")).toBe("Uber");
    expect(getPlatformDisplayLabel("owned")).toBe("自營派單");
    expect(getPlatformDisplayLabel(null)).toBe("自營派單");
  });

  it("未知平台代碼會被整理成品牌名樣式，不會吐出 snake_case／kebab-case", () => {
    const unknownCodes = [
      "line-taxi",
      "yellow_cab",
      "some.internal.code",
      "TAXI_9527",
    ];

    for (const code of unknownCodes) {
      const label = getPlatformDisplayLabel(code);
      expect(label).not.toMatch(INTERNAL_CODE_SHAPE);
      expect(label).not.toContain("-");
      // 每個字都首字母大寫，看起來像品牌名而不是程式識別名稱。
      expect(label).toBe(label.replace(/\b\w/g, (char) => char.toUpperCase()));
    }

    expect(getPlatformDisplayLabel("line-taxi")).toBe("Line Taxi");
    expect(getPlatformDisplayLabel("yellow_cab")).toBe("Yellow Cab");
  });
});

describe("後端回傳的阻擋原因不會原封不動顯示", () => {
  const rawCodes = [
    "token_expired",
    "ADAPTER_TIMEOUT",
    "DeviceNotProvisioned",
    "eligibility.pending",
    "some_unmapped_backend_code",
  ];

  it("已知代碼給中文對照、未知代碼給中文 fallback、中文原文保留", () => {
    expect(formatDriverBlockingReasonLabel("token_expired")).toBe(
      "平台授權已過期，請重新授權",
    );
    expect(formatDriverBlockingReasonLabel("ADAPTER_TIMEOUT")).toBe(
      "平台連線逾時",
    );
    expect(formatDriverBlockingReasonLabel("some_unmapped_backend_code")).toBe(
      "目前無法接單，請稍後再試或聯繫派車台。",
    );
    expect(formatDriverBlockingReasonLabel("whatever", "平台連線異常")).toBe(
      "平台連線異常",
    );
    expect(formatDriverBlockingReasonLabel("缺少營業證件")).toBe("缺少營業證件");
    expect(formatDriverBlockingReasonLabel(null, "平台連線中斷")).toBe(
      "平台連線中斷",
    );
  });

  it("平台健康卡片不會顯示 adapterStatus 的原始阻擋代碼", () => {
    for (const code of rawCodes) {
      for (const status of ["degraded", "down"] as const) {
        const assessment = assessPlatformHealth(
          {
            platformCode: "uber",
            accountId: "acct-1",
            status: "online",
            eligibility: "eligible",
            reauthRequired: false,
            tokenExpiresAt: null,
            updatedAt: new Date().toISOString(),
          } as never,
          { platformCode: "uber", status, blockingReason: code } as never,
        );

        expect(assessment.adapterLabel).not.toContain(code);
        expect(HAN_CHARACTER.test(assessment.adapterLabel)).toBe(true);
      }
    }
  });

  it("平台上線狀態頁不會顯示 ineligibleReasons／blockingReason 的原始代碼", () => {
    for (const code of rawCodes) {
      const reasons = deriveBlockingReasons(
        {
          platformCode: "uber",
          accountId: "acct-1",
          status: "online",
          eligibility: "ineligible",
          reauthRequired: false,
          tokenExpiresAt: null,
          updatedAt: new Date().toISOString(),
          ineligibleReasons: [code],
        } as never,
        { platformCode: "uber", status: "down", blockingReason: code } as never,
      );

      expect(reasons.length).toBeGreaterThan(0);
      for (const reason of reasons) {
        expect(reason).not.toContain(code);
        expect(HAN_CHARACTER.test(reason)).toBe(true);
      }
    }
  });
});
