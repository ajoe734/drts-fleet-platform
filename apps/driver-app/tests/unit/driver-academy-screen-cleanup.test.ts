import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
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
  DriverQuizAttemptDetail,
  DriverTrainingRecord,
} from "@drts/contracts";

// Regression guard for the driver academy screens: no internal IDs, versions,
// resource URLs or English status words; one back control and one give-up
// control per view; no "start quiz (0 questions)" dead end; and a failed quiz
// submit stays visible on the quiz view.

const boundary = vi.hoisted(() => ({
  listAcademyCourses: vi.fn(),
  listDriverTrainingRecords: vi.fn(),
  getAcademyCourse: vi.fn(),
  submitQuiz: vi.fn(),
  openURL: vi.fn(),
  canOpenURL: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Keyboard: { addListener: () => ({ remove: () => {} }) },
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
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), canGoBack: () => true }),
}));
vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => boundary,
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import DriverAcademyScreen from "../../app/academy";
import { CourseCard } from "../../components/academy/course-card";
import { ModuleReader } from "../../components/academy/module-reader";
import { QuizResultView } from "../../components/academy/quiz-result-view";
import { TrainingRecordsList } from "../../components/academy/training-records-list";

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[];
};
type Renderer = ReactTestRenderer & {
  root: { findAll(predicate: (node: Node) => boolean): Node[] };
};

const renderers: Renderer[] = [];

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

function course(
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
    modulesCount: 1,
    description: "防禦駕駛影片。",
    modules: [
      {
        moduleId: "mod_video_defensive",
        title: "防禦駕駛路口實務影片",
        type: "video",
        contentUrl: "https://cdn.example.invalid/academy/defensive-v2.mp4",
        durationMinutes: 15,
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
    ],
    ...overrides,
  };
}

function summary(detail: AcademyCourseDetail): AcademyCourseSummary {
  return {
    courseId: detail.courseId,
    courseCode: detail.courseCode,
    title: detail.title,
    category: detail.category,
    isRequired: detail.isRequired,
    validityDays: detail.validityDays,
    passingScore: detail.passingScore,
    version: detail.version,
    modulesCount: detail.modulesCount,
    userStatus: "not_started",
  };
}

function text(node: Node | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
function allText(renderer: Renderer): string {
  return renderer.root
    .findAll((node) => node.type === "Text")
    .map(text)
    .join("\n");
}
function pressables(renderer: Renderer, label: string): Node[] {
  return renderer.root.findAll(
    (node) =>
      (node.type === "Pressable" || node.type === "TouchableOpacity") &&
      text(node).includes(label),
  );
}
async function press(node: Node) {
  await act(async () => {
    await (node.props.onPress as () => unknown)();
  });
}
async function mount(element: React.ReactElement): Promise<Renderer> {
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(element) as Renderer;
  });
  renderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.clearAllMocks();
  const detail = course();
  boundary.listAcademyCourses.mockResolvedValue({ items: [summary(detail)] });
  boundary.listDriverTrainingRecords.mockResolvedValue({ items: [] });
  boundary.getAcademyCourse.mockResolvedValue(detail);
  boundary.canOpenURL.mockResolvedValue(true);
  boundary.openURL.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

describe("Driver academy result view", () => {
  it("shows plain pass/fail copy, Taiwan time and per-question right/wrong without any IDs", async () => {
    const result: DriverQuizAttemptDetail = {
      attemptId: "att_fail_1",
      courseId: "crs_safety_2026",
      courseVersion: 2,
      driverId: "drv_001",
      score: 50,
      passed: false,
      attemptedAt: "2026-10-15T17:58:00.000Z",
      feedback: "未達及格分數，請重新研讀教材後再次作答。",
      answersSummary: [
        { questionId: "q_safe_1", selectedOptionId: "opt_1a", isCorrect: true },
        {
          questionId: "q_safe_2",
          selectedOptionId: "opt_2b",
          isCorrect: false,
        },
      ],
    };
    const renderer = await mount(
      React.createElement(QuizResultView, {
        result,
        passingScore: 80,
        onRetake: vi.fn(),
        onBackToCourses: vi.fn(),
      }),
    );
    const rendered = allText(renderer);

    for (const internal of [
      "att_fail_1",
      "crs_safety_2026",
      "q_safe",
      "opt_",
      "Attempt ID",
      "Passed",
      "Failed",
      "2026-10-15T",
      "權威",
    ]) {
      expect(rendered).not.toContain(internal);
    }
    expect(rendered).toContain("未通過");
    // 17:58 UTC on 10/15 is 01:58 on 10/16 in Taiwan.
    expect(rendered).toContain("2026/10/16 01:58");
    expect(rendered).toContain("第 1 題");
    expect(rendered).toContain("答對");
    expect(rendered).toContain("第 2 題");
    expect(rendered).toContain("答錯");
  });

  it("tells a passing driver the result is recorded in plain words", async () => {
    const renderer = await mount(
      React.createElement(QuizResultView, {
        result: {
          attemptId: "att_pass_2",
          courseId: "crs_safety_2026",
          courseVersion: 2,
          score: 100,
          passed: true,
          attemptedAt: "2026-10-15T18:00:00.000Z",
        },
        passingScore: 80,
        onRetake: vi.fn(),
        onBackToCourses: vi.fn(),
      }),
    );
    const rendered = allText(renderer);
    expect(rendered).toContain("合格");
    expect(rendered).toContain("成績已記錄，車行可看到你已完訓。");
    expect(rendered).not.toContain("資料庫");
    expect(rendered).not.toContain("att_pass_2");
  });
});

describe("Driver academy module reader", () => {
  it("does not offer a quiz when the course has no questions and says how completion works", async () => {
    const renderer = await mount(
      React.createElement(ModuleReader, {
        course: course({ questions: [] }),
        onStartQuiz: vi.fn(),
      }),
    );
    expect(pressables(renderer, "開始測驗")).toHaveLength(0);
    // Completion is recorded only by passing the quiz, so the driver is told
    // this course cannot be completed in the app rather than shown a pass mark.
    const rendered = allText(renderer);
    expect(rendered).toContain(
      "這門課目前沒有測驗，無法在 App 內完訓，請聯絡車行。",
    );
    expect(rendered).not.toContain("完訓標準：測驗成績需達");
  });

  it("hides course code, version, module ID and resource URL but still opens the right material", async () => {
    const onStartQuiz = vi.fn();
    const renderer = await mount(
      React.createElement(ModuleReader, { course: course(), onStartQuiz }),
    );
    const rendered = allText(renderer);
    expect(rendered).not.toContain("SAFE-2026");
    expect(rendered).not.toContain("v2");
    expect(rendered).not.toContain("mod_video_defensive");
    expect(rendered).not.toContain("https://");
    expect(pressables(renderer, "返回清單")).toHaveLength(0);

    const [open] = renderer.root.findAll(
      (node) =>
        node.props?.testID === "academy-material-open-mod_video_defensive" &&
        typeof node.type === "string",
    );
    await press(open!);
    expect(boundary.openURL).toHaveBeenCalledExactlyOnceWith(
      "https://cdn.example.invalid/academy/defensive-v2.mp4",
    );
    expect(allText(renderer)).toContain("已啟動教學影片播放");
    expect(allText(renderer)).not.toContain("https://");

    const [start] = pressables(renderer, "開始測驗 (1 題)");
    await press(start!);
    expect(onStartQuiz).toHaveBeenCalledTimes(1);
  });
});

describe("Driver academy screen controls", () => {
  it("has one back control on the course view and one give-up control on the quiz view, without question IDs", async () => {
    const renderer = await mount(React.createElement(DriverAcademyScreen));
    await press(pressables(renderer, course().title)[0]!);

    expect(pressables(renderer, "回清單")).toHaveLength(1);
    expect(pressables(renderer, "返回清單")).toHaveLength(0);

    await press(pressables(renderer, "開始測驗")[0]!);
    expect(pressables(renderer, "放棄測驗")).toHaveLength(1);
    expect(allText(renderer)).not.toContain("q_safe_1");
    expect(allText(renderer)).not.toContain("ID:");

    await press(pressables(renderer, "放棄測驗")[0]!);
    expect(pressables(renderer, "開始測驗")).toHaveLength(1);
  });

  it("keeps a failed quiz submit visible on the quiz view", async () => {
    boundary.submitQuiz.mockRejectedValueOnce(new Error("網路連線中斷"));
    const renderer = await mount(React.createElement(DriverAcademyScreen));
    await press(pressables(renderer, course().title)[0]!);
    await press(pressables(renderer, "開始測驗")[0]!);
    await press(pressables(renderer, "減速慢行並確認左右來車")[0]!);
    await press(pressables(renderer, "確認交卷")[0]!);

    expect(boundary.submitQuiz).toHaveBeenCalledTimes(1);
    expect(pressables(renderer, "確認交卷")).toHaveLength(1);
    expect(allText(renderer)).toContain("網路連線中斷");
  });

  it("does not carry a background list-refresh failure into the next quiz", async () => {
    boundary.listAcademyCourses
      .mockResolvedValueOnce({ items: [summary(course())] })
      .mockRejectedValueOnce(new Error("課程清單暫時無法載入"));
    boundary.submitQuiz.mockResolvedValueOnce({
      attemptId: "att_fail_1",
      courseId: "crs_safety_2026",
      courseVersion: 2,
      score: 0,
      passed: false,
      attemptedAt: "2026-10-15T17:58:00.000Z",
    });
    const renderer = await mount(React.createElement(DriverAcademyScreen));
    await press(pressables(renderer, course().title)[0]!);
    await press(pressables(renderer, "開始測驗")[0]!);
    await press(pressables(renderer, "鳴喇叭加速通過")[0]!);
    await press(pressables(renderer, "確認交卷")[0]!);

    // The submit succeeded; the background refresh after it failed.
    expect(boundary.listAcademyCourses).toHaveBeenCalledTimes(2);
    expect(allText(renderer)).toContain("未通過");

    await press(pressables(renderer, "重新測驗")[0]!);
    expect(pressables(renderer, "確認交卷")).toHaveLength(1);
    expect(allText(renderer)).not.toContain("課程清單暫時無法載入");

    // The refresh failure still belongs to, and shows on, the course list.
    await press(pressables(renderer, "放棄測驗")[0]!);
    await press(pressables(renderer, "回清單")[0]!);
    expect(allText(renderer)).toContain("課程清單暫時無法載入");
  });

  it("shows course and record titles without course codes", async () => {
    const record: DriverTrainingRecord = {
      recordId: "rec_safe_1",
      driverId: "drv_001",
      courseId: "crs_safety_2026",
      courseCode: "SAFE-2026",
      courseTitle: "平台安全防禦駕駛與應變實務",
      status: "passed",
      highestScore: 100,
      attemptsCount: 1,
      passed: true,
      lastAttemptAt: "2026-10-15T18:00:00.000Z",
      completedAt: "2026-10-15T18:00:00.000Z",
      expiresAt: "2026-11-14T18:00:00.000Z",
      isOverdue: false,
    };
    const records = await mount(
      React.createElement(TrainingRecordsList, { records: [record] }),
    );
    expect(allText(records)).toContain(record.courseTitle);
    expect(allText(records)).not.toContain("SAFE-2026");
    // 18:00 UTC on 10/15 is 10/16 in Taiwan.
    expect(allText(records)).toContain("2026/10/16");

    const card = await mount(
      React.createElement(CourseCard, {
        course: summary(course()),
        onSelect: vi.fn(),
      }),
    );
    expect(allText(card)).toContain(course().title);
    expect(allText(card)).not.toContain("SAFE-2026");
    expect(allText(card)).not.toContain("代碼");
  });

  it("describes empty training records without jargon", async () => {
    const renderer = await mount(
      React.createElement(TrainingRecordsList, { records: [] }),
    );
    const rendered = allText(renderer);
    expect(rendered).toContain("完訓紀錄");
    expect(rendered).not.toContain("權威");
  });
});
