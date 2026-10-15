import { Linking } from "react-native";
import type { AcademyCourseDetail, AcademyModule } from "./types";

export interface AcademyMaterialIdentity {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseVersion: number;
  moduleId: string;
  moduleTitle: string;
  moduleType: AcademyModule["type"];
  durationMinutes: number;
}

export interface AcademyMaterialOpenRequest extends AcademyMaterialIdentity {
  contentUrl: string;
}

export interface AcademyMaterialOpenOutcome {
  contentBody?: string | null;
}

export interface AcademyMaterialLinkingBoundary {
  openURL: (url: string) => Promise<unknown>;
  canOpenURL?: (url: string) => Promise<boolean>;
}

export type AcademyMaterialOpener = (
  request: AcademyMaterialOpenRequest,
) => Promise<void | string | AcademyMaterialOpenOutcome>;

export type AcademyMaterialResolution =
  | {
      state: "ready";
      url: string;
      identity: AcademyMaterialIdentity;
      request: AcademyMaterialOpenRequest;
      actionLabel: string;
      reopenLabel: string;
      readinessHint: string;
    }
  | {
      state: "missing" | "unavailable";
      url: null;
      identity: AcademyMaterialIdentity;
      reason: string;
      actionLabel: string;
    };

export interface AcademyMaterialOpenedSession extends AcademyMaterialOpenRequest {
  actionLabel: string;
  reopenLabel: string;
  statusLabel: string;
  openedAt: string;
  contentBody: string | null;
}

export function getModuleTypeLabel(type: AcademyModule["type"]): string {
  switch (type) {
    case "video":
      return "教學影片";
    case "sop":
      return "SOP 指引";
    case "article":
      return "專業講義";
    default:
      return type;
  }
}

export function getMaterialActionLabel(
  type: AcademyModule["type"],
  reopened = false,
): string {
  switch (type) {
    case "video":
      return reopened ? "重新播放教學影片" : "播放教學影片";
    case "sop":
      return reopened ? "重新開啟 SOP 教材" : "開啟 SOP 教材";
    case "article":
      return reopened ? "重新閱讀專業講義" : "閱讀專業講義";
    default:
      return reopened ? "重新開啟教材" : "開啟教材";
  }
}

export function getMaterialActiveStatusLabel(
  type: AcademyModule["type"],
): string {
  switch (type) {
    case "video":
      return "已啟動教學影片播放";
    case "sop":
      return "已開啟 SOP 指引教材";
    case "article":
      return "已開啟專業講義教材";
    default:
      return "已開啟教材資源";
  }
}

export function getMaterialReadinessHint(type: AcademyModule["type"]): string {
  switch (type) {
    case "video":
      return "請點擊下方按鈕啟動播放器觀看本單元教學影片。";
    case "sop":
      return "請點擊下方按鈕開啟並研讀本單元 SOP 標準作業指引。";
    case "article":
      return "請點擊下方按鈕開啟並閱讀本單元專業知識講義。";
    default:
      return "請點擊下方按鈕開啟本單元教材資源。";
  }
}

export function buildAcademyMaterialIdentity(
  course: Pick<
    AcademyCourseDetail,
    "courseId" | "courseCode" | "title" | "version"
  >,
  module: AcademyModule,
): AcademyMaterialIdentity {
  return {
    courseId: course.courseId,
    courseCode: course.courseCode,
    courseTitle: course.title,
    courseVersion: course.version,
    moduleId: module.moduleId,
    moduleTitle: module.title,
    moduleType: module.type,
    durationMinutes: module.durationMinutes,
  };
}

export function resolveAcademyMaterialResource(
  course: Pick<
    AcademyCourseDetail,
    "courseId" | "courseCode" | "title" | "version"
  >,
  module: AcademyModule,
): AcademyMaterialResolution {
  const identity = buildAcademyMaterialIdentity(course, module);
  const actionLabel = getMaterialActionLabel(module.type, false);
  const rawUrl =
    typeof module.contentUrl === "string" ? module.contentUrl.trim() : "";

  if (!rawUrl) {
    return {
      state: "missing",
      url: null,
      identity,
      reason: "此單元尚未設定教材資源位址，無法開啟或載入教材。",
      actionLabel,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      state: "unavailable",
      url: null,
      identity,
      reason: "教材資源位址格式無效或不受支援，無法開啟教材。",
      actionLabel,
    };
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !parsed.hostname
  ) {
    return {
      state: "unavailable",
      url: null,
      identity,
      reason: "教材資源位址格式無效或不受支援，無法開啟教材。",
      actionLabel,
    };
  }

  return {
    state: "ready",
    url: rawUrl,
    identity,
    request: {
      ...identity,
      contentUrl: rawUrl,
    },
    actionLabel,
    reopenLabel: getMaterialActionLabel(module.type, true),
    readinessHint: getMaterialReadinessHint(module.type),
  };
}

export function formatAcademyMaterialError(
  error: unknown,
  fallback = "開啟教材資源失敗，請確認網路或閱讀器狀態後重試。",
): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

function extractContentBody(outcome: unknown): string | null {
  if (typeof outcome === "string" && outcome.trim()) {
    return outcome.trim();
  }
  if (
    outcome &&
    typeof outcome === "object" &&
    "contentBody" in outcome &&
    typeof (outcome as AcademyMaterialOpenOutcome).contentBody === "string"
  ) {
    const body = (outcome as AcademyMaterialOpenOutcome).contentBody?.trim();
    return body || null;
  }
  return null;
}

export async function openAcademyMaterialResource(
  course: Pick<
    AcademyCourseDetail,
    "courseId" | "courseCode" | "title" | "version"
  >,
  module: AcademyModule,
  options?: {
    opener?: AcademyMaterialOpener;
    linking?: AcademyMaterialLinkingBoundary;
    now?: () => string;
  },
): Promise<AcademyMaterialOpenedSession> {
  const resolution = resolveAcademyMaterialResource(course, module);
  if (resolution.state !== "ready") {
    throw new Error(resolution.reason);
  }

  let outcome: unknown;
  if (options?.opener) {
    outcome = await options.opener(resolution.request);
  } else {
    const linking: AcademyMaterialLinkingBoundary = options?.linking ?? Linking;
    if (typeof linking?.canOpenURL === "function") {
      const supported = await linking.canOpenURL(resolution.url);
      if (!supported) {
        throw new Error(
          "裝置目前無法開啟此教材連結，請確認外部播放器或閱讀器設定。",
        );
      }
    }
    if (typeof linking?.openURL !== "function") {
      throw new Error("教材開啟介面不可用，請稍後重試。");
    }
    outcome = await linking.openURL(resolution.url);
  }

  return {
    ...resolution.request,
    actionLabel: resolution.actionLabel,
    reopenLabel: resolution.reopenLabel,
    statusLabel: getMaterialActiveStatusLabel(module.type),
    openedAt: options?.now ? options.now() : new Date().toISOString(),
    contentBody: extractContentBody(outcome),
  };
}
