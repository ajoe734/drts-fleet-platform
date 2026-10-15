import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tokens } from "@/components/ui/tokens";
import { ActionButton } from "@/components/ui/ActionButton";
import { formatCategoryLabel, type AcademyCourseDetail } from "./types";
import {
  formatAcademyMaterialError,
  getModuleTypeLabel,
  openAcademyMaterialResource,
  resolveAcademyMaterialResource,
  type AcademyMaterialOpenedSession,
  type AcademyMaterialOpener,
} from "./material-resource";

export * from "./material-resource";

export interface ModuleReaderProps {
  course: AcademyCourseDetail;
  onStartQuiz: () => void;
  onBack: () => void;
  onOpenMaterial?: AcademyMaterialOpener;
  onMaterialOpened?: (session: AcademyMaterialOpenedSession) => void;
}

export function ModuleReader({
  course,
  onStartQuiz,
  onBack,
  onOpenMaterial,
  onMaterialOpened,
}: ModuleReaderProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<string>(
    course.modules[0]?.moduleId ?? "",
  );
  const [activeSession, setActiveSession] =
    useState<AcademyMaterialOpenedSession | null>(null);
  const [isOpening, setIsOpening] = useState<boolean>(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const inFlight = useRef(false);
  const generation = useRef(0);
  const previousCourseKey = useRef(`${course.courseId}:${course.version}`);

  useEffect(() => {
    const nextCourseKey = `${course.courseId}:${course.version}`;
    if (previousCourseKey.current !== nextCourseKey) {
      previousCourseKey.current = nextCourseKey;
      generation.current += 1;
      inFlight.current = false;
      setIsOpening(false);
      setOpenError(null);
      setActiveSession(null);
      setSelectedModuleId(course.modules[0]?.moduleId ?? "");
    }
  }, [course.courseId, course.version, course.modules]);

  useEffect(
    () => () => {
      generation.current += 1;
      inFlight.current = false;
    },
    [],
  );

  const selectedModule =
    course.modules.find((m) => m.moduleId === selectedModuleId) ??
    course.modules[0];

  const resolution = selectedModule
    ? resolveAcademyMaterialResource(course, selectedModule)
    : null;

  const isCurrentModuleOpened = Boolean(
    activeSession &&
    selectedModule &&
    resolution?.state === "ready" &&
    activeSession.courseId === course.courseId &&
    activeSession.courseVersion === course.version &&
    activeSession.moduleId === selectedModule.moduleId &&
    activeSession.contentUrl === resolution.url,
  );

  const handleSelectModule = (moduleId: string) => {
    if (moduleId === selectedModule?.moduleId) {
      return;
    }
    generation.current += 1;
    inFlight.current = false;
    setIsOpening(false);
    setOpenError(null);
    setActiveSession(null);
    setSelectedModuleId(moduleId);
  };

  const handleOpenMaterial = async () => {
    if (!selectedModule || inFlight.current) {
      return;
    }

    const currentResolution = resolveAcademyMaterialResource(
      course,
      selectedModule,
    );
    if (currentResolution.state !== "ready") {
      setActiveSession(null);
      setOpenError(currentResolution.reason);
      return;
    }

    inFlight.current = true;
    const requestGeneration = generation.current;
    setIsOpening(true);
    setOpenError(null);

    try {
      const session = await openAcademyMaterialResource(
        course,
        selectedModule,
        {
          opener: onOpenMaterial,
        },
      );
      if (generation.current !== requestGeneration) {
        return;
      }
      setActiveSession(session);
      setOpenError(null);
      onMaterialOpened?.(session);
    } catch (err) {
      if (generation.current !== requestGeneration) {
        return;
      }
      setActiveSession(null);
      setOpenError(formatAcademyMaterialError(err));
    } finally {
      if (generation.current === requestGeneration) {
        inFlight.current = false;
        setIsOpening(false);
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Course Overview Card */}
      <View style={styles.headerCard}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回清單"
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← 返回清單</Text>
          </Pressable>
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                {formatCategoryLabel(course.category)}
              </Text>
            </View>
            {course.isRequired && (
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredText}>必修</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.courseTitle}>{course.title}</Text>
        <Text style={styles.courseCode}>
          代碼：{course.courseCode} · 版本：v{course.version}
        </Text>
        <Text style={styles.description}>{course.description}</Text>

        <View style={styles.requirementBanner}>
          <Text style={styles.requirementText}>
            完訓標準：測驗成績需達 {course.passingScore} 分（含）以上方可認證
          </Text>
        </View>
      </View>

      {/* Module Selector */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          教學單元教材 ({course.modules.length})
        </Text>
      </View>

      <View style={styles.moduleList}>
        {course.modules.map((mod, idx) => {
          const isSelected = mod.moduleId === selectedModule?.moduleId;
          return (
            <Pressable
              key={mod.moduleId}
              accessibilityRole="button"
              accessibilityLabel={`選擇單元 ${idx + 1} ${mod.title}`}
              accessibilityState={{ selected: isSelected }}
              testID={`academy-module-select-${mod.moduleId}`}
              style={[
                styles.moduleItem,
                isSelected && styles.moduleItemSelected,
              ]}
              onPress={() => handleSelectModule(mod.moduleId)}
            >
              <View style={styles.moduleItemHeader}>
                <View style={styles.moduleNumberBadge}>
                  <Text style={styles.moduleNumberText}>單元 {idx + 1}</Text>
                </View>
                <View style={styles.moduleTypeBadge}>
                  <Text style={styles.moduleTypeText}>
                    {getModuleTypeLabel(mod.type)}
                  </Text>
                </View>
                <Text style={styles.durationText}>
                  {mod.durationMinutes} 分鐘
                </Text>
              </View>
              <Text style={styles.moduleTitle}>{mod.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Module Resource Reader / Player */}
      {selectedModule && resolution ? (
        <View
          style={styles.contentViewerCard}
          testID={`academy-material-viewer-${selectedModule.moduleId}`}
        >
          <View style={styles.contentViewerHeader}>
            <Text style={styles.contentViewerType}>
              [{getModuleTypeLabel(selectedModule.type)}]
            </Text>
            <Text style={styles.contentViewerTitle}>
              {selectedModule.title}
            </Text>
          </View>

          <View
            style={styles.materialIdentityCard}
            testID="academy-material-identity"
          >
            <Text style={styles.materialIdentityText}>
              課程：{course.title} ({course.courseCode} · v{course.version})
            </Text>
            <Text style={styles.materialIdentityText}>
              單元代碼：{selectedModule.moduleId} · 預計時長：
              {selectedModule.durationMinutes} 分鐘
            </Text>
          </View>

          {resolution.state !== "ready" ? (
            <View
              style={styles.unavailableCard}
              testID="academy-material-unavailable"
            >
              <Text style={styles.unavailableTitle}>教材資源無法使用</Text>
              <Text style={styles.unavailableReason}>{resolution.reason}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={resolution.actionLabel}
                accessibilityState={{ disabled: true }}
                disabled
                style={[
                  styles.materialActionButton,
                  styles.materialActionButtonDisabled,
                ]}
                testID={`academy-material-open-${selectedModule.moduleId}`}
              >
                <Text
                  style={[
                    styles.materialActionButtonText,
                    styles.materialActionButtonTextDisabled,
                  ]}
                >
                  {resolution.actionLabel}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={
                selectedModule.type === "video"
                  ? styles.videoPlaceholder
                  : styles.documentViewer
              }
            >
              <Text style={styles.resourceHeading}>
                {selectedModule.type === "video"
                  ? `教學影片資源（時長 ${selectedModule.durationMinutes} 分鐘）`
                  : `${getModuleTypeLabel(selectedModule.type)}資源（時長 ${selectedModule.durationMinutes} 分鐘）`}
              </Text>
              <Text style={styles.resourceUrlText}>
                教材資源位址：{resolution.url}
              </Text>

              {isCurrentModuleOpened && activeSession ? (
                <View
                  style={styles.activeSessionCard}
                  testID="academy-material-active-session"
                >
                  <Text style={styles.activeSessionStatus}>
                    {activeSession.statusLabel}
                  </Text>
                  <Text style={styles.activeSessionDetail}>
                    已開啟單元：{activeSession.moduleTitle} (
                    {activeSession.moduleId})
                  </Text>
                  <Text style={styles.activeSessionDetail}>
                    所屬課程：{activeSession.courseTitle} (
                    {activeSession.courseCode} · v{activeSession.courseVersion})
                  </Text>
                  <Text style={styles.activeSessionDetail}>
                    已連線資源：{activeSession.contentUrl}
                  </Text>
                  {activeSession.contentBody ? (
                    <Text
                      style={styles.documentBody}
                      testID="academy-material-loaded-content"
                    >
                      {activeSession.contentBody}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.readinessHintText}>
                  {resolution.readinessHint}
                </Text>
              )}

              {openError ? (
                <View
                  style={styles.errorBanner}
                  testID="academy-material-error"
                >
                  <Text style={styles.errorTitle}>教材開啟失敗</Text>
                  <Text style={styles.errorBody}>{openError}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="重試開啟教材"
                    accessibilityState={{ disabled: isOpening }}
                    disabled={isOpening}
                    onPress={() => void handleOpenMaterial()}
                    style={styles.retryButton}
                    testID="academy-material-retry"
                  >
                    <Text style={styles.retryButtonText}>重試開啟教材</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isCurrentModuleOpened
                    ? resolution.reopenLabel
                    : resolution.actionLabel
                }
                accessibilityState={{
                  disabled: isOpening,
                  busy: isOpening,
                }}
                disabled={isOpening}
                onPress={() => void handleOpenMaterial()}
                style={[
                  styles.materialActionButton,
                  isOpening && styles.materialActionButtonDisabled,
                ]}
                testID={`academy-material-open-${selectedModule.moduleId}`}
              >
                {isOpening ? (
                  <ActivityIndicator
                    size="small"
                    color={Tokens.colors.textInverse}
                  />
                ) : null}
                <Text style={styles.materialActionButtonText}>
                  {isOpening
                    ? "正在開啟教材..."
                    : isCurrentModuleOpened
                      ? resolution.reopenLabel
                      : resolution.actionLabel}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.unavailableCard} testID="academy-material-empty">
          <Text style={styles.unavailableTitle}>本課程目前尚無教材單元</Text>
        </View>
      )}

      {/* Start Quiz Action */}
      <View style={styles.actionContainer}>
        <ActionButton
          title={`開始測驗 (${course.questions.length} 題)`}
          variant="primary"
          onPress={onStartQuiz}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  headerCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    paddingVertical: Tokens.spacing.xs,
    paddingHorizontal: Tokens.spacing.sm,
  },
  backButtonText: {
    fontSize: 13,
    color: Tokens.colors.brandHi,
    fontWeight: "600",
  },
  badgeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.xs,
  },
  categoryBadge: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  categoryText: {
    fontSize: 11,
    color: Tokens.colors.textMuted,
  },
  requiredBadge: {
    backgroundColor: Tokens.colors.brandBg,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
    borderColor: Tokens.colors.brandHi,
  },
  requiredText: {
    fontSize: 11,
    color: Tokens.colors.brandHi,
    fontWeight: "600",
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  courseCode: {
    fontSize: 12,
    color: Tokens.colors.textDim,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.xs,
  },
  requirementBanner: {
    marginTop: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.infoBg,
    borderColor: Tokens.colors.info,
    borderWidth: 1,
    borderRadius: Tokens.radius.sm,
    padding: Tokens.spacing.sm,
  },
  requirementText: {
    fontSize: 12,
    color: Tokens.colors.info,
    fontWeight: "500",
  },
  sectionHeader: {
    marginTop: Tokens.spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  moduleList: {
    gap: Tokens.spacing.sm,
  },
  moduleItem: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  moduleItemSelected: {
    borderColor: Tokens.colors.brandHi,
    backgroundColor: Tokens.colors.surfaceHi,
  },
  moduleItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  moduleNumberBadge: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.xs,
    paddingVertical: 1,
    borderRadius: Tokens.radius.xs,
  },
  moduleNumberText: {
    fontSize: 10,
    fontWeight: "600",
    color: Tokens.colors.textMuted,
  },
  moduleTypeBadge: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.xs,
    paddingVertical: 1,
    borderRadius: Tokens.radius.xs,
  },
  moduleTypeText: {
    fontSize: 10,
    color: Tokens.colors.brandHi,
  },
  durationText: {
    fontSize: 11,
    color: Tokens.colors.textDim,
    marginLeft: "auto",
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.colors.text,
  },
  contentViewerCard: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  contentViewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.border,
    paddingBottom: Tokens.spacing.sm,
  },
  contentViewerType: {
    fontSize: 13,
    fontWeight: "600",
    color: Tokens.colors.brandHi,
  },
  contentViewerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  materialIdentityCard: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.sm,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.sm,
    gap: 2,
  },
  materialIdentityText: {
    fontSize: 11,
    color: Tokens.colors.textMuted,
  },
  videoPlaceholder: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  documentViewer: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  resourceHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  resourceUrlText: {
    fontSize: 11,
    color: Tokens.colors.textDim,
  },
  readinessHintText: {
    fontSize: 12,
    lineHeight: 18,
    color: Tokens.colors.textMuted,
  },
  activeSessionCard: {
    backgroundColor: Tokens.colors.successBg,
    borderColor: Tokens.colors.success,
    borderWidth: 1,
    borderRadius: Tokens.radius.sm,
    padding: Tokens.spacing.md,
    gap: 4,
  },
  activeSessionStatus: {
    fontSize: 13,
    fontWeight: "700",
    color: Tokens.colors.success,
  },
  activeSessionDetail: {
    fontSize: 12,
    color: Tokens.colors.text,
  },
  documentBody: {
    fontSize: 13,
    lineHeight: 20,
    color: Tokens.colors.text,
    marginTop: Tokens.spacing.xs,
  },
  unavailableCard: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: Tokens.colors.danger,
    borderWidth: 1,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  unavailableTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Tokens.colors.danger,
  },
  unavailableReason: {
    fontSize: 12,
    lineHeight: 18,
    color: Tokens.colors.danger,
  },
  errorBanner: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: Tokens.colors.danger,
    borderWidth: 1,
    borderRadius: Tokens.radius.sm,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Tokens.colors.danger,
  },
  errorBody: {
    fontSize: 12,
    lineHeight: 18,
    color: Tokens.colors.danger,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: Tokens.spacing.xs,
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.danger,
    borderWidth: 1,
    borderRadius: Tokens.radius.sm,
    paddingVertical: Tokens.spacing.xs,
    paddingHorizontal: Tokens.spacing.md,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Tokens.colors.danger,
  },
  materialActionButton: {
    minHeight: 42,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Tokens.spacing.xs,
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    marginTop: Tokens.spacing.xs,
  },
  materialActionButtonDisabled: {
    opacity: 0.5,
  },
  materialActionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Tokens.colors.textInverse,
  },
  materialActionButtonTextDisabled: {
    color: Tokens.colors.textInverse,
  },
  actionContainer: {
    marginTop: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.xxl,
  },
});
