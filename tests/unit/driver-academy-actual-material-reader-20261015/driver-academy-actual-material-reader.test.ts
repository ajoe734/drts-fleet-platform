import { execFileSync } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  AcademyCourseDetail,
  AcademyCourseSummary,
  DriverTrainingRecord,
  QuizResultRecord,
  QuizSubmissionCommand,
} from "@drts/contracts";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DRIVER_APP_ROOT = path.join(REPO_ROOT, "apps/driver-app");
const ACCEPTED_BASE_SHA = "431966bdf2728a76f7b03907974a124ab4a48ae7";

type TestNode = {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<TestNode | string>;
};

type TestRenderer = {
  root: {
    findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  };
  update: (element: unknown) => void;
  unmount: () => void;
};

type DriverRuntime = {
  React: {
    createElement: (
      type: unknown,
      props?: Record<string, unknown> | null,
      ...children: unknown[]
    ) => unknown;
  };
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: unknown) => TestRenderer;
  loadHistoricalModuleReader: () => {
    ModuleReader: (props: Record<string, unknown>) => unknown;
  };
  loadCurrentAcademyComponents: () => {
    ModuleReader: (props: Record<string, unknown>) => unknown;
    resolveAcademyMaterialResource: (
      course: Pick<
        AcademyCourseDetail,
        "courseId" | "courseCode" | "title" | "version"
      >,
      module: AcademyCourseDetail["modules"][number],
    ) => unknown;
    openAcademyMaterialResource: (
      course: Pick<
        AcademyCourseDetail,
        "courseId" | "courseCode" | "title" | "version"
      >,
      module: AcademyCourseDetail["modules"][number],
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  loadDriverAcademyScreen: () => {
    default: () => unknown;
  };
};

const boundary = {
  openURL: vi.fn<(url: string) => Promise<unknown>>(),
  canOpenURL: vi.fn<(url: string) => Promise<boolean>>(),
  listAcademyCourses: vi.fn<() => Promise<{ items: AcademyCourseSummary[] }>>(),
  listDriverTrainingRecords:
    vi.fn<() => Promise<{ items: DriverTrainingRecord[] }>>(),
  getAcademyCourse: vi.fn<(courseId: string) => Promise<AcademyCourseDetail>>(),
  submitQuiz:
    vi.fn<
      (
        courseId: string,
        command: QuizSubmissionCommand,
      ) => Promise<QuizResultRecord>
    >(),
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  canGoBack: vi.fn(() => true),
};

let runtime!: DriverRuntime;
const activeRenderers: TestRenderer[] = [];

function setupDriverRuntime(): DriverRuntime {
  const appRequire = Module.createRequire(
    path.join(DRIVER_APP_ROOT, "package.json"),
  );
  const React = appRequire("react") as DriverRuntime["React"];
  const jsxRuntime = appRequire("react/jsx-runtime") as unknown;
  const { act, create } = appRequire("react-test-renderer") as {
    act: DriverRuntime["act"];
    create: DriverRuntime["create"];
  };

  const nativeMock: Record<string, unknown> = {
    ActivityIndicator: "ActivityIndicator",
    KeyboardAvoidingView: "KeyboardAvoidingView",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Text: "Text",
    TextInput: "TextInput",
    TouchableOpacity: "TouchableOpacity",
    View: "View",
    SafeAreaView: "SafeAreaView",
    StatusBar: "StatusBar",
    Platform: {
      OS: "web",
      select: (values: Record<string, unknown>) => values.web ?? values.default,
    },
    StyleSheet: {
      create: <T>(styles: T): T => styles,
      flatten: (style: unknown) => style,
      hairlineWidth: 1,
      absoluteFillObject: {},
    },
    Linking: {
      openURL: (url: string) => boundary.openURL(url),
      canOpenURL: (url: string) => boundary.canOpenURL(url),
    },
  };

  const moduleInternal = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    _extensions: Record<
      string,
      (
        mod: { _compile: (code: string, file: string) => void },
        file: string,
      ) => void
    >;
  };

  const originalLoad = moduleInternal._load;

  const compileTs = (
    mod: { _compile: (code: string, file: string) => void },
    filename: string,
    sourceText: string,
  ) => {
    const transpiled = ts.transpileModule(sourceText, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    mod._compile(transpiled.outputText, filename);
  };

  moduleInternal._extensions[".ts"] = (mod, filename) => {
    compileTs(mod, filename, fs.readFileSync(filename, "utf8"));
  };
  moduleInternal._extensions[".tsx"] = (mod, filename) => {
    compileTs(mod, filename, fs.readFileSync(filename, "utf8"));
  };

  moduleInternal._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "react") return React;
    if (request === "react/jsx-runtime") return jsxRuntime;
    if (request === "react-native") return nativeMock;
    if (request === "@expo/vector-icons") return { Ionicons: "Ionicons" };
    if (request === "react-native-safe-area-context") {
      return {
        SafeAreaView: "SafeAreaView",
        useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      };
    }
    if (request === "expo-router") {
      return {
        Redirect: "Redirect",
        useRouter: () => ({
          back: boundary.routerBack,
          push: boundary.routerPush,
          canGoBack: boundary.canGoBack,
        }),
      };
    }
    if (request === "@/lib/api-client") {
      return {
        getDriverClient: () => ({
          listAcademyCourses: () => boundary.listAcademyCourses(),
          listDriverTrainingRecords: () => boundary.listDriverTrainingRecords(),
          getAcademyCourse: (courseId: string) =>
            boundary.getAcademyCourse(courseId),
          submitQuiz: (courseId: string, command: QuizSubmissionCommand) =>
            boundary.submitQuiz(courseId, command),
        }),
        formatDriverError: (err: unknown, fallback: string) =>
          err instanceof Error ? err.message : fallback,
      };
    }
    if (request.startsWith("@/")) {
      const target = path.join(DRIVER_APP_ROOT, request.slice(2));
      return originalLoad.call(this, target, parent, isMain);
    }
    if (request === "@drts/contracts") {
      return originalLoad.call(
        this,
        path.join(REPO_ROOT, "packages/contracts/src/index.ts"),
        parent,
        isMain,
      );
    }
    if (request === "@drts/ui-tokens") {
      return originalLoad.call(
        this,
        path.join(REPO_ROOT, "packages/ui-tokens/src/index.ts"),
        parent,
        isMain,
      );
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return {
    React,
    act,
    create,
    loadHistoricalModuleReader: () => {
      const historicalSource = execFileSync(
        "git",
        [
          "show",
          `${ACCEPTED_BASE_SHA}:apps/driver-app/components/academy/module-reader.tsx`,
        ],
        { cwd: REPO_ROOT, encoding: "utf8" },
      );
      const fakeFilename = path.join(
        DRIVER_APP_ROOT,
        "components/academy/__historical_module_reader__.tsx",
      );
      const tempMod = new Module(fakeFilename) as unknown as {
        filename: string;
        paths: string[];
        exports: { ModuleReader: (props: Record<string, unknown>) => unknown };
        _compile: (code: string, file: string) => void;
      };
      tempMod.filename = fakeFilename;
      tempMod.paths = (
        Module as unknown as { _nodeModulePaths: (dir: string) => string[] }
      )._nodeModulePaths(path.dirname(fakeFilename));
      compileTs(tempMod, fakeFilename, historicalSource);
      return tempMod.exports;
    },
    loadCurrentAcademyComponents: () => {
      const readerPath = path.join(
        DRIVER_APP_ROOT,
        "components/academy/module-reader.tsx",
      );
      const resourcePath = path.join(
        DRIVER_APP_ROOT,
        "components/academy/material-resource.ts",
      );
      delete appRequire.cache[readerPath];
      delete appRequire.cache[resourcePath];
      return appRequire(readerPath) as ReturnType<
        DriverRuntime["loadCurrentAcademyComponents"]
      >;
    },
    loadDriverAcademyScreen: () => {
      const academyScreenPath = path.join(DRIVER_APP_ROOT, "app/academy.tsx");
      const indexPath = path.join(
        DRIVER_APP_ROOT,
        "components/academy/index.ts",
      );
      const readerPath = path.join(
        DRIVER_APP_ROOT,
        "components/academy/module-reader.tsx",
      );
      const resourcePath = path.join(
        DRIVER_APP_ROOT,
        "components/academy/material-resource.ts",
      );
      delete appRequire.cache[academyScreenPath];
      delete appRequire.cache[indexPath];
      delete appRequire.cache[readerPath];
      delete appRequire.cache[resourcePath];
      return appRequire(academyScreenPath) as { default: () => unknown };
    },
  };
}

function nodeText(node: TestNode | string): string {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(nodeText).join("");
}

function allRenderedText(renderer: TestRenderer): string {
  return renderer.root
    .findAll((node) => node.type === "Text")
    .map(nodeText)
    .join("\n");
}

function findByTestId(renderer: TestRenderer, testID: string): TestNode | null {
  const matches = renderer.root.findAll(
    (node) => node.props?.testID === testID && typeof node.type === "string",
  );
  return matches[0] ?? null;
}

function findButtonByText(renderer: TestRenderer, label: string): TestNode {
  const matches = renderer.root.findAll(
    (node) =>
      (node.type === "Pressable" || node.type === "TouchableOpacity") &&
      nodeText(node).includes(label),
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0]!;
}

async function pressNode(node: TestNode): Promise<void> {
  const onPress = node.props.onPress as
    | (() => void | Promise<void>)
    | undefined;
  expect(onPress).toBeTypeOf("function");
  await runtime.act(async () => {
    await onPress!();
  });
}

async function mountElement(element: unknown): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await runtime.act(async () => {
    renderer = runtime.create(element);
  });
  activeRenderers.push(renderer);
  return renderer;
}

function buildMultiResourceCourse(
  overrides: Partial<AcademyCourseDetail> = {},
): AcademyCourseDetail {
  return {
    courseId: "crs_safety_2026",
    courseCode: "SAFE-2026",
    title: "平台安全防禦駕駛與應變實務",
    category: "safety",
    isRequired: true,
    validityDays: 30,
    passingScore: 80,
    version: 2,
    modulesCount: 5,
    description: "涵蓋防禦駕駛影片、兩份不同作業階段 SOP 與兩份法規講義。",
    modules: [
      {
        moduleId: "mod_video_defensive",
        title: "防禦駕駛路口實務影片",
        type: "video",
        contentUrl: "https://cdn.drts.internal/academy/videos/defensive-v2.mp4",
        durationMinutes: 15,
      },
      {
        moduleId: "mod_sop_precheck",
        title: "出車前安全自檢 SOP",
        type: "sop",
        contentUrl: "https://cdn.drts.internal/academy/sop/precheck-v2.pdf",
        durationMinutes: 10,
      },
      {
        moduleId: "mod_sop_incident",
        title: "行車事故與緊急通報 SOP",
        type: "sop",
        contentUrl: "https://cdn.drts.internal/academy/sop/incident-v2.pdf",
        durationMinutes: 12,
      },
      {
        moduleId: "mod_article_contract",
        title: "駕駛承攬權益與責任分工講義",
        type: "article",
        contentUrl: "https://cdn.drts.internal/academy/articles/contract-v2.md",
        durationMinutes: 8,
      },
      {
        moduleId: "mod_article_compliance",
        title: "計程車客運服務業法遵規範講義",
        type: "article",
        contentUrl:
          "https://cdn.drts.internal/academy/articles/compliance-v2.md",
        durationMinutes: 14,
      },
    ],
    questions: [
      {
        questionId: "q_safe_1",
        prompt: "行經無號誌交叉路口時，應採取何種防禦駕駛作為？",
        options: [
          { optionId: "opt_1a", text: "減速慢行並確認左右來車" },
          { optionId: "opt_1b", text: "鳴喇叭加速通過" },
        ],
      },
      {
        questionId: "q_safe_2",
        prompt: "行程中發生擦撞事故時，第一時間應如何處置？",
        options: [
          { optionId: "opt_2a", text: "確認人員安全、放置警告標誌並啟動通報" },
          { optionId: "opt_2b", text: "自行離開現場繼續載客" },
        ],
      },
    ],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  runtime = setupDriverRuntime();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  boundary.canOpenURL.mockReset().mockResolvedValue(true);
  boundary.openURL.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await runtime.act(async () => {
    for (const renderer of activeRenderers.splice(0)) {
      renderer.unmount();
    }
  });
});

describe("DRIVER-ACADEMY-ACTUAL-MATERIAL-READER-20261015 (C059-F1)", () => {
  describe("1. Original-before counterexample at immutable base 431966bdf2728a76f7b03907974a124ab4a48ae7", () => {
    it("reproduces the mounted ModuleReader dead video glyph and identical canned SOP/article body across distinct module resources", async () => {
      const { ModuleReader: HistoricalModuleReader } =
        runtime.loadHistoricalModuleReader();
      const course = buildMultiResourceCourse();

      const renderer = await mountElement(
        runtime.React.createElement(HistoricalModuleReader, {
          course,
          onStartQuiz: vi.fn(),
          onBack: vi.fn(),
        }),
      );

      // 1. Video module only renders static "▶" and URL text with no open/play Pressable
      const initialText = allRenderedText(renderer);
      expect(initialText).toContain("▶");
      expect(initialText).toContain(
        "影片資源位址：https://cdn.drts.internal/academy/videos/defensive-v2.mp4",
      );
      expect(boundary.openURL).not.toHaveBeenCalled();

      // 2. Switch between two distinct SOP modules: both render the exact same canned generic paragraph
      await pressNode(findButtonByText(renderer, "出車前安全自檢 SOP"));
      const sop1Text = allRenderedText(renderer);
      expect(sop1Text).toContain("【標準作業指引 SOP】");
      expect(sop1Text).toContain("1. 接單前請確認車輛安全自檢與整潔完成。");

      await pressNode(findButtonByText(renderer, "行車事故與緊急通報 SOP"));
      const sop2Text = allRenderedText(renderer);
      expect(sop2Text).toContain("【標準作業指引 SOP】");
      expect(sop2Text).toContain("1. 接單前請確認車輛安全自檢與整潔完成。");

      // 3. Switch between two distinct article modules: both render the exact same canned generic paragraph
      await pressNode(findButtonByText(renderer, "駕駛承攬權益與責任分工講義"));
      const art1Text = allRenderedText(renderer);
      expect(art1Text).toContain("【專業知識講義】");
      expect(art1Text).toContain(
        "本單元涵蓋平台服務法規、責任分工原則與合約條款注意事項。",
      );

      await pressNode(
        findButtonByText(renderer, "計程車客運服務業法遵規範講義"),
      );
      const art2Text = allRenderedText(renderer);
      expect(art2Text).toContain("【專業知識講義】");
      expect(art2Text).toContain(
        "本單元涵蓋平台服務法規、責任分工原則與合約條款注意事項。",
      );
      expect(boundary.openURL).not.toHaveBeenCalled();
    });
  });

  describe("2. Fixed-after mounted ModuleReader actual video/SOP/article actions and resource switching (c059_actual_selected_material_read_or_play)", () => {
    it("opens/plays the selected video, SOP, and article resources with preserved course/module identity and never renders canned generic text", async () => {
      const { ModuleReader } = runtime.loadCurrentAcademyComponents();
      const course = buildMultiResourceCourse();
      const onStartQuiz = vi.fn();
      const onBack = vi.fn();
      const openedSessions: Array<Record<string, unknown>> = [];

      boundary.openURL.mockImplementation(async (url: string) => {
        if (url.endsWith("precheck-v2.pdf")) {
          return "【出車前自檢實務】請逐項核對輪胎胎壓、煞車燈號、行照與強制險效期。";
        }
        if (url.endsWith("incident-v2.pdf")) {
          return "【事故應變實務】開啟雙黃警示燈、擺放三角故障標誌，並立即通報110與車行值班台。";
        }
        if (url.endsWith("contract-v2.md")) {
          return "【承攬合約專章】明定趟次服務費結算週期、合作車隊權利義務與爭議調解程序。";
        }
        if (url.endsWith("compliance-v2.md")) {
          return "【運輸法遵專章】執業登記證應置於車內指定插座，不得超收車資或無故拒載。";
        }
        return undefined;
      });

      const renderer = await mountElement(
        runtime.React.createElement(ModuleReader, {
          course,
          onStartQuiz,
          onBack,
          onMaterialOpened: (session: Record<string, unknown>) => {
            openedSessions.push(session);
          },
        }),
      );

      // Verify course metadata and absence of canned generic text
      const initialText = allRenderedText(renderer);
      expect(initialText).toContain("平台安全防禦駕駛與應變實務");
      expect(initialText).toContain("代碼：SAFE-2026 · 版本：v2");
      expect(initialText).not.toContain("【標準作業指引 SOP】");
      expect(initialText).not.toContain("【專業知識講義】");
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).toBeNull();

      // 1. Activate video playback action
      const openVideoBtn = findByTestId(
        renderer,
        "academy-material-open-mod_video_defensive",
      );
      expect(openVideoBtn).not.toBeNull();
      expect(nodeText(openVideoBtn!)).toContain("播放教學影片");

      await pressNode(openVideoBtn!);

      expect(boundary.canOpenURL).toHaveBeenCalledWith(
        "https://cdn.drts.internal/academy/videos/defensive-v2.mp4",
      );
      expect(boundary.openURL).toHaveBeenCalledWith(
        "https://cdn.drts.internal/academy/videos/defensive-v2.mp4",
      );
      expect(openedSessions).toHaveLength(1);
      expect(openedSessions[0]).toMatchObject({
        courseId: "crs_safety_2026",
        courseCode: "SAFE-2026",
        courseTitle: "平台安全防禦駕駛與應變實務",
        courseVersion: 2,
        moduleId: "mod_video_defensive",
        moduleTitle: "防禦駕駛路口實務影片",
        moduleType: "video",
        contentUrl: "https://cdn.drts.internal/academy/videos/defensive-v2.mp4",
        statusLabel: "已啟動教學影片播放",
      });
      const videoOpenedText = allRenderedText(renderer);
      expect(videoOpenedText).toContain("已啟動教學影片播放");
      expect(videoOpenedText).toContain(
        "已開啟單元：防禦駕駛路口實務影片 (mod_video_defensive)",
      );
      expect(videoOpenedText).toContain("重新播放教學影片");

      // 2. Switch to first SOP module -> previous session clears, no canned text
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_sop_precheck")!,
      );
      const sop1BeforeOpen = allRenderedText(renderer);
      expect(sop1BeforeOpen).toContain("出車前安全自檢 SOP");
      expect(sop1BeforeOpen).toContain(
        "教材資源位址：https://cdn.drts.internal/academy/sop/precheck-v2.pdf",
      );
      expect(sop1BeforeOpen).not.toContain("已啟動教學影片播放");
      expect(sop1BeforeOpen).not.toContain("【標準作業指引 SOP】");
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).toBeNull();

      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_sop_precheck")!,
      );
      expect(boundary.openURL).toHaveBeenLastCalledWith(
        "https://cdn.drts.internal/academy/sop/precheck-v2.pdf",
      );
      const sop1AfterOpen = allRenderedText(renderer);
      expect(sop1AfterOpen).toContain("已開啟 SOP 指引教材");
      expect(sop1AfterOpen).toContain(
        "已開啟單元：出車前安全自檢 SOP (mod_sop_precheck)",
      );
      expect(sop1AfterOpen).toContain(
        "【出車前自檢實務】請逐項核對輪胎胎壓、煞車燈號、行照與強制險效期。",
      );

      // 3. Switch to second SOP module -> verify distinct resource, no masquerade of SOP 1 or generic text
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_sop_incident")!,
      );
      const sop2BeforeOpen = allRenderedText(renderer);
      expect(sop2BeforeOpen).toContain("行車事故與緊急通報 SOP");
      expect(sop2BeforeOpen).toContain(
        "教材資源位址：https://cdn.drts.internal/academy/sop/incident-v2.pdf",
      );
      expect(sop2BeforeOpen).not.toContain("【出車前自檢實務】");
      expect(sop2BeforeOpen).not.toContain("【標準作業指引 SOP】");
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).toBeNull();

      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_sop_incident")!,
      );
      expect(boundary.openURL).toHaveBeenLastCalledWith(
        "https://cdn.drts.internal/academy/sop/incident-v2.pdf",
      );
      const sop2AfterOpen = allRenderedText(renderer);
      expect(sop2AfterOpen).toContain(
        "已開啟單元：行車事故與緊急通報 SOP (mod_sop_incident)",
      );
      expect(sop2AfterOpen).toContain(
        "【事故應變實務】開啟雙黃警示燈、擺放三角故障標誌，並立即通報110與車行值班台。",
      );
      expect(sop2AfterOpen).not.toContain("【出車前自檢實務】");

      // 4. Switch between two distinct article modules -> verify each opens its own resource
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_article_contract")!,
      );
      expect(allRenderedText(renderer)).not.toContain("【專業知識講義】");
      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_article_contract")!,
      );
      expect(boundary.openURL).toHaveBeenLastCalledWith(
        "https://cdn.drts.internal/academy/articles/contract-v2.md",
      );
      expect(allRenderedText(renderer)).toContain(
        "【承攬合約專章】明定趟次服務費結算週期、合作車隊權利義務與爭議調解程序。",
      );

      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_article_compliance")!,
      );
      expect(allRenderedText(renderer)).not.toContain("【承攬合約專章】");
      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_article_compliance")!,
      );
      expect(boundary.openURL).toHaveBeenLastCalledWith(
        "https://cdn.drts.internal/academy/articles/compliance-v2.md",
      );
      expect(allRenderedText(renderer)).toContain(
        "【運輸法遵專章】執業登記證應置於車內指定插座，不得超收車資或無故拒載。",
      );

      // Opening materials does not auto-start quiz or navigate back
      expect(onStartQuiz).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    });
  });

  describe("3. Missing/invalid URLs, opener/player rejections, retry recovery, and race safety (c059_material_unavailable_error_and_resource_switch)", () => {
    it("renders an honest unavailable state for missing or invalid contentUrl without calling opener or faking loaded content, and recovers when switching to a valid module", async () => {
      const { ModuleReader } = runtime.loadCurrentAcademyComponents();
      const course = buildMultiResourceCourse({
        modules: [
          {
            moduleId: "mod_missing_url",
            title: "尚未上傳連結之 SOP",
            type: "sop",
            contentUrl: "   ",
            durationMinutes: 5,
          },
          {
            moduleId: "mod_invalid_scheme",
            title: "不合法協定之講義",
            type: "article",
            contentUrl: "javascript:alert(1)",
            durationMinutes: 6,
          },
          {
            moduleId: "mod_valid_video",
            title: "正常可播放之安全影片",
            type: "video",
            contentUrl: "https://cdn.drts.internal/academy/videos/valid.mp4",
            durationMinutes: 10,
          },
        ],
      });

      const renderer = await mountElement(
        runtime.React.createElement(ModuleReader, {
          course,
          onStartQuiz: vi.fn(),
          onBack: vi.fn(),
        }),
      );

      // 1. Missing URL module
      expect(
        findByTestId(renderer, "academy-material-unavailable"),
      ).not.toBeNull();
      const missingText = allRenderedText(renderer);
      expect(missingText).toContain("教材資源無法使用");
      expect(missingText).toContain(
        "此單元尚未設定教材資源位址，無法開啟或載入教材。",
      );
      expect(missingText).not.toContain("【標準作業指引 SOP】");
      const disabledBtn1 = findByTestId(
        renderer,
        "academy-material-open-mod_missing_url",
      );
      expect(disabledBtn1?.props.disabled).toBe(true);
      expect(boundary.openURL).not.toHaveBeenCalled();

      // 2. Invalid scheme module
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_invalid_scheme")!,
      );
      expect(
        findByTestId(renderer, "academy-material-unavailable"),
      ).not.toBeNull();
      const invalidText = allRenderedText(renderer);
      expect(invalidText).toContain("教材資源無法使用");
      expect(invalidText).toContain(
        "教材資源位址格式無效或不受支援，無法開啟教材。",
      );
      expect(invalidText).not.toContain("【專業知識講義】");
      const disabledBtn2 = findByTestId(
        renderer,
        "academy-material-open-mod_invalid_scheme",
      );
      expect(disabledBtn2?.props.disabled).toBe(true);
      expect(boundary.openURL).not.toHaveBeenCalled();

      // 3. Switch to valid module -> recovers cleanly and opens
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_valid_video")!,
      );
      expect(findByTestId(renderer, "academy-material-unavailable")).toBeNull();
      const validOpenBtn = findByTestId(
        renderer,
        "academy-material-open-mod_valid_video",
      );
      expect(validOpenBtn?.props.disabled).toBe(false);

      await pressNode(validOpenBtn!);
      expect(boundary.openURL).toHaveBeenCalledExactlyOnceWith(
        "https://cdn.drts.internal/academy/videos/valid.mp4",
      );
      expect(allRenderedText(renderer)).toContain("已啟動教學影片播放");
    });

    it("surfaces rejected opener/load errors honestly without claiming material loaded, and succeeds on retry", async () => {
      const { ModuleReader } = runtime.loadCurrentAcademyComponents();
      const course = buildMultiResourceCourse();

      boundary.openURL
        .mockRejectedValueOnce(
          new Error("外部影片播放器啟動失敗 (ERR_PLAYER_UNAVAILABLE)"),
        )
        .mockResolvedValueOnce(undefined);

      const renderer = await mountElement(
        runtime.React.createElement(ModuleReader, {
          course,
          onStartQuiz: vi.fn(),
          onBack: vi.fn(),
        }),
      );

      // First attempt fails
      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_video_defensive")!,
      );
      expect(boundary.openURL).toHaveBeenCalledTimes(1);
      expect(findByTestId(renderer, "academy-material-error")).not.toBeNull();
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).toBeNull();
      const errorText = allRenderedText(renderer);
      expect(errorText).toContain("教材開啟失敗");
      expect(errorText).toContain(
        "外部影片播放器啟動失敗 (ERR_PLAYER_UNAVAILABLE)",
      );
      expect(errorText).not.toContain("已啟動教學影片播放");

      // Retry succeeds
      const retryBtn = findByTestId(renderer, "academy-material-retry");
      expect(retryBtn).not.toBeNull();
      await pressNode(retryBtn!);

      expect(boundary.openURL).toHaveBeenCalledTimes(2);
      expect(findByTestId(renderer, "academy-material-error")).toBeNull();
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).not.toBeNull();
      expect(allRenderedText(renderer)).toContain("已啟動教學影片播放");
    });

    it("guards against duplicate in-flight presses and discards stale responses after switching modules", async () => {
      const { ModuleReader } = runtime.loadCurrentAcademyComponents();
      const course = buildMultiResourceCourse();
      const pendingVideoOpen = deferred<void>();

      boundary.openURL.mockReturnValueOnce(pendingVideoOpen.promise);

      const renderer = await mountElement(
        runtime.React.createElement(ModuleReader, {
          course,
          onStartQuiz: vi.fn(),
          onBack: vi.fn(),
        }),
      );

      const openVideoBtn = findByTestId(
        renderer,
        "academy-material-open-mod_video_defensive",
      )!;
      const onPress = openVideoBtn.props.onPress as () => void;

      await runtime.act(async () => {
        onPress();
        onPress();
      });

      expect(boundary.openURL).toHaveBeenCalledTimes(1);
      expect(allRenderedText(renderer)).toContain("正在開啟教材...");

      // Switch to SOP module while video open is still pending
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_sop_precheck")!,
      );
      expect(allRenderedText(renderer)).not.toContain("正在開啟教材...");

      // Late resolution of video open must not pollute SOP module
      await runtime.act(async () => {
        pendingVideoOpen.resolve();
      });
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).toBeNull();
      expect(allRenderedText(renderer)).toContain("出車前安全自檢 SOP");
      expect(allRenderedText(renderer)).not.toContain("已啟動教學影片播放");
    });

    it("surfaces canOpenURL=false rejection and resets active session when course version or identity updates", async () => {
      const { ModuleReader } = runtime.loadCurrentAcademyComponents();
      const courseV2 = buildMultiResourceCourse({ version: 2 });

      boundary.canOpenURL.mockResolvedValueOnce(false);

      const renderer = await mountElement(
        runtime.React.createElement(ModuleReader, {
          course: courseV2,
          onStartQuiz: vi.fn(),
          onBack: vi.fn(),
        }),
      );

      // 1. canOpenURL returns false -> error banner shown, openURL not invoked
      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_video_defensive")!,
      );
      expect(boundary.canOpenURL).toHaveBeenCalledTimes(1);
      expect(boundary.openURL).not.toHaveBeenCalled();
      expect(findByTestId(renderer, "academy-material-error")).not.toBeNull();
      expect(allRenderedText(renderer)).toContain(
        "裝置目前無法開啟此教材連結，請確認外部播放器或閱讀器設定。",
      );

      // 2. Retry with canOpenURL=true -> succeeds
      boundary.canOpenURL.mockResolvedValueOnce(true);
      await pressNode(findByTestId(renderer, "academy-material-retry")!);
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).not.toBeNull();

      // 3. Switch to SOP module and then update course version prop -> resets to first module and clears active session
      await pressNode(
        findByTestId(renderer, "academy-module-select-mod_sop_precheck")!,
      );
      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_sop_precheck")!,
      );
      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).not.toBeNull();

      const courseV3 = buildMultiResourceCourse({ version: 3 });
      await runtime.act(async () => {
        renderer.update(
          runtime.React.createElement(ModuleReader, {
            course: courseV3,
            onStartQuiz: vi.fn(),
            onBack: vi.fn(),
          }),
        );
      });

      expect(
        findByTestId(renderer, "academy-material-active-session"),
      ).toBeNull();
      const v3Text = allRenderedText(renderer);
      expect(v3Text).toContain("代碼：SAFE-2026 · 版本：v3");
      expect(
        findByTestId(renderer, "academy-material-open-mod_video_defensive"),
      ).not.toBeNull();
    });
  });

  describe("4. Mounted DriverAcademyScreen integration, quiz/retake/progress preservation, and C062 Web/native import split (c059_existing_quiz_progress_and_web_native_regressions)", () => {
    it("mounts DriverAcademyScreen -> detail ModuleReader -> opens material without auto-completing course -> runs quiz, fail, retake, pass, and record refresh", async () => {
      const { default: DriverAcademyScreen } =
        runtime.loadDriverAcademyScreen();
      const courseDetail = buildMultiResourceCourse();
      const courseSummary: AcademyCourseSummary = {
        courseId: courseDetail.courseId,
        courseCode: courseDetail.courseCode,
        title: courseDetail.title,
        category: courseDetail.category,
        isRequired: courseDetail.isRequired,
        validityDays: courseDetail.validityDays,
        passingScore: courseDetail.passingScore,
        version: courseDetail.version,
        modulesCount: courseDetail.modulesCount,
        userStatus: "not_started",
      };

      const initialRecords: DriverTrainingRecord[] = [
        {
          recordId: "rec_safe_1",
          driverId: "drv_001",
          courseId: courseDetail.courseId,
          courseCode: courseDetail.courseCode,
          courseTitle: courseDetail.title,
          status: "not_started",
          highestScore: null,
          attemptsCount: 0,
          passed: false,
          lastAttemptAt: null,
          completedAt: null,
          expiresAt: null,
          isOverdue: false,
        },
      ];

      const passedRecords: DriverTrainingRecord[] = [
        {
          ...initialRecords[0]!,
          status: "passed",
          highestScore: 100,
          attemptsCount: 2,
          passed: true,
          lastAttemptAt: "2026-10-15T18:00:00.000Z",
          completedAt: "2026-10-15T18:00:00.000Z",
          expiresAt: "2026-11-14T18:00:00.000Z",
          isOverdue: false,
        },
      ];

      boundary.listAcademyCourses
        .mockResolvedValueOnce({ items: [courseSummary] })
        .mockResolvedValueOnce({
          items: [{ ...courseSummary, userStatus: "failed" }],
        })
        .mockResolvedValueOnce({
          items: [{ ...courseSummary, userStatus: "passed" }],
        });
      boundary.listDriverTrainingRecords
        .mockResolvedValueOnce({ items: initialRecords })
        .mockResolvedValueOnce({
          items: [
            {
              ...initialRecords[0]!,
              status: "failed",
              highestScore: 50,
              attemptsCount: 1,
            },
          ],
        })
        .mockResolvedValueOnce({ items: passedRecords });
      boundary.getAcademyCourse.mockResolvedValue(courseDetail);

      const renderer = await mountElement(
        runtime.React.createElement(DriverAcademyScreen),
      );

      expect(boundary.listAcademyCourses).toHaveBeenCalledTimes(1);
      expect(boundary.listDriverTrainingRecords).toHaveBeenCalledTimes(1);
      expect(allRenderedText(renderer)).toContain(courseDetail.title);

      // Select course to open detail ModuleReader (academy.tsx:219-232)
      await pressNode(findButtonByText(renderer, courseDetail.title));
      expect(boundary.getAcademyCourse).toHaveBeenCalledWith("crs_safety_2026");

      // Open video material inside mounted DriverAcademyScreen
      await pressNode(
        findByTestId(renderer, "academy-material-open-mod_video_defensive")!,
      );
      expect(boundary.openURL).toHaveBeenCalledWith(
        "https://cdn.drts.internal/academy/videos/defensive-v2.mp4",
      );
      // Opening material does NOT submit quiz or mark course completed
      expect(boundary.submitQuiz).not.toHaveBeenCalled();

      // Start Quiz
      await pressNode(findButtonByText(renderer, "開始測驗 (2 題)"));
      expect(allRenderedText(renderer)).toContain("線上測驗");

      // Answer Q1 right, Q2 wrong -> 50 points (fail)
      await pressNode(findButtonByText(renderer, "減速慢行並確認左右來車"));
      await pressNode(findButtonByText(renderer, "下一題"));
      await pressNode(findButtonByText(renderer, "自行離開現場繼續載客"));

      boundary.submitQuiz.mockResolvedValueOnce({
        attemptId: "att_fail_1",
        courseId: courseDetail.courseId,
        courseVersion: 2,
        score: 50,
        passed: false,
        attemptedAt: "2026-10-15T17:58:00.000Z",
        feedback: "未達 80 分及格門檻，請重新研讀教材後再測驗。",
      });

      await pressNode(findButtonByText(renderer, "確認交卷"));
      expect(boundary.submitQuiz).toHaveBeenCalledWith("crs_safety_2026", {
        courseVersion: 2,
        answers: [
          { questionId: "q_safe_1", selectedOptionId: "opt_1a" },
          { questionId: "q_safe_2", selectedOptionId: "opt_2b" },
        ],
      });
      expect(allRenderedText(renderer)).toContain("未達標準，測驗未通過");
      expect(allRenderedText(renderer)).toContain("50");

      // Retake Quiz and pass with 100
      await pressNode(findButtonByText(renderer, "重新測驗"));
      await pressNode(findButtonByText(renderer, "減速慢行並確認左右來車"));
      await pressNode(findButtonByText(renderer, "下一題"));
      await pressNode(
        findButtonByText(renderer, "確認人員安全、放置警告標誌並啟動通報"),
      );

      boundary.submitQuiz.mockResolvedValueOnce({
        attemptId: "att_pass_2",
        courseId: courseDetail.courseId,
        courseVersion: 2,
        score: 100,
        passed: true,
        attemptedAt: "2026-10-15T18:00:00.000Z",
        feedback: "恭喜通過安全防禦駕駛認證！",
      });

      await pressNode(findButtonByText(renderer, "確認交卷"));
      expect(allRenderedText(renderer)).toContain("測驗合格！完訓認證完成");
      expect(allRenderedText(renderer)).toContain("100");
      expect(boundary.listDriverTrainingRecords).toHaveBeenCalledTimes(3);
    });

    it("preserves C062 Web/native import separation with zero native-only player or map imports in Academy material reader modules", () => {
      const moduleReaderSource = fs.readFileSync(
        path.join(DRIVER_APP_ROOT, "components/academy/module-reader.tsx"),
        "utf8",
      );
      const materialResourceSource = fs.readFileSync(
        path.join(DRIVER_APP_ROOT, "components/academy/material-resource.ts"),
        "utf8",
      );

      for (const source of [moduleReaderSource, materialResourceSource]) {
        expect(source).not.toMatch(/react-native-maps/);
        expect(source).not.toMatch(/PROVIDER_GOOGLE/);
        expect(source).not.toMatch(/expo-av/);
        expect(source).not.toMatch(/expo-video/);
        expect(source).not.toMatch(/react-native-video/);
        expect(source).not.toMatch(/Linking\.openURL\s*\(\s*[`'"]tel:/);
      }

      const webMapSource = fs.readFileSync(
        path.join(DRIVER_APP_ROOT, "components/driver-trip-map.web.tsx"),
        "utf8",
      );
      expect(webMapSource).not.toMatch(/react-native-maps/);
      expect(webMapSource).not.toMatch(/PROVIDER_GOOGLE/);
    });
  });
});
